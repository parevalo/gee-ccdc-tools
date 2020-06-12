Google Earth Engine tools for CCDC
==================================

This is the documentation for the toolbox to use the Continuous Change Detection and Classification (CCDC) algorithm on the Google Earth Engine.

.. _Google Earth Engine: https://earthengine.google.com/

CCDC is used to monitor changes in land cover, land use, or condition using dense time series of satellite imagery. As the name suggests, there are two primary components: change detection and classification. CCDC has primarily been applied using Landsat data, but these tools are designed to be data agnostic. This toolbox provides applications and a Javascript API for performing all necessary steps in using CCDC, including:

* Visualizing pixel-based time series and CCDC model fits
* Performing change detection for entire study regions
* Visualiing CCDC coefficient images
* Producing "synthetic" imagery
* Land cover classification
* Creating maps of land cover/use change


This documentation and the tools are a work in progress. For any questions contact us at: parevalo@bu.edu or bullocke@bu.edu.


Contents


Background
__________

.. toctree::
   :maxdepth: 2


   background


Documentation
_____________

.. toctree::
   :maxdepth: 2


Tutorials
__________

.. toctree::
   :maxdepth: 2

   ccdc_viz
   lcgui
   lctut
   ccdc

API
___

.. toctree::
   :maxdepth: 1


   api/api
