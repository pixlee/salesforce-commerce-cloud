'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var masterProductModelMock = {
    variant: false,
    ID: 'someID',
    manufacturerSKU: 'some manufacturer SKU'
};

var variantProductModelMock = {
    variant: true,
    masterProduct: masterProductModelMock
};

var PixleeHelper = require('../../../../../mocks/scripts/pixlee/helpers/pixleeHelper');
var object;
var pixleeProductId;

describe('Product pixleeProductId decorator', function () {
    it('should create pixleeProductId property for Variant and SKU Refference set to Manufacturer SKU', function () {
        object = {};
        pixleeProductId = proxyquire('../../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/decorators/pixleeProductId', {
            '*/cartridge/scripts/pixlee/helpers/pixleeHelper': new PixleeHelper({
                skuReference: 'Manufacturer SKU'
            })
        });
        pixleeProductId(object, variantProductModelMock);

        assert.equal(object.pixleeProductId, 'some manufacturer SKU');
    });

    it('should create pixleeProductId property for Variant and SKU Refference set to Product ID', function () {
        object = {};
        pixleeProductId = proxyquire('../../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/decorators/pixleeProductId', {
            '*/cartridge/scripts/pixlee/helpers/pixleeHelper': new PixleeHelper({
                skuReference: 'Product ID'
            })
        });
        pixleeProductId(object, variantProductModelMock);

        assert.equal(object.pixleeProductId, 'someID');
    });

    it('should create pixleeProductId property for Master Product and SKU Refference set to Manufacturer SKU', function () {
        object = {};
        pixleeProductId = proxyquire('../../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/decorators/pixleeProductId', {
            '*/cartridge/scripts/pixlee/helpers/pixleeHelper': new PixleeHelper({
                skuReference: 'Manufacturer SKU'
            })
        });
        pixleeProductId(object, masterProductModelMock);

        assert.equal(object.pixleeProductId, 'some manufacturer SKU');
    });

    it('should create pixleeProductId property for Master Product and SKU Refference set to Product ID', function () {
        object = {};
        pixleeProductId = proxyquire('../../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/decorators/pixleeProductId', {
            '*/cartridge/scripts/pixlee/helpers/pixleeHelper': new PixleeHelper({
                skuReference: 'Product ID'
            })
        });
        pixleeProductId(object, masterProductModelMock);

        assert.equal(object.pixleeProductId, 'someID');
    });
});
