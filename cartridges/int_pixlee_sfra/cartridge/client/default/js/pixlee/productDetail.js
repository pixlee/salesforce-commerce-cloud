'use strict';

/* global Pixlee */

module.exports = function () {
    var $pixleeContainer = $('#pixlee_container');

    if ($pixleeContainer.length) {
        var apiKey = $pixleeContainer.data('apikey');
        var widgetId = $pixleeContainer.data('widgetid');
        var accountId = $pixleeContainer.data('accountid');
        var productId = $pixleeContainer.data('productid');

        window.PixleeAsyncInit = function () {
            Pixlee.init({ apiKey: apiKey });
            Pixlee.addProductWidget({
                accountId: accountId,
                widgetId: widgetId,
                skuId: productId
            });
        };

        $.getScript('//assets.pixlee.com/assets/pixlee_widget_1_0_0.js');
    }
};
