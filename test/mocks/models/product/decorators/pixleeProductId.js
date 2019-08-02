'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var PixleeHelper = require('../../../../mocks/scripts/pixlee/helpers/pixleeHelper');

module.exports = proxyquire('../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/decorators/pixleeProductId', {
    '*/cartridge/scripts/pixlee/helpers/pixleeHelper': new PixleeHelper({
        skuReference: 'Manufacturer SKU'
    })
});
