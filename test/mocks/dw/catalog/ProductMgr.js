'use strict';

/**
 * Mock ProductMgr for testing product export functionality
 */

function createMockProduct(id, options) {
    options = options || {};
    
    var mockCategoryAssignments = options.categoryAssignments || [];
    
    return {
        ID: id,
        name: options.name || 'Mock Product ' + id,
        UPC: options.upc || null,
        online: options.online !== false,
        searchable: options.searchable !== false,
        variant: options.variant || false,
        
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
                    return options.hasVariant ? {
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
            return [{
                absURL: { toString: function () { return 'https://example.com/image1.jpg'; } }
            }];
        },
        
        getVariants: function () {
            return {
                iterator: function () {
                    return {
                        hasNext: function () { return false; },
                        next: function () { return null; }
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
ProductMgr.__testUtils = {
    createMockProduct: createMockProduct
};

module.exports = ProductMgr;
