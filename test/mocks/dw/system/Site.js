// Mock Site object for SFCC testing
var mockSite = {
    getCustomPreferenceValue: function (value) {
        if (value === 'SkuReference') {
            return 'Product ID'; // Default value
        }
        if (value === 'ProductHost') {
            return null; // No custom host by default
        }
        if (value === 'PixleeEnabled') {
            return true; // Enable Pixlee by default for tests
        }
        if (value === 'PixleePrivateApiKey') {
            return 'test_private_key';
        }
        if (value === 'PixleeSecretKey') {
            return 'test_secret_key';
        }
        return null;
    },

    getAllowedLocales: function () {
        return [
            { toString: function () { return 'en_US'; } },
            { toString: function () { return 'fr_FR'; } }
        ];
    },

    getDefaultLocale: function () {
        return { toString: function () { return 'en_US'; } };
    },

    getDefaultCurrency: function () {
        return 'USD';
    },

    ID: 'test-site'
};

module.exports = {
    getCurrent: function () {
        return mockSite;
    },

    current: mockSite,

    // For parameterized tests (backward compatibility)
    createMock: function (params) {
        var skuReference = params ? params.skuReference : null;

        var customMockSite = {};
        var keys = Object.keys(mockSite);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            customMockSite[key] = mockSite[key];
        }
        customMockSite.getCustomPreferenceValue = function (value) {
            if (value === 'SkuReference') {
                if (skuReference === 'Manufacturer SKU') {
                    return 'Manufacturer SKU';
                }
                return 'Product ID';
            }
            return mockSite.getCustomPreferenceValue(value);
        };

        return {
            getCurrent: function () {
                return customMockSite;
            },
            current: customMockSite
        };
    }
};
