# int_pixlee_core: Pixlee core LINK cartridge

Pixlee core cartridge contains common components to be shared by `int_pixlee` and `int_pixlee_sfra` cartridges, including:
* Service defition
* Job step components
* Helper script modules
* ISML templates and modules
* Resources

## Dependencies
This cartridge does not dependend on any other cartridges.

## Compile Client-Side Code and SCSS
The cartridge has no client-side resources to be compiled.

## Deployment
The cartridge is not intended to be used alone. It should be deployed along with either `int_pixlee_sfra` for **SFRA** based applications or `int_pixlee` for **Site Genesis** applications.

For SFRA based applications, the cartridge will be uploaded by npm `uploadCartridge` script.

## Cartridge Path Considerations
The cartridge does not override any components and has its own components namespaces, so could be put to the most right position in the cartridge path. It should definitely be placed to the right of the application specific cartridges, as follows:

* `int_pixlee_sfra:int_pixlee_core` for SFRA
* `int_pixlee:int_pixlee_core` for Site Genesis

More details could be found here:
https://developers.pixlee.com/docs/salesforce-commerce-cloud-demandware
