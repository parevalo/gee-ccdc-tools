Background
=========================

CCDC is an algorithm developed to monitor changes in land cover, land use, or condition using dense time series of satellite imagery. As the name suggests, there are two primary components: change detection and classification. The algorithm itself (CCD) only does the change detection part; the classification must be done separately. We provide tools and examples to simplify that process. The original paper with the description of the algorithm can be found here_. 

.. _here: https://doi.org/10.1016/j.rse.2014.01.011

CCDC has primarily been applied using Landsat data and most of the tools presented here have been created and tested for Landsat imagery. However, the algorithm itself as implemented in GEE is data agnostic and has been successfully used with other imagery (such as Sentinel-1).

The tools presented here are a (slightly) more stable version of some of the tools developed for the Global Land Cover mapping and Estimation (GLanCE_) project at Boston University. We will attempt to maintain and update the code and documentation as much as possible for the duration of the project.

.. _GLanCE: https://sites.bu.edu/measures/


