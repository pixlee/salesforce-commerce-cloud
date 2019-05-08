'use strict';

/* global session */

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
                product_id: productId,
                product_sku: productSKU,
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
