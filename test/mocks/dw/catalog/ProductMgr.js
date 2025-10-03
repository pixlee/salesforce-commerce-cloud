/**
 * Mock ProductMgr for testing product export functionality
 */

function createMockProduct(id, options) {
    var opts = options || {};

    var mockCategoryAssignments = opts.categoryAssignments || [];

    return {
        ID: id,
        name: opts.name || 'Mock Product ' + id,
        UPC: opts.upc || null,
        online: opts.online !== false,
        searchable: opts.searchable !== false,
        variant: opts.variant || false,
        master: opts.master || false,

        getCategoryAssignments: function () {
            return mockCategoryAssignments.map(function (catId) {
                return {
                    getCategory: function () {
                        return {
                            getID: function () { return catId; },
                            getDisplayName: function () { return 'Category ' + catId; }
                        };
                    }
                };
            });
        },

        getPriceModel: function () {
            return {
                getPrice: function () {
                    return {
                        decimalValue: { valueOf: function () { return 99.99; } },
                        getCurrencyCode: function () { return 'USD'; }
                    };
                }
            };
        },

        getVariationModel: function () {
            return {
                getDefaultVariant: function () {
                    return opts.hasVariant ? {
                        getPriceModel: function () {
                            return {
                                getPrice: function () {
                                    return {
                                        decimalValue: { valueOf: function () { return 89.99; } },
                                        getCurrencyCode: function () { return 'USD'; }
                                    };
                                }
                            };
                        }
                    } : null;
                }
            };
        },

        getAvailabilityModel: function () {
            return {
                isInStock: function () { return true; },
                getInventoryRecord: function () {
                    return {
                        ATS: { value: 10 }
                    };
                }
            };
        },

        getImage: function () {
            return {
                absURL: { toString: function () { return 'https://example.com/image.jpg'; } }
            };
        },

        getImages: function () {
            var imageCount = opts.imageCount || 1;
            var images = [];
            for (var i = 0; i < imageCount; i++) {
                (function(imageIndex) {
                    images.push({
                        absURL: { toString: function () { return 'https://example.com/image' + imageIndex + '.jpg'; } }
                    });
                })(i);
            }
            return images;
        },

        getVariants: function () {
            var variantCount = opts.variantCount || 0;
            var variants = [];

            // Create mock variants if this is a master product
            if (opts.master && variantCount > 0) {
                for (var i = 0; i < variantCount; i++) {
                    (function(variantIndex) {
                        variants.push({
                            getID: function () { return id + '_variant_' + variantIndex; },
                            getAvailabilityModel: function () {
                                return {
                                    getInventoryRecord: function () {
                                        return {
                                            ATS: { value: 5 }
                                        };
                                    }
                                };
                            },
                            getImages: function () {
                                var imagesPerVariant = opts.imagesPerVariant || 1;
                                var variantImages = [];
                                for (var j = 0; j < imagesPerVariant; j++) {
                                    (function(imageIndex) {
                                        variantImages.push({
                                            absURL: { toString: function () { return 'https://example.com/variant' + variantIndex + '_image' + imageIndex + '.jpg'; } }
                                        });
                                    })(j);
                                }
                                return variantImages;
                            }
                        });
                    })(i);
                }
            }

            var index = 0;
            return {
                iterator: function () {
                    return {
                        hasNext: function () { return index < variants.length; },
                        next: function () { return variants[index++]; }
                    };
                }
            };
        },

        getName: function () {
            return this.name;
        }
    };
}

var ProductMgr = {
    getProduct: function (productId) {
        return createMockProduct(productId);
    },

    queryAllSiteProducts: function () {
        // Return an iterator with a few mock products
        var products = [
            createMockProduct('prod1', { categoryAssignments: ['cat1'] }),
            createMockProduct('prod2', { categoryAssignments: ['cat2', 'cat1_0'] })
        ];
        var index = 0;

        return {
            count: products.length,
            hasNext: function () { return index < products.length; },
            next: function () { return products[index++]; },
            close: function () { /* no-op */ }
        };
    }
};

// Test utilities
ProductMgr.testUtils = {
    createMockProduct: createMockProduct
};

module.exports = ProductMgr;
