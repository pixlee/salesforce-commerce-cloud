'use strict';

var server = require('server');

server.extend(module.superModule);

server.append('Confirm', function (req, res, next) {
    var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');

    if (pixleeHelper.isPixleeEnabled()) {
        var viewData = res.getViewData();
        var trackingAllowed = pixleeHelper.isTrackingAllowed(viewData.tracking_consent);

        if (trackingAllowed) {
            var OrderMgr = require('dw/order/OrderMgr');
            var order = OrderMgr.getOrder(req.querystring.ID);

            var PixleeEndCheckoutEvent = require('*/cartridge/scripts/pixlee/models/eventModel').PixleeEndCheckoutEvent;
            var endCheckoutEvent = new PixleeEndCheckoutEvent(order);

            if (endCheckoutEvent) {
                res.setViewData({
                    pixleeEventData: [endCheckoutEvent]
                });
            }
        }
    }

    next();
});

module.exports = server.exports();
