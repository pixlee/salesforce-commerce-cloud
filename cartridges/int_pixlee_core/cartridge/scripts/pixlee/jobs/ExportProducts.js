'use strict';

var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');

/**
 * @function SingleProductIterator
 * @description A class for wrapping a single product in an iterator.
 * To be used for test purposes only.
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
 * @function ProductsIterator
 * @description A class for wrapping a product iterator.
 * Depending on the passed parameter it could return products from the search
 * index (only online, searchable and assigned to a site catalog category) or
 * use dw.catalog API to return all products assigned to the site.
 * @constructor
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
        if (productsIterator && typeof productsIterator.getCount === 'function') {
            count = productsIterator.getCount();
        } else {
            count = productsIterator && typeof productsIterator.count === 'number' ? productsIterator.count : 0
        }
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
 * @function generateUniqueId
 * @description Generates a unique ID using SFCC platform UUID utilities.
 * @returns {string} - The generated unique ID
 */
function generateUniqueId() {
    var UUIDUtils = require('dw/util/UUIDUtils');
    return UUIDUtils.createUUID();
}

/**
 * @function execute
 * @description Main job step entry point.
 * @param {Object} jobParameters - A map of parameters configured for the job step
 *   in Business Manager.
 * @returns {dw.system.Status} - Status OK or ERROR
 */
exports.execute = function (jobParameters) {
    var PixleeService = require('~/cartridge/scripts/pixlee/services/PixleeService');
    var ProductExportPayload = require('~/cartridge/scripts/pixlee/models/productExportPayload');
    var currentSite = require('dw/system/Site').getCurrent();
    if (!currentSite.getCustomPreferenceValue('PixleeEnabled')) {
        Logger.info('Pixlee integration is disabled');
        return new Status(Status.OK, 'OK', 'Pixlee integration is disabled');
    }
    if (!currentSite.getCustomPreferenceValue('PixleePrivateApiKey')) {
        Logger.warn('Pixlee Private API Key not set');
        return new Status(Status.ERROR, 'FINISHED_WITH_WARNINGS', 'Pixlee Private API Key not set');
    }
    if (!currentSite.getCustomPreferenceValue('PixleeSecretKey')) {
        Logger.warn('Pixlee Secret Key Key not set');
        return new Status(Status.ERROR, 'FINISHED_WITH_WARNINGS', 'Pixlee Secret Key Key not set');
    }

    var useSearchIndex = jobParameters['Products Source'] === 'SEARCH_INDEX';
    var breakAfter = parseInt(jobParameters['Break After'], 10);
    // eslint-disable-next-line no-restricted-globals
    breakAfter = isNaN(breakAfter) ? 0 : breakAfter;
    var exportOptions = {
        imageViewType: jobParameters['Images View Type'] || null,
        onlyRegionalDetails: jobParameters['Main site ID'] && (currentSite.ID !== jobParameters['Main site ID'])
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

        try {
            // This call will initialize and cache the category strategy and maps
            ProductExportPayload.preInitializeCategoryProcessing();
            Logger.info('Category processing strategy successfully built');
        } catch (e) {
            Logger.warn('Failed to build category processing: ' + e.message + '. Will initialize per-product.');
        }

        var processedCount = 0;
        // eslint-disable-next-line no-restricted-globals
        var progressLogInterval = (totalProductsToProcess && !isNaN(totalProductsToProcess) && totalProductsToProcess > 0)
            ? Math.max(100, Math.floor(totalProductsToProcess / 20))
            : 500;

        while (productsIter.hasNext()) {
            var product = productsIter.next();
            processedCount += 1;

            if (product.online && product.searchable && !product.variant) {
                try {
                    if (processedCount % progressLogInterval === 0 || processedCount <= 10) {
                        var totalText = totalProductsToProcess ? totalProductsToProcess.toString() : 'unknown';
                        Logger.info('Processing product {0} ({1}/{2})', product.ID, processedCount, totalText);
                    }

                    var productPayload = new ProductExportPayload(product, exportOptions);
                    PixleeService.postProduct(productPayload);
                    productsExported += 1;
                    consecutiveFails = 0;

                    if (productsExported <= 5 || productsExported % progressLogInterval === 0) {
                        Logger.info('Product {0} successfully exported ({1} total)', product.ID, productsExported);
                    }
                } catch (e) {
                    Logger.error('Failed to export product {0}, original error was {1}', product.ID, e);
                    consecutiveFails += 1;
                    totalFails += 1;
                }
            }

            if (breakAfter && (consecutiveFails >= breakAfter)) {
                throw new Error('Reached the maximum number of consecutive product export failures');
            }
        }

        try {
            var cacheStats = ProductExportPayload.getCacheStatistics();
            Logger.info('Final cache statistics: ' + JSON.stringify(cacheStats));
        } catch (e) {
            Logger.warn('Failed to get final cache statistics: ' + e.message);
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
