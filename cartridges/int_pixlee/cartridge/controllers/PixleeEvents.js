'use strict';

var ISML = require('dw/template/ISML');

/**
 * An entry point to remote-include Pixlee tracking initializer
 * Remote-include is needed to allow tracking consent from session to be
 *   correctly detected on cached pages.
 */
exports.Init = function () {
    ISML.renderTemplate('pixlee/events/init');
};
exports.Init.public = true;

/**
 * An entry point to retrieve add to cart events stored in session via AJAX call.
 * More details could be found in eventsHelper module description.
 */
exports.GetAddToCartEvents = function () {
    var eventsHelper = require('~/cartridge/scripts/pixlee/helpers/eventsHelper');
    var eventsData = eventsHelper.getAddToCartEventsFromSession();
    var addToCartEvents = [];

    if (eventsData && eventsData.length) {
        var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');
        addToCartEvents = pixleeHelper.getAddToCartEvents(eventsData);
    }
    
    var jsonResponse = JSON.stringify(addToCartEvents);
    response.setContentType('application/json');
    response.writer.print(jsonResponse);
};
exports.GetAddToCartEvents.public = true;
