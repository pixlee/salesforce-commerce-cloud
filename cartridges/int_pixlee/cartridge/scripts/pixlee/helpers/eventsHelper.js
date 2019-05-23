'use strict';

/* global session, empty */

/*
 * The only reason for this module and the complexity it adds to exist is to
 * allow products from a set to be reported to Pixlee when customers choose
 * to 'Add All' at once from product set page or quick view. In that case
 * SiteGeneis front-end code makes a number of AJAX calls, one for each product
 * to be added. The results of all those calls except the last one are discarded,
 * so it is not possible to get the details of the product added (and trigger
 * add:to:cart event for them to Pixlee) except of the last one.
 *
 * See addAllToCart function defined in
 * sitegenesis_core/cartridge/js/pages/product/addToCart.js
 *
 * To allow products from a set to be properly reported without vastly changing
 * Site Genesis front-end logic, details of products added from each AJAX call
 * made are accumulated in the session.
 *
 * The response of the last AJAX call, which will be processed on the front end,
 * will trigger a new AJAX call to retrieve the accumulated products data to
 * report - for that purpose PixleeEvents-GetAddToCartEvents controller is created.
 */

var SESSION_KEY = 'pixleeATCEventsData';

/**
 * Accumulates details of a product added to cart into a session attribute.
 *
 * @param {string} pid - ID of the product added to cart.
 * @param {string} qty - Quantity of the product added to cart
 */
function addAddToCartEventToSession(pid, qty) {
    var eventsDataStr = session.privacy[SESSION_KEY];
    var eventsData = eventsDataStr ? JSON.parse(eventsDataStr) : [];

    eventsData.push({
        pid: pid,
        qty: qty
    });

    session.privacy[SESSION_KEY] = JSON.stringify(eventsData);
}

/**
 * Handles added to cart.
 *
 * @param {Object} httpParameterMap - HTTP parameter map
 * @returns {boolean} - True if any products were added, fale otherwise
 */
exports.processAddToCart = function (httpParameterMap) {
    var pid = httpParameterMap.pid.stringValue;
    var qty = httpParameterMap.Quantity.stringValue;

    if (pid && !qty) { // handle product bundles
        var product = require('dw/catalog/ProductMgr').getProduct(pid);
        if (product && product.bundle) {
            qty = '1';
        }
    }

    if (pid && qty) {
        addAddToCartEventToSession(pid, qty);
    }

    return !empty(session.privacy[SESSION_KEY]);
};

/**
 * Process adding a product list item (like from gift registry or with list)
 *
 * @param {dw.customer.ProductListItem} productListItem - Product list item being added.
 * @param {string} qty - Quantity added to cart
 */
exports.processAddProductListItem = function (productListItem, qty) {
    if (productListItem && qty) {
        addAddToCartEventToSession(productListItem.productID, qty);
    }
};

/**
 * Retrieves the details of all products added to cart from a session attribtue
 *   and clears that session attribute.
 *
 * @return {Array} - A list of the accumulated products
 */
exports.getAddToCartEventsFromSession = function () {
    var eventsDataStr = session.privacy[SESSION_KEY];
    var eventsData;

    try {
        eventsData = eventsDataStr ? JSON.parse(eventsDataStr) : null;
    } catch (e) {
        eventsData = null;
    }

    delete session.privacy[SESSION_KEY];

    return eventsData;
};

/**
 * Clears accumulated products from session.
 */
exports.deleteEventsFromSession = function () {
    delete session.privacy[SESSION_KEY];
};

exports.getEndCheckoutEvents = function (order) {
    var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');

    if (order && pixleeHelper.isPixleeEnabled() && pixleeHelper.isTrackingAllowed()) {
        var PixleeEndCheckoutEvent = require('*/cartridge/scripts/pixlee/models/eventModel').PixleeEndCheckoutEvent;
        var endCheckoutEvent = new PixleeEndCheckoutEvent(order);

        if (endCheckoutEvent) {
            return [endCheckoutEvent];
        }
    }

    return null;
};
