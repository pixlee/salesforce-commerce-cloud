'use strict';

function getPixleeProductId(product) {
	var Site = require('dw/system/Site');
	var pixleeSkuReference = Site.current.getCustomPreferenceValue('SkuReference');

	if ('Manufacturer SKU'.equalsIgnoreCase(pixleeSkuReference)) {
		return product.manufacturerSKU
	}
	
	return product.ID;
}

exports.getPixleeProductId = getPixleeProductId;
