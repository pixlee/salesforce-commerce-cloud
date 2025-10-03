/**
 * Mock for dw.web.Resource
 * Based on SFRA7 patterns with simplified resource handling for testing
 */

// Mock resource bundles for common keys
var mockResources = {
    'global': {
        'button.addtocart': 'Add to Cart',
        'button.addtowishlist': 'Add to Wishlist',
        'label.quantity': 'Quantity',
        'label.price': 'Price',
        'error.general': 'An error occurred',
        'success.addtocart': 'Product added to cart'
    },
    'product': {
        'label.availability': 'Availability',
        'label.instock': 'In Stock',
        'label.outofstock': 'Out of Stock',
        'label.preorder': 'Pre-Order'
    },
    'pixlee': {
        'error.export.failed': 'Product export failed',
        'success.export.complete': 'Product export completed',
        'label.category.processing': 'Processing categories'
    }
};

/**
 * Gets a localized message
 * @param {string} key - The resource key
 * @param {string} bundleName - The bundle name (optional)
 * @param {string} defaultValue - Default value if key not found
 * @returns {string} - The localized message or default value
 */
function msg(key, bundleName, defaultValue) {
    if (!key) {
        return defaultValue || '';
    }

    // Check specific bundle first
    if (bundleName && mockResources[bundleName] && mockResources[bundleName][key]) {
        return mockResources[bundleName][key];
    }

    // Check global bundle
    if (mockResources.global && mockResources.global[key]) {
        return mockResources.global[key];
    }

    // Return default value or key
    return defaultValue || key;
}

/**
 * Gets a localized message with formatting
 * @param {string} key - The resource key
 * @param {string} bundleName - The bundle name (optional)
 * @param {string} defaultValue - Default value if key not found
 * @param {...*} formatArgs - Arguments for string formatting
 * @returns {string} - The formatted localized message
 */
function msgf(key, bundleName, defaultValue) {
    var message = msg(key, bundleName, defaultValue);

    // Handle formatting arguments (simple {0}, {1}, etc. replacement)
    if (arguments.length > 3) {
        var formatArgs = Array.prototype.slice.call(arguments, 3);
        message = message.replace(/\{(\d+)}/g, function (match, index) {
            var argIndex = parseInt(index, 10);
            return formatArgs[argIndex] !== undefined ? formatArgs[argIndex] : match;
        });
    }

    return message;
}

module.exports = {
    msg: msg,
    msgf: msgf,
    locale: 'en_US',

    // Test utility to add mock resources
    __testUtils: {
        addMockResource: function (bundle, key, value) {
            if (!mockResources[bundle]) {
                mockResources[bundle] = {};
            }
            mockResources[bundle][key] = value;
        },

        clearMockResources: function () {
            mockResources = {
                'global': {},
                'product': {},
                'pixlee': {}
            };
        }
    }
};
