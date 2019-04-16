'use strict';

/* global Pixlee */

module.exports = function () {
    var $pixleeContainer = $('#pixlee_container');

    if ($pixleeContainer.length) {
        var apiKey = $pixleeContainer.data('apikey');
        var widgetId = $pixleeContainer.data('widgetid');
        var categoryId = $pixleeContainer.data('categoryid');

        window.PixleeAsyncInit = function () {
            Pixlee.init({ apiKey: apiKey });
            Pixlee.addCategoryWidget({
                widgetId: widgetId,
                nativeCategoryId: categoryId,
                ecomm_platform: 'demandware'
            });
        };

        $.getScript('//assets.pixlee.com/assets/pixlee_widget_1_0_0.js');
    }
};
