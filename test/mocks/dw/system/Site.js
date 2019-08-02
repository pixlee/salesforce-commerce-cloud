'use strict';

module.exports = function(params) {
    var skuReference = params.skuReference;
    
    return {
        current: {
            getCustomPreferenceValue: function(value) {
                if (value == 'SkuReference') {
                    if (skuReference == 'Manufacturer SKU')
                        return 'Manufacturer SKU';
                    else
                        return 'Product ID';
                }
            }
        }
    };
};
