/** ///////////////////////////////////////////////////////////////////
 * 
 * Utility functions for filtering and modifying CCD output
 * 
 ** /////////////////////////////////////////////////////////////////*/
 

/**
* Create sequence of segment strings
* @param {Integer} nSegments Number of segments to create labels for
* @returns {ee.List) List of segment names (e.g. S1, S2)
*/
function buildSegmentTag(nSegments) {
  return ee.List.sequence(1, nSegments).map(function(i) {
    return ee.String('S').cat(ee.Number(i).int())
  })
}


/**
* Create sequence of band names for a given string tag
* @param {string} tag String tag to use (e.g. 'RMSE')
* @param {array} bandList List of band names to combine with tag
* @returns {ee.List) List of band names combined with tag name
*/
function buildBandTag(tag, bandList) {
  var bands = ee.List(bandList)
  return bands.map(function(s) {
    return ee.String(s).cat('_' + tag)
  })
}


/**
* Extract CCDC magnitude image from current CCDC result format
* @param {ee.Image} fit Image with CCD results
* @param {number} nSegments Number of segments to extract
* @param {array} bandList  Client-side list with band names to use
* @returns {ee.Image) Image with magnitude of change per segment per band 
*/
function buildMagnitude(fit, nSegments, bandList){
  var segmentTag = buildSegmentTag(nSegments)
  var zeros = ee.Image(ee.Array(ee.List.repeat(0, nSegments)))
  // Pad zeroes for pixels that have less than nSegments and then slice the first nSegment values
  var retrieveMags = function(band){
    var magImg = fit.select(band + '_magnitude').arrayCat(zeros, 0).float().arraySlice(0, 0, nSegments)
    var tags = segmentTag.map(function(x){ return ee.String(x).cat('_').cat(band).cat('_MAG')})
    return magImg.arrayFlatten([tags])
  }
  return ee.Image(bandList.map(retrieveMags))
}


/**
* Extract CCDC RMSE image from current CCDC formatted results
* @param {ee.Image} fit Image with CCDC results
* @param {number}  nSegments Number of segments to extract
* @param {array} bandList  Client-side list with band names to use
* @returns {ee.Image) Image with RMSE of each segment per band
*/
function buildRMSE(fit, nSegments, bandList){
  var segmentTag = buildSegmentTag(nSegments)
  var zeros = ee.Image(ee.Array(ee.List.repeat(0, nSegments)))
  // Pad zeroes for pixels that have less than 6 segments and then slice the first 6 values
  var retrieveMags = function(band){
    var magImg = fit.select(band + '_rmse').arrayCat(zeros, 0).float().arraySlice(0, 0, nSegments)
    var tags = segmentTag.map(function(x){ return ee.String(x).cat('_').cat(band).cat('_RMSE')})
    return magImg.arrayFlatten([tags])
  }
  return ee.Image(bandList.map(retrieveMags))
}


/**
* Extract CCDC Coefficients from current CCDC formatted result
* @param {ee.Image} fit Image with CCD results
* @param {number} nSegments Number of segments to extract
* @param {array} bandList  Client-side list with band names to use
* @returns {ee.Image) Image with coefficients per band
*/
function buildCoefs(fit, nSegments, bandList) {
  var nBands = bandList.length
  var segmentTag = buildSegmentTag(nSegments)
  var bandTag = buildBandTag('coef', bandList)
  var harmonicTag = ['INTP','SLP','COS','SIN','COS2','SIN2','COS3','SIN3']
  
  var zeros = ee.Image(ee.Array([ee.List.repeat(0, harmonicTag.length)])).arrayRepeat(0, nSegments)
  var retrieveCoefs = function(band){
    var coefImg = fit.select(band + '_coefs').arrayCat(zeros, 0).float().arraySlice(0, 0, nSegments)
    var tags = segmentTag.map(function(x){ return ee.String(x).cat('_').cat(band).cat('_coef')})
    return coefImg.arrayFlatten([tags, harmonicTag])
  }
  
  return ee.Image(bandList.map(retrieveCoefs))
}


/**
* Extract data for CCDC 1D-array, non-spectral bands (tStart, tEnd, tBreak, changeProb or numObs)
* @param {ee.Image} fit Image with CCD results
* @param {integer} nSegments Number of segments to extract
* @param {string} tag Client-side string to use as name in the output bands
* @returns {ee.Image) Image with values for tStart, tEnd, tBreak, changeProb or numObs
*/
function buildStartEndBreakProb(fit, nSegments, tag) {
  var segmentTag = buildSegmentTag(nSegments).map(function(s) {
    return ee.String(s).cat('_'+tag)
  })
  
  var zeros = ee.Array(0).repeat(0, nSegments)
  var magImg = fit.select(tag).arrayCat(zeros, 0).float().arraySlice(0, 0, nSegments)
  
  return magImg.arrayFlatten([segmentTag])
}


/**
* Transform ccd results from array image to "long" multiband format
* @param {ee.Image} fit Image with CCD results
* @param {number} nSegments Number of segments to extract
* @param {array} bandList Client-side list with band names to use
* @returns {ee.Image) Image with all results from CCD in 'long' image format
*/
function buildCcdImage(fit, nSegments, bandList) {
  var magnitude = buildMagnitude(fit, nSegments, bandList)
  var rmse = buildRMSE(fit, nSegments, bandList)

  var coef = buildCoefs(fit, nSegments, bandList)
  var tStart = buildStartEndBreakProb(fit, nSegments, 'tStart')
  var tEnd = buildStartEndBreakProb(fit, nSegments, 'tEnd')
  var tBreak = buildStartEndBreakProb(fit, nSegments, 'tBreak')
  var probs = buildStartEndBreakProb(fit, nSegments, 'changeProb')
  var nobs = buildStartEndBreakProb(fit, nSegments, 'numObs')
  return ee.Image.cat(coef, rmse, magnitude, tStart, tEnd, tBreak, probs, nobs)
}


/**
* Create synthetic image for specified band
* @param {ee.Image} image Image with CCD results in long multi-band format
* @param {number} date Date to extract the segments for, in the format that ccd was run in
* @param {number} dateFormat Code of the date format that ccdc was run in (e.g. 1 for frac years)
* @param {string} band Band name to use for creation of synthetic image
* @paramg {array} segs List of segment names to use. 
* @returns {ee.Image) Synthetic image for the given date and band
*/
function getSyntheticForYear(image, date, dateFormat, band, segs) {
  var tfit = date
  var PI2 = 2.0 * Math.PI
  var OMEGAS = [PI2 / 365.25, PI2, PI2 / (1000 * 60 * 60 * 24 * 365.25)]
  var omega = OMEGAS[dateFormat];
  var imageT = ee.Image.constant([1, tfit,
                                tfit.multiply(omega).cos(),
                                tfit.multiply(omega).sin(),
                                tfit.multiply(omega * 2).cos(),
                                tfit.multiply(omega * 2).sin(),
                                tfit.multiply(omega * 3).cos(),
                                tfit.multiply(omega * 3).sin()]).float()
                                
  // OLD CODE
  // Casting as ee string allows using this function to be mapped
  // var selectString = ee.String('.*' + band + '_coef.*')
  // var params = getSegmentParamsForYear(image, date) 
  //                       .select(selectString)
  // return imageT.multiply(params).reduce('sum').rename(band)
                        
  // Use new standard functions instead
  var COEFS = ["INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3", "SIN3"]
  var newParams = getMultiCoefs(image, date, [band], COEFS, false, segs, 'before')
  return imageT.multiply(newParams).reduce('sum').rename(band)
  
}

/**
* Create synthetic image for a list of bands
* @param {ee.Image} image Image with CCD results in long multi-band format
* @param {number} date Date to extract the segments for, in the format that ccd was run in
* @param {number} dateFormat Code of the date format that ccdc was run in (e.g. 1 for frac years)
* @param {array} band List of bands to get synthetic data for
* @paramg {array} segs List of segment names to use. 
* @returns {ee.Image) Synthethic image for the given date and bands
*/
function getMultiSynthetic(image, date, dateFormat, bandList, segs){
  var retrieveSynthetic = function(band){
    return getSyntheticForYear(image, date, dateFormat, band, segs)
  }
  
  return ee.Image.cat(bandList.map(retrieveSynthetic))
}


/**
* @deprecated (No longer necessary)
* Replace nodata in CCD output and fill with zeros
* Assumes current CCDC result format
* @param {ee.Image} fit Image with CCD results
* @param {number} nCoefs Number of coefficients present in the results
* @param {number} nBands Number of spectral bands used to produce the results
* @param {ee.Geometry} clipGeom Geometry of the image that is being masked
* @returns {ee.Image) Image with nodata areas replaced with zeros
*/
function fillNoData(fit, nCoefs, nBands){
  var d1 = ee.Image(ee.Array([0]).double())
  var d2 = ee.Image(ee.Array([ee.List.repeat(-9999, nCoefs)])).double() 
  
  var upper = ee.Image([d1, d1, d1, d1.int32(), d1])
  
  // Create variable number of coef, rmse and change amplitude bands
  var arrCenter = []
  var arrBottom = []
  for (var i = 0; i < nBands; i++) {
    arrCenter.push(d2)
    arrBottom.push(d1, d1)
  } 
  var center = ee.Image(arrCenter)
  var bottom = ee.Image(arrBottom)
  
  var mock = upper.addBands(center).addBands(bottom).rename(fit.bandNames()).updateMask(fit.mask())
  var newimage = ee.ImageCollection([mock, fit]).mosaic()
  return newimage
  
}


/** 
 * @deprecated (No longer necessary) 
 * Return a date as days from 01-01-0000
 * @param {String} strDate Date in the format accepted by ee.Date
 * @returns {ee.Number} Date expressed as days since 01-01-0000
 */ 
function dateToDays(strDate){
  var date = ee.Date(strDate)
  // Number of days since 01-01-0000 unti 01-01-1970
  var epoch = ee.Number(719177)
  // Convert milis to days
  var days = ee.Number(date.millis().divide(86400000))
  return days.add(epoch)
}


/** 
 * @deprecated (No longer necessary) Find segments that intersect a given date
 * @param {ee.Image}    ccdResults     CCD results in long multi-band format
 * @param {Number}      date            Date in the format that was used to run CCD 
 * @paramg {ee.List}    segNames       Segment names to use. 
 * @returns {ee.Image}  segmentMatch   Mask image indicating segments that intersect the given date 
 */
function dateToSegment(ccdResults, date, segNames){
  var startBands = ccdResults.select(".*_tStart").rename(segNames)
  var endBands = ccdResults.select(".*_tEnd").rename(segNames)
  
  var start = startBands.lte(date)
  var end = endBands.gte(date)
  
  var segmentMatch = start.and(end)
  return segmentMatch
}


/** 
 * Filter coefficients for a given date using a mask
 * @param {ee.Image} ccdResults CCD results in long multi-band format
 * @param {string} date Date in the same format that CCD was run with
 * @param {string} band Band to select. 
 * @param {string} coef Coef to select. Options are "INTP", "SLP", "COS", "SIN", "COS2", 
                                  "SIN2", "COS3", "SIN3", "RMSE", "MAG"
 * @paramg {ee.List} segNames List of segment names to use. 
 * @param {String} behavior Method to find intersecting ('normal') or closest
 *                                segment to given date ('before' or 'after') if no segment
 *                                intersects directly
 * @returns {ee.Image} Single band image with the values for the selected band/coefficient
 */
function filterCoefs(ccdResults, date, band, coef, segNames, behavior){

  var startBands = ccdResults.select(".*_tStart").rename(segNames)
  var endBands = ccdResults.select(".*_tEnd").rename(segNames)
  
  // Get all segments for a given band/coef
  var selStr = ".*".concat(band).concat(".*").concat(coef) // Client side concat
  var coef_bands = ccdResults.select(selStr)
  
  // Select a segment based on conditions
  if (behavior == "normal"){
    var start = startBands.lte(date)
    var end = endBands.gte(date)
    var segmentMatch = start.and(end)
    var outCoef = coef_bands.updateMask(segmentMatch).reduce(ee.Reducer.firstNonNull())
    
  } else if (behavior == "after"){
    var segmentMatch = endBands.gt(date)
    var outCoef = coef_bands.updateMask(segmentMatch).reduce(ee.Reducer.firstNonNull())
    
  } else if (behavior ==  "before"){
    // Mask start to avoid comparing against zero, mask after to remove zeros from logical comparison
    var segmentMatch = startBands.selfMask().lt(date).selfMask()
    var outCoef =  coef_bands.updateMask(segmentMatch).reduce(ee.Reducer.lastNonNull())
  } 
  
  // TODO: Add a "automatic" after, then before behavior
  return outCoef
  
}


/** 
 * Normalize the intercept to the middle of the segment time period, instead
 * of the 0 time period.
 * @param {ee.Image} intercept Image band representing model intercept
 * @param {ee.Image} start Image band representing model slope date
 * @param {ee.Image} end Image band representing model end date
 * @param {ee.Image} slope Image band representing model slope
 * @returns {ee.Image} Image band representing normalized intercept.
 */ 
function normalizeIntercept(intercept, start, end, slope) {
  var middleDate = ee.Image(start).add(ee.Image(end)).divide(2)
  var slopeCoef = ee.Image(slope).multiply(middleDate)
  return ee.Image(intercept).add(slopeCoef)
}


/** 
 * Get image of with a single coefficient for all bands
 * @param {ee.Image} ccd results CCD results in long multi-band format
 * @param {string} date Date in the same format that CCD was run with
 * @param {array} bandList List of all bands to include. 
 * @param {array} coef Coef to select. Options are "INTP", "SLP", "COS", "SIN", "COS2", 
 *                                    "SIN2", "COS3", "SIN3", "RMSE", "MAG"
 * @paramg {ee.List} segNames List of segment names to use. 
 * @param {string} behavior Method to find intersecting ('normal') or closest
 *                                    segment to given date ('before' or 'after') if no segment
 *                                    intersects directly
 * @returns {ee.Image} coefs Image with the values for the selected bands x coefficient
 */
function getCoef(ccdResults, date, bandList, coef, segNames, behavior){
  var inner = function(band){
    var band_coef = filterCoefs(ccdResults, date, band, coef, segNames, behavior)
    return band_coef.rename(band.concat("_").concat(coef)) // Client side concat
  }
  var coefs = ee.Image(bandList.map(inner)) // Client side map
  return coefs
}


/**
 * Apply normalization to intercepts
 * @param {ee.Image} bandCoefs Band x coefficients image. Must include slopes
 * @param {ee.Image} segStart Image with dates representing the start of the segment 
 * @param {ee.Image} segEnd Image with dates representing the end of the segment
 * @returns {ee.Image} bandCoefs Updated input image with normalized intercepts
 */
function applyNorm(bandCoefs, segStart, segEnd){
  var intercepts = bandCoefs.select(".*INTP")
  var slopes = bandCoefs.select(".*SLP")
  var normalized = normalizeIntercept(intercepts, segStart, segEnd, slopes)
  return bandCoefs.addBands({srcImg:normalized, overwrite:true})
}


/**
 * Get image of with bands x coefficients given in a list
 * @param {ee.Image} ccd results CCD results in long multi-band format
 * @param {string} date Date in the same format that CCD was run with
 * @param {array} bandList List of all bands to include. Options are "B1", "B2", "B3", "B4", "B5", "B6", "B7"
 * @param {list} coef_list List of coefs to select. Options are "INTP", "SLP", "COS", "SIN", "COS2", 
 *                                    "SIN2", "COS3", "SIN3", "RMSE", "MAG"
 * @param {boolean} cond Normalize intercepts? If true, requires "INTP" and "SLP" to be selected
 *                                    in coef_list.
 * @param {ee.List} segNames List of segment names to use.
 * @param {string} behavior Method to find intersecting ('normal') or closest
 *                                    segment to given date ('before' or 'after') if no segment
 *                                    intersects directly
 * @returns {ee.Image} coefs Image with the values for the selected bands x coefficients
 */
function getMultiCoefs(ccdResults, date, bandList, coef_list, cond, segNames, behavior){
  // Non normalized
  var inner = function(coef){
    var inner_coef = getCoef(ccdResults, date, bandList, coef, segNames, behavior)
    return inner_coef
  }

  var coefs = ee.Image(coef_list.map(inner))

  // Normalized
  var segStart = filterCoefs(ccdResults, date, "","tStart", segNames, behavior)
  var segEnd = filterCoefs(ccdResults, date, "","tEnd", segNames, behavior)
  var normCoefs = applyNorm(coefs, segStart, segEnd)
  
  var out_coefs = ee.Algorithms.If(cond, normCoefs, coefs)
  return ee.Image(out_coefs)
}


/**
 * Filter segments with change in a given range
 * @param {ee.Image} ccd results CCD results in long multi-band format
 * @param {Number} startDate Start date in the format that was used to run CCD 
 * @param {Number} endDate End date in the format that was used to run CCD 
 * @param {ee.List} segNames List of segment names matching the number of segments in the bands
 * @returns {ee.Image}                 Mask image indicating which pixel/segments have changes in the 
 *                                    specified time range.
**/
function getChanges(ccdResults, startDate, endDate, segNames){
  var breakBands = ccdResults.select(".*_tBreak").rename(segNames)
  var segmentMatch = breakBands.gte(startDate).and(breakBands.lt(endDate))
  return segmentMatch
}


/**
 * Obtain change with largest magnitude, timing of that break, and total number of breaks 
 * for a given date range and band
 * @param {ee.Image} ccd results CCD results in long multi-band format
 * @param {number} startDate Start date in the format that was used to run CCD 
 * @param {sumber} endDate End date in the format that was used to run CCD 
 * @param {string} band Spectral band
 * @param {ee.List} segNames List of segment names matching the number of segments in the bands
 * @returns {ee.Image} Image with three bands indicating:
 *                     1) Magnitude of the largest break for the given date range
 *                     2) Timing of largest break (in the time units CCDC was run in)
 *                     3) Total number of breaks in the date range
**/
function filterMag(ccdResults, startDate, endDate, band, segNames){
  var segMask = getChanges(ccdResults, startDate, endDate, segNames)
  var selStr = ".*".concat(band).concat(".*").concat("MAG") // Client side concat
  var feat_bands = ccdResults.select(selStr)
  var filteredMag = feat_bands.mask(segMask).reduce(ee.Reducer.max())
  var numTbreak = ccdResults.select(".*tBreak").mask(segMask).reduce(ee.Reducer.count())
  var filteredTbreak = ccdResults.select(".*tBreak").mask(segMask).reduce(ee.Reducer.max())
  return filteredMag.addBands(filteredTbreak) 
                    .addBands(numTbreak)
                    .rename(['MAG', 'tBreak', 'numTbreak'])
}


/**
 * Get phase and amplitude for a single spectral band
 * 
 * @param {ee.Image} ccd results CCD results in long multi-band format
 * @param {List} bands List with the name of the bands for which to calculate ampl. and phase
 * @param {String} sinName Band suffix of the desired sine harmonic coefficient (e.g  '_SIN)
 * @param {String} cosName Band suffix of the desired sine harmonic coefficient (e.g  '_COS)
 * @returns{ee.Image} Image with two bands representing phase and amplitude of
 *                    the desired harmonic
**/
function phaseAmplitude(img, bands, sinName, cosName){
    var sinNames = bands.map(function(x){return x.concat(sinName)})
    var cosNames = bands.map(function(x){return x.concat(cosName)})
    var phaseNames = bands.map(function(x){return x.concat('_PHASE')})
    var amplitudeNames = bands.map(function(x){return x.concat('_AMPLITUDE')})
    var phase =  img.select(sinNames).atan2(img.select(cosNames))
      // Scale to [0, 1] from radians. 
      .unitScale(-Math.PI, Math.PI)
      .multiply(365) // To get phase in days!
      .rename(phaseNames)
    
    var amplitude = img.select(sinNames).hypot(img.select(cosNames)).rename(amplitudeNames)
    return phase.addBands(amplitude)
  }

/**
 * Get phase and amplitude. Replace old function with this.
 * 
 * @param {ee.Image} ccd results CCD results in long multi-band format
 * @param {String} sinExpr Regular expression of the sine harmonic coefficient (e.g  '.*SIN.*') for all harmonics
 * @param {String} cosExpr Regular expression of the cosine harmonic coefficient (e.g  '.*COS.*) for all harmonics.
 *                         Must retrieve the same number of bands as sinExpr
 * @returns{ee.Image} Image with two bands representing phase and amplitude of
 *                    the desired harmonic
**/
function newPhaseAmplitude(img, sinExpr, cosExpr){
    var sin = img.select(sinExpr)
    var cos = img.select(cosExpr)
    
    var phase = sin.atan2(cos)
      // Scale to [0, 1] from radians. 
      .unitScale(-3.14159265359, 3.14159265359)
      .multiply(365) // To get phase in days!
    
    var amplitude = sin.hypot(cos)
    
    var phaseNames = phase.bandNames().map(function(x){return ee.String(x).replace('_SIN', '_PHASE')})
    var amplitudeNames = amplitude.bandNames().map(function(x){return ee.String(x).replace('_SIN', '_AMPLITUDE')})
    return phase.rename(phaseNames).addBands(amplitude.rename(amplitudeNames))
  }


exports = {
  buildSegmentTag: buildSegmentTag,
  buildBandTag: buildBandTag,
  buildMagnitude: buildMagnitude,
  buildRMSE: buildRMSE,
  buildCoefs: buildCoefs,
  buildStartEndBreakProb: buildStartEndBreakProb,
  buildCcdImage: buildCcdImage,
  getSyntheticForYear: getSyntheticForYear,
  getMultiSynthetic: getMultiSynthetic,
  fillNoData: fillNoData,
  dateToDays: dateToDays, 
  filterCoefs: filterCoefs,
  normalizeIntercept: normalizeIntercept,
  getCoef: getCoef,
  applyNorm: applyNorm,
  getMultiCoefs: getMultiCoefs,
  getChanges: getChanges,
  filterMag: filterMag,
  phaseAmplitude: phaseAmplitude,
  newPhaseAmplitude: newPhaseAmplitude
  
}
