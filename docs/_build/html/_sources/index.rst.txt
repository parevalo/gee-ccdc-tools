Google Earth Engine tools for CCDC
==================================

This is the documentation for a suite of tools designed for continuous land change monitoring in Google Earth Engine. The paper that accompanies this documentation and explains the rationale and potential uses for the tools can be found here_.

.. _here: https://doi.org/10.3389/fclim.2020.576740
.. _Google Earth Engine: https://earthengine.google.com/


CCDC is used to monitor changes in land cover, land use, or condition using dense time series of satellite imagery. As the name suggests, there are two primary components: change detection and classification. CCDC has primarily been applied using Landsat data, but these tools are designed to be data agnostic. This toolbox provides applications and a Javascript API for performing all necessary steps in using CCDC, which include:

* Visualizing pixel-based time series and CCDC model fits
* Performing change detection for entire study regions
* Viewing CCDC coefficient images
* Producing "synthetic" imagery
* Land cover classification
* Creating maps of land cover/use change


This documentation and the tools are a work in progress. For technical issues, please use the "Issues" functionality in the official Github repository_. For general questions contact us at: parevalo@bu.edu or bullocke@bu.edu.

.. _repository: https://github.com/parevalo/gee-ccdc-tools/issues


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


API REFERENCE
_____________

.. toctree::
   :maxdepth: 2 
   
   api/api
