# int_pixlee: Pixlee Site Genesis LINK cartridge

This cartridge is intended to provide components required to integrate Pixlee services with Salesforce Commerce Cloud applications based on Site Genesis. 

## Dependencies
This cartridge depends on `int_pixlee_core`.

## Compile Client-Side Code and SCSS
The cartridge has no client-side resources to be compiled.

## Deployment
It should be arranged that both `int_pixlee` and `int_pixlee_core` cartridges are uploaded to SFCC environments.

## Cartridge Path Considerations
The cartridge should be placed to the left of `int_pixlee_core`. Here is an example:

	cleint_sitegenesis_controllers:client_sitegenesis_core:int_pixlee:int_pixlee_core

More details could be found here:
https://developers.pixlee.com/docs/salesforce-commerce-cloud-demandware

