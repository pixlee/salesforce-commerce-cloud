'use strict';

/* global request, session */

var DEFAULT_IMAGE_VEIW_TYPE = 'large';
var DEFAULT_NO_IMAGE_PATH = '/images/noimagesmall.png';

var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');

var categoriesMap;

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
    var productImageURL;
    var imageViewType = options.imageViewType || DEFAULT_IMAGE_VEIW_TYPE;
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

    return productImageURL || null;
}

/**
 * Returns the product price.
 *
 * @param {dw.catalog.Product} product - Product for which to retrieve price.
 * @returns {number} - The retrieved price.
 */
function getProductPrice(product) {
    var productPrice;
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

    return productPrice || null;
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
    var imageViewType = exportOptions.imageViewType || DEFAULT_IMAGE_VEIW_TYPE;

    var productImages = product.getImages(imageViewType);
    for (var i = 0; i < productImages.length; i++) {
        var image = productImages[i];
        allImages.push(image.absURL.toString());
    }

    if (product.master) {
        var variantIterator = product.getVariants().iterator();

        while (variantIterator.hasNext()) {
            var variant = variantIterator.next();
            var variantPhotos = variant.getImages(imageViewType);
            for (var j = 0; j < variantPhotos.length; j++) {
                var photoURL = variantPhotos[j].absURL.toString();
                if (allImages.indexOf(photoURL) < 0) {
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

            var variantObj = {
                variant_stock: variantStock,
                variant_sku: variantID
            };

            variantsDict[variantID] = variantObj;
        }
    }

    return variantsDict;
}

/**
 * Helper function. Consumes the namesMap and gives back the full name
 *
 * @param {Array} pathStack - Path stack
 * @param {Object} namesMap - Map of category names
 * @param {string} categoryName - Category Name
 * @return {string} - Full category name
 */
function getFullName(pathStack, namesMap, categoryName) {
    var fullName = '';
    for (var i = 0; i < pathStack.length; i++) {
        var parentID = pathStack[i];
        fullName += namesMap[parentID] + ' > ';
    }
    fullName += categoryName;
    return fullName;
}

/**
 * Retrieves a map of all categories in the catalog assigned to the site.
 *
 * @returns {Object} - Map og categories, having category ID as a key.
 */
function getCategoriesMap() {

    // Very Easy
    // The root node is available to us.
    // We're gonna do a BFS (iterative) to traverse the entire tree with an small modification, we will keep track of the path to the current node.
    // By path, we mean an array of category ids from the parent category all the way to the root category.
    // The way we do it is by attaching the path along with the children when enqueuing them.
    // The result we want is a hash with category_ids as keys and an object with two properties as values.
    // The first property of the object will be the full name of the category. For example - Women > SkinCare > Sunscreen.
    // The second property would be the path to the parent.

    // One more thing, sorry
    // We need to keep track of the path in such a way that getting both full names and paths is cheap i.e. without additional API calls.
    // We can do this in many ways, but I'm use more space and keep track of all category_ids and names (not full names) in a seperate hash.
    // We'll call it namesMap.

    var catalog = require('dw/catalog/CatalogMgr').getSiteCatalog();
    var root = catalog.getRoot();

    var queue = [];
    var namesMap = {};
    var result = {};

    // We want to skip the root node in front of all categories
    var topLevelCategories = root.getSubCategories();
    for (var i = 0; i < topLevelCategories.length; i++) {
        queue.push({
            node: topLevelCategories[i],
            path: []
        });
    }

    // BFS starts here
    while (queue.length > 0) {
        var currentNode = queue.shift(); // dequeue
        var category = currentNode.node;
        var pathToNode = currentNode.path;

        // API calls
        var categoryID = category.getID();
        var categoryName = category.getDisplayName();
        var childrenNodes = category.getSubCategories();

        // Add the combination to the namesMap
        namesMap[categoryID] = categoryName;

        result[categoryID] = {
            fullName: getFullName(pathToNode, namesMap, categoryName),
            parentIDs: pathToNode.slice() // JS way of copying an array by value not reference
        };

        // For all the children of this node, add the current category to the path
        pathToNode.push(categoryID);
        for (var j = 0; j < childrenNodes.length; j++) {
            queue.push({ node: childrenNodes[j], path: pathToNode.slice() });
        }
    }

    return result;
}

/**
 * Returns product categories.
 *
 * @param {dw.catalog.Product} product - Product for which to retrieve categories
 * @return {Array} - Array of categories for the product.
 */
function getProductCategories(product) {
    // Lazy init the categories map
    categoriesMap = categoriesMap || getCategoriesMap();

    var productCategories = {};
    var categoryAssignments = product.getCategoryAssignments();

    for (var i = 0; i < categoryAssignments.length; i++) {
        var category = categoryAssignments[i].getCategory();
        var categoryId = category.getID();

        // NOTE: This check could be unnecessary as getCategoryAssignments should
        // return only the categories to which a product is assigned in the current
        // site catalog.
        if (!(categoryId in categoriesMap)) {
            // Skip if this is a category that does not belong to site's catalog
            continue; // eslint-disable-line
        }

        if (!(categoryId in productCategories)) {
            productCategories[categoryId] = {
                category_id: categoryId,
                category_name: categoriesMap[categoryId].fullName
            };
        }

        var parentCategoriesIds = categoriesMap[categoryId].parentIDs;
        for (var j = 0; j < parentCategoriesIds.length; j++) {
            var parentCategoryId = parentCategoriesIds[j];
            if (!(parentCategoryId in productCategories)) {
                productCategories[parentCategoryId] = {
                    category_id: parentCategoryId,
                    category_name: categoriesMap[parentCategoryId].fullName
                };
            }
        }
    }

    // Object.values does not seem to be supported.
    return Object.keys(productCategories).map(function (key) {
        return productCategories[key];
    });
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

    Logger.warn('Processing Product: ' + product.getName());

    for (var j = 0; j < siteLocales.length; j++) {
        var currentLocale = siteLocales[j];

        if ('default'.equalsIgnoreCase(currentLocale)) {
            continue; // eslint-disable-line
        }

        var localeCurrency = currencyLookupHelper.getCurrencyForLocale(currentLocale);

        request.setLocale(currentLocale);
        session.setCurrency(Currency.getCurrency(localeCurrency));

        Logger.warn('Processing Locale: ' + currentLocale);

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
                Logger.warn('Could not get the price for product id: ' + product.ID);
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
            description: product.longDescription ? product.longDescription.getMarkup() : null,
            region_code: currentLocale,
            variants_json: variantsJSON
        };

        regional.push(productRegion);
    }

    // It made sense to add these lines at the top of the function, but dsScript is weird
    // But when I did that the behavior was the the default values were not default values, and instead values of the last locale iterated
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
            ecommerce_platform: 'demandware',
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
