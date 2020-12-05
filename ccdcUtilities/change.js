/** ///////////////////////////////////////////////////////////////////
 * 
 * Utility functions for exploring and processing change information
 * 
 ** /////////////////////////////////////////////////////////////////*/

var dateUtils = require('users/parevalo_bu/gee-ccdc-tools:ccdcUtilities/dates.js')
var statsUtils = require('users/parevalo_bu/gee-ccdc-tools:ccdcUtilities/stats.js')

// Add time band and constant
function createTimeBand(img) {
  var year = ee.Image(img.date().difference('1970-01-01', 'year')).rename('t')
  var constant = ee.Image(1).rename('constant')
  return img.addBands(constant).addBands(year.float())
}

// Function to get a sequence of names using a base name and a list
// of strings to append (e.g a sequence)
function constructBandNames(base, list) {
  return ee.List(list).map(function(i) {
    return ee.String(base).cat(ee.Number(i).int());
  });
};

// Function to add a constant and time band
function addDependents(image) {
  // Compute time in fractional years since the epoch.
  var years = image.date().difference('1970-01-01', 'year');
  var timeRadians = ee.Image(years.multiply(2 * Math.PI)).rename('t');
  var constant = ee.Image(1);
  return image.addBands(constant).addBands(timeRadians.float());
};


// Calculated scaled cusum OLS residuals
function calc_scaled_cusum(resids, critVal){
  // Initialize empty cusum
  var dt = ee.Date(resids.first().get('system:time_start')).advance(-1, 'day').millis()
  var cs_0 = ee.List([ee.Image(0.0001).set('system:time_start', dt)
  .rename('cusum')])
  
  // Simple CUSUM function. Unmask images to prevent sum to fail due to masked values.
  // Unmaked values will have a value of zero and won't affect the calculation
  var cusum_calc = function(image, list){
    var previous = ee.Image(ee.List(list).get(-1))
    var current_cusum = previous.select('cusum').unmask()
    .add(image.unmask())
    .set('system:time_start', image.get('system:time_start'))
    return ee.List(list).add(current_cusum.rename('cusum'))
  }
  
  // Calculate CUSUM
  var cusum = ee.ImageCollection(ee.List(resids.iterate(cusum_calc, cs_0)))

  // Scaled cumulative residuals, based on statsmodels (Ploberger, Werner, and Walter Kramer 1992)
  var nobs = resids.count() //Count excludes masked vals, which is what we want here
  var nobssigma2 = resids.map(function(x){return x.pow(2)}).sum()
  var ddof = ee.Number(8) // # of Harmonic regression pairs + intp + slope. Automate this calculation
  // This notation replicates the python opearator order
  nobssigma2 = nobssigma2.divide(nobs.subtract(ddof)).multiply(nobs)
  
  
  // Actual calculation of scaled CUSUM. Append breakpoint band
  var scaled_resid = cusum.map(function(img){
    var scaledres = img.divide(nobssigma2.sqrt()).set('system:time_start', img.get('system:time_start'))
    var breakpoint = scaledres.abs().gte(critVal).rename('break_detected')
    return scaledres.addBands(breakpoint) 
  })
  return scaled_resid
}

// Add date band in fractional year format to compare against tstart/tend
function addFracyearBand(img){
  return img.addBands(ee.Image(dateUtils.msToFrac(img.date().millis())).rename('fracYear'))
}

// Function to run a harmonic regression for a given band in a collection
// and return observed and predicted values, residuals, and coefficients
function harmonic_regression(ts_collection, band){
  
  // The number of cycles per year to model and variable name to use
  var harmonics = 3
  var dependent = band
  
  // Make a list of harmonic frequencies to model.
  // These also serve as band name suffixes.
  var harmonicFrequencies = ee.List.sequence(1, harmonics);
  
  // Construct lists of names for the harmonic terms.
  var cosNames = constructBandNames('cos_', harmonicFrequencies);
  var sinNames = constructBandNames('sin_', harmonicFrequencies);
  
  // Independent variables.
  var independents = ee.List(['constant', 't'])
    .cat(cosNames).cat(sinNames);
  
  // Function to compute the specified number of harmonics
  // and add them as bands.  Assumes the time band is present.
  var addHarmonics = function(freqs) {
    return function(image) {
      // Make an image of frequencies.
      var frequencies = ee.Image.constant(freqs);
      // This band should represent time in radians.
      var time = ee.Image(image).select('t');
      // Get the cosine terms.
      var cosines = time.multiply(frequencies).cos().rename(cosNames);
      // Get the sin terms.
      var sines = time.multiply(frequencies).sin().rename(sinNames);
      return image.addBands(cosines).addBands(sines);
    };
  };
  
  // Add variables.
  var harmonicLandsat = ts_collection //all_scenes
    .map(addDependents)
    .map(addHarmonics(harmonicFrequencies));
  
  // The output of the regression reduction is a 4x1 array image.
  var harmonicTrend = harmonicLandsat
    .select(independents.add(dependent))
    .reduce(ee.Reducer.linearRegression(independents.length(), 1));
  
  // Turn the array image into a multi-band image of coefficients.
  var harmonicTrendCoefficients = harmonicTrend.select('coefficients')
    .arrayProject([0])
    .arrayFlatten([independents]);
  
  // Compute fitted values.
  var fittedHarmonic = harmonicLandsat.map(function(image) {
    return image.addBands(
      image.select(independents)
        .multiply(harmonicTrendCoefficients)
        .reduce('sum')
        .rename('fitted'));
  });
  
  // Compute residuals manually
  var calc_residuals = function(img){
    var resid = (img.select(dependent)).subtract(img.select('fitted')).rename('residuals')
    return img.addBands(resid)
  }
  var regression_results = fittedHarmonic.map(calc_residuals)
  
  return ee.List([harmonicTrendCoefficients, regression_results])
}

/////// TEST INTEGRATION WITH CCDC SEGMENTS
/**
* @param   {ee.ImageCollection}  landsatCol  Cloud and shadow filtered Landsat collection 
* @param   {ee.Image}            ccdcImg     Ccdc results in long format
* @param   {string}              segId       Segment ID to apply function to (e.g. "S1, S2")
* @param   {string}              band        Spectral band to calculate test on (e.g. 'SWIR1')
* @returns {ee.Image}                        Image with bands 'break' and 'maxCusum'
**/
function getOmission(landsatCol, ccdcImg, segId, band, critVal){
  
  // a) Get tstart and tend for current segment
  var tStart = ccdcImg.select(segId + '_tStart')
  var tEnd = ccdcImg.select(segId + '_tEnd')
  
  // Add band with fractional year
  var fracYearCol = landsatCol.map(addFracyearBand)
  
  //  b) Compare date for each image against the tstart-tend per pixel, and mask accordingly
  // Test date band against dates in tstart/tend and add mask accordingly
  function maskDates(img){
    var fracYear = img.select('fracYear')
    var mask = ee.Image(fracYear.gte(tStart)).and(ee.Image(fracYear.lte(tEnd))).rename('dateMask')
    return img.updateMask(mask)
  }
  var maskedCol = fracYearCol.map(maskDates)
  // Do harmonic regression instead of simple linear
  var regressionResults = ee.ImageCollection(harmonic_regression(maskedCol, band).get(1))
  
  //  f) Calculate scaled residuals and occurence of break if threshold reached
  var residuals = regressionResults.select('residuals')
  // Calculated scaled CUSUM and time of break for each image
  var scaled_cusum = calc_scaled_cusum(residuals, critVal)
  var cusum = scaled_cusum.select('cusum').map(function(x){return x.abs()})
  var break_detected = scaled_cusum.select('break_detected')
  // Get presence of any breaks detected for the current segment, and the max abs value
  var cusum_break = break_detected.reduce(ee.Reducer.anyNonZero()).rename('omission')
  var cusum_treshold = cusum.reduce(ee.Reducer.max()).rename('maxCusum')
  
  return ee.Image.cat([cusum_break, cusum_treshold])
  
}

/////// TEST INTEGRATION WITH CCDC SEGMENTS
/**
 * @param   {ee.ImageCollection}  landsatCol  Cloud and shadow filtered Landsat collection 
 * @param   {ee.Image}            ccdcImg     Ccdc results in long format
 * @param   {string}              segId       Segment ID to apply function to (e.g. "S1, S2")
 * @param   {string}              band        Spectral band to calculate test on (e.g. 'SWIR1')
 * @returns {ee.Image}                        Image with bands 'break' and 'maxCusum'
**/
function getCommission(landsatCol, ccdcImg, seg1, seg2, band){
  
  // a) Get tstart and tend for each segment
  var tStart1 = ccdcImg.select(seg1 + '_tStart')
  var tEnd1 = ccdcImg.select(seg1 + '_tEnd')
  var tStart2 = ccdcImg.select(seg2 + '_tStart')
  var tEnd2 = ccdcImg.select(seg2 + '_tEnd')
  
  // Add band with fractional year
  var fracYearCol = landsatCol.map(addFracyearBand)
  
  //  b) Compare date for each image against the tstart-tend per pixel, and mask accordingly
  // Test date band against dates in tstart/tend and add mask accordingly
  function maskDates(img){
      var fracYear = img.select('fracYear')
      var mask = ee.Image(fracYear.gte(tStart)).and(ee.Image(fracYear.lte(tEnd))).rename('dateMask')
      return img.updateMask(mask)
  }
  
  function maskDates (col, tStart, tEnd){
    function inner(img){
      var fracYear = img.select('fracYear')
      var mask = ee.Image(fracYear.gte(tStart)).and(ee.Image(fracYear.lte(tEnd))).rename('dateMask')
      return img.updateMask(mask)
    }
    return col.map(inner)
  }

  var maskedCol1 = maskDates(fracYearCol, tStart1, tEnd1)
  var maskedCol2 = maskDates(fracYearCol, tStart2, tEnd2)
  var maskedColGlobal = maskDates(fracYearCol, tStart1, tEnd2)
  
  // Run harmonic regression instead of linear
  var regressionResults1 = ee.ImageCollection(harmonic_regression(maskedCol1, band).get(1))
  var regressionResults2 = ee.ImageCollection(harmonic_regression(maskedCol2, band).get(1))
  var regressionResultsGlobal = ee.ImageCollection(harmonic_regression(maskedColGlobal, band).get(1))
  
  var resid1 = regressionResults1.select('residuals')
  var resid2 = regressionResults2.select('residuals')
  var residGlobal = regressionResultsGlobal.select('residuals')
  
  // 6) Get sum of squared residuals for each model
  function sumSquares(col){
    return col.map(function(x){return x.pow(2)}).sum()
  }
  
  var ss1 = sumSquares(resid1)
  var ss2 = sumSquares(resid2)
  var ssGl = sumSquares(residGlobal)
  
  // Get nobs per segment, directly from CCDC record
  var n1 = ccdcImg.select(seg1 + '_numObs')
  var n2 = ccdcImg.select(seg2 + '_numObs')
  var nGl = n1.add(n2)
  
  // 7) Calculate Chow test statistic
  // var k = ee.Number(3) //Num of parameters, 3 for now bc we are doing simple OLS
  var k = ee.Number(4) //Num of parameters, e.g. 2 pairs of harmonics
  var num = ssGl.subtract(ss1.add(ss2)).divide(k.add(1))
  var den = ss1.add(ss2).divide(nGl.subtract(k.add(1).multiply(2)))
  var chow = num.divide(den)
  
  // Calculate probability
  var Fprob = statsUtils.F_cdf(chow, k, nGl.subtract(k.multiply(2)))
  return chow.addBands(Fprob).rename(['chow_F', 'prob'])
  
}

exports = {
  createTimeBand: createTimeBand,
  getOmission: getOmission,
  getCommission: getCommission,
}
