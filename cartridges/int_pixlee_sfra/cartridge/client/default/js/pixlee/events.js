'use strict';

/* global Pixlee_Analytics */

var pixleeAnalytics;

/**
 * Triggers an event to Pixlee by calling Pixlee_Analytics
 *
 * @param {PixleeEvent} pixleeEvent - an object holding the event type to report
 *   and the payload of the event.
 */
function triggerEvent(pixleeEvent) {
    if (pixleeAnalytics) {
        pixleeAnalytics.events.trigger(pixleeEvent.type, pixleeEvent.payload);
    }
}

/**
 * Creates a listener to track add to cart events.
 */
function initAddToCart() {
    $('body').on('product:afterAddToCart', function (event, data) {
        if (data.pixleeEventData && data.pixleeEventData.length) {
            data.pixleeEventData.forEach(function (pixleeEvent) {
                triggerEvent(pixleeEvent);
            });
        }
    });
}

module.exports = function () {
    if (pixleeAnalytics) return;

    var $pixleeEventsInit = $('#pixlee-events-init');

    if ($pixleeEventsInit.length) {
        var apiKey = $pixleeEventsInit.data('apikey');

        $.getScript('https://assets.pixlee.com/assets/pixlee_events.js')
            .done(function () {
                pixleeAnalytics = new Pixlee_Analytics(apiKey);

                initAddToCart();
            });
    }
};
