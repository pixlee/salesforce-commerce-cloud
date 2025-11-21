'use strict';

// eslint-disable-next-line no-redeclare
/* global request, session */

var DEFAULT_IMAGE_VIEW_TYPE = 'large';
var DEFAULT_NO_IMAGE_PATH = '/images/noimagesmall.png';
var THREE_PROPERTY_LIMIT = 650; // Avoid SFCC 2000 property limit assumes 3 properties per item
var CATEGORY_LIMIT = THREE_PROPERTY_LIMIT;
var VARIANT_LIMIT = THREE_PROPERTY_LIMIT;

var MAX_RECURSION_DEPTH = 20;

var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var CatalogMgr = require('dw/catalog/CatalogMgr');
var Currency = require('dw/util/Currency');
var pixleeHelper;
var currencyLookupHelper;

/**
 * @returns {Object} The pixleeHelper module
 */
function getPixleeHelper() {
    if (!pixleeHelper) {
        pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');
    }
    return pixleeHelper;
}

/**
 * @returns {Object} The currencyLookupHelper module
 */
function getCurrencyLookupHelper() {
    if (!currencyLookupHelper) {
        currencyLookupHelper = require('*/cartridge/scripts/pixlee/helpers/currencyLookupHelper');
    }
    return currencyLookupHelper;
}

// Cache expensive Resource.msg calls to avoid repeated string operations
var VERSION_HASH = (function () {
    var pixleeVersion = Resource.msg('pixlee.version.hash', 'pixlee', 'unknown version');
    var platformVersion = Resource.msg('ecomm.platform.version', 'pixlee', 'unknown architecture');
    return pixleeVersion + platformVersion;
}());

var ECOMM_PLATFORM = Resource.msg('ecomm.platform', 'pixlee', 'demandware');

var ECOMM_PLATFORM_VERSION = (function () {
    var globalVersion = Resource.msg(
        'global.version.number',
        'version',
        Resource.msg('revisioninfo.revisionnumber', 'revisioninfo', 'unknown version')
    );
    var siteName = Resource.msg(
        'global.site.name',
        'version',
        Resource.msg('global.site.name', 'locale', 'unknown architecture')
    );
    return globalVersion + ' ' + siteName;
}());

/**
 * Module-level cache for category maps (not stored in session due to SFCC restrictions)
 * This cache persists for the lifetime of the module but doesn't violate session storage rules
 */
var ModuleLevelCache = {
    categoryMap: null,
    categoryCount: null,

    clear: function () {
        this.categoryMap = null;
        this.categoryCount = null;
    }
};

/**
 * Module-level variable to cache the category strategy instance
 * Simple variable is more appropriate than complex caching for a single strategy object
 */
var categoryStrategyInstance = null;

/**
 * Request-scoped cache for primitive values only (SFCC session storage compliant)
 * Uses session.getPrivacy() for automatic cleanup at end of request
 */
var RequestCache = {
    /**
     * Gets a cached value or creates it using the factory function
     * @param {string} key - Cache key
     * @param {Function} factory - Function to create value if not cached
     * @returns {*} - Cached or newly created value
     */
    get: function (key, factory) {
        var privacyCache = session.getPrivacy();
        if (!privacyCache[key]) {
            var value = factory();

            // SFCC Session Compliance: Validate data type
            if (!this.isValidSessionType(value)) {
                Logger.warn('Invalid session data type for key: ' + key + ', type: ' + typeof value);
                return value; // Don't cache invalid types
            }

            privacyCache[key] = value;

            // SFCC Session Compliance: Monitor session size (10KB limit)
            this.checkSessionSize();
        }

        return privacyCache[key];
    },

    /**
     * Validates if a value can be stored in SFCC session
     * @param {*} value - Value to validate
     * @returns {boolean} - True if valid for session storage
     */
    isValidSessionType: function (value) {
        if (value === null || value === undefined) return true;

        var type = typeof value;

        // Primitive types are allowed
        if (type === 'boolean' || type === 'number' || type === 'string') {
            // Check string length limit (2000 chars)
            if (type === 'string' && value.length > 2000) {
                Logger.warn('String exceeds 2000 character limit: ' + value.length + ' chars');
                return false;
            }
            return true;
        }

        // Date objects are allowed
        if (value instanceof Date) return true;

        // Number, String, Boolean wrapper objects are allowed
        if (value instanceof Number || value instanceof String || value instanceof Boolean) return true;

        // Arrays are specifically not allowed
        if (Array.isArray(value)) {
            Logger.warn('Arrays not allowed in session storage. Use comma-separated strings instead.');
            return false;
        }

        // Everything else is not allowed (objects, functions, etc.)
        Logger.warn('Unsupported session data type: ' + type + ', constructor: ' + (value.constructor ? value.constructor.name : 'unknown'));
        return false;
    },

    /**
     * Helper to safely store arrays as comma-separated strings
     * @param {Array} array - Array to convert
     * @param {string} separator - Separator to use (default: ',')
     * @returns {string} - Comma-separated string safe for session storage
     */
    arrayToString: function (array, separator) {
        if (!Array.isArray(array)) return array;
        return array.join(separator || ',');
    },

    /**
     * Helper to convert comma-separated strings back to arrays
     * @param {string} str - String to convert
     * @param {string} separator - Separator used (default: ',')
     * @returns {Array} - Array of strings
     */
    stringToArray: function (str, separator) {
        if (typeof str !== 'string') return str;
        return str.split(separator || ',');
    },

    /**
     * Monitors session size to ensure compliance with 10KB limit
     */
    checkSessionSize: function () {
        try {
            var privacyCache = session.getPrivacy();
            var serialized = JSON.stringify(privacyCache);
            var sizeKB = Math.round((serialized.length / 1024) * 100) / 100;

            if (sizeKB > 8) { // Warn at 8KB to prevent hitting 10KB limit
                Logger.warn('Session cache approaching size limit: ' + sizeKB + 'KB / 10KB');
            }

            if (sizeKB > 10) {
                Logger.error('Session cache exceeds SFCC 10KB limit: ' + sizeKB + 'KB');
            }
        } catch (e) {
            Logger.warn('Failed to check session size: ' + e.message);
        }
    },

    /**
     * Clears specific cache entry (useful for testing)
     * @param {string} key - Cache key to clear
     */
    clear: function (key) {
        var privacyCache = session.getPrivacy();
        delete privacyCache[key];
    },

    /**
     * Clears all cache entries (useful for testing)
     */
    clearAll: function () {
        var privacyCache = session.getPrivacy();
        // Clear all cached keys by iterating and deleting
        var keys = Object.keys(privacyCache);
        for (var i = 0; i < keys.length; i += 1) {
            delete privacyCache[keys[i]];
        }
    }
};

/**
 * @function
 * @description Validates that a product has the required methods for category processing
 * @param {dw.catalog.Product} product - Product to validate
 * @param {string} context - Context string for error logging (e.g., strategy name)
 * @returns {boolean} - True if product is valid, false otherwise
 */
function validateProductForCategories(product, context) {
    if (!product || !product.getCategoryAssignments) {
        Logger.error('Invalid product passed to ' + context);
        return false;
    }
    return true;
}

/**
 * @function
 * @description Gets the site catalog - no caching since Catalog objects can't be stored in session
 * @returns {dw.catalog.Catalog} - The site catalog
 */
function getSiteCatalog() {
    return CatalogMgr.getSiteCatalog();
}

/**
 * @function
 * @description Gets the current site - no caching since Site objects can't be stored in session
 * @returns {dw.system.Site} - The current site instance
 */
function getCurrentSite() {
    return Site.getCurrent();
}

/**
 * @function
 * @description Optimized JSON serialization that handles large objects gracefully
 * @param {Object} obj - Object to serialize
 * @param {string} context - Context for error logging
 * @returns {string} - JSON string or fallback on error
 */
function safeJSONStringify(obj, context) {
    try {
        // For small objects, use standard JSON.stringify
        if (!obj || typeof obj !== 'object') {
            return JSON.stringify(obj);
        }

        // Check object size heuristically - count keys for arrays/objects
        var estimatedSize;
        if (Array.isArray(obj)) {
            estimatedSize = obj.length;
        } else {
            estimatedSize = Object.keys(obj).length;
        }

        // For large objects (>100 items), add progress logging and chunked processing
        if (estimatedSize > 100) {
            Logger.debug('Serializing large ' + context + ' object with ' + estimatedSize + ' items');

            // For very large arrays, consider truncating or summarizing
            if (Array.isArray(obj) && obj.length > 1000) {
                Logger.warn('Large array detected for ' + context + ' (' + obj.length + ' items), consider optimizing data structure');
            }
        }

        return JSON.stringify(obj);
    } catch (e) {
        Logger.error('JSON serialization failed for ' + context + ': ' + e.message);

        // Fallback: try to serialize a simplified version
        try {
            if (Array.isArray(obj)) {
                return JSON.stringify(obj.slice(0, 10)); // First 10 items only
            } if (typeof obj === 'object') {
                return JSON.stringify({ error: 'Serialization failed', context: context });
            }
        } catch (fallbackError) {
            Logger.error('Fallback JSON serialization also failed for ' + context + ': ' + fallbackError.message);
        }

        return '{"error": "JSON serialization failed for ' + context + '"}';
    }
}

/**
 * @function
 * @description Retrieves the PDP URL for a given product. In case ProductHost site preference
 * is configured, the URL domain is replaced with that host name.
 * @param {dw.catalog.Product} product - Product to retrieve the PDP URL for
 * @returns {string} - Product Page URL.
 */
function getProductPageUrl(product) {
    var pdpURL = URLUtils.https('Product-Show', 'pid', product.ID);
    var replaceHost = RequestCache.get('pixlee:productHost', function () {
        return getCurrentSite().getCustomPreferenceValue('ProductHost');
    });

    if (replaceHost) {
        pdpURL.host(replaceHost);
    }

    return pdpURL.toString();
}

/**
 * @function
 * @description Retrieves the URL of the product main image.
 * @param {dw.catalog.Product} product - Product for which to retrieve the main
 *   product image URL.
 * @param {Object} options - Export configuration options
 * @returns {string} - Main product image URL. In case no image is configured for
 *   that product but no image file is present, the URL of that file is returned
 *   as a fallback.
 */
function getProductImageURL(product, options) {
    var productImageURL = null;
    var imageViewType = options.imageViewType || DEFAULT_IMAGE_VIEW_TYPE;
    var image = product.getImage(imageViewType, 0);

    if (image) {
        productImageURL = image.absURL.toString();
    } else {
        var pvm = product.variationModel;
        if (pvm && pvm.defaultVariant) {
            var defaultVariant = pvm.defaultVariant;
            image = defaultVariant.getImage(imageViewType, 0);
            if (image) {
                productImageURL = image.absURL.toString();
            }
        }
    }

    // fall back to no image URL:
    if (!productImageURL) {
        productImageURL = URLUtils.absStatic(DEFAULT_NO_IMAGE_PATH);
    }

    return productImageURL;
}

/**
 * @function
 * @description Returns the product price using pre-fetched price model and variant data
 * @param {dw.catalog.Product} product - The product to get price for
 * @param {Object} cachedProductData - Pre-fetched product data
 * @returns {number} - The retrieved price
 */
function getProductPrice(product, cachedProductData) {
    var productPrice = null;

    if (cachedProductData.priceModel) {
        try {
            var price;
            if (!cachedProductData.defaultVariant) {
                price = cachedProductData.priceModel.getPrice();
            } else {
                price = cachedProductData.defaultVariant.getPriceModel().getPrice();
            }

            // Check if price is null (common for product sets, bundles, etc.)
            if (price && price.decimalValue !== null && price.decimalValue !== undefined) {
                productPrice = price.decimalValue.valueOf();
            } else {
                Logger.debug('Product has no price (product set/bundle/etc.): ' + product.ID);
                productPrice = 0; // Default price for products without pricing
            }
        } catch (e) {
            Logger.warn('Could not get the price from cached data: ' + e.message);
            productPrice = 0; // Fallback to 0 instead of leaving undefined
        }
    }

    // Final fallback for products with no price model at all
    if (productPrice === null || productPrice === undefined) {
        Logger.debug('Product has no price model - using default value 0: ' + (product ? product.ID : 'unknown'));
        productPrice = 0;
    }

    return productPrice;
}

/**
 * @function
 * @description Retrieves the product stock.
 * @param {dw.catalog.Product} product - Product for which to retrieve stock.
 * @returns {number} - Stock for the product.
 */
function getProductStock(product) {
    var productStock = 0;

    if (product.getAvailabilityModel()) {
        // 2016-03-23: product.getAvailabilityModel().availability uses some fancy algorithm,
        // described by the documentation as the following:
        // If inventory lists are in use:
        //     If no inventory record exists and the inventory list default-in-stock flag is true this method returns 1.
        //    If no inventory record exists the inventory list default-in-stock flag is false this method returns 0.
        //    If the product is not available this method returns 0.
        //    If the product is perpetually available this method returns 1.
        //    Otherwise, this method returns the ATS / allocation.
        // What I really want is the sum of all variants
        // BUT I DON'T HAVE IT BECAUSE I NEVER FIGURED OUT HOW TO LOOP THROUGH VARIANTS
        // IN B2C COMMERCE - Instead, I'll settle for a 0/1, which I've tested
        // Check CR-534
        if (product.getAvailabilityModel().isInStock()) {
            productStock = 1;
        } else {
            productStock = 0;
        }
    }

    return productStock;
}

/**
 * @function
 * @description Retrieves a list of URLs of all product images of a product.
 * @param {dw.catalog.Product} product - Product for which to retrieve stock.
 * @param {Object} exportOptions - Export configuration options
 * @returns {Array} - Array of all product image URLs.
 */
function getAllProductImages(product, exportOptions) {
    var allImages = [];
    var imageUrlsSet = {};
    var imageViewType = exportOptions.imageViewType || DEFAULT_IMAGE_VIEW_TYPE;
    var MAX_IMAGES = 1900; // Cap to stay well under SFCC 2000 property limit

    var productImages = product.getImages(imageViewType);
    for (var i = 0; i < productImages.length && allImages.length < MAX_IMAGES; i += 1) {
        var image = productImages[i];
        var imageUrl = image.absURL.toString();
        imageUrlsSet[imageUrl] = true;
        allImages.push(imageUrl);
    }

    if (product.master && allImages.length < MAX_IMAGES) {
        var variantIterator = product.getVariants().iterator();

        while (variantIterator.hasNext() && allImages.length < MAX_IMAGES) {
            var variant = variantIterator.next();
            var variantPhotos = variant.getImages(imageViewType);
            for (var j = 0; j < variantPhotos.length && allImages.length < MAX_IMAGES; j += 1) {
                var photoURL = variantPhotos[j].absURL.toString();
                // Use object for O(1) duplicate checking
                if (!imageUrlsSet[photoURL]) {
                    imageUrlsSet[photoURL] = true;
                    allImages.push(photoURL);
                }
            }
        }
    }

    // Log warning if we hit the cap
    if (allImages.length >= MAX_IMAGES) {
        Logger.warn('Product {0} has more than {1} images. Only first {1} images included to prevent SFCC object size limit.',
            product.ID, MAX_IMAGES);
    }

    return allImages;
}

/**
 * @function
 * @description Retrieves details of product variants.
 * @param {dw.catalog.Product} product - Product for which to retrieve variants.
 * @returns {Object} - An object (map) having details of all product variants.
 */
function getProductVariants(product) {
    var variantsDict = {};

    if (product.master) {
        var variantIterator = product.getVariants().iterator();
        var variantCount = 0;

        while (variantIterator.hasNext() && variantCount < VARIANT_LIMIT) {
            var variant = variantIterator.next();

            var variantID = variant.getID();

            var inventoryRecord = variant.getAvailabilityModel().getInventoryRecord();
            // NOTE: Changed to using ATS instead of stockLevel
            var variantStock = inventoryRecord ? inventoryRecord.ATS.value : null;

            variantsDict[variantID] = {
                variant_stock: variantStock,
                variant_sku: variantID
            };

            variantCount++;
        }

        // Log warning if we hit the cap
        if (variantIterator.hasNext()) {
            Logger.warn('Product {0} has more than {1} variants. Only first {1} variants included to prevent SFCC object size limit.',
                product.ID, VARIANT_LIMIT);
        }
    }

    return variantsDict;
}

/**
 * Base strategy interface for category processing
 * Building a category object was failing for too many categories. Because this is the most efficient way, that is preferred.
 * However, if there are too many categories, we have to try different strategies. The other strategies are optimized based
 * on the number of categories in the catalog.
 * @constructor
 */
function CategoryStrategy() {
    // eslint-disable-next-line no-unused-vars
    this.getCategories = function (product) {
        throw new Error('getCategories must be implemented by strategy');
    };
}

/**
 * @function
 * @description Estimates category count efficiently without building full tree
 * @param {dw.catalog.Catalog} catalog - The catalog to estimate categories for
 * @returns {number} - Estimated number of categories in the catalog
 */
function estimateCategoryCount(catalog) {
    var count = 0;
    var queue = [];
    var root = catalog.getRoot();
    var categoryCollection = root.getSubCategories();

    for (var i = 0; i < categoryCollection.length; i += 1) {
        queue.push(categoryCollection[i]);
    }

    while (queue.length > 0 && count <= CATEGORY_LIMIT) { // Stop once we know it's a large catalog
        var category = queue.shift();
        count += 1;

        var children = category.getSubCategories();
        for (var j = 0; j < children.length; j += 1) {
            queue.push(children[j]);
        }
    }

    return count;
}


/**
 * @function
 * @description Generic function to extract product categories and their parent hierarchy using
 * a pluggable lookup strategy. Handles both direct category assignments and parent
 * category inheritance with safety limits to prevent infinite processing.
 *
 * Algorithm:
 * 1. Get direct category assignments from product
 * 2. For each assigned category, use lookupFunction to get category data
 * 3. Recursively add parent categories from the hierarchy
 * 4. Enforce CATEGORY_LIMIT to prevent runaway processing
 * 5. Return deduplicated category list
 *
 * @param {dw.catalog.Product} product - SFCC Product object with category assignments
 * @param {Function} lookupFunction - Strategy-specific lookup function with signature:
 *   (categoryId: string) => {category_id: string, category_name: string, fullName: string, parentIDs: Array<string>} | null
 * @returns {Array<Object>} Array of category objects with structure:
 *   [{category_id: string, category_name: string}, ...]
 * @throws {Error} If product category processing fails
 */
function getProductCategoriesGeneric(product, lookupFunction) {
    var productCategories = {};
    var categoryAssignments = product.getCategoryAssignments();
    var processedCount = 0;

    for (var i = 0; i < categoryAssignments.length && processedCount < CATEGORY_LIMIT; i += 1) {
        var category = categoryAssignments[i].getCategory();
        var categoryId = category.getID();

        var categoryInfo = lookupFunction(categoryId);
        if (categoryInfo) {
            if (!productCategories[categoryId]) {
                productCategories[categoryId] = {
                    category_id: categoryId,
                    category_name: categoryInfo.fullName
                };
                processedCount += 1;
            }

            // Add parent categories
            var parentCategoriesIds = categoryInfo.parentIDs && categoryInfo.parentIDs.length > 0 ? categoryInfo.parentIDs.split(',') : [];
            for (var j = 0; j < parentCategoriesIds.length && processedCount < CATEGORY_LIMIT; j += 1) {
                var parentCategoryId = parentCategoriesIds[j];
                if (!parentCategoryId) {
                    // Skip empty parent IDs
                } else if (!productCategories[parentCategoryId]) {
                    var parentInfo = lookupFunction(parentCategoryId);
                    if (parentInfo) {
                        productCategories[parentCategoryId] = {
                            category_id: parentCategoryId,
                            category_name: parentInfo.fullName
                        };
                        processedCount += 1;
                    }
                }
            }
        }
    }

    return Object.keys(productCategories).map(function (key) {
        return productCategories[key];
    });
}

/**
 * @function
 * @description Improved category path building with better performance
 * @param {Array} pathStack - Stack of parent category IDs
 * @param {Object} namesMap - Map of category IDs to names
 * @param {string} categoryName - Name of the current category
 * @returns {string} - Full category path as a string
 */
function buildCategoryPath(pathStack, namesMap, categoryName) {
    var pathParts = [];
    for (var i = 0; i < pathStack.length; i += 1) {
        var parentID = pathStack[i];
        var parentName = namesMap[parentID];
        if (parentName) {
            pathParts.push(parentName);
        }
    }
    pathParts.push(categoryName);
    return pathParts.join(' > ');
}

/**
 * Strategy 1: Single Map (if category tree fits in object < 2000 properties)
 * @extends CategoryStrategy
 */
function SingleMapStrategy() {
    CategoryStrategy.call(this);
    var categoriesMap = null;

    /**
     * @function
     * @private
     * @description Builds a single categories map for small catalogs
     * @returns {Object} - Map of categories with full names and parent IDs
     */
    function buildSingleCategoriesMap() {
        var catalog = getSiteCatalog();
        var root = catalog.getRoot();
        var result = {};
        var namesMap = {};

        // Standard BFS approach (safe for small catalogs)
        var queue = [];
        var categoryCollection = root.getSubCategories();

        for (var i = 0; i < categoryCollection.length; i += 1) {
            queue.push({
                node: categoryCollection[i],
                path: []
            });
        }

        while (queue.length > 0) {
            var currentNode = queue.shift();
            var category = currentNode.node;
            var pathToNode = currentNode.path;

            var categoryID = category.getID();
            var categoryName = category.getDisplayName();
            var childrenNodes = category.getSubCategories();

            namesMap[categoryID] = categoryName;

            result[categoryID] = {
                fullName: buildCategoryPath(pathToNode, namesMap, categoryName),
                parentIDs: pathToNode.join(',')
            };

            pathToNode.push(categoryID);
            for (var j = 0; j < childrenNodes.length; j += 1) {
                queue.push({ node: childrenNodes[j], path: pathToNode.slice() });
            }
        }

        return result;
    }

    /**
     * @function
     * @private
     * @description Lazy initialization helper to ensure category map is built only once
     * @returns {Object} - The initialized category map
     */
    function ensureCategoryMapInitialized() {
        if (!ModuleLevelCache.categoryMap) {
            ModuleLevelCache.categoryMap = buildSingleCategoriesMap();
        }
        return ModuleLevelCache.categoryMap;
    }

    this.getCategories = function (product) {
        if (!validateProductForCategories(product, 'SingleMapStrategy')) {
            return [];
        }

        categoriesMap = ensureCategoryMapInitialized();
        return getProductCategoriesGeneric(product, function (categoryId) {
            return categoriesMap[categoryId];
        });
    };

    /**
     * Gets cache statistics for monitoring
     * @returns {Object} - Cache statistics for SingleMapStrategy
     */
    this.getCacheStats = function () {
        var categoryMap = ensureCategoryMapInitialized();
        return {
            size: Object.keys(categoryMap).length,
            totalCachedCategories: Object.keys(categoryMap).length
        };
    };

}

/**
 * Hybrid BFS Strategy for large catalogs (> CATEGORY_LIMIT)
 * @extends CategoryStrategy
 */
function HybridBFSStrategy() {
    CategoryStrategy.call(this);
    var bfsCategoryMap = {}; // BFS map for highest levels of category tree
    var additionalCategoryMap = {}; // Additional lower-level categories that did not fit in primary BFS map
    var isBuilt = false;

    /**
     * @function
     * @private
     * @description Builds partial category map using BFS (breadth-first search)
     * @returns {void}
     */
    function buildBFSCategoryMap() {
        var catalog = getSiteCatalog();
        var root = catalog.getRoot();
        var queue = [];
        var count = 0;

        // Initialize BFS queue with top levels of category tree
        var categoryCollection = root.getSubCategories();
        for (var i = 0; i < categoryCollection.length; i += 1) {
            queue.push({
                category: categoryCollection[i],
                path: [],
                pathNames: [] // Store parent names directly in queue items
            });
        }

        // BFS traversal until we hit the map size limit
        while (queue.length > 0 && count < CATEGORY_LIMIT) {
            var item = queue.shift();
            var category = item.category;
            var categoryId = category.getID();
            var categoryName = category.getDisplayName();
            var pathToNode = item.path;
            var pathNamesToNode = item.pathNames;

            // Build full path directly without separate namesMap
            var fullPath = pathNamesToNode.length > 0
                ? pathNamesToNode.join(' > ') + ' > ' + categoryName
                : categoryName;

            // Store in BFS map (SINGLE object only)
            bfsCategoryMap[categoryId] = {
                fullName: fullPath,
                parentIDs: pathToNode.join(',')
            };
            count += 1;

            // Add children to queue for next BFS level
            var children = category.getSubCategories();
            var newPath = pathToNode.slice();
            newPath.push(categoryId);
            var newPathNames = pathNamesToNode.slice();
            newPathNames.push(categoryName);

            for (var j = 0; j < children.length; j += 1) {
                if (count < CATEGORY_LIMIT) { // Only add if we haven't hit the limit
                    queue.push({
                        category: children[j],
                        path: newPath,
                        pathNames: newPathNames
                    });
                }
            }
        }

    }

    /**
     * @function
     * @private
     * @description Hybrid lookup: checks BFS map first, then traverses tree for unmapped categories
     * @param {string} categoryId - The category ID to look up
     * @returns {Object|null} - Category data or null if not found
     */
    function hybridLookup(categoryId) {
        // First check: BFS map (O(1) lookup)
        if (bfsCategoryMap[categoryId]) {
            return bfsCategoryMap[categoryId];
        }

        // Second check: additional categories map
        if (additionalCategoryMap[categoryId]) {
            return additionalCategoryMap[categoryId];
        }

        // Not in either cache - traverse up tree to find mapped category
        var category = CatalogMgr.getCategory(categoryId);
        if (!category) {
            return null;
        }

        var traversalPath = []; // Categories we traverse up from target
        var currentCategory = category;
        var depth = 0;

        // Traverse up until we find a BFS-mapped category or hit root
        while (currentCategory && depth < MAX_RECURSION_DEPTH) {
            var currentId = currentCategory.getID();

            // Found a BFS-mapped category!
            if (bfsCategoryMap[currentId]) {
                var mappedCategory = bfsCategoryMap[currentId];

                // Build full path: mapped category path + traversed path
                var fullPath = mappedCategory.fullName;
                for (var i = traversalPath.length - 1; i >= 0; i -= 1) {
                    fullPath += ' > ' + traversalPath[i].name;
                }

                // Build parent IDs: mapped parents + mapped ancestor + traversed parents (excluding target)
                var parentIds = mappedCategory.parentIDs;

                // Include the mapped ancestor itself in the parent chain
                if (parentIds) {
                    parentIds += ',' + currentId;
                } else {
                    parentIds = currentId;
                }

                // Add traversed parents (excluding the target category)
                if (traversalPath.length > 1) {
                    var traversedParents = [];
                    for (var j = traversalPath.length - 1; j > 0; j -= 1) {
                        traversedParents.push(traversalPath[j].id);
                    }
                    parentIds += ',' + traversedParents.join(',');
                }

                var result = {
                    fullName: fullPath,
                    parentIDs: parentIds
                };

                // Store the result if we have room
                if (Object.keys(additionalCategoryMap).length < CATEGORY_LIMIT) {
                    additionalCategoryMap[categoryId] = result;
                }

                return result;
            }

            // Continue traversing up
            traversalPath.push({
                id: currentId,
                name: currentCategory.getDisplayName()
            });
            currentCategory = currentCategory.getParent();
            depth += 1;
        }

        // Reached root without finding mapped category (shouldn't happen with proper BFS)
        Logger.warn('No mapped parent found for category: ' + categoryId + ' after ' + depth + ' levels');
        return null;
    }

    /**
     * @function
     * @description Clears all caches (useful for testing or between batch processing)
     * @returns {void}
     */
    this.clearCache = function () {
        additionalCategoryMap = {};
    };

    /**
     * @function
     * @description Gets comprehensive cache statistics for monitoring
     * @returns {Object} - Cache statistics including both BFS map and unmapped cache
     */
    this.getCacheStats = function () {
        return {
            bfsMap: {
                size: Object.keys(bfsCategoryMap).length,
                maxSize: CATEGORY_LIMIT,
                utilization: (Object.keys(bfsCategoryMap).length / CATEGORY_LIMIT * 100).toFixed(1) + '%'
            },
            additionalMap: {
                size: Object.keys(additionalCategoryMap).length,
                maxSize: CATEGORY_LIMIT,
                utilization: (Object.keys(additionalCategoryMap).length / CATEGORY_LIMIT * 100).toFixed(1) + '%'
            },
            totalCachedCategories: Object.keys(bfsCategoryMap).length + Object.keys(additionalCategoryMap).length
        };
    };


    this.getCategories = function (product) {
        if (!validateProductForCategories(product, 'HybridBFSStrategy')) {
            return [];
        }

        if (!isBuilt) {
            buildBFSCategoryMap();
            isBuilt = true;
        }

        return getProductCategoriesGeneric(product, hybridLookup);
    };

    // Test-only method to access internal objects for SFCC compliance testing
    if (typeof global !== 'undefined' && global.describe) {
        this.getInternalObjectsForTesting = function () {
            return {
                bfsCategoryMap: bfsCategoryMap,
                additionalCategoryMap: additionalCategoryMap
            };
        };
    }
}

/**
 * @function
 * @description Initializes and returns the optimal category processing strategy based on catalog size
 * @returns {CategoryStrategy} - The appropriate strategy instance
 */
function initializeCategoryStrategy() {
    try {
        var catalog = getSiteCatalog();
        // Use module-level cache for category count
        if (ModuleLevelCache.categoryCount === null) {
            ModuleLevelCache.categoryCount = estimateCategoryCount(catalog);
        }
        var categoryCount = ModuleLevelCache.categoryCount;

        if (categoryCount < CATEGORY_LIMIT) {
            Logger.info('Detected ' + categoryCount + ' categories. Using SingleMapStrategy');
            return new SingleMapStrategy();
        }
        Logger.info('Detected ' + categoryCount + ' categories. Using HybridBFSStrategy for large catalog');
        return new HybridBFSStrategy();
    } catch (e) {
        Logger.error('Failed to initialize category strategy: ' + e.message);
        Logger.info('Falling back to SingleMapStrategy');
        return new SingleMapStrategy();
    }
}

/**
 * @function
 * @description Gets the category processing strategy with simple module-level variable caching
 * @returns {CategoryStrategy} - The appropriate category strategy for current catalog size
 */
function getCategoryStrategy() {
    if (!categoryStrategyInstance) {
        categoryStrategyInstance = initializeCategoryStrategy();
    }
    return categoryStrategyInstance;
}

/**
 * @function
 * @description Main function to get product categories using adaptive strategy
 * @param {dw.catalog.Product} product - Product for which to retrieve categories
 * @returns {Array} - Array of categories for the product
 */
function getProductCategories(product) {
    try {
        // Input validation
        if (!validateProductForCategories(product, 'getProductCategories')) {
            return [];
        }

        // Get cached strategy (automatically initializes if needed)
        var strategy = getCategoryStrategy();

        return strategy.getCategories(product);
    } catch (e) {
        Logger.error('Error in getProductCategories for product ' + (product ? product.ID : 'unknown') + ': ' + e.message);
        return []; // Return empty array on error
    }
}

/**
 * @function
 * @description Retrieves regional (locale-specific) details of a product
 * @param {dw.catalog.Product} product - Product to get regional details for.
 * @param {string} variantsJSON - Variants JSON, same for all regions so passed
 *   to this function as a parameter.
 * @param {Object} cachedProductData - Pre-fetched product data
 * @returns {Array} - Array of objects, separate object for each region (locale)
 */
function getRegionalInfo(product, variantsJSON, cachedProductData) {
    // Use cached site locales to avoid repeated API calls
    // Cache as comma-separated string (SFCC session compliant)
    var siteLocalesString = RequestCache.get('pixlee:siteLocales', function () {
        var locales = getCurrentSite().getAllowedLocales();
        var localeStrings = [];
        for (var i = 0; i < locales.length; i += 1) {
            localeStrings.push(locales[i].toString());
        }
        return RequestCache.arrayToString(localeStrings); // Use helper function
    });
    var siteLocales = RequestCache.stringToArray(siteLocalesString); // Convert back to array for use

    var regional = [];

    for (var j = 0; j < siteLocales.length; j += 1) {
        var currentLocale = siteLocales[j];

        if ('default'.toLowerCase() === currentLocale.toLowerCase()) {
            // Skip default locale processing
        } else {
            var cacheKey = 'pixlee:localeCurrency:' + encodeURIComponent(currentLocale);
            var localeCurrency = RequestCache.get(cacheKey, (function (locale) {
                return function () {
                    return getCurrencyLookupHelper().getCurrencyForLocale(locale);
                };
            }(currentLocale)));

            request.setLocale(currentLocale);
            session.setCurrency(Currency.getCurrency(localeCurrency));

            // Product URL
            var regionalUrl = getProductPageUrl(product);

            // Name
            var regionalName = product.getName();

            // Product Price
            var regionalPrice = null;
            var regionalCurrency = null;
            if (cachedProductData && cachedProductData.priceModel) {
                try {
                    var price;
                    if (!cachedProductData.defaultVariant) {
                        price = cachedProductData.priceModel.getPrice();
                    } else {
                        price = cachedProductData.defaultVariant.getPriceModel().getPrice();
                    }

                    // Check if price is null (common for product sets, bundles, etc.)
                    if (price && price.decimalValue !== null && price.decimalValue !== undefined) {
                        regionalPrice = price.decimalValue.valueOf();
                        regionalCurrency = price.getCurrencyCode();
                    } else {
                        Logger.debug('Product has no regional price (product set/bundle/etc.): ' + product.ID);
                        regionalPrice = 0; // Default price for products without pricing
                        regionalCurrency = localeCurrency || 'USD'; // Use locale currency or default
                    }
                } catch (err) {
                    Logger.warn('Could not get the regional price for product id: ' + product.ID);
                    Logger.warn(err.message);
                    regionalPrice = 0; // Fallback to 0
                    regionalCurrency = localeCurrency || 'USD'; // Fallback currency
                }
            } else if (product.getPriceModel()) {
                // Fallback to original logic if cached data not available
                try {
                    var productVariant = product.getVariationModel().getDefaultVariant();
                    var fallbackPrice;
                    if (!productVariant) {
                        fallbackPrice = product.getPriceModel().getPrice();
                    } else {
                        fallbackPrice = productVariant.getPriceModel().getPrice();
                    }

                    // Check if price is null (common for product sets, bundles, etc.)
                    if (fallbackPrice && fallbackPrice.decimalValue !== null && fallbackPrice.decimalValue !== undefined) {
                        regionalPrice = fallbackPrice.decimalValue.valueOf();
                        regionalCurrency = fallbackPrice.getCurrencyCode();
                    } else {
                        Logger.debug('Product has no fallback regional price (product set/bundle/etc.): ' + product.ID);
                        regionalPrice = 0; // Default price for products without pricing
                        regionalCurrency = localeCurrency || 'USD'; // Use locale currency or default
                    }
                } catch (err) {
                    Logger.warn('Could not get the regional price for product id: ' + product.ID);
                    Logger.warn(err.message);
                    regionalPrice = 0; // Fallback to 0
                    regionalCurrency = localeCurrency || 'USD'; // Fallback currency
                }
            }

            // Final fallback for products with no price model at all
            if (regionalPrice === null || regionalPrice === undefined) {
                Logger.debug('Product has no price model - using default values: ' + product.ID);
                regionalPrice = 0;
                regionalCurrency = localeCurrency || 'USD';
            }

            // Product Stock - use cached value to avoid repeated API calls
            var regionalStock = cachedProductData ? cachedProductData.stock : getProductStock(product);

            var productRegion = {
                buy_now_link_url: regionalUrl,
                name: regionalName,
                price: regionalPrice,
                currency: regionalCurrency,
                stock: regionalStock,
                region_code: currentLocale,
                variants_json: variantsJSON
            };

            regional.push(productRegion);
        }
    }

    // It made sense to add these lines at the top of the function, but dsScript is weird
    // When I did that the values were not default values but the values of the last locale iterated
    // Add these lines at the end helped
    // Cache only the string values, not the objects - SFCC session compliance
    var defaultLocale = RequestCache.get('pixlee:defaultLocale', function () {
        return getCurrentSite().getDefaultLocale().toString(); // Convert Locale object to string
    });
    var defaultCurrencyCode = RequestCache.get('pixlee:defaultCurrencyCode', function () {
        return getCurrentSite().getDefaultCurrency(); // Already returns string
    });
    var defaultCurrency = Currency.getCurrency(defaultCurrencyCode);

    request.setLocale(defaultLocale); // defaultLocale is now a string
    session.setCurrency(defaultCurrency);

    return regional;
}

/**
 * @function
 * @description Creates a comprehensive product payload object for Pixlee API integration.
 *
 * This constructor aggregates product data from multiple sources including:
 * - Basic product information (name, SKU, UPC, price, stock)
 * - Product images and variants
 * - Category assignments and hierarchy
 * - Regional pricing and currency information
 * - Platform metadata and versioning
 *
 * The payload structure adapts based on export options - regional-only exports
 * include minimal data while full exports include complete product details.
 * @param {dw.catalog.Product} product - SFCC Product object to export. Must be a valid
 *   product with accessible properties. Supports both master and variant products.
 * @param {Object} [options] - Export configuration parameters:
 * @param {boolean} [options.onlyRegionalDetails=false] - If true, exports only regional
 *   pricing data, excluding images, categories, and other extended product information
 * @param {string} [options.imageViewType='large'] - Image view type for product photos
 * @param {Object} [options.customFields] - Additional custom fields to include in export
 */
function ProductExportPayload(product, options) {
    var exportOptions = options || {};

    // Cache expensive product API calls to avoid duplication
    var cachedProductData = {
        price: null,
        stock: null,
        priceModel: null,
        defaultVariant: null
    };

    // Get price model and variant once for reuse
    cachedProductData.priceModel = product.getPriceModel();
    if (cachedProductData.priceModel) {
        cachedProductData.defaultVariant = product.getVariationModel().getDefaultVariant();
    }

    // Calculate price once
    cachedProductData.price = getProductPrice(product, cachedProductData);

    // Calculate stock once
    cachedProductData.stock = getProductStock(product);

    var variants = getProductVariants(product);
    var variantsJSON = safeJSONStringify(variants, 'product variants');
    var regionalInfo = getRegionalInfo(product, variantsJSON, cachedProductData);

    this.title = product.name || '';
    this.product = {
        sku: getPixleeHelper().getPixleeProductSKU(product),
        upc: product.UPC || null,
        native_product_id: product.ID,
        regional_info: regionalInfo
    };

    if (!exportOptions.onlyRegionalDetails) {
        var productExtraFields = {
            product_photos: getAllProductImages(product, exportOptions),
            categories: getProductCategories(product),
            version_hash: VERSION_HASH,
            ecommerce_platform: ECOMM_PLATFORM,
            ecommerce_platform_version: ECOMM_PLATFORM_VERSION,
            categories_last_updated_at: RequestCache.get('pixlee:jobStartTime', function () {
                return Math.floor(Date.now() / 1000);
            })
        };

        this.product.name = product.name || '';
        this.product.buy_now_link_url = getProductPageUrl(product);
        this.product.product_photo = getProductImageURL(product, exportOptions);
        this.product.price = cachedProductData.price;
        this.product.stock = cachedProductData.stock;
        this.product.extra_fields = safeJSONStringify(productExtraFields, 'product extra fields');
        this.product.currency = RequestCache.get('pixlee:defaultCurrencyCode', function () {
            return getCurrentSite().getDefaultCurrency();
        });
        this.product.variants_json = variantsJSON;
    }

    this.album_type = 'product';
    this.live_update = false;
    this.num_photos = 0;
    this.num_inbox_photos = 0;
}

/**
 * @function
 * @description Static method to pre-initialize category processing strategy and maps
 * This should be called once before processing multiple products to ensure
 * optimal performance by avoiding repeated category map builds
 * @returns {void}
 */
ProductExportPayload.preInitializeCategoryProcessing = function () {
    Logger.info('Pre-initializing category processing for optimal performance...');

    try {
        // Initialize the category strategy
        var strategy = getCategoryStrategy();
        Logger.info('Category strategy initialized: ' + strategy.constructor.name);

        Logger.info('Category processing pre-initialization completed (using module-level caching)');

        // Pre-compute and cache job-level constants that don't change per product
        RequestCache.get('pixlee:jobStartTime', function () {
            return Math.floor(Date.now() / 1000);
        });

        RequestCache.get('pixlee:defaultCurrencyCode', function () {
            return getCurrentSite().getDefaultCurrency(); // Already returns string
        });

        RequestCache.get('pixlee:productHost', function () {
            return getCurrentSite().getCustomPreferenceValue('ProductHost');
        });

        // Pre-cache site locales to avoid repeated API calls in regional processing
        // Store as comma-separated string (SFCC session compliant)
        RequestCache.get('pixlee:siteLocales', function () {
            var locales = getCurrentSite().getAllowedLocales();
            var localeStrings = [];
            for (var i = 0; i < locales.length; i += 1) {
                localeStrings.push(locales[i].toString());
            }
            return RequestCache.arrayToString(localeStrings); // Use helper function
        });

        Logger.info('Job-level constants cached successfully');

        // Log cache status for monitoring
        var cacheKeys = [
            'pixlee:jobStartTime', 'pixlee:defaultCurrencyCode', 'pixlee:productHost', 'pixlee:siteLocales'
        ];
        var cachedItems = 0;
        var privacyCache = session.getPrivacy();
        for (var i = 0; i < cacheKeys.length; i += 1) {
            if (privacyCache[cacheKeys[i]]) {
                cachedItems += 1;
            }
        }
        Logger.info('Category processing cache status: ' + cachedItems + '/' + cacheKeys.length + ' items cached');
    } catch (e) {
        Logger.error('Failed to pre-initialize category processing: ' + e.message);
        throw new Error('Category processing pre-initialization failed: ' + e.message);
    }
};

/**
 * @function
 * @description Static method to get category processing cache statistics
 * Useful for monitoring and debugging category processing performance
 * @returns {Object} - Cache statistics including strategy type and cache utilization
 */
ProductExportPayload.getCacheStatistics = function () {
    try {
        var strategy = getCategoryStrategy();
        var stats = {
            strategyType: strategy.constructor.name,
            moduleCache: {
                categoryMapExists: !!ModuleLevelCache.categoryMap,
                categoryCount: ModuleLevelCache.categoryCount
            }
        };

        // Add strategy-specific cache stats if available
        if (typeof strategy.getCacheStats === 'function') {
            var cacheStats = strategy.getCacheStats();
            if (strategy.constructor.name === 'HybridBFSStrategy') {
                stats.hybridBFS = cacheStats;
            } else if (strategy.constructor.name === 'SingleMapStrategy') {
                stats.singleMap = cacheStats;
            } else {
                stats.requestCache = cacheStats;
            }
        }

        return stats;
    } catch (e) {
        Logger.warn('Failed to get cache statistics: ' + e.message);
        return {
            error: 'Failed to get cache statistics',
            message: e.message
        };
    }
};

/**
 * @function
 * @description Clears all category caches and resets strategy instance
 * Useful for long-lived processes, admin-triggered catalog changes, or test isolation
 * @returns {void}
 */
ProductExportPayload.clearCategoryCaches = function () {
    try {
        // Clear module-level cache
        if (ModuleLevelCache && typeof ModuleLevelCache.clear === 'function') {
            ModuleLevelCache.clear();
        } else {
            // Fallback: manually clear known properties
            ModuleLevelCache.categoryMap = null;
            ModuleLevelCache.categoryCount = 0;
        }

        // Reset strategy instance to force re-initialization
        categoryStrategyInstance = null;

        // Clear request-level cache
        if (typeof RequestCache !== 'undefined' && typeof RequestCache.clearAll === 'function') {
            RequestCache.clearAll();
        }

        Logger.info('Category caches cleared successfully');
    } catch (e) {
        Logger.warn('Failed to clear category caches: ' + e.message);
    }
};

// Test utilities - only available in test environment
if (typeof global !== 'undefined' && global.describe) {
    ProductExportPayload.testUtils = {
        getModuleLevelCache: function () {
            return ModuleLevelCache;
        },
        getCategoryStrategyInstance: function () {
            return categoryStrategyInstance;
        },
        getInternalObjects: function () {
            if (!categoryStrategyInstance) {
                return null;
            }

            // For SingleMapStrategy, return the module-level cache
            if (categoryStrategyInstance.constructor.name === 'SingleMapStrategy') {
                return {
                    categoriesMap: ModuleLevelCache.categoryMap
                };
            }

            // For HybridBFSStrategy, use the test-only method if available
            if (categoryStrategyInstance.constructor.name === 'HybridBFSStrategy' &&
                typeof categoryStrategyInstance.getInternalObjectsForTesting === 'function') {
                return categoryStrategyInstance.getInternalObjectsForTesting();
            }

            return null;
        }
    };
}

module.exports = ProductExportPayload;

