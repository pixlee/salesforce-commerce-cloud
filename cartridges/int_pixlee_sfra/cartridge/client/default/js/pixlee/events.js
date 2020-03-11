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

/**
 * Triggers all events included in the DOM as x-pixlee-event-data script blocks.
 */
function processIncludedEvents() {
    $('script[type="text/x-pixlee-event-data"]').each(function () {
        var $eventNode = $(this);

        var eventType = $eventNode.data('type');
        var eventPayload = JSON.parse($eventNode.text());
        if (typeof pixleeAnalytics !== 'undefined') {
            pixleeAnalytics.events.trigger(eventType, eventPayload);
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
                if (typeof Pixlee_Analytics !== 'undefined') {
                    pixleeAnalytics = new Pixlee_Analytics(apiKey);
                }
                initAddToCart();

                processIncludedEvents();
            });
    }
};
