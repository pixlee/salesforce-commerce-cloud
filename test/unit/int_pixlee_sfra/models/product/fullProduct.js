'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();
var mockSuperModule = require('../../../../mockModuleSuperModule');
var baseFullProductMock = require('../../../../mocks/models/product/baseFullProduct');

var productMock = {
    attributeModel: {},
    minOrderQuantity: { value: 'someValue' },
    availabilityModel: {},
    stepQuantity: { value: 'someOtherValue' },
    getPrimaryCategory: function () { return { custom: { sizeChartID: 'someID' } }; },
    getMasterProduct: function () {
        return {
            getPrimaryCategory: function () { return { custom: { sizeChartID: 'someID' } }; }
        };
    },
    ID: 'someID',
    pageTitle: 'some title',
    pageDescription: 'some description',
    pageKeywords: 'some keywords',
    pageMetaData: [{}],
    template: 'some template'
};

var optionsMock = {
    productType: 'someProductType',
    optionModel: {},
    quantity: 1,
    variationModel: {},
    promotions: [],
    variables: []
};

var fullProduct;

describe('Full Product Model', function () {
    before(function () {
        mockSuperModule.create(baseFullProductMock);
        fullProduct = proxyquire('../../../../../cartridges/int_pixlee_sfra/cartridge/models/product/fullProduct', {
            '*/cartridge/models/product/decorators/index': require('../../../../mocks/models/product/decorators/index')
        });
    });
    after(function () {
        mockSuperModule.remove();
    });

    it('should call pixleeProductId for full product', function () {
        var object = {};
        fullProduct(object, productMock, optionsMock);

        assert.equal(object.pixleeProductId, 'someID');
    });
});
