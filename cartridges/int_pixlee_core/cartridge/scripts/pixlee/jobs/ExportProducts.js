'use strict';

var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');
var Site = require('dw/system/Site');
var PixleeService = require('~/cartridge/scripts/pixlee/services/PixleeService');
var ProductExportPayload = require('~/cartridge/scripts/pixlee/models/productExportPayload');

var PROGRESS_LOG_DEFAULTS = {
    DEFAULT_INTERVAL: 500,
    MIN_INTERVAL: 100,
    PERCENTAGE_DIVISOR: 20,
    ALWAYS_LOG_FIRST: 5
};

var JOB_STATE_DEFAULTS = {
    productsIterator: null,
    totalProductsToProcess: 0,
    jobId: '',
    exportOptions: null,
    breakAfter: 0,
    consecutiveFails: 0,
    totalFails: 0,
    productsExported: 0,
    processedCount: 0,
    progressLogInterval: PROGRESS_LOG_DEFAULTS.DEFAULT_INTERVAL,
    isConfigured: false
};

/**
 * Applies default values to a target object
 * @param {Object} target - The object to apply defaults to
 * @param {Object} defaults - The default values to apply
 */
function applyDefaults(target, defaults) {
    var keys = Object.keys(defaults);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        // eslint-disable-next-line no-param-reassign
        target[key] = defaults[key];
    }
}

/**
 * @function hasValidConfiguration
 * @description Checks if Pixlee is properly configured for the current site.
 * @returns {boolean} - True if configured and ready, false if intentionally disabled
 * @throws {Error} - If enabled but misconfigured
 */
function hasValidConfiguration() {
    var currentSite = Site.getCurrent();
    if (!currentSite.getCustomPreferenceValue('PixleeEnabled')) {
        Logger.info('Pixlee integration is disabled for {0}', currentSite.ID);
        return false;
    }

    // If enabled but missing required configuration, that's an error
    if (!currentSite.getCustomPreferenceValue('PixleePrivateApiKey')) {
        throw new Error('Pixlee Private API Key is not set for ' + currentSite.ID);
    }
    if (!currentSite.getCustomPreferenceValue('PixleeSecretKey')) {
        throw new Error('Pixlee Secret Key is not set for ' + currentSite.ID);
    }

    return true;
}

/**
 * Job state object to maintain state across chunk script method calls
 */
var jobState = {
    /** @type {Object} productsIterator - Iterator for products to export */
    productsIterator: JOB_STATE_DEFAULTS.productsIterator,
    /** @type {number} totalProductsToProcess - Total count of products in iterator */
    totalProductsToProcess: JOB_STATE_DEFAULTS.totalProductsToProcess,
    /** @type {string} jobId - Unique ID for this job execution */
    jobId: JOB_STATE_DEFAULTS.jobId,
    /** @type {Object} exportOptions - Options for export (imageViewType, onlyRegionalDetails) */
    exportOptions: JOB_STATE_DEFAULTS.exportOptions,
    /** @type {number} breakAfter - Maximum consecutive failures before stopping */
    breakAfter: JOB_STATE_DEFAULTS.breakAfter,
    /** @type {number} consecutiveFails - Current count of consecutive failures */
    consecutiveFails: JOB_STATE_DEFAULTS.consecutiveFails,
    /** @type {number} totalFails - Total count of failures in this job */
    totalFails: JOB_STATE_DEFAULTS.totalFails,
    /** @type {number} productsExported - Count of successfully exported products */
    productsExported: JOB_STATE_DEFAULTS.productsExported,
    /** @type {number} processedCount - Count of products processed (including skipped) */
    processedCount: JOB_STATE_DEFAULTS.processedCount,
    /** @type {number} progressLogInterval - How often to log progress */
    progressLogInterval: JOB_STATE_DEFAULTS.progressLogInterval,
    /** @type {boolean} isConfigured - Whether Pixlee is properly configured */
    isConfigured: JOB_STATE_DEFAULTS.isConfigured,

    /**
     * Reset all state variables to their initial values
     */
    reset: function () {
        applyDefaults(this, JOB_STATE_DEFAULTS);
    },

    /**
     * Check if the job state has been properly initialized and ready to process
     * @returns {boolean} true if state is initialized and ready
     */
    isInitialized: function () {
        return this.isConfigured &&
            jobState.totalProductsToProcess &&
            !empty(this.jobId);
    },

    /**
     * Record a successful product export
     */
    recordSuccess: function () {
        this.productsExported += 1;
        this.consecutiveFails = 0;
    },

    /**
     * Record a failed product export
     */
    recordFailure: function () {
        this.totalFails += 1;
        this.consecutiveFails += 1;
    },

    /**
     * Check if consecutive failure limit has been reached
     * @returns {boolean} true if limit reached and job should stop
     */
    shouldStopDueToFailures: function () {
        return this.breakAfter > 0 && this.consecutiveFails >= this.breakAfter;
    },

    /**
     * Check if progress should be logged for this product count
     * @param {number} count - Current product count to check
     * @returns {boolean} true if progress should be logged
     */
    shouldLogProgress: function (count) {
        return count <= PROGRESS_LOG_DEFAULTS.ALWAYS_LOG_FIRST || count % this.progressLogInterval === 0;
    }
};

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
    var internalIterator;

    if (fromIndex) {
        var ProductSearchModel = require('dw/catalog/ProductSearchModel');
        var psm = new ProductSearchModel();
        psm.categoryID = 'root';
        psm.search();
        internalIterator = psm.getProductSearchHits();
        count = psm.count;
    } else {
        var ProductMgr = require('dw/catalog/ProductMgr');
        internalIterator = ProductMgr.queryAllSiteProducts();
        if (internalIterator && typeof internalIterator.getCount === 'function') {
            count = internalIterator.getCount();
        } else {
            count = internalIterator && typeof internalIterator.count === 'number' ? internalIterator.count : 0;
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
        return internalIterator.hasNext();
    };

    /**
     * Returns the next product from the Iterator.
     *
     * @return {dw.catalog.Product} - The next product.
     */
    this.next = function () {
        return fromIndex
            ? internalIterator.next().product
            : internalIterator.next();
    };

    /**
     * Closes the iterator if necessary
     */
    this.close = function () {
        if (!fromIndex) {
            try {
                internalIterator.close();
            } catch (e) {
                Logger.error('Failed to close iterator, original error message was {0}: {1}', e, e.stack);
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
 * Chunk Script Method: beforeStep
 * Called once before processing begins. Used to initialize resources.
 *
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {void}
 */
exports.beforeStep = function (parameters) {
    if (parameters.IsDisabled) {
        Logger.info('Job step is disabled');
        return;
    }

    jobState.reset();
    jobState.isConfigured = hasValidConfiguration();
    if (!jobState.isConfigured) {
        return;
    }

    try {
        var useSearchIndex = parameters['Products Source'] === 'SEARCH_INDEX';
        jobState.breakAfter = parseInt(parameters['Break After'], 10);
        // eslint-disable-next-line no-restricted-globals
        jobState.breakAfter = isNaN(jobState.breakAfter) ? 0 : jobState.breakAfter;

        jobState.exportOptions = {
            imageViewType: parameters['Images View Type'] || 'large',
            onlyRegionalDetails: parameters['Main site ID'] && (Site.getCurrent().ID !== parameters['Main site ID'])
        };

        var testProductId = parameters['Test Product ID'] || null;

        jobState.jobId = generateUniqueId();
        Logger.info('Starting Pixlee export job {0}', jobState.jobId);

        jobState.productsIterator = testProductId
            ? new SingleProductIterator(testProductId)
            : new ProductsIterator(useSearchIndex);

        jobState.totalProductsToProcess = jobState.productsIterator.getCount();
        Logger.info('Total products to process: {0}', jobState.totalProductsToProcess);

        if (jobState.totalProductsToProcess === 0) {
            Logger.warn('No products found in catalog to export');
        }

        // eslint-disable-next-line no-restricted-globals
        if (jobState.totalProductsToProcess && !isNaN(jobState.totalProductsToProcess) && jobState.totalProductsToProcess > 0) {
            jobState.progressLogInterval = Math.max(
                PROGRESS_LOG_DEFAULTS.MIN_INTERVAL,
                Math.floor(jobState.totalProductsToProcess / PROGRESS_LOG_DEFAULTS.PERCENTAGE_DIVISOR)
            );
        }

        PixleeService.notifyExportStatus('started', jobState.jobId, jobState.totalProductsToProcess);

        try {
            ProductExportPayload.preInitializeCategoryProcessing();
        } catch (e) {
            Logger.warn('Failed to pre-initialize category processing: {0}\n{1}', e.message, e.stack || '');
        }
    } catch (e) {
        Logger.error('Failed to initialize Pixlee export job: {0}\n{1}', e.message, e.stack || '');
        jobState.reset();
        throw e;
    }
};

/**
 * Chunk Script Method: getTotalCount
 * Returns the total number of items to be processed.
 *
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {number} - Total count of products to process
 */
exports.getTotalCount = function (parameters) {
    if (parameters.IsDisabled || !jobState.isInitialized()) {
        return 0;
    }
    return jobState.totalProductsToProcess;
};

/**
 * Chunk Script Method: beforeChunk
 * Called before each chunk is processed.
 *
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {void}
 */
exports.beforeChunk = function (parameters) {
    if (parameters.IsDisabled || !jobState.isInitialized()) {
        return;
    }
    Logger.debug('Starting new chunk. Products exported so far: {0}, Total failures: {1}',
        jobState.productsExported, jobState.totalFails);
};

/**
 * Chunk Script Method: read
 * Returns the next item to process, or null when there are no more items.
 * This method is called repeatedly until it returns null.
 *
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {dw.catalog.Product|string|null} - Next product to process, empty string to skip, or null when done
 */
exports.read = function (parameters) {
    if (parameters.IsDisabled || !jobState.isInitialized()) {
        return null;
    }

    try {
        if (jobState.shouldStopDueToFailures()) {
            Logger.error('Reached maximum consecutive failures ({0}). Stopping export.', jobState.consecutiveFails);
            return null;
        }

        if (!jobState.productsIterator || !jobState.productsIterator.hasNext()) {
            return null;
        }

        var product = jobState.productsIterator.next();

        if (!product) {
            Logger.warn('Iterator returned null product. Skipping.');
            return '';
        }

        jobState.processedCount += 1;

        if (!product.online || !product.searchable || product.variant) {
            return '';
        }

        if (jobState.shouldLogProgress(jobState.processedCount)) {
            var totalText = jobState.totalProductsToProcess ? jobState.totalProductsToProcess.toString() : 'unknown';
            Logger.info('Reading product {0} ({1}/{2})', product.ID, jobState.processedCount, totalText);
        }

        return product;
    } catch (e) {
        Logger.error('Failed on read step: {0}\n{1}', e.message, e.stack || '');
        return null;
    }
};

/**
 * Chunk Script Method: process
 * Processes a single item returned by read(). Returns the processed result.
 *
 * @param {dw.catalog.Product} product - Product to process
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {Object|null} - Processed product payload, or null if processing failed
 */
exports.process = function (product, parameters) {
    if (parameters.IsDisabled || !jobState.isInitialized() || empty(product)) {
        return null;
    }

    try {
        var productPayload = new ProductExportPayload(product, jobState.exportOptions);

        return {
            payload: productPayload,
            productId: product.ID
        };
    } catch (e) {
        Logger.error('Failed to create payload for product {0}: {1}\n{2}',
            product.ID, e.message, e.stack || '');
        jobState.recordFailure();
        return null;
    }
};

/**
 * Chunk Script Method: write
 * Writes a chunk of processed items. This is where we send products to Pixlee.
 *
 * @param {Array} items - Array of processed items from process()
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {void}
 */
exports.write = function (items, parameters) {
    if (parameters.IsDisabled || !jobState.isInitialized() || !items || items.length === 0) {
        return;
    }

    try {
        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            if (item && item.payload) {
                try {
                    PixleeService.postProduct(item.payload);
                    jobState.recordSuccess();

                    if (jobState.shouldLogProgress(jobState.productsExported)) {
                        Logger.info('Product {0} exported ({1} total)', item.productId, jobState.productsExported);
                    }
                } catch (e) {
                    Logger.error('Failed to export product {0}: {1}\n{2}',
                        item.productId, e.message, e.stack || '');
                    jobState.recordFailure();
                }
            }
        }
    } catch (e) {
        Logger.error('Failed on write step: {0}\n{1}', e.message, e.stack || '');
    }
};

/**
 * Chunk Script Method: afterChunk
 * Called after each chunk is processed.
 *
 * @param {boolean} success - Whether chunk processed successfully
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {void}
 */
exports.afterChunk = function (success, parameters) {
    if (parameters.IsDisabled || !jobState.isInitialized()) {
        return;
    }

    if (!success) {
        Logger.warn('Chunk completed with errors. Consecutive failures: {0}', jobState.consecutiveFails);
    }
};

/**
 * Chunk Script Method: afterStep
 * Called once after all chunks have been processed (or if step fails).
 * Used for cleanup and final reporting.
 *
 * @param {boolean} success - Whether the step completed successfully
 * @param {dw.job.JobParameters} parameters - Job parameters from Business Manager
 * @returns {void}
 */
exports.afterStep = function (success, parameters) {
    try {
        if (parameters.IsDisabled || !jobState.isInitialized()) {
            return;
        }

        Logger.info('Pixlee export job {0} finishing. Success: {1}', jobState.jobId, success);

        try {
            var cacheStats = ProductExportPayload.getCacheStatistics();
            Logger.info('Cache statistics: ' + JSON.stringify(cacheStats));
        } catch (e) {
            Logger.warn('Failed to get cache statistics: {0}', e.message);
        }

        try {
            PixleeService.notifyExportStatus('finished', jobState.jobId, jobState.totalProductsToProcess);
        } catch (e) {
            Logger.warn('Failed to notify Pixlee: {0}', e.message);
        }

        Logger.info('Export completed. Exported: {0}, Failures: {1}, Processed: {2}/{3}',
            jobState.productsExported, jobState.totalFails, jobState.processedCount, jobState.totalProductsToProcess);

        if (!success) {
            Logger.error('Job step reported failure');
        }

        if (jobState.totalProductsToProcess > 0 && jobState.productsExported === 0) {
            Logger.error('No products exported despite {0} available', jobState.totalProductsToProcess);
        }

        if (jobState.totalFails > 0) {
            Logger.warn('Export completed with {0} failures out of {1} processed',
                jobState.totalFails, jobState.processedCount);
        }

        if (!success || (jobState.totalProductsToProcess > 0 && jobState.productsExported === 0)) {
            var msg = 'Export failed. Exported: ' + jobState.productsExported +
                ', Failures: ' + jobState.totalFails + ', Available: ' + jobState.totalProductsToProcess;
            throw new Error(msg);
        }
    } catch (e) {
        Logger.error('Failed on afterStep: {0}\n{1}', e.message, e.stack || '');
        throw e;
    } finally {
        try {
            if (jobState.productsIterator && typeof jobState.productsIterator.close === 'function') {
                jobState.productsIterator.close();
            }
        } catch (e) {
            Logger.warn('Failed to close iterator: {0}', e.message);
        }
        jobState.reset();
    }
};

/**
 * Legacy execute method - kept for backward compatibility.
 * This method is no longer called when using chunk-script-module-step,
 * but keeping it allows reverting to script-module-step if needed.
 *
 * @deprecated
 * @param {Object} jobParameters - Job parameters from Business Manager
 * @returns {dw.system.Status} - Status OK or ERROR
 */
exports.execute = function (jobParameters) {
    var currentSite = Site.getCurrent();
    if (!currentSite.getCustomPreferenceValue('PixleeEnabled')) {
        Logger.info('Pixlee integration is disabled');
        return new Status(Status.OK, 'OK', 'Pixlee integration is disabled for {0}', currentSite.ID);
    }
    if (!currentSite.getCustomPreferenceValue('PixleePrivateApiKey')) {
        Logger.error('Pixlee is enabled but Private API Key is not set');
        return new Status(Status.ERROR, 'ERROR', 'Pixlee Private API Key not set for {0}', currentSite.ID);
    }
    if (!currentSite.getCustomPreferenceValue('PixleeSecretKey')) {
        Logger.error('Pixlee is enabled but Secret Key is not set');
        return new Status(Status.ERROR, 'ERROR', 'Pixlee Secret Key not set for {0}', currentSite.ID);
    }

    var breakAfterParam = parseInt(jobParameters['Break After'], 10);
    // eslint-disable-next-line no-restricted-globals
    breakAfterParam = isNaN(breakAfterParam) ? 0 : breakAfterParam;
    var legacyExportOptions = {
        imageViewType: jobParameters['Images View Type'] || null,
        onlyRegionalDetails: jobParameters['Main site ID'] && (currentSite.ID !== jobParameters['Main site ID'])
    };
    var testProductId = jobParameters['Test Product ID'] || null;

    var legacyJobId = generateUniqueId();

    var productsIter;
    var totalProducts;
    var productsExportedCount = 0;
    var totalFailsCount = 0;
    var consecutiveFailsCount = 0;
    var progressLogIntervalLocal = PROGRESS_LOG_DEFAULTS.DEFAULT_INTERVAL;

    try {
        var useSearchIndex = jobParameters['Products Source'] === 'SEARCH_INDEX';
        productsIter = testProductId
            ? new SingleProductIterator(testProductId)
            : new ProductsIterator(useSearchIndex);

        totalProducts = productsIter.getCount();

        PixleeService.notifyExportStatus('started', legacyJobId, totalProducts);

        try {
            ProductExportPayload.preInitializeCategoryProcessing();
            Logger.info('Category processing strategy successfully built');
        } catch (e) {
            Logger.warn('Failed to build category processing: ' + e.message + '. Will initialize per-product.');
        }

        var processedCountLocal = 0;
        // eslint-disable-next-line no-restricted-globals
        if (totalProducts && !isNaN(totalProducts) && totalProducts > 0) {
            progressLogIntervalLocal = Math.max(
                PROGRESS_LOG_DEFAULTS.MIN_INTERVAL,
                Math.floor(totalProducts / PROGRESS_LOG_DEFAULTS.PERCENTAGE_DIVISOR)
            );
        }

        while (productsIter.hasNext()) {
            var product = productsIter.next();
            processedCountLocal += 1;

            if (product.online && product.searchable && !product.variant) {
                try {
                    if (processedCountLocal % progressLogIntervalLocal === 0 || processedCountLocal <= PROGRESS_LOG_DEFAULTS.ALWAYS_LOG_FIRST) {
                        var totalText = totalProducts ? totalProducts.toString() : 'unknown';
                        Logger.info('Processing product {0} ({1}/{2})', product.ID, processedCountLocal, totalText);
                    }

                    var productPayload = new ProductExportPayload(product, legacyExportOptions);
                    PixleeService.postProduct(productPayload);
                    productsExportedCount += 1;
                    consecutiveFailsCount = 0;

                    if (productsExportedCount <= PROGRESS_LOG_DEFAULTS.ALWAYS_LOG_FIRST || productsExportedCount % progressLogIntervalLocal === 0) {
                        Logger.info('Product {0} successfully exported ({1} total)', product.ID, productsExportedCount);
                    }
                } catch (e) {
                    Logger.error('Failed to export product {0}: {1}\n{2}', product.ID, e.message, e.stack || '');
                    consecutiveFailsCount += 1;
                    totalFailsCount += 1;
                }
            }

            if (breakAfterParam && (consecutiveFailsCount >= breakAfterParam)) {
                throw new Error('Reached the maximum number of consecutive product export failures');
            }
        }

        try {
            var cacheStats = ProductExportPayload.getCacheStatistics();
            Logger.info('Final cache statistics: ' + JSON.stringify(cacheStats));
        } catch (e) {
            Logger.warn('Failed to get final cache statistics: {0}', e.message);
        }

        if (totalProducts && !productsExportedCount) {
            throw new Error('No products exported');
        } else if (totalFailsCount) {
            return new Status(Status.ERROR, 'ERROR', totalFailsCount + ' products failed to export');
        }

        return new Status(Status.OK, 'OK', 'job id: ' + legacyJobId + ', ' + productsExportedCount + ' products exported');
    } catch (e) {
        Logger.error('Failed to export products, job id: {0}, error: {1}\n{2}', legacyJobId, e.message, e.stack || '');
        return new Status(Status.ERROR, 'ERROR', e);
    } finally {
        PixleeService.notifyExportStatus('finished', legacyJobId, totalProducts);

        if (productsIter) {
            productsIter.close();
        }
    }
};
