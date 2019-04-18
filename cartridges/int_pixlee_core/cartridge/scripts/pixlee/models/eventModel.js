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

module.exports = {
    PixleeEvent: PixleeEvent
};
