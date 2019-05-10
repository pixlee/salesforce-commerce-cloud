'use strict';

var base = module.superModule;

var decorators = require('*/cartridge/models/product/decorators/index');

/**
 * Decorate product with product Pixlee product ID.
 * @param {Object} product - Product Model to be decorated
 * @param {dw.catalog.Product} apiProduct - Product information returned by the script API
 * @param {Object} options - Options passed in from the factory
 * @property {string} pixleeProductId - Product ID to be used by Pixlee components
 *
 * @returns {Object} - Decorated product model
 */
module.exports = function fullProduct(product, apiProduct, options) {
    base(product, apiProduct, options);

    decorators.pixleeProductId(product, apiProduct);

    return product;
};
