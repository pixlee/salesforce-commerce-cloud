'use strict';

var server = require('server');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.extend(module.superModule);

server.append('AddProduct', consentTracking.consent, function (req, res, next) {
    var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');

    if (pixleeHelper.isPixleeEnabled()) {
        var viewData = res.getViewData();
        var trackingAllowed = pixleeHelper.isTrackingAllowed(viewData.tracking_consent);

        if (trackingAllowed && !viewData.error) {
            var addedProducts;
            if (req.form.pidsObj) {
                addedProducts = JSON.parse(req.form.pidsObj);
            } else {
                addedProducts = [{
                    pid: req.form.pid,
                    qty: req.form.quantity
                }];
            }

            if (addedProducts && addedProducts.length) {
                var addToCartEvents = pixleeHelper.getAddToCartEvents(addedProducts);
                res.json({
                    pixleeEventData: addToCartEvents
                });
            }
        }
    }

    next();
});

module.exports = server.exports();
