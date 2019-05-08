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

    if ('Manufacturer SKU'.equalsIgnoreCase(pixleeSkuReference)) {
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
 * Sets a flag with the current customer session indicating that checkout:start
 * event has been reported.
 */
exports.saveCheckoutStartedReportedFlag = function () {
    session.privacy.pixleeCheckoutStartedFlag = true;
};

/**
 * Checkis if checkout:start event is reported for the current checkout session.
 *
 * @return {boolean} - Returns true if checkout:start event has been reported
 */
exports.hasCheckoutStartedBeenReported = function () {
    return session.privacy.pixleeCheckoutStartedFlag || false;
};

/**
 * Clears the session flag indicating that checkout:start event was reported.
 */
exports.clearCheckoutStartedFlag = function () {
    delete session.privacy.pixleeCheckoutStartedFlag;
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
