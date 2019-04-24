'use strict';

var server = require('server');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

server.extend(module.superModule);

/**
 * Adds details for checkout started evetn to view data.
 *
 * @param {Object} res - Response object
 */
function addCheckoutStartedEvent(res) {
    var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');

    if (pixleeHelper.isPixleeEnabled()) {
        var viewData = res.getViewData();
        var trackingAllowed = pixleeHelper.isTrackingAllowed(viewData.tracking_consent);

        if (trackingAllowed && !pixleeHelper.hasCheckoutStartedBeenReported()) {
            var PixleeCheckoutStartedEvent = require('*/cartridge/scripts/pixlee/models/eventModel').PixleeCheckoutStartedEvent;
            var checkoutStartedEvent = new PixleeCheckoutStartedEvent();

            if (checkoutStartedEvent) {
                pixleeHelper.saveCheckoutStartedReportedFlag();

                res.setViewData({
                    pixleeEventData: [checkoutStartedEvent]
                });
            }
        }
    }
}

server.append('Login', consentTracking.consent, function (req, res, next) {
    addCheckoutStartedEvent(res);

    next();
});

server.append('Begin', consentTracking.consent, function (req, res, next) {
    addCheckoutStartedEvent(res);

    next();
});

module.exports = server.exports();
