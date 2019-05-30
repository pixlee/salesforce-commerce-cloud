# int_pixlee: Pixlee SFRA LINK cartridge

This cartridge is intended to provide components required to integrate Pixlee services with Salesforce Commerce Cloud applications based on SFRA. 

## Dependencies
This cartridge depends on `int_pixlee_core`.

## Compile Client-Side Code and SCSS
Make sure `paths:base` property of `package.json` file located in the root folder of Pixlee LINK repository has the correct relative path to your SFRA base cartridge. It's default value will be as follows:

	"paths": {
		"base": "../storefront-reference-architecture/cartridges/app_storefront_base/"
	}

In the root folder of Pixlee LINK repository, execute `npm install` to install the required Node dependencies.

From the same folder, execute `npm run compile:js` to compile the client-side JavaScript code.

The cartridge does not contain any stylesheets, so SCSS compilation is not requred.

## Deployment

Having completed the client-side code compilation, and configured `dw.json` file in the root folder of Pixlee LINK repository, execute `npm run uploadCartridge`. It should upload both `int_pixlee_core` and `int_pixlee_sfra` cartridges to the environment and code version specified in `dw.json`.

Please refer to [SFRA repository](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture) for details on configuring `dw.json`.

## Cartridge Path Considerations
The cartridge should be placed to the left of `int_pixlee_core`. Here is an example:

	app_client:int_pixlee_sfra:int_pixlee_core:app_storefront_base:modules

More details could be found here:
https://developers.pixlee.com/docs/salesforce-commerce-cloud-demandware
