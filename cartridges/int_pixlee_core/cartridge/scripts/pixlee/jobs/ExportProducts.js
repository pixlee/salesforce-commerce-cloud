'use strict';

var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');

/**
 * A class for wrapping a single product in an iterator.
 * To be used for test purposes only.
 *
 * @constructor
 * @param {string} productId - Product ID.
 */
function SingleProductIterator(productId) {
    var ProductMgr = require('dw/catalog/ProductMgr');
    var product = ProductMgr.getProduct(productId);
    var done = false;

    /**
     * Returns the number of products.
     *
     * @return {int} The number of product in this iterator
     */
    this.getCount = function () {
        return product ? 1 : 0;
    };

    /**
     * Indicates if there are more products to iterate.
     *
     * @return {boolean} - True if there are more products.
     */
    this.hasNext = function () {
        return product ? !done : false;
    };

    /**
     * Returns the next product from the Iterator.
     *
     * @return {dw.catalog.Product} - The next product.
     */
    this.next = function () {
        done = true;
        return product || null;
    };

    /**
     * Closes the iterator
     */
    this.close = function () {
    };
}

/**
 * A class for wrapping a product iterator.
 * Depending on the passed parameter it could return products from the search
 * index (only online, searchable and assigned to a site catalog category) or
 * use dw.catalog API to return all products assigned to the site.
 *
 * @constructor
 *
 * @param {boolean} fromIndex - Indicates whether the iterator should be created
 *   from the search index (if true) or all products assigned to the site should
 *   be returned (if false, in which case ProductMgr.queryAllSiteProducts()
 *   should be used).
 */
function ProductsIterator(fromIndex) {
    var count;
    var productsIterator;

    if (fromIndex) {
        var ProductSearchModel = require('dw/catalog/ProductSearchModel');
        var psm = new ProductSearchModel();
        psm.categoryID = 'root';
        psm.search();
        productsIterator = psm.getProductSearchHits();
        count = psm.count;
    } else {
        var ProductMgr = require('dw/catalog/ProductMgr');
        productsIterator = ProductMgr.queryAllSiteProducts();
        count = productsIterator.count;
    }

    /**
     * Returns the number of products.
     *
     * @return {int} The number of product in this iterator
     */
    this.getCount = function () {
        return count;
    };

    /**
     * Indicates if there are more products to iterate.
     *
     * @return {boolean} - True if there are more products.
     */
    this.hasNext = function () {
        return productsIterator.hasNext();
    };

    /**
     * Returns the next product from the Iterator.
     *
     * @return {dw.catalog.Product} - The next product.
     */
    this.next = function () {
        return fromIndex
            ? productsIterator.next().product
            : productsIterator.next();
    };

    /**
     * Closes the iterator if necessary
     */
    this.close = function () {
        if (!fromIndex) {
            try {
                productsIterator.close();
            } catch (e) {
                Logger.error('Failed to close iterator, original error message was {0}', e);
            }
        }
    };
}

/**
 * Generates a unique ID.
 *
 * NOTE: Ported from the original cartridge implementation, could be replaced
 *   with dw.util.UUIDUtils.createUUID()
 *
 * @return {string} - The generated unique ID
 */
function generateUniqueId() {
    /**
     * Returns a random string.
     * @return {string} - random string
     */
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + s4();
}

/**
 * Main job step entry point.
 *
 * @param {Object} jobParameters - A map of parameters configured for the job step
 *   in Business Manager.
 *
 * @returns {dw.system.Status} - Status OK or ERROR
 */
exports.execute = function (jobParameters) {
    var PixleeService = require('~/cartridge/scripts/pixlee/services/PixleeService');
    var ProductExportPayload = require('~/cartridge/scripts/pixlee/models/productExportPayload');

    var useSearchIndex = jobParameters['Products Source'] === 'SEARCH_INDEX';
    var breakAfter = parseInt(jobParameters['Break After'], 10);
    breakAfter = isNaN(breakAfter) ? 0 : breakAfter;
    var exportOptions = {
        imageViewType: jobParameters['Images View Type'] || null,
        onlyRegionalDetails: jobParameters['Main site ID'] && (require('dw/system/Site').current.ID !== jobParameters['Main site ID'])
    };
    var testProductId = jobParameters['Test Product ID'] || null;

    var jobId = generateUniqueId();

    var productsIter;
    var totalProductsToProcess;
    var productsExported = 0;
    var totalFails = 0;
    var consecutiveFails = 0;

    try {
        productsIter = testProductId
            ? new SingleProductIterator(testProductId)
            : new ProductsIterator(useSearchIndex);

        totalProductsToProcess = productsIter.getCount();

        PixleeService.notifyExportStatus('started', jobId, totalProductsToProcess);

        while (productsIter.hasNext()) {
            var product = productsIter.next();

            if (product.online && product.searchable && !product.variant) {
                try {
                    Logger.info('About to export product {0}', product.ID);
                    var productPayload = new ProductExportPayload(product, exportOptions);
                    PixleeService.postProduct(productPayload);
                    productsExported++;
                    consecutiveFails = 0;
                    Logger.info('Product {0} successfully exported', product.ID);
                } catch (e) {
                    Logger.error('Failed to export product {0}, original error was {1}', product.ID, e);
                    consecutiveFails++;
                    totalFails++;
                }
            }

            if (breakAfter && (consecutiveFails > breakAfter)) {
                throw new Error('Reached the maximum number of consecutive product export failures');
            }
        }

        if (totalProductsToProcess && !productsExported) {
            throw new Error('No products exported');
        } else if (totalFails) {
            return new Status(Status.ERROR, 'FINISHED_WITH_WARNINGS', totalFails + ' products failed to export');
        }

        return new Status(Status.OK, 'OK', 'job id: ' + jobId + ', ' + productsExported + ' products exported');
    } catch (e) {
        Logger.error('Failed to export products, job id: {0}, original error was: {1}', jobId, e);
        return new Status(Status.ERROR, 'ERROR', e);
    } finally {
        PixleeService.notifyExportStatus('finished', jobId, totalProductsToProcess);

        if (productsIter) {
            productsIter.close();
        }
    }
};
