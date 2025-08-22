'use strict';

var DEFAULT_IMAGE_VIEW_TYPE = 'large';
var DEFAULT_NO_IMAGE_PATH = '/images/noimagesmall.png';
var CATEGORY_SAFETY_LIMIT = 1900;
var SMALL_CATALOG_THRESHOLD = 1700;
var LARGE_CATALOG_THRESHOLD = 4000;
var MAX_CATEGORY_ESTIMATION = 5000;
var DFS_CHUNK_SIZE = 1600;
var CUSTOM_OBJECT_BATCH_SIZE = 100;
var MAX_RECURSION_DEPTH = 20;

var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');

var VERSION_HASH = Resource.msg('pixlee.version.hash', 'pixlee', 'unknown version') + Resource.msg('ecomm.platform.version', 'pixlee', 'unknown architecture');
var ECOMM_PLATFORM = Resource.msg('ecomm.platform', 'pixlee', 'demandware');
var ECOMM_PLATFORM_VERSION = Resource.msg('global.version.number', 'version', Resource.msg('revisioninfo.revisionnumber', 'revisioninfo', 'unknown version')) +
    ' ' + Resource.msg('global.site.name', 'version', Resource.msg('global.site.name', 'locale', 'unknown architecture'));

// Adaptive category processing strategy
var categoryProcessingStrategy = null;

/**
 * Retrieves the PDP URL for a given product. In case ProductHost site preference
 * is configured, the URL domain is replaced with that host name.
 *
 * @param {dw.catalog.Product} product - Product to retrieve the PDP URL for
 * @returns {string} - Product Page URL.
 */
function getProductPageUrl(product) {
    var URLUtils = require('dw/web/URLUtils');

    var pdpURL = URLUtils.http('Product-Show', 'pid', product.ID);
    var replaceHost = Site.getCurrent().getCustomPreferenceValue('ProductHost');

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
        productImageURL = require('dw/web/URLUtils').absStatic(DEFAULT_NO_IMAGE_PATH);
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
    var productStock;

    if (product.getAvailabilityModel()) {
        // 2016-03-23: product.getAvailabilityModel().availability uses some fancy algorithm,
        // described by the documentation as the following:
        // If inventory lists are in use:
        //     If no inventory record exists and the inventory list default-in-stock flag is true this method returns 1.
        //    If no inventory record exists the inventory list default-in-stock flag is false this method returns 0.
        //    If the product is not available this method returns 0.
        //    If the product is perpetually available this method returns 1.
        //    Otherwise this method returns the ATS / allocation.
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
    for (var i = 0; i < productImages.length; i++) {
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
            for (var j = 0; j < variantPhotos.length; j++) {
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
    this.getCategories = function(product) {
        throw new Error('getCategories must be implemented by strategy');
    };
}

/**
 * Estimates category count efficiently without building full tree
 * @param {dw.catalog} catalog - The catalog to estimate categories for
 * @returns {number} - Estimated number of categories in the catalog
 */
function estimateCategoryCount(catalog) {
    var count = 0;
    var queue = [];
    var root = catalog.getRoot();
    var topLevelCategories = root.getSubCategories();

    for (var i = 0; i < topLevelCategories.length; i++) {
        queue.push(topLevelCategories[i]);
    }

    while (queue.length > 0 && count < MAX_CATEGORY_ESTIMATION) { // Cap estimation for performance
        var category = queue.shift();
        count++;

        var children = category.getSubCategories();
        for (var j = 0; j < children.length; j++) {
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
    for (var i = 0; i < children.length; i++) {
        collectCategoriesDFS(children[i], newPath, allCategoryNodes, currentDepth + 1);
    }
}

/**
 * Generic function to get product categories using a lookup function
 * @param {dw.catalog.Product} product - Product for which to retrieve categories
 * @param {Function} lookupFunction - Function to lookup category info by ID
 * @returns {Array} - Array of categories for the product
 */
function getProductCategoriesGeneric(product, lookupFunction) {
    var productCategories = {};
    var categoryAssignments = product.getCategoryAssignments();
    var processedCount = 0;

    for (var i = 0; i < categoryAssignments.length && processedCount < CATEGORY_SAFETY_LIMIT; i++) {
        var category = categoryAssignments[i].getCategory();
        var categoryId = category.getID();

        var categoryInfo = lookupFunction(categoryId);
        if (categoryInfo) {
            if (!productCategories[categoryId]) {
                productCategories[categoryId] = {
                    category_id: categoryId,
                    category_name: categoryInfo.fullName
                };
                processedCount++;
            }

            // Add parent categories
            var parentCategoriesIds = categoryInfo.parentIDs;
            for (var j = 0; j < parentCategoriesIds.length && processedCount < CATEGORY_SAFETY_LIMIT; j++) {
                var parentCategoryId = parentCategoriesIds[j];
                if (!productCategories[parentCategoryId]) {
                    var parentInfo = lookupFunction(parentCategoryId);
                    if (parentInfo) {
                        productCategories[parentCategoryId] = {
                            category_id: parentCategoryId,
                            category_name: parentInfo.fullName
                        };
                        processedCount++;
                    }
                }
            }
        }
    }

    return Object.keys(productCategories).map(function(key) {
        return productCategories[key];
    });
}

/**
 * Looks up category info from the chunked storage
 * @param {number} categoryId - ID of the category to look up
 * @param {Array} categoryChunks - Array of category chunks to search in
 * @returns {*|null} - Category info if found, otherwise null
 */
function getCategoryFromChunks(categoryId, categoryChunks) {
    for (var i = 0; i < categoryChunks.length; i++) {
        var chunk = categoryChunks[i];
        if (chunk[categoryId]) {
            return chunk[categoryId];
        }
    }
    return null;
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
    for (var i = 0; i < pathStack.length; i++) {
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
        var catalog = require('dw/catalog/CatalogMgr').getSiteCatalog();
        var root = catalog.getRoot();
        var result = {};
        var namesMap = {};

        Logger.info('Building single categories map...');

        // Standard BFS approach (safe for small catalogs)
        var queue = [];
        var topLevelCategories = root.getSubCategories();

        for (var i = 0; i < topLevelCategories.length; i++) {
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
                parentIDs: pathToNode.slice()
            };

            pathToNode.push(categoryID);
            for (var j = 0; j < childrenNodes.length; j++) {
                queue.push({ node: childrenNodes[j], path: pathToNode.slice() });
            }
        }

        Logger.info('Single map built with ' + Object.keys(result).length + ' categories');
        return result;
    }

    this.getCategories = function(product) {
        if (!product || !product.getCategoryAssignments) {
            Logger.error('Invalid product passed to SingleMapStrategy');
            return [];
        }

        if (!categoriesMap) {
            categoriesMap = buildSingleCategoriesMap();
        }
        return getProductCategoriesGeneric(product, function(categoryId) {
            return categoriesMap[categoryId];
        });
    };
}

/**
 * Strategy 2: DFS Chunked (for medium catalogs 1700-4000 categories)
 * @extends CategoryStrategy
 */
function DFSChunkedStrategy() {
    CategoryStrategy.call(this);
    var categoryChunks = [];

    /**
     * Finds missing parent names in the allCategoryNodes
     * @param {Array} missingIds - Array of category IDs that are missing names
     * @param {Array} allCategoryNodes - Array of all category nodes to search in
     * @param {Object} namesMap - Map to fill with missing names
     */
    function findMissingParentNames(missingIds, allCategoryNodes, namesMap) {
        var remainingIds = missingIds.slice();

        for (var i = 0; i < allCategoryNodes.length && remainingIds.length > 0; i++) {
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
     * Processes a chunk of categories with optimized parent lookup
     * @param {Array} categoryChunk - Array of category objects with paths
     * @param {Array} allCategoryNodes - Array of all category nodes for parent lookup
     * @returns {Object} - Map of categories with full names and parent IDs
     */
    function processChunkOptimized(categoryChunk, allCategoryNodes) {
        var chunkMap = {};
        var localNamesMap = {};
        var missingParentIds = {};
        var item;
        var categoryID;
        var pathToNode;
        var i;

        // Phase 1: Build local names map
        for (i = 0; i < categoryChunk.length; i++) {
            item = categoryChunk[i];
            categoryID = item.category.getID();
            localNamesMap[categoryID] = item.category.getDisplayName();
        }

        // Phase 2: Identify missing parents (much fewer with DFS)
        for (i = 0; i < categoryChunk.length; i++) {
            pathToNode = categoryChunk[i].path;
            for (var j = 0; j < pathToNode.length; j++) {
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

        // Phase 4: Build final category objects
        for (i = 0; i < categoryChunk.length; i++) {
            item = categoryChunk[i];
            categoryID = item.category.getID();
            pathToNode = item.path;

            chunkMap[categoryID] = {
                fullName: buildCategoryPath(pathToNode, localNamesMap, localNamesMap[categoryID]),
                parentIDs: pathToNode.slice()
            };
        }

        return chunkMap;
    }

    /**
     * Builds a DFS chunked map of categories
     */
    function buildDFSChunkedMap() {
        var catalog = require('dw/catalog/CatalogMgr').getSiteCatalog();
        var root = catalog.getRoot();
        var allCategoryNodes = [];

        Logger.info('Building DFS chunked categories map...');

        // DFS collection for better hierarchical locality
        var topLevelCategories = root.getSubCategories();
        for (var i = 0; i < topLevelCategories.length; i++) {
            collectCategoriesDFS(topLevelCategories[i], [], allCategoryNodes, 0);
        }

        Logger.info('Collected ' + allCategoryNodes.length + ' categories via DFS');

        // Process in chunks with optimized parent lookup
        categoryChunks = [];

        for (var chunkStart = 0; chunkStart < allCategoryNodes.length; chunkStart += DFS_CHUNK_SIZE) {
            var chunkEnd = Math.min(chunkStart + DFS_CHUNK_SIZE, allCategoryNodes.length);
            var currentChunk = allCategoryNodes.slice(chunkStart, chunkEnd);

            var chunkResult = processChunkOptimized(currentChunk, allCategoryNodes);
            categoryChunks.push(chunkResult);

            Logger.info('Processed DFS chunk ' + (categoryChunks.length) +
                ': ' + chunkEnd + '/' + allCategoryNodes.length + ' categories');
        }
    }

    this.getCategories = function(product) {
        if (!product || !product.getCategoryAssignments) {
            Logger.error('Invalid product passed to DFSChunkedStrategy');
            return [];
        }

        if (categoryChunks.length === 0) {
            buildDFSChunkedMap();
        }
        return getProductCategoriesGeneric(product, function(categoryId) {
            return getCategoryFromChunks(categoryId, categoryChunks);
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
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');

        /**
         * Create lookup function that converts Custom Object format to standard format
         * @param {number} categoryId - ID of the category to look up
         * @returns {null|Object} - Custom Object
         */
        function customObjectLookup(categoryId) {
            var categoryObj = CustomObjectMgr.getCustomObject('PixleeCategoryHierarchy', categoryId);
            if (categoryObj) {
                return {
                    fullName: categoryObj.custom.fullPath,
                    parentIDs: JSON.parse(categoryObj.custom.parentIDs)
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
        for (var i = 0; i < allCategoryNodes.length; i++) {
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

        for (var j = 0; j < pathToNode.length; j++) {
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
        var Transaction = require('dw/system/Transaction');
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var catalog = require('dw/catalog/CatalogMgr').getSiteCatalog();

        Logger.info('Building category map using Custom Objects...');

        // Clear existing data
        Transaction.wrap(function() {
            var existing = CustomObjectMgr.getAllCustomObjects('PixleeCategoryHierarchy');
            while (existing.hasNext()) {
                CustomObjectMgr.remove(existing.next());
            }
        });

        // Collect all categories via DFS
        var allCategoryNodes = [];
        var root = catalog.getRoot();
        var topLevelCategories = root.getSubCategories();

        var i;
        for (i = 0; i < topLevelCategories.length; i++) {
            collectCategoriesDFS(topLevelCategories[i], [], allCategoryNodes, 0);
        }

        // Build global names map once for efficiency
        globalNamesMap = buildGlobalNamesMap(allCategoryNodes);

        // Store in batches
        for (i = 0; i < allCategoryNodes.length; i += CUSTOM_OBJECT_BATCH_SIZE) {
            var batchEnd = Math.min(i + CUSTOM_OBJECT_BATCH_SIZE, allCategoryNodes.length);
            var batch = allCategoryNodes.slice(i, batchEnd);

            try {
                Transaction.wrap(function(currentBatch) {
                    return function() {
                        for (var j = 0; j < currentBatch.length; j++) {
                            var item = currentBatch[j];
                            var categoryID = item.category.getID();

                            var customObj = CustomObjectMgr.createCustomObject('PixleeCategoryHierarchy', categoryID);
                            customObj.custom.displayName = item.category.getDisplayName();
                            customObj.custom.parentIDs = JSON.stringify(item.path);
                            customObj.custom.fullPath = buildFullPathForCustomObject(item.path, item.category);
                        }
                    };
                }(batch));
            } catch (e) {
                Logger.error('Failed to store category batch: ' + e.message);
                throw e;
            }

            Logger.info('Stored batch ' + Math.ceil((i + 1) / CUSTOM_OBJECT_BATCH_SIZE) +
                ': ' + batchEnd + '/' + allCategoryNodes.length + ' categories');
        }

        Logger.info('Custom Objects strategy built with ' + allCategoryNodes.length + ' categories');
    }

    this.getCategories = function(product) {
        if (!product || !product.getCategoryAssignments) {
            Logger.error('Invalid product passed to CustomObjectStrategy');
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
 * Initializes the optimal category processing strategy based on catalog size
 */
function initializeCategoryStrategy() {
    try {
        var catalog = require('dw/catalog/CatalogMgr').getSiteCatalog();
        var categoryCount = estimateCategoryCount(catalog);

        Logger.info('Detected ' + categoryCount + ' categories. Selecting optimal strategy...');

        if (categoryCount < SMALL_CATALOG_THRESHOLD) {
            Logger.info('Using SingleMapStrategy for small catalog');
            categoryProcessingStrategy = new SingleMapStrategy();
        } else if (categoryCount < LARGE_CATALOG_THRESHOLD) {
            Logger.info('Using DFSChunkedStrategy for medium catalog');
            categoryProcessingStrategy = new DFSChunkedStrategy();
        } else {
            Logger.info('Using CustomObjectStrategy for large catalog');
            categoryProcessingStrategy = new CustomObjectStrategy();
        }
    } catch (e) {
        Logger.error('Failed to initialize category strategy: ' + e.message);
        Logger.info('Falling back to SingleMapStrategy');
        categoryProcessingStrategy = new SingleMapStrategy();
    }
}

/**
 * Main function to get product categories using adaptive strategy
 * @param {dw.catalog.Product} product - Product for which to retrieve categories
 * @return {Array} - Array of categories for the product
 */
function getProductCategories(product) {
    try {
        // Input validation
        if (!product || !product.getCategoryAssignments) {
            Logger.error('Invalid product passed to getProductCategories');
            return [];
        }

        // Initialize strategy if not already done
        if (!categoryProcessingStrategy) {
            initializeCategoryStrategy();
        }

        return categoryProcessingStrategy.getCategories(product);
    } catch (e) {
        Logger.error('Error in getProductCategories for product ' + (product ? product.ID : 'unknown') + ': ' + e.message);
        return []; // Return empty array on error
    }
}

/**
 * Retrieves regeional (locale-specific) details of a product
 *
 * @param {dw.catalog.Product} product - Product to get regional details for.
 * @param {string} variantsJSON - Variants JSON, same for all regions so passed
 *   to this function as a parameter.
 * @returns {Array} - Array of objects, separate object for each region (locale)
 */
function getRegionalInfo(product, variantsJSON) {
    var Currency = require('dw/util/Currency');

    var siteLocales = Site.getCurrent().getAllowedLocales();
    var currencyLookupHelper = require('*/cartridge/scripts/pixlee/helpers/currencyLookupHelper');

    var regional = [];

    Logger.debug('Processing Product: ' + product.getName());

    for (var j = 0; j < siteLocales.length; j++) {
        var currentLocale = siteLocales[j];

        if ('default'.equalsIgnoreCase(currentLocale)) {
            continue; // eslint-disable-line
        }

        var localeCurrency = currencyLookupHelper.getCurrencyForLocale(currentLocale);

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

    // It made sense to add these lines at the top of the function, but dsScript is weird
    // When I did that the values were not default values but the values of the last locale iterated
    // Add these lines at the end helped
    request.setLocale(Site.current.getDefaultLocale());
    session.setCurrency(Currency.getCurrency(Site.current.getDefaultCurrency()));

    return regional;
}

/**
 * Creates a product payload object that can be passed to Pixlee web service API.
 *
 * @constructor
 * @param {dw.catalog.Product} product - SFCC product from which to create a
 *   payload object.
 * @param {Object} options - Export configuration parameters.
 */
function ProductExportPayload(product, options) {
    var pixleeHelper = require('*/cartridge/scripts/pixlee/helpers/pixleeHelper');
    var exportOptions = options || {};
    var variants = getProductVariants(product);
    var variantsJSON = JSON.stringify(variants);
    var regionalInfo = getRegionalInfo(product, variantsJSON);

    this.title = product.name;
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
            categories_last_updated_at: Math.floor(Date.now() / 1000)
        };

        this.product.name = product.name;
        this.product.buy_now_link_url = getProductPageUrl(product);
        this.product.product_photo = getProductImageURL(product, exportOptions);
        this.product.price = getProductPrice(product);
        this.product.stock = getProductStock(product);
        this.product.extra_fields = JSON.stringify(productExtraFields);
        this.product.currency = Site.getCurrent().getDefaultCurrency();
        this.product.variants_json = variantsJSON;
    }

    this.album_type = 'product';
    this.live_update = false;
    this.num_photos = 0;
    this.num_inbox_photos = 0;
}

module.exports = ProductExportPayload;
