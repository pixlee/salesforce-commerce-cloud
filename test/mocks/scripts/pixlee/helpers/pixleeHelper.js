'use strict';

var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var Site = require('../../../dw/system/Site');

module.exports = function (params) {
    return proxyquire('../../../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/helpers/pixleeHelper', {
        'dw/system/Site': new Site(params)
    });
};
