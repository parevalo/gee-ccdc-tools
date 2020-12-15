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

Classification requirements:
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  The training data must be specified in the format described in Part 2
   of this tutorial.
-  A machine learning classifier.

Converting the CCDC coefficient data to an image that can be classified
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The API functions 'loadResults' in the Classification module and 'getAncillary' in 
the Inputs module can be used to create the CCDC stack with ancillary data to 
classify.

.. code:: javascript

    // First load the API file
    var utils = require('users/parevalo_bu/gee-ccdc-tools:ccdcUtilities/api')


Next, we can actually do the classification! We've already defined the
parameters above, so we can then use the 'classifySegments' function to
classify the CCDC segments. Note the parameters were defined earlier in this
tutorial. 

.. code:: javascript


    // Now do the actual classification add the first segments classification to the map

    // Get training data as FC
    var trainingData = ee.FeatureCollection(params.Classification.trainingPath)

    // Optionally filter by study area
    trainingData = trainingData.filterBounds(params.StudyRegion)

    // Next, turn array image into image
    var imageToClassify = utils.CCDC.buildCcdImage(params.Classification.changeResults, params.Classification.segs.length, params.Classification.bandNames)

    // Now get ancillary data
    var demImage = ee.Image('USGS/SRTMGL1_003').rename('ELEVATION')
    var slope = ee.Terrain.slope(demImage).rename('DEM_SLOPE')
    var aspect = ee.Terrain.aspect(demImage).rename('ASPECT')
    var bio = ee.Image('WORLDCLIM/V1/BIO')
        .select(['bio01','bio12'])
        .rename(['TEMPERATURE','RAINFALL'])
    var ancillary = ee.Image.cat([demImage, slope, aspect, bio])

    // Get classifier with params
    var classifier = params.Classification.classifier(params.Classification.classifierParams)

    var results = utils.Classification.classifySegments(
        imageToClassify, params.Classification.segs.length, params.Classification.bandNames, 
        ancillary, params.Classification.ancillaryFeatures,
        trainingData, classifier, params.StudyRegion, params.Classification.classProperty, 
        params.Classification.inputFeatures)
        .clip(params.StudyRegion)

    Map.addLayer(results.select(0).randomVisualizer(), {}, 'Seg1 Classification')

.. figure:: ../img/classify1.png
   :alt: img1

   img1

And just like that, we can get a classified land cover map! The layer
added represents the first segment land cover.
