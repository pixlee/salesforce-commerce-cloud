'use strict';

/**
 * Mock global objects for SFCC testing environment
 */

// Mock session object
global.session = {
    privacy: {},

    getPrivacy: function () {
        return this.privacy;
    },

    setCurrency: function (currency) {
        this.currency = currency;
    }
};

// Mock request object
global.request = {
    locale: 'en_US',

    setLocale: function (locale) {
        this.locale = locale;
    }
};

// Mock System object for garbage collection
global.System = {
    gc: function () {
        // Mock garbage collection - no-op in tests
    }
};

// SFCC String extensions for testing environment
if (!String.prototype.equalsIgnoreCase) {
    String.prototype.equalsIgnoreCase = function(other) {
        if (typeof other !== 'string') return false;
        return this.toLowerCase() === other.toLowerCase();
    };
}

// Reset function for tests
function resetGlobals() {
    global.session.privacy = {};
    global.request.locale = 'en_US';
}

module.exports = {
    resetGlobals: resetGlobals
};
