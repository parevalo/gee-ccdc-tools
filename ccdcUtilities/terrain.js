/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = /* color: #d63000 */ee.Geometry.Point([84.07618795831739, 29.54037010686166]);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Make a layer of shadow pixels at any time of year

var utils = require('projects/GLANCE:ccdcUtilities/inputs')

var PARAMS,
    TERRAIN,
    FUNCS,
    HELPER
var RESULTS = {}
    
var PARAMS = {
  pi: 3.14159265359,
  dem: ee.Image("USGS/SRTMGL1_003"),
  products: ee.Terrain.products(ee.Image("USGS/SRTMGL1_003")),
  landsat: utils.getLandsat(),
  landsat: ee.ImageCollection("LANDSAT/LC08/C01/T2_SR"),
  wrs2: ee.FeatureCollection('projects/google/wrs2_descending'),
}

var FUNCS = function() {

  this.degrees = function(num) {
    return num.multiply(180).divide(PARAMS.pi)
  }
  
  this.radians = function(num) {
    return num.multiply(pi).divide(180)
  } 
  
  this.filterLandsat = function() {
    PARAMS.landsatImage = ee.Image(
      PARAMS.landsat
      .filterBounds(PARAMS.geo)
      .first()
    )
    
    // Get the hour and minute from image, date from parameter
    var sensingTime= ee.Date(PARAMS.landsatImage.get('SENSING_TIME'))
    
    PARAMS.newDate = PARAMS.date.update(
      PARAMS.date.get('year'), 
      PARAMS.date.get('month'), 
      PARAMS.date.get('day'), 
      sensingTime.get('hour'), 
      sensingTime.get('minute'),
      sensingTime.get('second')
    )
    
    PARAMS.sensingTime = sensingTime
  }
  
  this.getSZE = function(img) {
    var point = PARAMS.geo
    var sze = FUNCS.degrees(
      img.select('sunZen')
    ).sample(
      ee.Feature(point).buffer(300).geometry(), 
      30,
      null,
      null,
      1
    ).first()
    var saz = FUNCS.degrees(
      img.select('sunAz')
    ).sample(
      ee.Feature(point).buffer(300).geometry(), 
      30,
      null,
      null,
      1
    ).first()
    return img.set('SZE',sze.get('sunZen'),'SAZ',saz.get('sunAz'))
  }
  

  
}


// Helper functions not written by me
// // Function to correct Landsat data for BRDF effects using a c-factor approach as published in:
// D.P. Roy, H.K. Zhang, J. Ju, J.L. Gomez-Dans, P.E. Lewis, C.B. Schaaf, Q. Sun, J. Li, H. Huang, V. Kovalskyy, A general method to normalize Landsat reflectance data to nadir BRDF adjusted reflectance, Remote Sensing of Environment, Volume 176, April 2016, Pages 255-271
// Interpreted and coded here by Daniel Wiell and Erik Lindquist of the United Nations Food and Agriculture Organization
// for cast shadow: https://code.earthengine.google.com/?scriptPath=users%2Fgena%2Fpackages%3Autils

var HELPER = function() {
  // var self = this
  
  this.doHillShadow = function(img) {
    
    var hysteresis = true
    var neighborhoodSize = 256
    var hillShadow = ee.Algorithms.HillShadow(
      PARAMS.dem, 
      img.get('SAZ'), 
      img.get('SZE'), 
      neighborhoodSize, 
      hysteresis
    ).float()
  
    hillShadow = ee.Image(1).float().subtract(hillShadow)
    
    // cleaning
    hillShadow = hillShadow.focal_mode(3)
    
    // smoothing  
    // return hillShadow.convolve(ee.Kernel.gaussian(5, 3))
    return hillShadow.clip(
      PARAMS.landsatImage.geometry().buffer(10000))
    
  }
  
  this.solarPosition = function(image, date) {

    // Ported from http://pythonfmask.org/en/latest/_modules/fmask/landsatangles.html
    // var date = ee.Date(ee.Number(image.get('system:time_start')))
    date = ee.Date(date)
    // ************** COMMON HELPERS **************
    var constants = {
      pi: Math.PI
    }

    function set(name, toAdd, args) {
      toAdd = toImage(toAdd, args)
      image = image.addBands(toAdd.rename(name), null, true)
    }
  
    function setIf(name, condition, trueValue, falseValue) {
      condition = toImage(condition)
      var trueMasked = toImage(trueValue).mask(toImage(condition))
      var falseMasked = toImage(falseValue).mask(invertMask(condition))
      var value = trueMasked.unmask(falseMasked)
      set(name, value)
      
  
      function invertMask(mask) {
        return mask.multiply(-1).add(1)
      }
    }
  
    function toImage(band, args) {
      if ((typeof band) === 'string') {
        if (band.indexOf('.') > -1 || band.indexOf(' ') > -1 || band.indexOf('{') > -1) {
          band = image.expression(format(band, args), {i: image})
        } else
          band = image.select(band)
      }
      return ee.Image(band)
    }
  
    function format(s, args) {
      if (!args) args = {}
      var allArgs = merge(constants, args)
      var result = s.replace(/{([^{}]*)}/g,
        function (a, b) {
          var replacement = allArgs[b]
          if (replacement == null) {
            print('Undeclared argument: ' + b, 's: ' + s, args)
            return null
          }
          return allArgs[b]
        }
      )
      if (result.indexOf('{') > -1)
        return format(result, args)
      return result
    }
    
    function merge(o1, o2) {
      function addAll(target, toAdd) {
        for (var key in toAdd) target[key] = toAdd[key]
      }
  
      var result = {}
      addAll(result, o1)
      addAll(result, o2)
      return result
    }
    
      var secondsInHour = 3600
      set('longDeg',
        ee.Image.pixelLonLat().select('longitude'))
      set('latRad',
        ee.Image.pixelLonLat().select('latitude')
          .multiply(Math.PI).divide(180))
      set('hourGMT',
        ee.Number(date.getRelative('second', 'day')).divide(secondsInHour))
      set('jdp', // Julian Date Proportion
        date.getFraction('year'))
      set('jdpr', // Julian Date Proportion in Radians
        'i.jdp * 2 * {pi}')
      set('meanSolarTime',
        'i.hourGMT + i.longDeg / 15')
      set('localSolarDiff',
        '(0.000075 + 0.001868 * cos(i.jdpr) - 0.032077 * sin(i.jdpr)' +
        '- 0.014615 * cos(2 * i.jdpr) - 0.040849 * sin(2 * i.jdpr))' +
        '* 12 * 60 / {pi}')
      set('trueSolarTime',
        'i.meanSolarTime + i.localSolarDiff / 60 - 12')
      set('angleHour',
        'i.trueSolarTime * 15 * {pi} / 180')
      set('delta',
        '0.006918 - 0.399912 * cos(i.jdpr) + 0.070257 * sin(i.jdpr) - 0.006758 * cos(2 * i.jdpr)' +
        '+ 0.000907 * sin(2 * i.jdpr) - 0.002697 * cos(3 * i.jdpr) + 0.001480 * sin(3 * i.jdpr)')
      set('cosSunZen',
        'sin(i.latRad) * sin(i.delta) ' +
        '+ cos(i.latRad) * cos(i.delta) * cos(i.angleHour)')
      set('sunZen',
        'acos(i.cosSunZen)')
      set('sinSunAzSW',
        toImage('cos(i.delta) * sin(i.angleHour) / sin(i.sunZen)')
          .clamp(-1, 1))
      set('cosSunAzSW',
        '(-cos(i.latRad) * sin(i.delta)' +
        '+ sin(i.latRad) * cos(i.delta) * cos(i.angleHour)) / sin(i.sunZen)')
      set('sunAzSW',
        'asin(i.sinSunAzSW)')
      setIf('sunAzSW',
        'i.cosSunAzSW <= 0',
        '{pi} - i.sunAzSW',
        'sunAzSW')
      setIf('sunAzSW',
        'i.cosSunAzSW > 0 and i.sinSunAzSW <= 0',
        '2 * {pi} + i.sunAzSW',
        'sunAzSW')
      set('sunAz',
        'i.sunAzSW + {pi}')
      setIf('sunAz',
        'i.sunAz > 2 * {pi}',
        'i.sunAz - 2 * {pi}',
        'sunAz')
      return image
    }
  
   ////////////////////////////////////////////////////////////////////////////////
   // Function to calculate illumination condition (IC). Function by Patrick Burns and Matt Macander 
  this.illuminationCondition = function(img){
    
    // Extract image metadata about solar position
    // var SZ_rad = ee.Image.constant(ee.Number(img.get('SOLAR_ZENITH_ANGLE'))).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000)); 
    // var SA_rad = ee.Image.constant(ee.Number(img.get('SOLAR_AZIMUTH_ANGLE')).multiply(3.14159265359).divide(180)).clip(img.geometry().buffer(10000)); 
    var SZ_rad = img.select('sunZen')
    var SA_rad = img.select('sunAz')
    
    // Creat terrain layers
    var slp = ee.Terrain.slope(PARAMS.dem)
      .clip(img.geometry().buffer(10000));
      
    var slp_rad = ee.Terrain.slope(PARAMS.dem)
      .multiply(3.14159265359)
      .divide(180)
      .clip(img.geometry().buffer(10000));
      
    var asp_rad = ee.Terrain.aspect(PARAMS.dem)
      .multiply(3.14159265359)
      .divide(180)
      .clip(img.geometry().buffer(10000));
    
    // Calculate the Illumination Condition (IC)
    // slope part of the illumination condition
    var cosZ = SZ_rad.cos();
    var cosS = slp_rad.cos();
    var slope_illumination = cosS.expression("cosZ * cosS", 
                                            {'cosZ': cosZ,
                                            'cosS': cosS.select('slope')});
    // aspect part of the illumination condition
    var sinZ = SZ_rad.sin(); 
    var sinS = slp_rad.sin();
    var cosAziDiff = (SA_rad.subtract(asp_rad)).cos();
    var aspect_illumination = sinZ.expression("sinZ * sinS * cosAziDiff", 
                                            {'sinZ': sinZ,
                                              'sinS': sinS,
                                              'cosAziDiff': cosAziDiff});
    // full illumination condition (IC)
    var ic = slope_illumination.add(aspect_illumination);
    
    // Add IC to original image
    var img_plus_ic = ee.Image(
      img.addBands(ic.rename('IC'))
      .addBands(cosZ.rename('cosZ'))
      .addBands(cosS.rename('cosS'))
      .addBands(slp.rename('slope')));
    return img_plus_ic;
  }
   
   
  ////////////////////////////////////////////////////////////////////////////////
    // Function to apply the Sun-Canopy-Sensor + C (SCSc) correction method to each 
    // image. Function by Patrick Burns and Matt Macander 
    // Soenen, S. A., Peddle, D. R., & Coburn, C. A. (2005). SCS+ C: A modified sun-canopy-sensor topographic correction in forested terrain. IEEE Transactions on geoscience and remote sensing, 43(9), 2148-2159.
  this.illuminationCorrection = function(img){
    var props = img.toDictionary();
    var st = img.get('system:time_start');
    
    var img_plus_ic = img;
    var mask1 = img_plus_ic.select('NIR').gt(-0.1);
    var mask2 = img_plus_ic.select('slope').gte(5)
                            // .and(img_plus_ic.select('IC').gte(0))
                            .and(img_plus_ic.select('NIR').gt(-0.1));
    var img_plus_ic_mask2 = ee.Image(img_plus_ic.updateMask(mask2));
    
    // Specify Bands to topographically correct  
    var bandList = ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2']; 
    var compositeBands = img.bandNames();
    var nonCorrectBands = img.select(compositeBands.removeAll(bandList));
    
    var geom = ee.Geometry(img.get('system:footprint')).bounds().buffer(10000);
    
    function apply_SCSccorr(band){
      var method = 'SCSc';
      var out = img_plus_ic_mask2.select('IC', band).reduceRegion({
      reducer: ee.Reducer.linearFit(), // Compute coefficients: a(slope), b(offset), c(b/a)
      geometry: ee.Geometry(img.geometry().buffer(-5000)), // trim off the outer edges of the image for linear relationship 
      scale: 300,
      maxPixels: 1000000000,
      tileScale: 8
      });  

  if (out === null || out === undefined ){
      return img_plus_ic_mask2.select(band);
      }
  
  else{
      var out_a = ee.Number(out.get('scale'));
      var out_b = ee.Number(out.get('offset'));
      var out_c = out_b.divide(out_a);
      // Apply the SCSc correction
      var SCSc_output = img_plus_ic_mask2.expression(
        "((image * (cosB * cosZ + cvalue)) / (ic + cvalue))", {
        'image': img_plus_ic_mask2.select(band),
        'ic': img_plus_ic_mask2.select('IC'),
        'cosB': img_plus_ic_mask2.select('cosS'),
        'cosZ': img_plus_ic_mask2.select('cosZ'),
        'cvalue': out_c
      });
      
      return ee.Algorithms.If(out.get('offset'), SCSc_output, img_plus_ic_mask2.select(band))
    }
      
    }
    
    var img_SCSccorr = ee.Image(bandList.map(apply_SCSccorr))
      .addBands(img_plus_ic.select('IC'));
      
    var bandList_IC = ee.List([bandList, 'IC']).flatten();
    
    img_SCSccorr = img_SCSccorr.unmask(img_plus_ic.select(bandList_IC)).select(bandList);
    
    return img_SCSccorr.addBands(nonCorrectBands)
      .setMulti(props)
      .set('system:time_start',st);
  } 
        
}
// main(geo, img.date(), null, img,threshold)
var main = function(geo, date, maskMode, landsatImage, maskType, icThreshold, slopeThreshold) {
  
  PARAMS.geo = geo
  PARAMS.date = ee.Date(date)
  PARAMS.icThreshold = icThreshold || .7
  PARAMS.slopeThreshold = slopeThreshold || 10
  maskType = maskType || 'any'

  if (maskMode) {
    FUNCS.filterLandsat()
  } else {
    PARAMS.landsatImage = landsatImage
    PARAMS.newDate = PARAMS.date
    PARAMS.sensingTime = ee.Date(PARAMS.landsatImage.get('SENSING_TIME'))
    
  }
  
  var solarGeo = HELPER.solarPosition(
      PARAMS.landsatImage, 
      PARAMS.newDate.millis()
    )
  PARAMS.solarGeo = solarGeo
  
  var illuminationCondition = ee.Image(
      HELPER.illuminationCondition(
        PARAMS.solarGeo
      )
  )
  
  PARAMS.illuminationCondition = illuminationCondition
  

  var terrainCorrected = ee.Image(
      HELPER.illuminationCorrection(
        illuminationCondition
      )
  )
  // In case i need it later....
  PARAMS.terrainCorrected = terrainCorrected

  var illumMask = illuminationCondition.select('IC')
    .lte(PARAMS.icThreshold)
    .and(
      PARAMS.products.select('slope')
      .gt(
        PARAMS.slopeThreshold
      )
    ).unmask()

  // Now get cast shadow
  var imgWithSZE = ee.Image(
    FUNCS.getSZE(
      illuminationCondition
    )
  )
  
  var hillShadow = ee.Image(
    HELPER.doHillShadow(
      imgWithSZE
    )).gt(0).and(
    PARAMS.products.select('slope').gt(PARAMS.slopeThreshold))
  .unmask()

  if (maskType == 'any') {
    return illumMask.or(hillShadow).rename('TerrainShadowMask')
  } else if (maskType == 'type') {
    return hillShadow.multiply(2).add(illumMask).rename('TerrainShadowMask')
  } else if (maskType == 'hillshadow') {
    return hillShadow.rename('ShadowMask')
  } else if (maskType == 'IC') {
    return illuminationCondition.select('IC')
  }  else {
    return illumMask.rename('TerrainMask')
  }
}


var mappingFunc = function(feat) {
  var imList = ee.List([2,5,8,11]).map(function(num) {
    return ee.Image(
      main(
        feat.centroid().geometry(), 
        ee.String('2012-').cat(ee.String(num)).cat('-01'),
        true
      )
    )
  })
  
  return ee.ImageCollection(imList)
    .reduce(
      ee.Reducer.sum()
    ).gt(0).selfMask()
}

var makeMask = function(geo, icThreshold, slopeThreshold, maskType) {
  PARAMS.icThreshold = icThreshold || .7
  PARAMS.slopeThreshold = slopeThreshold || 10
  PARAMS.maskType = maskType || 'any'
  var feats = PARAMS.wrs2.filterBounds(geo)
  return ee.ImageCollection(feats.map(mappingFunc)).mosaic()
}


var terrainCorrection = function(img, date, mask, threshold) {
  if (date) {
    img = img.set('system:time_start',ee.Date(date).millis())
  }
  var copyOfImage = img
  var geo = img.geometry()
  
  img = HELPER.solarPosition(
      img, 
      ee.Date(date).millis()
    )
  
  img = HELPER.illuminationCondition(img);
  img = HELPER.illuminationCorrection(img);
  
  img = ee.Image(img).clip(geo)
  
  if (mask && mask == 'any') {
    var tMask = makeMask(geo)
    img = img.updateMask(tMask)
  } else if (mask && mask == 'image') {
    var tMask = main(geo, img.date(), null, img,'image',threshold)
    var spectralBands = img.select(['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','TEMP'])
    var allMasks = ee.Image.cat([tMask, tMask, tMask, tMask, tMask, tMask, tMask])
    spectralBands = spectralBands.where(tMask.not(), copyOfImage)
    img = img.addBands(spectralBands, null, true)
  }

  return img.copyProperties(copyOfImage)
}  

HELPER = new HELPER()
FUNCS = new FUNCS()


exports.makeMask = makeMask
exports.terrainCorrection = terrainCorrection
exports.main = main


// Testing below
// var img =  ee.Image('LANDSAT/LT05/C01/T1_SR/LT05_038031_19990705')
//   .select(['B1','B2','B3','B4','B5','B7','B6']).rename(['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','TEMP'])

// var corrected = ee.Image(terrainCorrection(img, img.date(), 'image', .5))
// var corrected2 = ee.Image(terrainCorrection(img, img.date(), 'image', .9))

// Map.addLayer(corrected.select('IC'), {min: 0, max: 1}, 'IC')

// Map.addLayer(img.select(['SWIR1','NIR','RED']), {min: 0, max: 6000}, 'Original')

// Map.addLayer(corrected2.select(['SWIR1','NIR','RED']), {min: 0, max: 6000}, 'Corrected1')
// Map.addLayer(corrected.select(['SWIR1','NIR','RED']), {min: 0, max: 6000}, 'Corrected9')