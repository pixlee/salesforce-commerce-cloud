'use strict';

/* global request, session */

var DEFAULT_IMAGE_VIEW_TYPE = 'large';
var DEFAULT_NO_IMAGE_PATH = '/images/noimagesmall.png';
var CATEGORY_SAFETY_LIMIT = 1900;
var SMALL_CATALOG_THRESHOLD = 1700;
var LARGE_CATALOG_THRESHOLD = 4000;
var DFS_CHUNK_SIZE = 1600;
var CUSTOM_OBJECT_BATCH_SIZE = 100;
var MAX_RECURSION_DEPTH = 20;

var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');
var CatalogMgr = require('dw/catalog/CatalogMgr');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Currency = require('dw/util/Currency');
var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');
var currencyLookupHelper = require('*/cartridge/scripts/pixlee/helpers/currencyLookupHelper');

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
 * Clears the category strategy cache (useful for testing or module reloading)
 * @function clearCategoryStrategy
 * @ignore - Utility function for testing, intentionally not exported
 */
function clearCategoryStrategy() { // eslint-disable-line no-unused-vars
    categoryStrategyInstance = null;
}

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

        // Everything else is not allowed (objects, arrays, functions, etc.)
        Logger.warn('Unsupported session data type: ' + type + ', constructor: ' + (value.constructor ? value.constructor.name : 'unknown'));
        return false;
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
 * Validates that a product has the required methods for category processing
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
 * Gets the site catalog - no caching since Catalog objects can't be stored in session
 * @returns {dw.catalog.Catalog} - The site catalog
 */
function getSiteCatalog() {
    return CatalogMgr.getSiteCatalog();
}

/**
 * Gets the current site - no caching since Site objects can't be stored in session
 * @returns {dw.system.Site} - The current site instance
 */
function getCurrentSite() {
    return Site.getCurrent();
}

/**
 * Optimized JSON serialization that handles large objects gracefully
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
 * Retrieves the PDP URL for a given product. In case ProductHost site preference
 * is configured, the URL domain is replaced with that host name.
 *
 * @param {dw.catalog.Product} product - Product to retrieve the PDP URL for
 * @returns {string} - Product Page URL.
 */
function getProductPageUrl(product) {
    var pdpURL = URLUtils.http('Product-Show', 'pid', product.ID);
    var replaceHost = RequestCache.get('pixlee:productHost', function () {
        return getCurrentSite().getCustomPreferenceValue('ProductHost');
    });

    if (replaceHost) {
        pdpURL.host(replaceHost);
    }

    return pdpURL.toString();
}

/**
 * Retrieves the URL of the product main image.
 *
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
 * Returns the product price.
 *
 * @param {dw.catalog.Product} product - Product for which to retrieve price.
 * @returns {number} - The retrieved price.
 */
function getProductPrice(product) {
    var productPrice = null;
    var priceModel = product.getPriceModel();

    if (priceModel) {
        try {
            // For the most part, master products don't have price, we need to get from a variant
            // getDefaultVariant() will give us either the default variant or an arbitrary one
            // I'm okay with getting an arbitrary one
            var productVariant = product.getVariationModel().getDefaultVariant();

            if (!productVariant) {
                productPrice = priceModel.getPrice().decimalValue.valueOf();
            // But some products don't have variants, and have a PriceModel object on the Product
            } else {
                productPrice = productVariant.getPriceModel().getPrice().decimalValue.valueOf();
            }
        } catch (e) {
            Logger.warn('Could not get the price for product id: ' + product.ID);
            Logger.warn(e.message);
        }
    }

    return productPrice;
}

/**
 * Retrieves the product stock.
 *
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
 * Retrieves a list of URLs of all product images of a product.
 *
 * @param {dw.catalog.Product} product - Product for which to retrieve stock.
 * @param {Object} exportOptions - Export configuration options
 * @returns {Array} - Array of all product image URLs.
 */
function getAllProductImages(product, exportOptions) {
    var allImages = [];
    var imageUrlsSet = {}; // For O(1) duplicate checking
    var imageViewType = exportOptions.imageViewType || DEFAULT_IMAGE_VIEW_TYPE;

    var productImages = product.getImages(imageViewType);
    for (var i = 0; i < productImages.length; i += 1) {
        var image = productImages[i];
        var imageUrl = image.absURL.toString();
        imageUrlsSet[imageUrl] = true;
        allImages.push(imageUrl);
    }

    if (product.master) {
        var variantIterator = product.getVariants().iterator();

        while (variantIterator.hasNext()) {
            var variant = variantIterator.next();
            var variantPhotos = variant.getImages(imageViewType);
            for (var j = 0; j < variantPhotos.length; j += 1) {
                var photoURL = variantPhotos[j].absURL.toString();
                // Use object for O(1) duplicate checking
                if (!imageUrlsSet[photoURL]) {
                    imageUrlsSet[photoURL] = true;
                    allImages.push(photoURL);
                }
            }
        }
    }

    return allImages;
}

/**
 * Retrieves details of product variants.
 *
 * @param {dw.catalog.Product} product - Product for which to retrieve variants.
 * @returns {Object} - An object (map) having details of all product variants.
 */
function getProductVariants(product) {
    var variantsDict = {};

    if (product.master) {
        var variantIterator = product.getVariants().iterator();

        while (variantIterator.hasNext()) {
            var variant = variantIterator.next();

            var variantID = variant.getID();

            var inventoryRecord = variant.getAvailabilityModel().getInventoryRecord();
            // NOTE: Changed to using ATS instead of stockLevel
            var variantStock = inventoryRecord ? inventoryRecord.ATS.value : null;

            variantsDict[variantID] = {
                variant_stock: variantStock,
                variant_sku: variantID
            };
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
 * Estimates category count efficiently without building full tree
 * @param {dw.catalog.Catalog} catalog - The catalog to estimate categories for
 * @returns {number} - Estimated number of categories in the catalog
 */
function estimateCategoryCount(catalog) {
    var count = 0;
    var queue = [];
    var root = catalog.getRoot();
    var topLevelCategories = root.getSubCategories();

    for (var i = 0; i < topLevelCategories.length; i += 1) {
        queue.push(topLevelCategories[i]);
    }

    while (queue.length > 0 && count <= LARGE_CATALOG_THRESHOLD) { // Stop once we know it's a large catalog
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
 * Shared utility function for DFS category collection
 * @param {dw.catalog.Category} category - Category to process
 * @param {Array} currentPath - Current path of parent category IDs
 * @param {Array} allCategoryNodes - Array to collect all category nodes
 * @param {number} depth - Current recursion depth
 */
function collectCategoriesDFS(category, currentPath, allCategoryNodes, depth) {
    var currentDepth = depth || 0;
    if (currentDepth > MAX_RECURSION_DEPTH) {
        Logger.warn('Category tree depth limit reached for category: ' + category.getID());
        return;
    }

    allCategoryNodes.push({
        category: category,
        path: currentPath.slice()
    });

    var categoryID = category.getID();
    var newPath = currentPath.slice();
    newPath.push(categoryID);

    var children = category.getSubCategories();
    for (var i = 0; i < children.length; i += 1) {
        collectCategoriesDFS(children[i], newPath, allCategoryNodes, currentDepth + 1);
    }
}

/**
 * Generic function to extract product categories and their parent hierarchy using
 * a pluggable lookup strategy. Handles both direct category assignments and parent
 * category inheritance with safety limits to prevent infinite processing.
 *
 * Algorithm:
 * 1. Get direct category assignments from product
 * 2. For each assigned category, use lookupFunction to get category data
 * 3. Recursively add parent categories from the hierarchy
 * 4. Enforce CATEGORY_SAFETY_LIMIT to prevent runaway processing
 * 5. Return deduplicated category list
 *
 * @param {dw.catalog.Product} product - SFCC Product object with category assignments
 * @param {Function} lookupFunction - Strategy-specific lookup function with signature:
 *   (categoryId: string) => {category_id: string, category_name: string, fullName: string, parentIDs: Array<string>} | null
 * @returns {Array<Object>} Array of category objects with structure:
 *   [{category_id: string, category_name: string}, ...]
 * @throws {Error} If product category processing fails
 * @performance O(n*d) where n=assigned categories, d=average depth of category tree
 * @safety Enforces CATEGORY_SAFETY_LIMIT (1900) to prevent excessive processing
 */
function getProductCategoriesGeneric(product, lookupFunction) {
    var productCategories = {};
    var categoryAssignments = product.getCategoryAssignments();
    var processedCount = 0;

    for (var i = 0; i < categoryAssignments.length && processedCount < CATEGORY_SAFETY_LIMIT; i += 1) {
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
            for (var j = 0; j < parentCategoriesIds.length && processedCount < CATEGORY_SAFETY_LIMIT; j += 1) {
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
 * Optimized lookup for category info using O(1) map lookup
 * @param {number} categoryId - ID of the category to look up
 * @param {Object} categoryMap - Map of categoryId -> category data for direct lookup
 * @returns {*|null} - Category info if found, otherwise null
 */
function getCategoryFromMap(categoryId, categoryMap) {
    return categoryMap[categoryId] || null;
}

/**
 * Improved category path building with better performance
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
     * Builds a single categories map for small catalogs
     * @returns {Object} - Map of categories with full names and parent IDs
     */
    function buildSingleCategoriesMap() {
        var catalog = getSiteCatalog();
        var root = catalog.getRoot();
        var result = {};
        var namesMap = {};

        Logger.info('Building single categories map...');

        // Standard BFS approach (safe for small catalogs)
        var queue = [];
        var topLevelCategories = root.getSubCategories();

        for (var i = 0; i < topLevelCategories.length; i += 1) {
            queue.push({
                node: topLevelCategories[i],
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

        Logger.info('Single map built with ' + Object.keys(result).length + ' categories');
        return result;
    }

    this.getCategories = function (product) {
        if (!validateProductForCategories(product, 'SingleMapStrategy')) {
            return [];
        }

        // Use module-level cache to avoid rebuilding category map
        if (!ModuleLevelCache.categoryMap) {
            ModuleLevelCache.categoryMap = buildSingleCategoriesMap();
        }
        categoriesMap = ModuleLevelCache.categoryMap;
        return getProductCategoriesGeneric(product, function (categoryId) {
            return categoriesMap[categoryId];
        });
    };
}

/**
 * Strategy 2: DFS Chunked Strategy - Optimized for medium-sized catalogs (1700-4000 categories)
 *
 * Uses Depth-First Search (DFS) to collect categories in hierarchical chunks for better
 * memory locality. Categories are processed in batches and stored in a flat map for O(1) lookups.
 * This balances memory efficiency with lookup performance.
 *
 * Memory Usage: Moderate - stores all categories in flat map
 * Lookup Performance: O(1) - direct hash map access
 * Build Performance: O(n) - single DFS traversal with chunked processing
 *
 * Ideal for: E-commerce sites with moderate category trees where memory allows
 * full in-memory storage but chunked processing provides better cache locality.
 *
 * @extends CategoryStrategy
 * @since 24.1.0
 * @performance Build: O(n), Lookup: O(1), Memory: O(n)
 */
function DFSChunkedStrategy() {
    CategoryStrategy.call(this);
    var categoryMap = {}; // Single flat map: categoryId -> category data for O(1) lookup

    /**
     * Finds missing parent names in the allCategoryNodes
     * @param {Array} missingIds - Array of category IDs that are missing names
     * @param {Array} allCategoryNodes - Array of all category nodes to search in
     * @param {Object} namesMap - Map to fill with missing names
     */
    function findMissingParentNames(missingIds, allCategoryNodes, namesMap) {
        var remainingIds = missingIds.slice();

        for (var i = 0; i < allCategoryNodes.length && remainingIds.length > 0; i += 1) {
            var nodeId = allCategoryNodes[i].category.getID();
            var index = remainingIds.indexOf(nodeId);

            if (index >= 0) {
                // eslint-disable-next-line no-param-reassign
                namesMap[nodeId] = allCategoryNodes[i].category.getDisplayName();
                remainingIds.splice(index, 1);
            }
        }
    }

    /**
     * Processes a chunk of categories with optimized parent lookup using a 4-phase approach:
     * Phase 1: Build local names map from current chunk categories
     * Phase 2: Identify missing parent category names not in local map
     * Phase 3: Resolve missing parent names by searching all category nodes
     * Phase 4: Build final category objects directly into target map
     *
     * This approach minimizes expensive searches by batching missing name lookups.
     * OPTIMIZED: Populates target map directly instead of creating intermediate objects.
     *
     * @param {Array} categoryChunk - Array of category objects with structure:
     *   [{category: dw.catalog.Category, path: Array<string>}, ...]
     * @param {Array} allCategoryNodes - Complete array of all category nodes for parent lookup.
     *   Used only when parent names are missing from the current chunk.
     * @param {Object} targetMap - Target map to populate directly (avoids intermediate object creation)
     * @throws {Error} If category chunk processing fails
     * @performance O(n*m) where n=chunk size, m=missing parents. Optimized to minimize m.
     */
    function processChunk(categoryChunk, allCategoryNodes, targetMap) {
        var localNamesMap = {};
        var missingParentIds = {};
        var item;
        var categoryID;
        var pathToNode;
        var i;

        // Phase 1: Build local names map
        for (i = 0; i < categoryChunk.length; i += 1) {
            item = categoryChunk[i];
            categoryID = item.category.getID();
            localNamesMap[categoryID] = item.category.getDisplayName();
        }

        // Phase 2: Identify missing parents (much fewer with DFS)
        for (i = 0; i < categoryChunk.length; i += 1) {
            pathToNode = categoryChunk[i].path;
            for (var j = 0; j < pathToNode.length; j += 1) {
                var parentID = pathToNode[j];
                if (!localNamesMap[parentID]) {
                    missingParentIds[parentID] = true;
                }
            }
        }

        // Phase 3: Efficient lookup of missing parents only
        var missingParentsList = Object.keys(missingParentIds);
        if (missingParentsList.length > 0) {
            findMissingParentNames(missingParentsList, allCategoryNodes, localNamesMap);
        }

        // Phase 4: Build final category objects directly into target map
        for (i = 0; i < categoryChunk.length; i += 1) {
            item = categoryChunk[i];
            categoryID = item.category.getID();
            pathToNode = item.path;

            // eslint-disable-next-line no-param-reassign
            targetMap[categoryID] = {
                fullName: buildCategoryPath(pathToNode, localNamesMap, localNamesMap[categoryID]),
                parentIDs: pathToNode.join(',')
            };
        }
    }

    /**
     * Builds a DFS chunked map of categories into the provided target map
     * @param {Object} targetMap - Target map to populate with category data
     */
    function buildDFSChunkedMap(targetMap) {
        var catalog = getSiteCatalog();
        var root = catalog.getRoot();
        var allCategoryNodes = [];

        Logger.info('Building DFS chunked categories map...');

        // DFS collection for better hierarchical locality
        var topLevelCategories = root.getSubCategories();
        for (var i = 0; i < topLevelCategories.length; i += 1) {
            collectCategoriesDFS(topLevelCategories[i], [], allCategoryNodes, 0);
        }

        Logger.info('Collected ' + allCategoryNodes.length + ' categories via DFS');

        // Process in chunks and build single flat map
        for (var chunkStart = 0; chunkStart < allCategoryNodes.length; chunkStart += DFS_CHUNK_SIZE) {
            var chunkEnd = Math.min(chunkStart + DFS_CHUNK_SIZE, allCategoryNodes.length);
            var currentChunk = allCategoryNodes.slice(chunkStart, chunkEnd);

            processChunk(currentChunk, allCategoryNodes, targetMap);

            Logger.info('Processed DFS chunk ' + Math.ceil(chunkEnd / DFS_CHUNK_SIZE)
                + ': ' + chunkEnd + '/' + allCategoryNodes.length + ' categories');
        }
    }

    this.getCategories = function (product) {
        if (!validateProductForCategories(product, 'DFSChunkedStrategy')) {
            return [];
        }

        // Use module-level cache to avoid rebuilding category map
        if (!ModuleLevelCache.categoryMap) {
            ModuleLevelCache.categoryMap = {};
            buildDFSChunkedMap(ModuleLevelCache.categoryMap);
        }
        categoryMap = ModuleLevelCache.categoryMap;
        return getProductCategoriesGeneric(product, function (categoryId) {
            return getCategoryFromMap(categoryId, categoryMap);
        });
    };
}

/**
 * Strategy 3: Custom Objects (for large catalogs 4000+ categories)
 * @extends CategoryStrategy
 */
function CustomObjectStrategy() {
    CategoryStrategy.call(this);
    var isBuilt = false;
    var globalNamesMap = null;

    /**
     * Retrieves product categories using Custom Objects
     * @param {dw.product} product - Product for which to retrieve categories
     * @returns {Array} - Array of categories for the product
     */
    function getProductCategoriesFromCustomObjectsOptimized(product) {
        /**
         * Create lookup function that converts Custom Object format to standard format
         * @param {number} categoryId - ID of the category to look up
         * @returns {null|Object} - Custom Object
         */
        function customObjectLookup(categoryId) {
            var categoryObj = CustomObjectMgr.getCustomObject('PixleeCategoryHierarchy', categoryId);
            if (categoryObj) {
                var parentIDsArray = JSON.parse(categoryObj.custom.parentIDs);
                return {
                    fullName: categoryObj.custom.fullName,
                    parentIDs: parentIDsArray.join(',')
                };
            }
            return null;
        }

        return getProductCategoriesGeneric(product, customObjectLookup);
    }

    /**
     * Builds a global names map from all category nodes
     * @param {Array} allCategoryNodes - Array of all category nodes
     * @returns {Object} - Map of category IDs to display names
     */
    function buildGlobalNamesMap(allCategoryNodes) {
        var namesMap = {};
        for (var i = 0; i < allCategoryNodes.length; i += 1) {
            var nodeId = allCategoryNodes[i].category.getID();
            namesMap[nodeId] = allCategoryNodes[i].category.getDisplayName();
        }
        return namesMap;
    }

    /**
     * Builds the full path for a custom object category
     * @param {Array} pathToNode - Array of parent category IDs leading to the current node
     * @param {Object} category - The current category object
     * @returns {string} - Full path string for the category
     */
    function buildFullPathForCustomObject(pathToNode, category) {
        var pathParts = [];

        for (var j = 0; j < pathToNode.length; j += 1) {
            var parentID = pathToNode[j];
            if (globalNamesMap[parentID]) {
                pathParts.push(globalNamesMap[parentID]);
            }
        }
        pathParts.push(category.getDisplayName());

        return pathParts.join(' > ');
    }

    /**
     * Builds the category map using Custom Objects
     */
    function buildCategoryMapToCustomObjects() {
        var catalog = getSiteCatalog();

        Logger.info('Building category map using Custom Objects...');

        // Clear existing data with comprehensive error handling and rollback
        try {
            var deletedCount = 0;
            Transaction.wrap(function () {
                Logger.debug('Starting Custom Object cleanup transaction...');
                var existing = CustomObjectMgr.getAllCustomObjects('PixleeCategoryHierarchy');

                try {
                    while (existing.hasNext()) {
                        var objToRemove = existing.next();
                        if (objToRemove) {
                            CustomObjectMgr.remove(objToRemove);
                            deletedCount += 1;

                            // Log progress for large cleanup operations
                            if (deletedCount % 100 === 0) {
                                Logger.debug('Deleted ' + deletedCount + ' Custom Objects...');
                            }
                        }
                    }
                    Logger.info('Custom Object cleanup completed: ' + deletedCount + ' objects deleted');
                } catch (iteratorError) {
                    Logger.error('Iterator/remove failed during Custom Object cleanup at count ' + deletedCount + ': ' + iteratorError.message);
                    Logger.error('Transaction will be rolled back - no partial cleanup');
                    throw iteratorError; // CRITICAL: Re-throw to rollback transaction
                } finally {
                    // Close iterator if it exists to prevent resource leaks
                    if (existing && typeof existing.close === 'function') {
                        try {
                            existing.close();
                        } catch (closeError) {
                            Logger.warn('Failed to close Custom Object iterator: ' + closeError.message);
                        }
                    }
                }
            });
            Logger.info('Custom Object cleanup transaction committed successfully');
        } catch (e) {
            Logger.error('Custom Object cleanup transaction failed and was rolled back: ' + e.message);
            Logger.error('Database state remains unchanged - no partial cleanup occurred');
            throw new Error('Custom Object cleanup failed with rollback: ' + e.message);
        }

        // Collect all categories via DFS
        var allCategoryNodes = [];
        var root = catalog.getRoot();
        var topLevelCategories = root.getSubCategories();

        var i;
        for (i = 0; i < topLevelCategories.length; i += 1) {
            collectCategoriesDFS(topLevelCategories[i], [], allCategoryNodes, 0);
        }

        // Build global names map once for efficiency
        globalNamesMap = buildGlobalNamesMap(allCategoryNodes);

        // Store in batches
        for (i = 0; i < allCategoryNodes.length; i += CUSTOM_OBJECT_BATCH_SIZE) {
            var batchEnd = Math.min(i + CUSTOM_OBJECT_BATCH_SIZE, allCategoryNodes.length);
            var batch = allCategoryNodes.slice(i, batchEnd);

            var batchNumber = Math.ceil((i + 1) / CUSTOM_OBJECT_BATCH_SIZE);

            try {
                var createdInBatch = Transaction.wrap((function (currentBatch, batchNum) {
                    return function () {
                        Logger.debug('Starting Custom Object creation transaction for batch ' + batchNum + '...');
                        var localCreatedCount = 0;

                        for (var j = 0; j < currentBatch.length; j += 1) {
                            var item = currentBatch[j];
                            var categoryID = null;

                            try {
                                categoryID = item.category.getID();

                                // Validate category data before creating Custom Object
                                if (!categoryID) {
                                    throw new Error('Category ID is null or undefined for item ' + j);
                                }

                                // Check if Custom Object already exists (defensive programming)
                                var existingObj = CustomObjectMgr.getCustomObject('PixleeCategoryHierarchy', categoryID);
                                if (existingObj) {
                                    Logger.warn('Custom Object already exists for category ' + categoryID + ', skipping creation');
                                    // Skip creation but don't use continue statement per ESLint rules
                                } else {
                                    var customObj = CustomObjectMgr.createCustomObject('PixleeCategoryHierarchy', categoryID);
                                    if (!customObj) {
                                        throw new Error('Failed to create Custom Object for category: ' + categoryID);
                                    }

                                    customObj.custom.fullName = buildFullPathForCustomObject(item.path || [], item.category);
                                    customObj.custom.parentIDs = safeJSONStringify(item.path || [], 'category parent IDs');

                                    localCreatedCount += 1;
                                }
                            } catch (itemError) {
                                Logger.error('Category item ' + j + ' (ID: ' + (categoryID || 'unknown') + ') failed in batch ' + batchNum + ': ' + itemError.message);
                                Logger.error('Transaction will be rolled back - no partial batch creation');
                                throw itemError; // CRITICAL: Re-throw to rollback entire batch
                            }
                        }

                        Logger.debug('Batch ' + batchNum + ' transaction prepared: ' + localCreatedCount + ' objects ready for commit');
                        return localCreatedCount;
                    };
                }(batch, batchNumber)));

                Logger.debug('Successfully committed batch ' + batchNumber + ' with ' + createdInBatch + ' categories created');
            } catch (e) {
                Logger.error('Custom Object batch ' + batchNumber + ' transaction failed and was rolled back: ' + e.message);
                Logger.error('Batch range: ' + i + '-' + (batchEnd - 1) + ' of ' + allCategoryNodes.length + ' total categories');
                Logger.error('Database state remains consistent - no partial batch was created');

                // Enhanced error context for debugging
                var errorContext = {
                    batchNumber: batchNumber,
                    batchSize: batch.length,
                    rangeStart: i,
                    rangeEnd: batchEnd - 1,
                    totalCategories: allCategoryNodes.length
                };

                Logger.error('Batch failure context: ' + JSON.stringify(errorContext));

                // Re-throw with additional context - caller can decide whether to continue or abort
                throw new Error('Custom Object batch creation failed at batch ' + batchNumber + ' with rollback: ' + e.message);
            }

            Logger.info('Stored batch ' + Math.ceil((i + 1) / CUSTOM_OBJECT_BATCH_SIZE)
                + ': ' + batchEnd + '/' + allCategoryNodes.length + ' categories');
        }

        Logger.info('Custom Objects strategy built with ' + allCategoryNodes.length + ' categories');
    }

    this.getCategories = function (product) {
        if (!validateProductForCategories(product, 'CustomObjectStrategy')) {
            return [];
        }

        if (!isBuilt) {
            buildCategoryMapToCustomObjects();
            isBuilt = true;
        }
        return getProductCategoriesFromCustomObjectsOptimized(product);
    };
}

/**
 * Initializes and returns the optimal category processing strategy based on catalog size
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

        if (categoryCount < SMALL_CATALOG_THRESHOLD) {
            Logger.info('Detected ' + categoryCount + ' categories. Using SingleMapStrategy for small catalog');
            return new SingleMapStrategy();
        } if (categoryCount < LARGE_CATALOG_THRESHOLD) {
            Logger.info('Detected ' + categoryCount + ' categories. Using DFSChunkedStrategy for medium catalog');
            return new DFSChunkedStrategy();
        }
        Logger.info('Detected ' + categoryCount + ' categories. Using CustomObjectStrategy for large catalog');
        try {
            return new CustomObjectStrategy();
        } catch (customObjectError) {
            Logger.warn('CustomObjectStrategy failed (likely missing Custom Object type. Import cartridge metadata): ' + customObjectError.message);
            Logger.info('Falling back to DFSChunkedStrategy for large catalog');
            return new DFSChunkedStrategy();
        }
    } catch (e) {
        Logger.error('Failed to initialize category strategy: ' + e.message);
        Logger.info('Falling back to SingleMapStrategy');
        return new SingleMapStrategy();
    }
}

/**
 * Gets the category processing strategy with simple module-level variable caching
 * @returns {CategoryStrategy} - The appropriate category strategy for current catalog size
 */
function getCategoryStrategy() {
    if (!categoryStrategyInstance) {
        categoryStrategyInstance = initializeCategoryStrategy();
    }
    return categoryStrategyInstance;
}

/**
 * Main function to get product categories using adaptive strategy
 * @param {dw.catalog.Product} product - Product for which to retrieve categories
 * @return {Array} - Array of categories for the product
 */
function getProductCategories(product) {
    try {
        // Input validation
        if (!validateProductForCategories(product, 'getProductCategories')) {
            return [];
        }

        // Get cached strategy (automatically initializes if needed)
        var strategy = getCategoryStrategy();

        try {
            return strategy.getCategories(product);
        } catch (strategyError) {
            // Check if this is a CustomObjectStrategy failure
            if (strategy.constructor.name === 'CustomObjectStrategy'
                && strategyError.message
                && (strategyError.message.indexOf('Type does not exist: PixleeCategoryHierarchy') > -1)) {
                Logger.warn('CustomObjectStrategy failed due to missing Custom Object type. Import cartridge metadata. Falling back to DFSChunkedStrategy.');

                // Clear the failed strategy and use DFS fallback
                categoryStrategyInstance = null;
                var fallbackStrategy = new DFSChunkedStrategy();
                categoryStrategyInstance = fallbackStrategy;

                Logger.info('Fallback to DFSChunkedStrategy successful');
                return fallbackStrategy.getCategories(product);
            }

            // Re-throw if not a known CustomObjectStrategy issue
            throw strategyError;
        }
    } catch (e) {
        Logger.error('Error in getProductCategories for product ' + (product ? product.ID : 'unknown') + ': ' + e.message);
        return []; // Return empty array on error
    }
}

/**
 * Retrieves regional (locale-specific) details of a product
 *
 * @param {dw.catalog.Product} product - Product to get regional details for.
 * @param {string} variantsJSON - Variants JSON, same for all regions so passed
 *   to this function as a parameter.
 * @returns {Array} - Array of objects, separate object for each region (locale)
 */
function getRegionalInfo(product, variantsJSON) {
    // Get site locales directly - no caching since arrays can't be stored in session
    var locales = getCurrentSite().getAllowedLocales();
    var siteLocales = [];
    for (var i = 0; i < locales.length; i += 1) {
        siteLocales.push(locales[i].toString());
    }

    var regional = [];

    Logger.debug('Processing Product: ' + product.getName());

    for (var j = 0; j < siteLocales.length; j += 1) {
        var currentLocale = siteLocales[j];

        if ('default'.equalsIgnoreCase(currentLocale)) {
            // Skip default locale processing
        } else {
            var cacheKey = 'pixlee:localeCurrency:' + encodeURIComponent(currentLocale);
            var localeCurrency = RequestCache.get(cacheKey, (function (locale) {
                return function () {
                    return currencyLookupHelper.getCurrencyForLocale(locale);
                };
            }(currentLocale)));

            request.setLocale(currentLocale);
            session.setCurrency(Currency.getCurrency(localeCurrency));

            Logger.debug('Processing Locale: ' + currentLocale);

            // Product URL
            var regionalUrl = getProductPageUrl(product);

            // Name
            var regionalName = product.getName();

            // Product Price
            var regionalPrice = null;
            var regionalCurrency = null;
            if (product.getPriceModel()) {
                try {
                // For the most part, master products don't have price, we need to get from a variant
                // getDefaultVariant() will give us either the default variant or an arbitrary one
                // I'm okay with getting an arbitrary one
                    var productVariant = product.getVariationModel().getDefaultVariant();

                    if (!productVariant) {
                        regionalPrice = product.getPriceModel().getPrice().decimalValue.valueOf();
                        regionalCurrency = product.getPriceModel().getPrice().getCurrencyCode();
                        // But some products don't have variants, and have a PriceModel object on the Product
                    } else {
                        regionalPrice = productVariant.getPriceModel().getPrice().decimalValue.valueOf();
                        regionalCurrency = productVariant.getPriceModel().getPrice().getCurrencyCode();
                    }
                } catch (err) {
                    Logger.warn('Could not get the regional price for product id: ' + product.ID);
                    Logger.warn(err.message);
                }
            }

            // Product Stock
            // NOTE: The stock should generally be the same for all regions so
            //   may be passed as a parameter to improve performance
            var regionalStock = getProductStock(product);

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
        return Site.current.getDefaultLocale().toString(); // Convert Locale object to string
    });
    var defaultCurrencyCode = RequestCache.get('pixlee:defaultCurrencyCode', function () {
        return Site.current.getDefaultCurrency(); // Already returns string
    });
    var defaultCurrency = Currency.getCurrency(defaultCurrencyCode);

    request.setLocale(defaultLocale); // defaultLocale is now a string
    session.setCurrency(defaultCurrency);

    return regional;
}

/**
 * Creates a comprehensive product payload object for Pixlee API integration.
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
 *
 * @constructor
 * @param {dw.catalog.Product} product - SFCC Product object to export. Must be a valid
 *   product with accessible properties. Supports both master and variant products.
 * @param {Object} [options] - Export configuration parameters:
 * @param {boolean} [options.onlyRegionalDetails=false] - If true, exports only regional
 *   pricing data, excluding images, categories, and other extended product information
 * @param {string} [options.imageViewType='large'] - Image view type for product photos
 * @param {Object} [options.customFields] - Additional custom fields to include in export
 *
 * @throws {Error} If product parameter is invalid or required data cannot be accessed
 * @since 24.1.0
 *
 * @example
 * // Full product export
 * var payload = new ProductExportPayload(product, {imageViewType: 'medium'});
 *
 * @example
 * // Regional-only export for pricing updates
 * var regionalPayload = new ProductExportPayload(product, {onlyRegionalDetails: true});
 */
function ProductExportPayload(product, options) {
    var exportOptions = options || {};
    var variants = getProductVariants(product);
    var variantsJSON = safeJSONStringify(variants, 'product variants');
    var regionalInfo = getRegionalInfo(product, variantsJSON);

    this.title = product.name || '';
    this.product = {
        sku: pixleeHelper.getPixleeProductSKU(product),
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
        this.product.price = getProductPrice(product);
        this.product.stock = getProductStock(product);
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
 * Static method to pre-initialize category processing strategy and maps
 * This should be called once before processing multiple products to ensure
 * optimal performance by avoiding repeated category map builds
 *
 * @static
 * @throws {Error} If category processing initialization fails
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

        Logger.info('Job-level constants cached successfully');

        // Log cache status for monitoring
        var cacheKeys = [
            'pixlee:jobStartTime', 'pixlee:defaultCurrencyCode', 'pixlee:productHost'
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

module.exports = ProductExportPayload;
