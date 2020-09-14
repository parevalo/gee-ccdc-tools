////////////////////////////////////////////////////////////////////
// 
// Utility functions for getting inputs for CCDC
//
/////////////////////////////////////////////////////////////////*/
 
var dateUtils = require('users/parevalo_bu/gee-ccdc-tools:ccdcUtilities/dates.js')
var ccdcUtils = require('users/parevalo_bu/gee-ccdc-tools:ccdcUtilities/ccdc.js')
 
/**
* Get Landsat images for a specific region
* Possible bands and indices: BLUE, GREEN, RED, NIR, SWIR1, SWIR2, NDVI, NBR, EVI, EVI2,BRIGHTNESS, GREENNESS, WETNESS
* @param {ee.Dict} options Parameter file containing the keys below
* @param {String} start First date to filter images
* @param {String} end Last date to filter images
* @param {list} targetBands Bands and indices to return
* 
* @returns                ee.ImageCol.    Masked image collection with L4, L5, L7, and L8
*/
function getLandsat(options) {
  var start = (options && options.start) || '1980-01-01'
  var end = (options && options.end) || '2021-01-01'
  var startDoy = (options && options.startDOY) || 1
  var endDoy = (options && options.endDOY) || 366
  var region = (options && options.region) || null
  var targetBands = (options && options.targetBands) || ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2','TEMP','NBR','NDFI','NDVI','GV','NPV','Shade','Soil']
  var useMask = (options && options.useMask) || true
  var sensors = (options && options.sensors) || {l4: true, l5: true, l7: true, l8: true}
 
  // Filter using new filtering functions
  var collection4 = ee.ImageCollection('LANDSAT/LT04/C01/T1_SR')
      .filterDate(start, end)
  var collection5 = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
      .filterDate(start, end)
  var collection7 = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
      .filterDate(start, end)
  var collection8 = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
      .filterDate(start, end)
   if (useMask == 'No') {
    useMask = false
  }
  if (useMask) {
    collection8 = collection8.map(prepareL8)
    collection7 = collection7.map(prepareL7)
    collection5 = collection5.map(prepareL4L5)
    collection4 = collection4.map(prepareL4L5)

  }

  var col = collection4.merge(collection5)
                        .merge(collection7)
                        .merge(collection8)
  if (region) {
    col = col.filterBounds(region)
  }
  
  var indices = doIndices(col).select(targetBands)
  
  if (!sensors.l5) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_5')
  } 
  if (!sensors.l4) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_4')
  }
  if (!sensors.l7) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_7')
  }
  if (!sensors.l8) {
    indices = indices.filterMetadata('SATELLITE','not_equals','LANDSAT_8')
  }
  var indices = indices.filter(ee.Filter.dayOfYear(startDoy, endDoy))
  
  return ee.ImageCollection(indices)
}  

/**
* Calculate spectral indices for all bands in collection
* @param {ee.ImageCollection} collection Landsat image collection
* @returns {ee.ImageCollection} Landsat image with spectral indices
*/
function doIndices(collection) {
  return collection.map(function(image) {
    var NDVI =  calcNDVI(image)
    var NBR = calcNBR(image)
    var EVI = calcEVI(image)
    var EVI2 = calcEVI2(image)
    var TC = tcTrans(image)
    // NDFI function requires surface reflectance bands only
    var BANDS = ['BLUE','GREEN','RED','NIR','SWIR1','SWIR2']
    var NDFI = calcNDFI(image.select(BANDS))
    return image.addBands([NDVI, NBR, EVI, EVI2, TC, NDFI])
  })
}


/**
 * Get Sentinel-2 surface reflectance data. 
 * Taken directly from GEE examples repo.
 * 
 * @param {ee.Geometry} roi target study area to filter data
 * 
 * @returns (ee.ImageCollection) Sentinel-2 SR and spectral indices
 */
function getS2(roi) {
  // Sentinel-2 Level 1C data.  Bands B7, B8, B8A and B10 from this
  // dataset are needed as input to CDI and the cloud mask function.
  var s2 = ee.ImageCollection('COPERNICUS/S2');
  // Cloud probability dataset.  The probability band is used in
  // the cloud mask function.
  var s2c = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY');
  // Sentinel-2 surface reflectance data for the composite.
  var s2Sr = ee.ImageCollection('COPERNICUS/S2_SR');
  
  // Dates over which to create a median composite.
  var start = ee.Date('2016-03-01');
  var end = ee.Date('2021-09-01');
  
  // S2 L1C for Cloud Displacement Index (CDI) bands.
  s2 = s2.filterDate(start, end)
      .select(['B7', 'B8', 'B8A', 'B10']);
  // S2Cloudless for the cloud probability band.
  s2c = s2c.filterDate(start, end)
  // S2 L2A for surface reflectance bands.
  s2Sr = s2Sr.filterDate(start, end)
      .select(['B2', 'B3', 'B4', 'B5','B8','B11','B12']);
  if (roi) {
    s2 = s2.filterBounds(roi)
    s2c = s2c.filterBounds(roi)
    s2Sr = s2Sr.filterBounds(roi)
  }
  // Join two collections on their 'system:index' property.
  // The propertyName parameter is the name of the property
  // that references the joined image.
  function indexJoin(collectionA, collectionB, propertyName) {
    var joined = ee.ImageCollection(ee.Join.saveFirst(propertyName).apply({
      primary: collectionA,
      secondary: collectionB,
      condition: ee.Filter.equals({
        leftField: 'system:index',
        rightField: 'system:index'})
    }));
    // Merge the bands of the joined image.
    return joined.map(function(image) {
      return image.addBands(ee.Image(image.get(propertyName)));
    });
  }
  
  // Aggressively mask clouds and shadows.
  function maskImage(image) {
    // Compute the cloud displacement index from the L1C bands.
    var cdi = ee.Algorithms.Sentinel2.CDI(image);
    var s2c = image.select('probability');
    var cirrus = image.select('B10').multiply(0.0001);
  
    // Assume low-to-mid atmospheric clouds to be pixels where probability
    // is greater than 65%, and CDI is less than -0.5. For higher atmosphere
    // cirrus clouds, assume the cirrus band is greater than 0.01.
    // The final cloud mask is one or both of these conditions.
    var isCloud = s2c.gt(65).and(cdi.lt(-0.5)).or(cirrus.gt(0.01));
  
    // Reproject is required to perform spatial operations at 20m scale.
    // 20m scale is for speed, and assumes clouds don't require 10m precision.
    isCloud = isCloud.focal_min(3).focal_max(16);
    isCloud = isCloud.reproject({crs: cdi.projection(), scale: 20});
  
    // Project shadows from clouds we found in the last step. This assumes we're working in
    // a UTM projection.
    var shadowAzimuth = ee.Number(90)
        .subtract(ee.Number(image.get('MEAN_SOLAR_AZIMUTH_ANGLE')));
  
    // With the following reproject, the shadows are projected 5km.
    isCloud = isCloud.directionalDistanceTransform(shadowAzimuth, 50);
    isCloud = isCloud.reproject({crs: cdi.projection(), scale: 100});
  
    isCloud = isCloud.select('distance').mask();
    return image.select('B2', 'B3', 'B4','B8','B11','B12')
      .rename(['BLUE','GREEN','RED','NIR','SWIR1','SWIR2'])
      .divide(10000).updateMask(isCloud.not())
      .set('system:time_start',ee.Image(image.get('l1c')).get('system:time_start'))
  }
  
  // Join the cloud probability dataset to surface reflectance.
  var withCloudProbability = indexJoin(s2Sr, s2c, 'cloud_probability');
  // Join the L1C data to get the bands needed for CDI.
  var withS2L1C = indexJoin(withCloudProbability, s2, 'l1c');
  
  // Map the cloud masking function over the joined collection.
  return doIndices(ee.ImageCollection(withS2L1C.map(maskImage)));  
} 


/**
* Calculate NDVI for an image
* @param {ee.Image} image  Landsat image with NIR and RED bands
* @returns {ee.Image} NDVI image
*/
function calcNDVI(image) {
   var ndvi = ee.Image(image).normalizedDifference(['NIR', 'RED']).rename('NDVI');
   return ndvi
};

/**
* Calculate NBR for an image
* @param {ee.Image} image  Landsat image with NIR and SWIR2 bands
* @returns {ee.Image} NBR image
*/
function calcNBR(image) {
  var nbr = ee.Image(image).normalizedDifference(['NIR', 'SWIR2']).rename('NBR');
  return nbr
};

/**
 * Calculate NDFI using endmembers from Souza et al., 2005
 * @param {ee.Image} Surface reflectance image with 6 bands (i.e. not thermal)
 * @returns {ee.Image} NDFI transform
 */
function calcNDFI(image) {
  /* Do spectral unmixing */
  var gv = [.0500, .0900, .0400, .6100, .3000, .1000]
  var shade = [0, 0, 0, 0, 0, 0]
  var npv = [.1400, .1700, .2200, .3000, .5500, .3000]
  var soil = [.2000, .3000, .3400, .5800, .6000, .5800]
  var cloud = [.9000, .9600, .8000, .7800, .7200, .6500]
  var cf = .1 // Not parameterized
  var cfThreshold = ee.Image.constant(cf)
  var unmixImage = ee.Image(image).unmix([gv, shade, npv, soil, cloud], true,true)
                  .rename(['band_0', 'band_1', 'band_2','band_3','band_4'])
  var newImage = ee.Image(image).addBands(unmixImage)
  var mask = newImage.select('band_4').lt(cfThreshold)
  var ndfi = ee.Image(unmixImage).expression(
    '((GV / (1 - SHADE)) - (NPV + SOIL)) / ((GV / (1 - SHADE)) + NPV + SOIL)', {
      'GV': ee.Image(unmixImage).select('band_0'),
      'SHADE': ee.Image(unmixImage).select('band_1'),
      'NPV': ee.Image(unmixImage).select('band_2'),
      'SOIL': ee.Image(unmixImage).select('band_3')
    })
    
  return ee.Image(newImage)
        .addBands(ee.Image(ndfi).rename(['NDFI']))
        .select(['band_0','band_1','band_2','band_3','NDFI'])
        .rename(['GV','Shade','NPV','Soil','NDFI'])
        .updateMask(mask)
  }


/**
* Calculate EVI for an image
* @param {ee.Image} image Landsat image with NIR, RED, and BLUE bands
* @returns {ee.Image} EVI transform
*/
function calcEVI(image) {
        
  var evi = ee.Image(image).expression(
          'float(2.5*(((B4) - (B3)) / ((B4) + (6 * (B3)) - (7.5 * (B1)) + 1)))',
          {
              'B4': ee.Image(image).select(['NIR']),
              'B3': ee.Image(image).select(['RED']),
              'B1': ee.Image(image).select(['BLUE'])
          }).rename('EVI');    
  
  return evi
};

/**
* Calculate EVI2 for an image
* @param {ee.Image} image  Landsat image with NIR and RED
* @returns {ee.Image} EVI2 transform
*/
function calcEVI2(image) {
  var evi2 = ee.Image(image).expression(
        'float(2.5*(((B4) - (B3)) / ((B4) + (2.4 * (B3)) + 1)))',
        {
            'B4': image.select('NIR'),
            'B3': image.select('RED')
        });
  return evi2.rename('EVI2')
};

/**
* Tassel Cap coefficients from Crist 1985
* @param {ee.Image} image Landsat image with BLUE, GREEN, RED, NIR, SWIR1, and SWIR2
* @returns {ee.Image} 3-band image with Brightness, Greenness, and Wetness
*/
function tcTrans(image) {

    // Calculate tasseled cap transformation
    var brightness = image.expression(
        '(L1 * B1) + (L2 * B2) + (L3 * B3) + (L4 * B4) + (L5 * B5) + (L6 * B6)',
        {
            'L1': image.select('BLUE'),
            'B1': 0.2043,
            'L2': image.select('GREEN'),
            'B2': 0.4158,
            'L3': image.select('RED'),
            'B3': 0.5524,
            'L4': image.select('NIR'),
            'B4': 0.5741,
            'L5': image.select('SWIR1'),
            'B5': 0.3124,
            'L6': image.select('SWIR2'),
            'B6': 0.2303
        });
    var greenness = image.expression(
        '(L1 * B1) + (L2 * B2) + (L3 * B3) + (L4 * B4) + (L5 * B5) + (L6 * B6)',
        {
            'L1': image.select('BLUE'),
            'B1': -0.1603,
            'L2': image.select('GREEN'),
            'B2': -0.2819,
            'L3': image.select('RED'),
            'B3': -0.4934,
            'L4': image.select('NIR'),
            'B4': 0.7940,
            'L5': image.select('SWIR1'),
            'B5': -0.0002,
            'L6': image.select('SWIR2'),
            'B6': -0.1446
        });
    var wetness = image.expression(
        '(L1 * B1) + (L2 * B2) + (L3 * B3) + (L4 * B4) + (L5 * B5) + (L6 * B6)',
        {
            'L1': image.select('BLUE'),
            'B1': 0.0315,
            'L2': image.select('GREEN'),
            'B2': 0.2021,
            'L3': image.select('RED'),
            'B3': 0.3102,
            'L4': image.select('NIR'),
            'B4': 0.1594,
            'L5': image.select('SWIR1'),
            'B5': -0.6806,
            'L6': image.select('SWIR2'),
            'B6': -0.6109
        });

    var bright =  ee.Image(brightness).rename('BRIGHTNESS');
    var green = ee.Image(greenness).rename('GREENNESS');
    var wet = ee.Image(wetness).rename('WETNESS');
    
    var tasseledCap = ee.Image([bright, green, wet])
    return tasseledCap
}


/**
 * Create a grid with features corresponding to latitudinal strips
 * @param {Dictionary} options parameter file
 * @param {Number} minY  minimum latititude coordinate
 * @param {Number} maxY  maximum latititude coordinate
 * @param {Number} minX  minimum longitude coordinate
 * @param {Number} minX  maximum longitude coordinate
 * @param {Number} size size of features in units of latitudinal degrees
 * @returns {ee.FeatureCollection} grid of features along latitudinal lines
*/
function makeLatGrid(minY, maxY, minX, maxX, size) {

  var ySeq = ee.List.sequence(minY, maxY, size)
  var numFeats = ySeq.length().subtract(2)
  var feats = ee.List.sequence(0, numFeats).map(function(num) {
    num = ee.Number(num)
    var num2 = num.add(1)
    var y1 = ee.Number(ySeq.get(num))
    var y2 = ee.Number(ySeq.get(num2))
    var feat = ee.Feature(ee.Geometry.Polygon([[maxX, y2], [minX, y2], [minX, y1], [maxX, y1]]))
    return feat
  })
  return ee.FeatureCollection(feats)
}



/**
 * Create a grid with features corresponding to longitudinal strips
 * @param {Dictionary} options parameter file
 * @param {Number} minY minimum latititude coordinate
 * @param {Number} maxY maximum latititude coordinate
 * @param {Number} minX minimum longitude coordinate
 * @param {Number} minX maximum longitude coordinate
 * @param {Number} size size of features in units of latitudinal degrees
 * @returns {ee.FeatureCollection} grid of features along longitudinal lines
 */
function makeLonGrid(minY, maxY, minX, maxX, size) {

  var ySeq = ee.List.sequence(minX, maxX, size)
  var numFeats = ySeq.length().subtract(2)
  var feats = ee.List.sequence(0, numFeats).map(function(num) {
    num = ee.Number(num)
    var num2 = num.add(1)
    var x1 = ee.Number(ySeq.get(num))
    var x2 = ee.Number(ySeq.get(num2))
    var feat = ee.Feature(ee.Geometry.Polygon([[x2, maxY], [x1, maxY], [x1, minY], [x2, minY]]))
    return feat
  })
  return ee.FeatureCollection(feats)
}

/**
 * Create a grid with features corresponding to longitudinal strips
 * @param {Number} minY minimum latititude coordinate
 * @param {Number} maxY maximum latititude coordinate
 * @param {Number} minX minimum longitude coordinate
 * @param {Number} minX maximum longitude coordinate
 * @param {Number} size size of features in units of latitudinal degrees
 * @returns {ee.FeatureCollection} grid of features along longitudinal lines
*/
function makeLonLatGrid(minY, maxY, minX, maxX, size) {

  var xSeq = ee.List.sequence(minX, maxX, size)
  var ySeq = ee.List.sequence(minY, maxY, size)
  
  var numFeatsY = ySeq.length().subtract(2)
  var numFeatsX = xSeq.length().subtract(2)

  var feats = ee.List.sequence(0, numFeatsY).map(function(y) {
    y = ee.Number(y)
    var y2 = y.add(1)
    var y1_val = ee.Number(ySeq.get(y))
    var y2_val = ee.Number(ySeq.get(y2))
    var feat = ee.List.sequence(0, numFeatsX).map(function(x) {
      x = ee.Number(x)
      var x2 = x.add(1)
      var x1_val = ee.Number(xSeq.get(x))
      var x2_val = ee.Number(xSeq.get(x2))
      return ee.Feature(ee.Geometry.Polygon([[x2_val, y2_val], [x1_val, y2_val], [x1_val, y1_val], [x2_val, y1_val]]))
    })
    return feat
   
  })
  return ee.FeatureCollection(feats.flatten())
}



/**
* Create a grid with features overlaying the bounding box of a geometry
* @param {ee.Geometry} geo geometry to use as spec for grid
* @param {Number} size size of features in units of degrees
* @returns {ee.FeatureCollection} grid of features along 
*/
function makeAutoGrid(geo, size) {
  var coordList = ee.List(geo.coordinates().get(0))
  
  var lonList = coordList.map(function (c) {
    return ee.List(c).flatten().get(0);
  })
  
  var latList = coordList.map(function (c) {
    return ee.List(c).flatten().get(1);
  })
  
  
  var minY = latList.reduce(ee.Reducer.min())
  var maxY = latList.reduce(ee.Reducer.max())
  
  
  var minX = lonList.reduce(ee.Reducer.min())
  var maxX = lonList.reduce(ee.Reducer.max())

  var xSeq = ee.List.sequence(minX, maxX, size)
  var ySeq = ee.List.sequence(minY, maxY, size)
  
  var numFeatsY = ySeq.length().subtract(2)
  var numFeatsX = xSeq.length().subtract(2)

  var feats = ee.List.sequence(0, numFeatsY).map(function(y) {
    y = ee.Number(y)
    var y2 = y.add(1)
    var y1_val = ee.Number(ySeq.get(y))
    var y2_val = ee.Number(ySeq.get(y2))
    var feat = ee.List.sequence(0, numFeatsX).map(function(x) {
      x = ee.Number(x)
      var x2 = x.add(1)
      var x1_val = ee.Number(xSeq.get(x))
      var x2_val = ee.Number(xSeq.get(x2))
      return ee.Feature(ee.Geometry.Polygon([[x2_val, y2_val], [x1_val, y2_val], [x1_val, y1_val], [x2_val, y1_val]]))
    })
    return feat
   
  })
  return ee.FeatureCollection(feats.flatten())
}


/** 
* Get ancillary data for trainning and classification.
* @returns {ee.Image} Multi-band image containing ancillary layers
*/ 
function getAncillary(){

  var srtm = ee.Image('USGS/SRTMGL1_003').rename('ELEVATION')
  var alos =  ee.Image("JAXA/ALOS/AW3D30/V2_2").select(0).rename('ELEVATION')
  var demImage = ee.ImageCollection([alos,srtm]).mosaic()

  var slope = ee.Terrain.slope(demImage).rename('DEM_SLOPE')
  var aspect = ee.Terrain.aspect(demImage).rename('ASPECT')
  var bio = ee.Image('WORLDCLIM/V1/BIO').select(['bio01','bio12']).rename(['TEMPERATURE','RAINFALL'])
  var water = ee.Image('JRC/GSW1_1/GlobalSurfaceWater')
    .select('occurrence')
    .rename('WATER_OCCURRENCE')
  var pop = ee.ImageCollection("WorldPop/GP/100m/pop")
    .filterMetadata('year','equals',2000)
    .mosaic()
    .rename('POPULATION')
      
  var hansen = ee.Image("UMD/hansen/global_forest_change_2018_v1_6")
    .select('treecover2000')
    .rename('TREE_COVER')
  
  var nightLights = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG")
                          .filter(ee.Filter.date('2019-01-01', '2019-12-31'))
                          .select('avg_rad')
                          .mosaic()
                          .rename('NIGHT_LIGHTS')

  // I can't get this to work without memory errors
  // var settlement = ee.Image("JRC/GHSL/P2016/SMOD_POP_GLOBE_V1/2000")
  // var distance = ee.Image(1).cumulativeCost(
  //   settlement.gt(1), 
  //   100000)
  // .divide(100)
  // .int32()
  // .rename('DISTANCE_SETTLEMENT')
  
  return ee.Image.cat([demImage, slope, aspect, bio, pop, water, hansen, nightLights]).unmask()

}

// /**
// * Get Sentinel-2 Data
// * From EE Examples Repo
// * @param {string} startDate beginning date in format 'YYYY-MM-DD'
// * @param {string} endDate end date in format 'YYYY-MM-DD'
// * @returns {ee.Image} masked median Sentinel-2 image
// */
// var getS2 = function(startDate, endDate) {
//   startDate = startDate || '2014-01-01'
//   endDate = endDate || '2021-12-31'
  
//   var maskS2clouds = function(image) {
//     var qa = image.select('QA60')
  
//     // Bits 10 and 11 are clouds and cirrus, respectively.
//     var cloudBitMask = 1 << 10;
//     var cirrusBitMask = 1 << 11;
  
//     // Both flags should be set to zero, indicating clear conditions.
//     var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
//               qa.bitwiseAnd(cirrusBitMask).eq(0))
  
//     // Return the masked and scaled data, without the QA bands.
//     return image.updateMask(mask).divide(10000)
//         .select("B.*")
//         .copyProperties(image, ["system:time_start"])
//   }
  
//   // Map the function over one year of data and take the median.
//   // Load Sentinel-2 TOA reflectance data.
//   var collection = ee.ImageCollection('COPERNICUS/S2_SR')
//       // Pre-filter to get less cloudy granules.
//       .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50))
//       .map(maskS2clouds)
      
//       //4 and 8
//   // Add NDVI
//   collection = collection.map(function(im) {
//     return im.addBands(ee.Image(im).normalizedDifference(['B8', 'B4']).rename('NDVI'));

//   })

//   return collection
// }



function prepare(orbit) {
  // Load the Sentinel-1 ImageCollection.
  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.eq('orbitProperties_pass', orbit))
}

/**
 * Get Sentinel 1 data
 * @param {string} [mode='ASCENDING'] orbital pass mode ('ASCENDING' or 'DESCENDING')
 * @param {number} [focalSize=3] window size for focal mean (1 means no averaging)
 * @return {ee.ImageCollection} Sentinel 1 collection with VH, VV, and ratio bands smoothed with focal mean
 */ 
function getS1(focalSize, kernelType) {
  focalSize = focalSize || 3
  kernelType = kernelType || 'circle'
  var data = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .select(['V.','angle'])
    .map(function(img) {
      var geom = img.geometry()
      var angle = img.select('angle')
      var edge = img.select('VV').lt(-30.0); //-30

      var fmean = img.select('V.').add(30).focal_mean(focalSize, kernelType)
      var ratio = fmean.select('VH').divide(fmean.select('VV')).rename('ratio').multiply(30)
      return img.select().addBands(fmean).addBands(ratio).addBands(angle)//.clip(geom)//.set('angle',angle)
    })      

    // .select(['V.','angle'])
    // .map(function(img) {
    //   var angle = img.select('angle').sample({numPixels: 1}).first().get('angle')
    //   var angleReversed = img.select('angle').multiply(-1).rename('angleReversed')
    //   var edge = img.select('VV').lt(-30.0); //-30

    //   var fmean = img.select('V.').add(30).focal_mean(focalSize, kernelType )
    //   var ratio = fmean.select('VH').divide(fmean.select('VV')).rename('ratio').multiply(30)
    //   var smoothed = img.select('angle').addBands([fmean, ratio, angleReversed])
    //   return smoothed.updateMask(edge.not()).set('angle',angle)
    // })
    
  return data
  }

/**
 * Generate Landsat collection as created for the global CCDC algorithm
 * AKA Noel's filtering
 */
 
 
/**
* Prepare Landsat 4 and 5 with strict filtering of noisy pixels
* @param {ee.Image} image Landsat SR image with pixel_qa band
* @returns {ee.Image} Landsat image with masked noisy pixels
*/
function prepareL4L5(image){
  var bandList = ['B1', 'B2','B3','B4','B5','B7','B6']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var scaling = [10000, 10000, 10000, 10000, 10000, 10000, 1000]
  var scaled = ee.Image(image).select(bandList).rename(nameList).divide(ee.Image.constant(scaling))

  var validQA = [66, 130, 68, 132]
  var mask1 = ee.Image(image).select(['pixel_qa']).remap(validQA, ee.List.repeat(1, validQA.length), 0)
  // Gat valid data mask, for pixels without band saturation
  var mask2 = image.select('radsat_qa').eq(0)
  var mask3 = image.select(bandList).reduce(ee.Reducer.min()).gt(0)
  // Mask hazy pixels
  var mask4 = image.select("sr_atmos_opacity").lt(300)
  return ee.Image(image).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4))
}

/**
* Prepare Landsat 7 with strict filtering of noisy pixels
* @param {ee.Image} image Landsat SR image with pixel_qa band
* @returns {ee.Image} Landsat image with masked noisy pixels
*/
function prepareL7(image){
  var bandList = ['B1', 'B2','B3','B4','B5','B7','B6']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var scaling = [10000, 10000, 10000, 10000, 10000, 10000, 1000]
  var scaled = ee.Image(image).select(bandList).rename(nameList).divide(ee.Image.constant(scaling))

  var validQA = [66, 130, 68, 132]
  var mask1 = ee.Image(image).select(['pixel_qa']).remap(validQA, ee.List.repeat(1, validQA.length), 0)
  // Gat valid data mask, for pixels without band saturation
  var mask2 = image.select('radsat_qa').eq(0)
  var mask3 = image.select(bandList).reduce(ee.Reducer.min()).gt(0)
  // Mask hazy pixels
  var mask4 = image.select("sr_atmos_opacity").lt(300)
  // Slightly erode bands to get rid of artifacts due to scan lines
  var mask5 = ee.Image(image).mask().reduce(ee.Reducer.min()).focal_min(2.5)
  return ee.Image(image).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4).and(mask5))
}

/**
* Prepare Landsat 8 with strict filtering of noisy pixels
* @param {ee.Image} image Landsat SR image with pixel_qa band
* @returns {ee.Image} Landsat image with masked noisy pixels
*/
function prepareL8(image){
  var bandList = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10']
  var nameList = ['BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'TEMP']
  var scaling = [10000, 10000, 10000, 10000, 10000, 10000, 1000]

  var validTOA = [66, 68, 72, 80, 96, 100, 130, 132, 136, 144, 160, 164]
  var validQA = [322, 386, 324, 388, 836, 900]

  var scaled = ee.Image(image).select(bandList).rename(nameList).divide(ee.Image.constant(scaling))
  var mask1 = ee.Image(image).select(['pixel_qa']).remap(validQA, ee.List.repeat(1, validQA.length), 0)
  var mask2 = image.select('radsat_qa').eq(0)
  var mask3 = image.select(bandList).reduce(ee.Reducer.min()).gt(0)
  var mask4 = ee.Image(image).select(['sr_aerosol']).remap(validTOA, ee.List.repeat(1, validTOA.length), 0)
  return ee.Image(image).addBands(scaled).updateMask(mask1.and(mask2).and(mask3).and(mask4))
}

/**
* Generate and combine filtered collections of Landsat 4, 5, 7 and 8
* @param {ee.Image} geom Geometry used to filter the collection
* @param {String} startDate Initial date to filter the collection
* @param {String} endDate Final date to filter the collection
* @returns {ee.ImageCollection} Filtered Landsat collection
*/
function generateCollection(geom, startDate, endDate){
  var filteredL8 = (ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
                      .filter("WRS_ROW < 122")
                      .filterBounds(geom)
                      .map(prepareL8))

  var filteredL7 = (ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
                      .filter("WRS_ROW < 122")
                      .filterBounds(geom)
                      .map(prepareL7))
                      
  // Originally not included in Noel's run
  var filteredL4 = (ee.ImageCollection('LANDSAT/LT04/C01/T1_SR')
                      .filter("WRS_ROW < 122")
                      .filterBounds(geom)
                      .map(prepareL4L5))
  var filteredL5 = (ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
                      .filter("WRS_ROW < 122")
                      .filterBounds(geom)
                      .map(prepareL4L5))

  var mergedCollections = ee.ImageCollection(filteredL8).merge(filteredL7).merge(filteredL5).merge(filteredL4)
  return mergedCollections.filterDate(startDate, endDate)
}

/**
* Make a ccd image from the most recent known global run
* @param {String} metadataFilter Which ccdc run prefix to use
* @param {List} segs List with the segment names
* @param {Number} numberOfSegments Max number of segments to retrieve from the CCDC results
* @param {List} bandNames List with the band names to use
* @param {List} inputFeatures List with the CCDC features to extract
* @returns {ee.Image} Filtered CCDC results in 'long' format
*/
function makeCcdImage(metadataFilter, segs, numberOfSegments,bandNames,inputFeatures, version) {
  metadataFilter = metadataFilter || 'z'
  numberOfSegments = numberOfSegments || 6
  bandNames = bandNames || ["BLUE","GREEN","RED","NIR","SWIR1","SWIR2","TEMP"]
  segs = segs || ['S1','S2','S3','S4','S5','S6']
  bandNames = bandNames || ["BLUE","GREEN","RED","NIR","SWIR1","SWIR2","TEMP"]
  inputFeatures = inputFeatures || ["INTP", "SLP","PHASE","AMPLITUDE","RMSE"]
  version = version || 'v2'

  var ccdcCollection = ee.ImageCollection("projects/CCDC/" + version)

  // Get CCDC coefficients
  var ccdcCollectionFiltered = ccdcCollection
    .filterMetadata('system:index', 'starts_with',metadataFilter)

  // CCDC mosaic image
  var ccdc = ccdcCollectionFiltered.mosaic()
  
  // Turn array image into image
  return ee.Image(ccdcUtils.buildCcdImage(ccdc, numberOfSegments, bandNames))

}

exports = {
  getLandsat: getLandsat,
  generateCollection: generateCollection,
  doIndices: doIndices,
  makeLatGrid: makeLatGrid,
  makeLonGrid: makeLonGrid,
  makeLonLatGrid: makeLonLatGrid,
  getAncillary: getAncillary,
  getS2: getS2,
  getS1: getS1,
  calcNDFI: calcNDFI,
  makeCcdImage: makeCcdImage,
  calcNDVI: calcNDVI,
  calcNBR: calcNBR,
  calcEVI: calcEVI,
  calcEVI2: calcEVI2,
  tcTrans: tcTrans,
  calcNDFI: calcNDFI,
  makeAutoGrid: makeAutoGrid,
}



