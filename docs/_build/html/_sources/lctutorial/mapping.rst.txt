Part 4: Land Cover Mapping
--------------------------

The output of part 3 was a stack of land cover classifications organized
by CCDC models. Each pixel contains different model start and end times,
so the land cover label for each band corresponds to different time
periods for each pixel. Well that's not very helpful, is it?

Part 4 of this tutorial demonstrates how to go from the classification
"stack" to a map of land cover at a specific year, or change between
years.

Mapping Requirements
~~~~~~~~~~~~~~~~~~~~

-  A classified 'stack' of as demonstrated in Part 3 of this tutorial

To go from a classified image stack to a classification at a date is
relatively straightforward. To get a land cover classification at a
specific date we can use the 'getLcAtDate' function in our API.

.. code:: javascript

    var utils = require('users/parevalo_bu/gee-ccdc-tools:ccdcUtilities/api')
    var classificationStack = '/PATH/TO/IMAGE/STACK'
    var dateOfClassification = '2014-03-27'
    var matchingDate = classUtils.getLcAtDate(classificationStack,
        dateOfClassification)

This can easily be extended to map change between two dates. In this
example we calculate the post-deforestation land cover between 2000 and
2018

.. code:: javascript

    var class2000 = utils.Classification.getLcAtDate(classificationStack,
        '2000-01-01')

    var class2018 = utils.Classification.getLcAtDate(classificationStack,
        '2018-01-01')

    var deforestation = class2000.eq(5)
        .and(class2018.neq(5))

    Map.addLayer(deforestation.selfMask(),
        {palette: 'red'},
        'Deforestation')

    var postDefClass = class2018.updateMask(deforestation)

    Map.addLayer(postDefClass.randomVisualizer(),
        {},
        'Post-Deforestation Class')

Note that the post-disturbance land cover is almost entirely from the
'Herbaceous' class.

.. figure:: ../img/postDefClass.png
   :alt: img1

   img1

In the above example, the Forest class corresponds to the number 5. This
process can be repeated to map any type of land cover change for the
classes in your legend. For example, the following example shows
expansion of river water west of Porto Velho (Cyan are pixels that were
converted from non-water to water)..

.. code:: javascript

    var regrowth = class2000.neq(5).and(class2000.neq(0))
            .and(class2018.eq(5))

    Map.addLayer(regrowth.selfMask(),
            {palette: 'cyan'},
            'Regrowth')

.. figure:: ../img/newWater.png
   :alt: New Water

   New Water
