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
 * This module has the original Pixlee cartridge logic, where a map of currencies
 * to countries is retrieved by making a web service call to Pixlee. It has just
 * been optimized to cache the retrieved countries as a system preference.
 *
 * SFRA and SiteGenesis cartridges will override this function, but may fallback
 * to it in case counfiguration files are cannot be found.
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

    // check for cached version first
    var currenciesMap;
    var cachedCurrenciesMapStr = require('dw/system/System').preferences.custom.PixleeCountriesMap;
    if (cachedCurrenciesMapStr) {
        try {
            currenciesMap = JSON.parse(cachedCurrenciesMapStr);
        } catch (e) {
            currenciesMap = null;
        }
    }

    // retrieve the map by making a web service call to Pixlee
    if (!currenciesMap) {
        var PixleeService = require('~/cartridge/scripts/pixlee/services/PixleeService');

        currenciesMap = PixleeService.getCountriesMap();

        if (currenciesMap) {
            require('dw/system/System').preferences.custom.PixleeCountriesMap = JSON.stringify(currenciesMap, null, 4);
        }
    }

    var currencyForCountry;
    if (currenciesMap) {
        currencyForCountry = currenciesMap[countryCode] && currenciesMap[countryCode].CurrencyCode;
    }

    if (currencyForCountry && require('dw/system/Site').getCurrent().allowedCurrencies.contains(currencyForCountry)) {
        return currencyForCountry;
    }

    return require('dw/system/Site').getCurrent().getDefaultCurrency();
};
