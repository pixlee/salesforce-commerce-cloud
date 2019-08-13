var assert = require('chai').assert;
var request = require('request');
var config = require('../it.config');
var chai = require('chai');
var chaiSubset = require('chai-subset');
chai.use(chaiSubset);


describe('Add To Cart', function () {
    this.timeout(15000);
    
    request = request.defaults({
        baseUrl: config.baseUrl, 
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        },
        rejectUnauthorized: false,
        jar: true,        
        json: true
    });
    
    var consentRequest = {
        method: 'GET',
        uri: 'ConsentTracking-SetSession',
        qs: {
            consent: true
        }
    };
    
    var addToCartRequest = {
        method: 'POST',
        uri: 'Cart-AddProduct',
        form: {
            pid: "701642890126M",
            quantity: 1
        },
    };
    
    var expectedData = {
        "pixleeEventData": [{
            "type": "add:to:cart",
            "payload": {
                "product_sku": "25502240M",
                "variant_sku": "701642890126M",
                "quantity": 1,
                "price": "65.99",
                "currency": "USD",
                "region_code": "en_US",
                "version_hash": "727f341dc8998be5cff57140636d81c9101184c3",
                "ecommerce_platform": "demandware",
                "ecommerce_platform_version": "19.3_SFRA"
            }
        }]
    };
    
    
    before(function(done) {
        request.get(consentRequest, function (error, response, jsonResponse) {
            if (error) done(error);
            assert.equal(jsonResponse.success, true, "Could not set tracking consent (required).");
            done();
        });
    });


    it('should contain expected Pixlee data', function (done) {
        request(addToCartRequest, function (error, response, jsonResponse) {
            if (error) done(error);
            
            assert.equal(response.statusCode, 200, 'Unexpected statusCode');
            
            assert.containSubset(jsonResponse.pixleeEventData, expectedData.pixleeEventData);
            
            done();
        });
    });
});
