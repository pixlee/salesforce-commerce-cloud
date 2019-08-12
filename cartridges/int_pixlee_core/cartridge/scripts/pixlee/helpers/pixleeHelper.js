'use strict';

/* global session */

/**
 * Checks wheter Pixlee integration is enabled for the current site.
 *
 * @return {boolean} - True if Pixlee integration is enabled for the site
 */
exports.isPixleeEnabled = function () {
    var Site = require('dw/system/Site');

    return Site.getCurrent().getCustomPreferenceValue('PixleeEnabled');
};

/**
 * Retrieves the product SKU to pass to Pixlee from a different product attribute
 * depending on SkuReference site preference.
 *
 * @param {dw.catalog.Product} product Product to retrieve SKU for
 * @return {string} Product ID to pass to Pixlee
 */
exports.getPixleeProductSKU = function (product) {
    var Site = require('dw/system/Site');
    var pixleeSkuReference = Site.current.getCustomPreferenceValue('SkuReference');

    if (pixleeSkuReference === 'Manufacturer SKU') {
        return product.manufacturerSKU || product.ID;
    }

    return product.ID;
};

/**
 * Retrieves the product ID to pass to Pixlee. If the product is a variant then its
 * master is considered.
 *
 * @param {dw.catalog.Product} product Product to retrieve ID for
 * @return {string} Product ID to pass to Pixlee
 */
exports.getPixleeProductId = function (product) {
    return product.variant
        ? this.getPixleeProductSKU(product.masterProduct)
        : this.getPixleeProductSKU(product);
};

/**
 * Calculates whether tracking is allowed for a customer session based on the
 *   Tracking Option site preference and the consent given by the customer, if any.
 *
 * @param {boolean} trackingConsent - Consent given by the customer, can be null.
 * @return {boolean} - True if tracking is allowed for the current session
 */
exports.isTrackingAllowed = function (trackingConsent) {
    var Site = require('dw/system/Site');
    var pixleeTrackingPreference = Site.current.getCustomPreferenceValue('PixleeTracking');

    if (!arguments.length) { // trackingConsent not passed, fall back to session, fine to reassing
        trackingConsent = session.trackingAllowed; // eslint-disable-line
    }

    switch (pixleeTrackingPreference.value) {
        default:
        case 'TRACK_ALWAYS':
            return true;
        case 'TRACK_IF_NOT_OPTED_OUT':
            return trackingConsent !== false; // tracking allowed if trackingConsent is null
        case 'TRACK_IF_OPTED_IN':
            return trackingConsent === true; // tracking NOT allowed if trackingConsent is null
        case 'TRACK_NEVER':
            return false;
    }
};

/**
 * Looks up a line item by product ID.
 *
 * NOTE: this function may not give the correct results in case basket is
 *   configured to have multiple lines of the same product, like if
 *   'Add Product to Basket Behaviour' site preference is set to
 *   'Allow Repeats'. This appears to be very uncommon configuration though.
 *
 * @param {dw.order.Basket} basket - Basket which line items to search
 * @param {type} productId - Product ID to find line item for.
 * @return {dw.order.ProductLineItem} - Line item found or null.
 */
function getMatchingLineItem(basket, productId) {
    for (var i = 0; i < basket.productLineItems.length; i++) {
        var pli = basket.productLineItems[i];
        if (pli.productID === productId) {
            return pli;
        }
    }

    return null;
}

/**
 * Creates a list (array) of PixleeEvent's given a list of plain JS objects
 * containing the details of products added to cart. Each of those objects is
 * expected to have the following details:
 * {
 *   pid - the ID of the product added
 *   qty - the quantity of the product added.
 * }
 *
 * @param {Array} productsAdded - Array of products added to cart
 * @return {Array<PixleeEvent>} - Array of PixleeEvent objects to report
 */
exports.getAddToCartEvents = function (productsAdded) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var pixleeHelper = require('./pixleeHelper');
    var pixleeEvents = [];

    if (Array.isArray(productsAdded) && productsAdded.length) {
        var BasketMgr = require('dw/order/BasketMgr');
        var currentBasket = BasketMgr.getCurrentOrNewBasket();
        var PixleeEvent = require('~/cartridge/scripts/pixlee/models/eventModel').PixleeEvent;

        productsAdded.forEach(function (productAdded) {
            var product = ProductMgr.getProduct(productAdded.pid);
            var pli = getMatchingLineItem(currentBasket, product.ID);

            var productId = pixleeHelper.getPixleeProductId(product);
            var productSKU = pixleeHelper.getPixleeProductSKU(product);
            var quantity = parseInt(productAdded.qty, 10);
            var price = ((pli.priceValue / pli.quantityValue) * quantity).toFixed(2);
            var currency = currentBasket.currencyCode;

            var eventPayload = {
                product_sku: productId,
                variant_sku: productSKU,
                quantity: quantity,
                price: price,
                currency: currency
            };

            var pixleeEvent = new PixleeEvent('add:to:cart', eventPayload);

            pixleeEvents.push(pixleeEvent);
        });
    }

    return pixleeEvents;
};
