/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = 
    /* color: #0b4a8b */
    /* displayProperties: [
      {
        "type": "rectangle"
      },
      {
        "type": "rectangle"
      },
      {
        "type": "rectangle"
      },
      {
        "type": "rectangle"
      },
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.MultiPolygon(
        [[[[-117.14969968636422, 31.56495919215045],
           [-117.14969968636422, 27.786113408408234],
           [-102.51591062386422, 27.786113408408234],
           [-102.51591062386422, 31.56495919215045]]],
         [[[-100.73971565424944, 23.387552980701475],
           [-100.73971565424944, 22.715302336002278],
           [-99.55593879878069, 22.715302336002278],
           [-99.55593879878069, 23.387552980701475]]],
         [[[-84.33357618887231, 11.493999379203002],
           [-84.33357618887231, 10.99833392197591],
           [-83.86116407949731, 10.99833392197591],
           [-83.86116407949731, 11.493999379203002]]],
         [[[-84.641588696685, 10.324312563679818],
           [-84.641588696685, 10.118885408298746],
           [-84.32023859902876, 10.118885408298746],
           [-84.32023859902876, 10.324312563679818]]],
         [[[-78.37840592797431, 9.302506837414125],
           [-78.37840592797431, 9.218472491382073],
           [-78.25206315453681, 9.218472491382073],
           [-78.25206315453681, 9.302506837414125]]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/**
 * View GLANCE Global land cover results
 * Last update: Jan 31, 2019
 * Eric Bullock
 * GLANCE Version 0.1
 */
 
// Return collection with all the images that match a string in an asset folder
var assetsToCollection = function(folderPath, assetType, stringMatch){
  var list = ee.data.getList({id: folderPath})
  var ims = []
  
  for (var i = 0; i < list.length; i++ ) {
    var id = list[i]['id']
    if (id.indexOf(stringMatch) != -1) {
      if (assetType == 'featureCollection'){
        var im = ee.FeatureCollection(id)
      } else if (assetType == 'Image'){
        var im = ee.Image(id)
      }
      ims.push(im)
    }
  }
  return ims
}



var ccdcUtils = require('projects/GLANCE:ccdcUtilities/ccdc')
var classUtils = require('projects/GLANCE:ccdcUtilities/classification')

// Date to display in addition to 1999
var date = '2018-01-01'

var getMode = function() {
  // Gather all the results finished as of now and create list.
  var folder = 'projects/GLANCE/RESULTS/CLASSIFICATION/V1'
  
  var list = ee.data.getList({id: folder})
  var ims = []
  
  for (var i = 0; i < list.length; i++ ) {
    var id = list[i]['id']
    if (id.indexOf('Classified') != -1) {
      var im = ee.Image(id)
      ims.push(im)
    }
  } 
  
  // Turn that list into an image collection
  var col = ee.ImageCollection(ims)
  
  // Get the mode for each segment.
  return col.reduce(ee.Reducer.mode())
}

// Visualization parameters
var palette = ['#5475a8','#ffffff','#b50000','#d2cdc0','#38814e','#dcca8f','#ca9146','#85c77e']
var viz = {min: 1, max: 8, palette: palette}


// Legend

// Make legends
var makeRow = function(color, name) {
  // Make a row of a legend

  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });

  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });

  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

var legend = ui.Panel({style: {shown: true, width: '150px'}});
legend.style().set({position: 'bottom-right'});

legend.add(makeRow(palette[0], 'Water'))
legend.add(makeRow(palette[1], 'Ice/Snow'))
legend.add(makeRow(palette[2], 'Built'))
legend.add(makeRow(palette[3], 'Bare'))
legend.add(makeRow(palette[4], 'Forest'))
legend.add(makeRow(palette[5], 'Shrub'))
legend.add(makeRow(palette[6], 'Herbaceous'))
legend.add(makeRow(palette[7], 'Woodland'))



exports.viz = viz
exports.legend = legend
exports.getMode = getMode
exports.assetsToCollection = assetsToCollection
