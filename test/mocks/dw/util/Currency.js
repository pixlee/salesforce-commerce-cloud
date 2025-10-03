/**
 * Mock for dw.util.Currency
 * Based on SFRA7 patterns for currency handling
 */

// Mock currency data
var mockCurrencies = {
    'USD': {
        currencyCode: 'USD',
        symbol: '$',
        name: 'US Dollar',
        defaultFractionDigits: 2
    },
    'EUR': {
        currencyCode: 'EUR',
        symbol: '€',
        name: 'Euro',
        defaultFractionDigits: 2
    },
    'GBP': {
        currencyCode: 'GBP',
        symbol: '£',
        name: 'British Pound',
        defaultFractionDigits: 2
    },
    'JPY': {
        currencyCode: 'JPY',
        symbol: '¥',
        name: 'Japanese Yen',
        defaultFractionDigits: 0
    }
};

/**
 * Mock Currency constructor
 * @param {string} currencyCode - The currency code
 */
function Currency(currencyCode) {
    var currency = mockCurrencies[currencyCode] || mockCurrencies.USD;

    this.currencyCode = currency.currencyCode;
    this.symbol = currency.symbol;
    this.name = currency.name;
    this.defaultFractionDigits = currency.defaultFractionDigits;
}

Currency.prototype.getCurrencyCode = function () {
    return this.currencyCode;
};

Currency.prototype.getSymbol = function () {
    return this.symbol;
};

Currency.prototype.getName = function () {
    return this.name;
};

Currency.prototype.getDefaultFractionDigits = function () {
    return this.defaultFractionDigits;
};

Currency.prototype.toString = function () {
    return this.currencyCode;
};

/**
 * Gets a currency by code
 * @param {string} currencyCode - The currency code
 * @returns {Currency} - Currency instance
 */
Currency.getCurrency = function (currencyCode) {
    return new Currency(currencyCode);
};

module.exports = Currency;
