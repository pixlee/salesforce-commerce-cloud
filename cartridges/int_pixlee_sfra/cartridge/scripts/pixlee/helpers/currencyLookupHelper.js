'use strict';

/**
 * Returns a currency code associated with a given locale of the current site.
 *
 * This SFRA specific module will try to make use of config/currencies.json file
 * located in SFRA core cartridge.
 *
 * If not found, a fallback to the logic from Pixlee core cartridge will be made.
 *
 * @param {string} locale - Locale ID as string, for which to retrieve the
 *   currency code;
 * @returns {string} - looked up currency code.
 */
exports.getCurrencyForLocale = function (locale) {
    if (!locale) {
        return null;
    } else if ('default'.equalsIgnoreCase(locale)) {
        return require('dw/system/Site').getCurrent().getDefaultCurrency();
    }

    var countries;
    try {
        countries = require('*/cartridge/config/countries.json');
    } catch (e) {
        countries = null;
    }

    var currencyCode;
    if (countries) {
        var matchingEntries = countries.filter(function (entry) {
            return entry.id === locale;
        });

        currencyCode = matchingEntries.length
            ? matchingEntries[0].currencyCode
            : require('dw/system/Site').getCurrent().getDefaultCurrency();
    } else {
        // fallback to core cartridge logic
        var coreCurrencyLookupHelper = require('int_pixlee_core/cartridge/scripts/pixlee/helpers/currencyLookupHelper');
        currencyCode = coreCurrencyLookupHelper.getCurrencyForLocale(locale);
    }

    return currencyCode;
};
