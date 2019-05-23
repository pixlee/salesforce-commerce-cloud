'use strict';

/* global request */

var Resource = require('dw/web/Resource');

var VERSION_HASH = Resource.msg('pixlee.version.hash', 'pixleehash', null);
var ECOMM_PATFORM = Resource.msg('ecomm.platform', 'pixlee', 'demandware');
var ECOMM_PATFORM_VERSION = Resource.msg('ecomm.platform.version', 'pixlee', '19.3');


/**
 * Creates an object containing all the detail necessary to report an event to
 *   Pixlee.
 *
 * @param {string} type - The event type, like add:to:cart
 * @param {Object} payload - Payload for the event to report to Pixlee
 * @param {string} locale - Locale for the event, reported as region_code
 */
function PixleeEvent(type, payload, locale) {
    this.type = type;
    this.payload = payload || {};

    this.payload.region_code = locale || request.locale;
    this.payload.version_hash = VERSION_HASH;
    this.payload.ecommerce_platform = ECOMM_PATFORM;
    this.payload.ecommerce_platform_version = ECOMM_PATFORM_VERSION;
}

/**
 * Returns an array of line item obects to be added to event payloads for events
 * like checkout:start or converted:photo
 *
 * @param {dw.order.LineItemCtnr} lineItemCtnr - Line item container to retrieve
 *   product line item details from
 * @return {Array} - An array of line item objects as expected by Pixlee events API.
 */
function getLineItemsPayload(lineItemCtnr) {
    var cartItems = [];
    var pixleeHelper = require('~/cartridge/scripts/pixlee/helpers/pixleeHelper');

    for (var i = 0; i < lineItemCtnr.productLineItems.length; i++) {
        var pli = lineItemCtnr.productLineItems[i];
        var productSku = pixleeHelper.getPixleeProductSKU(pli.product);
        var productId = pixleeHelper.getPixleeProductId(pli.product);

        cartItems.push({
            quantity: pli.quantityValue,
            product_sku: productId,
            variant_sku: productSku,
            price: pli.priceValue,
            currency: lineItemCtnr.currencyCode
        });
    }

    return cartItems;
}

/**
 * @constructor
 * @param {dw.order.Order} order - Order to report end checkout event for.
 * @param {string} locale - Locale to report to Pixlee
 */
function PixleeEndCheckoutEvent(order, locale) {
    if (!order) {
        return null;
    }

    var payload = {
        cart_contents: getLineItemsPayload(order),
        cart_total: order.adjustedMerchandizeTotalPrice.value,
        cart_total_quantity: order.productQuantityTotal,
        email: order.customerEmail,
        cart_type: 'demandware',
        order_id: order.orderNo
    };

    PixleeEvent.call(this, 'converted:photo', payload, locale);
}

module.exports = {
    PixleeEvent: PixleeEvent,
    PixleeEndCheckoutEvent: PixleeEndCheckoutEvent
};
