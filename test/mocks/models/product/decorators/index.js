'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

module.exports = proxyquire('../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/decorators/index', {
    '*/cartridge/models/product/decorators/pixleeProductId': require('../../../../mocks/models/product/decorators/pixleeProductId')
});
