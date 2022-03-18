'use strict';

/* API Includes */
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger');

/**
 * Generates a signature (hash) for a payload object.
 *
 * @param {Object} payload - Payload object to generate signature for
 * @return {string} - SHA-1 hash (signature) of the payload
 */
function getPayloadSignature(payload) {
    var Encoding = require('dw/crypto/Encoding');
    var Mac = require('dw/crypto/Mac');
    var Site = require('dw/system/Site');

    var secterKey = Site.getCurrent().getCustomPreferenceValue('PixleeSecretKey');
    var payloadStr = JSON.stringify(payload);

    var signature = Encoding.toBase64(new Mac(Mac.HMAC_SHA_256).digest(payloadStr, secterKey));

    return signature;
}

/**
 * Returns the API key configured in site preferences.
 *
 * @returns {string} - The API key
 */
function getApiKey() {
    var Site = require('dw/system/Site');
    return Site.getCurrent().getCustomPreferenceValue('PixleeApiKey');
}

/**
 * Local Services Framework service definition
 */
var pixleeService = LocalServiceRegistry.createService('pixlee.http.service', {

    /**
     * A callback function to configure HTTP request parameters before
     * a call is made to Pixlee web service
     *
     * @param {dw.svc.Service} svc Service instance
     * @param {string} requestObject - Request object, containing the end point, query string params, payload etc.
     * @returns {string} - The body of HTTP request
     */
    createRequest: function (svc, requestObject) {
        svc.addHeader('Content-Type', 'application/json');
        svc.addHeader('X-Alt-Referer', 'demandware.pixlee.com');

        var URL = svc.configuration.credential.URL;
        URL += requestObject.endpoint;

        if (requestObject.queryString) {
            URL += '?' + requestObject.queryString;
        } else {
            URL += '?api_key=' + encodeURIComponent(getApiKey());
        }

        svc.setURL(URL);

        if (requestObject.signature) {
            svc.addHeader('Signature', requestObject.signature);
        }

        if (requestObject.payload) {
            svc.setRequestMethod('POST');
            return JSON.stringify(requestObject.payload);
        }

        svc.setRequestMethod('GET');
        return null;
    },

    /**
     * A callback function to parse Pixlee web service response
     *
     * @param {dw.svc.Service} svc - Service instance
     * @param {dw.net.HTTPClient} httpClient - HTTP client instance
     * @returns {string} - Response body in case of a successful request or null
     */
    parseResponse: function (svc, httpClient) {
        return httpClient.text;
    },

    /**
     * A callback that allows filtering communication URL, request, and response
     * log messages. Must be implemented to have messages logged on Production.
     *
     * @param {string} msg - The original message to log.
     * @returns {string} - The original message itself, as no sensitive data is
     *   communicated.
     */
    filterLogMessage: function (msg) {
        return msg;
    }
});

/**
 * Makes a call to Pixlee web service given a request object.
 *
 * @param {Object} requestObject - An object having details for the request to
 *   be made, including endpoint, payload etc.
 * @return {dw.svc.Result} - Result returned by the call.
 */
function callService(requestObject) {
    if (!requestObject) {
        throw new Error('Required request object parameter missing or incorrect.');
    }

    var result = pixleeService.call(requestObject);

    return result;
}

exports.call = callService;

/**
 * Makes a call to Pixlee web service to export a product.
 *
 * @param {Object} productObject - Product payload object
 * @return {dw.svc.Result} - Result returned by the call.
 */
exports.postProduct = function (productObject) {
    var signature = getPayloadSignature(productObject);

    var requestObject = {
        endpoint: 'v2/albums',
        payload: productObject,
        signature: signature
    };

    var result = callService(requestObject);

    return result;
};

/**
 * Makes a call to Pixlee web service to retrieve the countries map.
 *
 * @return {Object} - Countries map retrieved, as JS object, or null in case of
 *   failure.
 */
exports.getCountriesMap = function () {
    var requestObject = {
        endpoint: 'v1/getSFCountryMap'
    };

    var result = callService(requestObject);

    if (!result.ok) {
        Logger.error('Failed to retrieve currency-to-country map from Pixlee, error code {0}, message: {1}, error message: {2}', result.error, result.msg, result.errorMessage);
        return null;
    }

    var countriesMap;
    try {
        countriesMap = JSON.parse(result.object);
    } catch (e) {
        Logger.error('Failed to parse currency-to-country map response from Pixlee, original error was: {0}', e);
        countriesMap = null;
    }

    return countriesMap;
};

/**
 * Makes a call to Pixlee web service to notidy of the export status.
 *
 * @param {string} status - Status to report
 * @param {string} jobId - Job identifier, should be a unique ID
 * @param {int} numProducts - Number of products
 * @return {dw.svc.Result} - Result returned by the call.
 */
exports.notifyExportStatus = function (status, jobId, numProducts) {
    var requestObject = {
        endpoint: 'v1/notifyExportStatus',
        payload: {
            api_key: getApiKey(),
            status: status,
            job_id: jobId,
            num_products: numProducts,
            platform: 'demandware'
        }
    };

    var result = callService(requestObject);

    return result;
};
