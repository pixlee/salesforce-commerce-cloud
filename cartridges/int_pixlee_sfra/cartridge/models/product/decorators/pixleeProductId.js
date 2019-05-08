'use strict';

module.exports = function (object, apiProduct) {
    Object.defineProperty(object, 'pixleeProductId', {
        enumerable: true,
        get: function () {
            var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');

            return pixleeHelper.getPixleeProductId(apiProduct);
        }
    });
};
