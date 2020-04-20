Part 3: Classify time series segments
-------------------------------------

The third step in performing land cover classification using CCDC is to
use the training data from step 2 in a machine learning classifier to
classify each CCDC *segment*. Note that each pixel can have a different
number of segments depending on the number of changes detected. That is
why the coefficients for CCDC are stored in n-dimensional arrays,
because each pixel can have a different number of dimensions depending
on the changes detected. This means that the process is *slightly* more
complicated than a simple supervised classification, but this tutorial
will go through it all.

A code example using GLANCE data and parameters can be found here:

https://code.earthengine.google.com/?scriptPath=projects%2FGLANCE%3ATutorial%2FPart%202.%20Classification

Classification requirements:
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  The training data must be specified in the format described in Part 1
   of this tutorial.
-  A machine learning classifier.

Converting the CCDC coefficient data to an image that can be classified
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The first step is to convert the n-dimensional CCDC array into an image
that can be classified. In this image, there are a finite amount of
bands depending on the amount of CCDC "segments" the user wants to
classify. Think of it this way, a stable land cover that never changes
has 1 segment for the entire time period. An agricultural land that has
many different changes due to crop rotation will have many segments even
if they are all classified as agriculture. The user needs to decide on
the maximum amount of segments to classify. My opinion is that for most
landscapes there will not be more than 6 changes, some of which are due
to land cover change and some due to change in condition.

There are a few parameter options that we should define first.

+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| Parameter           | Type            | Description                                                                                                                           | Options                                                                                                                                           |    |
+=====================+=================+=======================================================================================================================================+===================================================================================================================================================+====+
| bandNames           | list            | bands to use in classification                                                                                                        | "BLUE","GREEN","RED","NIR", "SWIR1","SWIR2","TEMP"                                                                                                |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| inputFeatures       | list            | inputs (predictors) to use in classification                                                                                          | "INTP", "SLP", "COS", "SIN", "COS2", "SIN2", "COS3","SIN3", "RMSE", "AMPLITUDE", "PHASE", "AMPLITUDE\_1", "PHASE\_1","AMPLITUDE\_2", "PHASE\_2"   |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| ancillaryFeatures   | list            | ancillary data to use as predictors                                                                                                   | "ELEVATION","ASPECT", "DEM\_SLOPE", "RAINFALL", "TEMPERATURE"                                                                                     |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| numberOfSegments    | Number          | number of segments to classify. If a pixel has more segments than numberOfSegments, the additional segments will not be classified.   | Any # =>1                                                                                                                                         |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| studyArea           | ee.Geometry     | study region                                                                                                                          | Polygon, MultiPolygon                                                                                                                             |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| trainingDataPath    | String          | Path to training data                                                                                                                 |                                                                                                                                                   |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| trainProp           | Float           | Proportion of training data to use for testing (optional)                                                                             | Any # from 0 to 1                                                                                                                                 |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| seed                | Number          | Random number seed for selection of training subset for testing (optional)                                                            |                                                                                                                                                   |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+
| classifier          | ee.Classifier   | Earth Engine classifier with parameters already specified                                                                             | Any GEE classifier                                                                                                                                |    |
+---------------------+-----------------+---------------------------------------------------------------------------------------------------------------------------------------+---------------------------------------------------------------------------------------------------------------------------------------------------+----+

The API functions 'newFillNoData' and 'newBuildCcdcImage' in the CCDC
module and 'getAncillary' in the Inputs module can be used to create the
CCDC stack with ancillary data to classify.

.. code:: javascript

    // First load the API file
    var utils = require('projects/GLANCE:ccdcUtilities/api')

    // Define a couple parameters
    var bandNames = ["BLUE","GREEN","RED","NIR","SWIR1","SWIR2","TEMP"]
    var inputFeatures = ["INTP", "SLP","PHASE","AMPLITUDE","RMSE"]
    var ancillaryFeatures = ["ELEVATION","ASPECT","DEM_SLOPE","RAINFALL","TEMPERATURE"]
    var numberOfSegments = 6
    var classProperty = 'landcover'
    var trainProp = .2
    var seed = Math.ceil(Math.random() * 1000)
    var studyArea = ee.Geometry.Polygon(
            [[[-65.11727581440459, -8.755437491733284],
              [-65.11727581440459, -13.240578578777912],
              [-59.470303158154586, -13.240578578777912],
              [-59.470303158154586, -8.755437491733284]]], null, false);
    var trainingDataPath = 'PATH/TO/YOUR/TRAINING/DATA'
    var classifier = ee.Classifier.smileRandomForest({
      numberOfTrees: 150,
      variablesPerSplit: null,
      minLeafPopulation: 1,
      bagFraction: 0.5,
      maxNodes: null
    })

    // Obtain the CCDC change detection array
    var ccdcArray = 'PATH/TO/YOUR/CCDC/ARRAy'
    var ccdcCollection = ee.ImageCollection("projects/CCDC/" + ccdVersion)

    // Next, turn array image into image
    var imageToClassify = utils.CCDC.buildCcdImage(ccdcArray, numberOfSegments, bandNames)

    // Now get ancillary data
    var demImage = ee.Image('USGS/SRTMGL1_003').rename('ELEVATION')
    var slope = ee.Terrain.slope(demImage).rename('DEM_SLOPE')
    var aspect = ee.Terrain.aspect(demImage).rename('ASPECT')
    var bio = ee.Image('WORLDCLIM/V1/BIO')
        .select(['bio01','bio12'])
        .rename(['TEMPERATURE','RAINFALL'])
    var ancillary = ee.Image.cat([demImage, slope, aspect, bio])

Next, we can actually do the classification! We've already defined the
parameters above, so we can then use the 'classifySegments' function to
classify the CCDC segments.

.. code:: javascript


    // Now do the actual classification add the first segments classification to the map

    // Get training data as FC
    var trainingData = ee.FeatureCollection(trainingDataPath)

    // Optionally filter by study area
    trainingData = trainingData.filterBounds(studyArea)

    var results = utils.Classification.classifySegments(
        imageToClassify, numberOfSegments, bandNames, ancillary, ancillaryFeatures,
        trainingData, classifier, studyArea, classProperty, inputFeatures)
      .clip(studyArea)

    // Get a legend and visualization parameters from the api.

    var viz = utils.Results.viz
    var legend = utils.Results.legend

    Map.addLayer(results.select(0), viz, 'Seg1 Classification')
    Map.add(legend)

.. figure:: ../img/classify1.png
   :alt: img1

   img1
And just like that, we can get a classified land cover map! The layer
added represents the first segment land cover, which in this case is
circa 1999.
