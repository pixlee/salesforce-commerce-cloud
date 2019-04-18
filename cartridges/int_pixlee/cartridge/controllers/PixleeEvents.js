'use strict';

var ISML = require('dw/template/ISML');

/**
 * An entry point to remote-include Pixlee tracking intializer
 * Remote-include is needed to allow tracking consent from session to be
 *   correctly detected on cached pages.
 */
exports.Include = function () {
    ISML.renderTemplate('pixlee/events/include');
};
exports.Include.public = true;

/**
 * An entry point to retrieve add to cart events stored in session via AJAX call.
 * More detaisl could be found in eventsHelper module description.
 */
exports.GetAddToCartEvents = function () {
    var eventsHelper = require('~/cartridge/scripts/pixlee/helpers/eventsHelper');
    var eventsData = eventsHelper.getAddToCartEventsFromSession();
    var addToCartEvents;

    if (eventsData && eventsData.length) {
        var trackingHelper = require('*/cartridge/scripts/pixlee/helpers/trackingHelper');
        addToCartEvents = trackingHelper.getAddToCartEvents(eventsData);
    }

    ISML.renderTemplate('pixlee/events/json', {
        JSONPayload: JSON.stringify(addToCartEvents || [])
    });
};
exports.GetAddToCartEvents.public = true;
