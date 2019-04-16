'use strict';

/* global Pixlee_Analytics */

var pixleeAnalytics;

module.exports = function () {
    if (pixleeAnalytics) return;

    var $pixleeEventsInit = $('#pixlee-events-init');

    if ($pixleeEventsInit.length) {
        var apiKey = $pixleeEventsInit.data('apikey');

        $.getScript('https://assets.pixlee.com/assets/pixlee_events.js')
        .done(function () {
            pixleeAnalytics = new Pixlee_Analytics(apiKey);
        });
    }
};
