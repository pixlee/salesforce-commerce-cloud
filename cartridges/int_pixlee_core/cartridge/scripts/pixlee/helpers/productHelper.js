'use strict';

/**
 * Retrieves the product ID to pass to Pixlee from a different product attribute
 * depending on SkuReference site preference.
 *
 * @param {dw.catalog.Product} product Product to retrive ID for
 * @return {string} Product ID to pass to Pixlee
 */
function getPixleeProductSKU(product) {
    var Site = require('dw/system/Site');
    var pixleeSkuReference = Site.current.getCustomPreferenceValue('SkuReference');

    if ('Manufacturer SKU'.equalsIgnoreCase(pixleeSkuReference)) {
        return product.manufacturerSKU;
    }

    return product.ID;
}

exports.getPixleeProductSKU = getPixleeProductSKU;
