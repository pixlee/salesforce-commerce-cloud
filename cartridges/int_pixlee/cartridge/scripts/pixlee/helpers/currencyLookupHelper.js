'use strict';

/**
 * Returns a country code for a locale.
 *
 * @param {string} locale - Locale ID as string, for which to return country code.
 * @return {string} - Looked up country code.
 */
function getCountryCodeFromLocale(locale) {
    var localeObject = require('dw/util/Locale').getLocale(locale);

    return localeObject ? localeObject.country : null;
}

/**
 * Returns a currency code associated with a given locale of the current site.
 *
 * This SiteGenesis specific module will try to make use of currencies.json file
 * located in in the root of SiteGenesis core cartridge.
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

    var countryCode = getCountryCodeFromLocale(locale);
    if (!countryCode) {
        return require('dw/system/Site').getCurrent().getDefaultCurrency();
    }

    var countries;
    try {
        countries = require('*/cartridge/countries.json');
    } catch (e) {
        countries = null;
    }

    var currencyCode;
    if (countries) {
        var matchingEntries = countries.filter(function (entry) {
            return entry.countryCode === countryCode;
        });

        currencyCode = matchingEntries.length
            ? matchingEntries[0].currencyCode
            : require('dw/system/Site').getCurrent().getDefaultCurrency();
    } else {
        // fallback to core cartridge logic
        currencyCode = module.superModule.getCurrencyForLocale(locale);
    }

    return currencyCode;
};
