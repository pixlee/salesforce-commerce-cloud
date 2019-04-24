'use strict';

module.exports = function (object, apiProduct) {
    Object.defineProperty(object, 'pixleeProductId', {
        enumerable: true,
        get: function () {
            var pixleeProductHelper = require('*/cartridge/scripts/pixlee/helpers/productHelper');

            return pixleeProductHelper.getPixleeProductSKU(apiProduct);
        }
    });
};
