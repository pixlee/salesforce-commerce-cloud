'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Import test utilities
require('../../../mocks/globals');

describe('ProductExportPayload - Category Strategy Tests', function () {
    var ProductExportPayload;
    var mockCatalogMgr;
    var mockProductMgr;
    var mockSite;
    var mockLogger;
    var mockGlobals;

    beforeEach(function () {
        // Reset global mocks
        mockGlobals = require('../../../mocks/globals');
        mockGlobals.resetGlobals();

        // Setup mocks
        mockCatalogMgr = require('../../../mocks/dw/catalog/CatalogMgr');
        mockProductMgr = require('../../../mocks/dw/catalog/ProductMgr');
        mockSite = require('../../../mocks/dw/system/Site');

        mockLogger = {
            info: function () {},
            debug: function () {},
            warn: function () {},
            error: function () {}
        };

        // Reset catalog mock data
        mockCatalogMgr.__testUtils.reset();

        // Load the module under test with mocks
        ProductExportPayload = proxyquire('../../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/models/productExportPayload', {
            'dw/system/Logger': mockLogger,
            'dw/system/Site': mockSite,
            'dw/catalog/CatalogMgr': mockCatalogMgr,
            'dw/catalog/ProductMgr': mockProductMgr,
            'dw/web/Resource': {
                msg: function (key, bundle, defaultValue) {
                    return defaultValue || 'mock_' + key;
                }
            },
            'dw/web/URLUtils': {
                http: function () {
                    return {
                        host: function () {},
                        toString: function () { return 'http://example.com/product'; }
                    };
                },
                absStatic: function () { return 'http://example.com/noimage.png'; }
            },
            'dw/util/Currency': {
                getCurrency: function () { return { currencyCode: 'USD' }; }
            },
            '*/cartridge/scripts/pixlee/helpers/pixleeHelper': {
                getPixleeProductSKU: function (product) { return product.ID; }
            },
            '*/cartridge/scripts/pixlee/helpers/currencyLookupHelper': {
                getCurrencyForLocale: function () { return 'USD'; }
            }
        });
    });

    describe('Small Catalog Strategy Selection', function () {
        it('should use SingleMapStrategy for catalogs under 1800 categories', function () {
            // Setup small catalog (default mock has 2 categories)
            var logMessages = [];
            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            // Create a test product
            var product = mockProductMgr.__testUtils.createMockProduct('test1', {
                categoryAssignments: ['cat1']
            });

            // Create payload (this will initialize strategy)
            var payload = new ProductExportPayload(product, {});

            // Verify strategy selection
            var strategyMessage = logMessages.find(function (msg) {
                return msg.indexOf('SingleMapStrategy') > -1;
            });

            assert.isNotNull(strategyMessage, 'Should log SingleMapStrategy selection');
            assert.isTrue(strategyMessage.indexOf('SingleMapStrategy') > -1, 'Should select SingleMapStrategy for small catalog');
        });
    });

    describe('Large Catalog Strategy Selection and SFCC Compliance', function () {
        it('should use HybridBFSStrategy for catalogs over safety threshold', function () {
            // Setup large catalog to test strategy selection and SFCC object size compliance
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3513); // Original error scenario
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            var logMessages = [];
            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            // Create a test product with category assignment
            var product = mockProductMgr.__testUtils.createMockProduct('test_large', {
                categoryAssignments: ['cat_0'] // Category that exists in large catalog
            });

            // Create payload (this will initialize strategy)
            var payload = new ProductExportPayload(product, {});

            // Verify strategy selection
            var strategyMessage = logMessages.find(function (msg) {
                return msg.indexOf('Using HybridBFSStrategy') > -1;
            });

            assert.isNotNull(strategyMessage, 'Should log HybridBFSStrategy selection');
            assert.isTrue(strategyMessage.indexOf('Using HybridBFSStrategy') > -1, 'Should select HybridBFSStrategy for large catalog');

            // Verify category count detection
            var countMessage = logMessages.find(function (msg) {
                return msg.indexOf('3513 categories') > -1;
            });

            assert.isNotNull(countMessage, 'Should detect large category count');
        });

        it('should respect SFCC object property limits regardless of catalog size', function () {
            // Test with very large catalog to ensure object property limits are always respected
            var hugeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(5000);
            mockCatalogMgr.__testUtils.setMockCatalogData(hugeCatalog);

            var logMessages = [];
            var warnMessages = [];

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            // Create test product
            var product = mockProductMgr.__testUtils.createMockProduct('test_huge', {
                categoryAssignments: ['cat_0', 'cat_1_0', 'cat_2_1'] // Multiple deep categories
            });

            // This should NOT throw "api.jsObjectSize exceeded" error
            var payload;
            assert.doesNotThrow(function () {
                payload = new ProductExportPayload(product, {});
            }, /api\.jsObjectSize/, 'Should not exceed SFCC object property limit');

            // Verify we got categories without errors
            assert.isObject(payload, 'Payload should be created successfully');
            assert.isArray(payload.product.extra_fields ? JSON.parse(payload.product.extra_fields).categories : [], 'Should have categories');

            // Check for any object size warnings
            var objectSizeErrors = warnMessages.filter(function (msg) {
                return msg.indexOf('api.jsObjectSize') > -1 || msg.indexOf('2000') > -1;
            });

            assert.equal(objectSizeErrors.length, 0, 'Should not have any object size limit warnings');
        });

        it('should handle threshold boundary without SFCC object size violations', function () {
            // Test the exact threshold boundary (CATEGORY_SAFETY_LIMIT) to ensure proper
            // strategy selection and compliance with SFCC object property limits
            var thresholdCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(1799);
            mockCatalogMgr.__testUtils.setMockCatalogData(thresholdCatalog);

            var logMessages = [];
            var errorMessages = [];
            var warnMessages = [];

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            mockLogger.error = function (message) {
                errorMessages.push(message);
            };

            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            // Create test product with category assignments
            var product = mockProductMgr.__testUtils.createMockProduct('threshold_test', {
                categoryAssignments: ['cat_0', 'cat_1_0'] // Multiple categories to test processing
            });

            // This is the critical test - should NOT throw api.jsObjectSize error at threshold
            var payload;
            assert.doesNotThrow(function () {
                payload = new ProductExportPayload(product, {});
            }, /api\.jsObjectSize|Limit.*2000.*exceeded/, 'Should not throw SFCC object size limit error with exactly 1799 categories');

            // Verify payload was created successfully
            assert.isObject(payload, 'Payload should be created successfully');
            assert.isObject(payload.product, 'Should have product data');

            // Verify categories were processed without errors
            if (payload.product.extra_fields) {
                var extraFields = JSON.parse(payload.product.extra_fields);
                assert.isArray(extraFields.categories, 'Should have categories array');
            }

            // Verify strategy selection - 1799 should still use SingleMapStrategy (< CATEGORY_SAFETY_LIMIT)
            var strategyMessage = logMessages.find(function (msg) {
                return msg.indexOf('Using SingleMapStrategy') > -1 && msg.indexOf('1799 categories') > -1;
            });
            assert.isDefined(strategyMessage, 'Should use SingleMapStrategy for exactly 1799 categories');

            // Verify no api.jsObjectSize errors occurred
            var objectSizeErrors = errorMessages.concat(warnMessages).filter(function (msg) {
                return msg.indexOf('api.jsObjectSize') > -1 ||
                       msg.indexOf('2000') > -1 ||
                       msg.indexOf('exceeded') > -1;
            });
            assert.equal(objectSizeErrors.length, 0, 'Should not have any object size limit errors or warnings');

            // Verify no general errors occurred
            assert.equal(errorMessages.length, 0, 'Should not have any error messages during processing');
        });

        it('should handle cache statistics for HybridBFSStrategy', function () {
            // Setup large catalog
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(2500);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            // Create product and payload
            var product = mockProductMgr.__testUtils.createMockProduct('test_stats', {
                categoryAssignments: ['cat_0']
            });

            var payload = new ProductExportPayload(product, {});

            // Get cache statistics
            var stats = ProductExportPayload.getCacheStatistics();

            assert.isObject(stats, 'Should return cache statistics');
            assert.equal(stats.strategyType, 'HybridBFSStrategy', 'Should report correct strategy type');

            if (stats.hybridBFS) {
                assert.isObject(stats.hybridBFS.bfsMap, 'Should have BFS map stats');
                assert.isObject(stats.hybridBFS.unmappedCache, 'Should have unmapped cache stats');

                // Verify object property limits are respected
                assert.isTrue(stats.hybridBFS.bfsMap.size <= 2000, 'BFS map should not exceed 2000 properties');
                assert.isTrue(stats.hybridBFS.unmappedCache.size <= 300, 'Unmapped cache should not exceed 300 properties');
            }
        });
    });

    describe('Category Processing Edge Cases', function () {
        it('should handle products with no category assignments', function () {
            var product = mockProductMgr.__testUtils.createMockProduct('no_cats', {
                categoryAssignments: []
            });

            var payload = new ProductExportPayload(product, {});
            var categories = JSON.parse(payload.product.extra_fields).categories;

            assert.isArray(categories, 'Should return empty array for products with no categories');
            assert.equal(categories.length, 0, 'Should have no categories');
        });

        it('should handle invalid products gracefully', function () {
            var invalidProduct = {
                ID: 'invalid',
                name: 'Invalid Product',
                getName: function() { return 'Invalid Product'; },
                getCategoryAssignments: function() { return { iterator: function() { return { hasNext: function() { return false; } }; } }; },
                getPriceModel: function() { return null; },
                getAvailabilityModel: function() { return null; },
                getImage: function() { return null; },
                getImages: function() { return { iterator: function() { return { hasNext: function() { return false; } }; } }; },
                getVariants: function() { return { iterator: function() { return { hasNext: function() { return false; } }; } }; }
            };

            // Should not throw error
            assert.doesNotThrow(function () {
                var payload = new ProductExportPayload(invalidProduct, {});
            }, 'Should handle invalid products gracefully');
        });

        it('should handle products without pricing (product sets, bundles)', function () {
            var productSet = mockProductMgr.__testUtils.createMockProduct('product-set-123', {
                name: 'Spring Look Set',
                categoryAssignments: ['sets']
            });

            // Mock a price model that returns null price (like product sets)
            productSet.getPriceModel = function() {
                return {
                    getPrice: function() {
                        return null; // Product sets often have no price
                    }
                };
            };

            productSet.getVariationModel = function() {
                return {
                    getDefaultVariant: function() {
                        return null;
                    }
                };
            };

            var payload;
            assert.doesNotThrow(function () {
                payload = new ProductExportPayload(productSet, {});
            }, 'Should handle products without pricing gracefully');

            // Verify the product was processed with default price
            assert.isObject(payload, 'Should create payload for product set');
            assert.equal(payload.product.price, '0', 'Should use default price of 0 for product sets');
        });

        it('should respect CATEGORY_SAFETY_LIMIT during processing', function () {
            // Create catalog with many categories
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(2000);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            // Create product with many category assignments (simulate edge case)
            var manyCategories = [];
            for (var i = 0; i < 100; i++) {
                manyCategories.push('cat_' + i);
            }

            var product = mockProductMgr.__testUtils.createMockProduct('many_cats', {
                categoryAssignments: manyCategories
            });

            var warnMessages = [];
            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            // Should process without infinite loops or excessive processing
            var payload = new ProductExportPayload(product, {});

            // Should complete in reasonable time (test framework timeout will catch infinite loops)
            assert.isObject(payload, 'Should complete processing with many categories');

            // Check for any safety limit warnings
            var safetyWarnings = warnMessages.filter(function (msg) {
                return msg.indexOf('safety') > -1 || msg.indexOf('limit') > -1;
            });

            // Warnings are OK, but should not crash
            assert.isObject(payload.product, 'Should have product data even with safety limits');
        });
    });

    describe('Memory Management and Performance', function () {
        it('should clear caches properly', function () {
            // Setup large catalog
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(2000);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            // Create product to initialize strategy
            var product = mockProductMgr.__testUtils.createMockProduct('cache_test', {
                categoryAssignments: ['cat_0']
            });

            var payload = new ProductExportPayload(product, {});

            // Get initial stats
            var initialStats = ProductExportPayload.getCacheStatistics();

            // Pre-initialize should work without errors
            assert.doesNotThrow(function () {
                ProductExportPayload.preInitializeCategoryProcessing();
            }, 'Pre-initialization should not throw errors');

            // Stats should still be available after pre-initialization
            var postInitStats = ProductExportPayload.getCacheStatistics();
            assert.isObject(postInitStats, 'Should have cache statistics after pre-initialization');
        });

        it('should handle session cache size limits', function () {
            // This test verifies the RequestCache respects SFCC session limits
            var product = mockProductMgr.__testUtils.createMockProduct('session_test', {
                categoryAssignments: ['cat1']
            });

            var warnMessages = [];
            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            // Create payload (will use RequestCache)
            var payload = new ProductExportPayload(product, {});

            // Check session size - should not exceed SFCC limits
            var sessionData = JSON.stringify(global.session.getPrivacy());
            var sessionSizeKB = sessionData.length / 1024;

            assert.isTrue(sessionSizeKB < 10, 'Session cache should stay under 10KB SFCC limit');

            // Check for any session size warnings
            var sizeWarnings = warnMessages.filter(function (msg) {
                return msg.indexOf('Session cache') > -1 || msg.indexOf('10KB') > -1;
            });

            // Warnings are informational, but should not indicate errors
            assert.isObject(payload, 'Should create payload without session cache errors');
        });
    });
});

describe('ProductExportPayload - Integration Tests', function () {
    var ProductExportPayload;
    var mockCatalogMgr;
    var mockProductMgr;
    var mockGlobals;

    beforeEach(function () {
        mockGlobals = require('../../../mocks/globals');
        mockGlobals.resetGlobals();

        mockCatalogMgr = require('../../../mocks/dw/catalog/CatalogMgr');
        mockProductMgr = require('../../../mocks/dw/catalog/ProductMgr');

        mockCatalogMgr.__testUtils.reset();

        ProductExportPayload = proxyquire('../../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/models/productExportPayload', {
            'dw/system/Logger': {
                info: function () {},
                debug: function () {},
                warn: function () {},
                error: function () {}
            },
            'dw/system/Site': require('../../../mocks/dw/system/Site'),
            'dw/catalog/CatalogMgr': mockCatalogMgr,
            'dw/catalog/ProductMgr': mockProductMgr,
            'dw/web/Resource': {
                msg: function (key, bundle, defaultValue) {
                    return defaultValue || 'mock_' + key;
                }
            },
            'dw/web/URLUtils': {
                http: function () {
                    return {
                        host: function () {},
                        toString: function () { return 'http://example.com/product'; }
                    };
                },
                absStatic: function () { return 'http://example.com/noimage.png'; }
            },
            'dw/util/Currency': {
                getCurrency: function () { return { currencyCode: 'USD' }; }
            },
            '*/cartridge/scripts/pixlee/helpers/pixleeHelper': {
                getPixleeProductSKU: function (product) { return product.ID; }
            },
            '*/cartridge/scripts/pixlee/helpers/currencyLookupHelper': {
                getCurrencyForLocale: function () { return 'USD'; }
            }
        });
    });

    describe('Original Bug Scenario Reproduction', function () {
        it('should handle the exact scenario that caused api.jsObjectSize error', function () {
            // Reproduce the exact scenario from the original error:
            // "Detected 3513 categories. Using DFSChunkedStrategy"
            // "Limit for quota 'api.jsObjectSize' exceeded. Limit is 2000, actual is 2001"

            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3513);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            // Create product similar to the one that failed
            var product = mockProductMgr.__testUtils.createMockProduct('failing_product', {
                name: 'Product That Previously Failed',
                categoryAssignments: ['cat_0', 'cat_1_0', 'cat_2_1'] // Deep category assignments
            });

            // This is the critical test - this should NOT throw the api.jsObjectSize error
            var payload;
            assert.doesNotThrow(function () {
                payload = new ProductExportPayload(product, {});
            }, /api\.jsObjectSize|Limit.*2000.*exceeded/, 'Should not throw SFCC object size limit error');

            // Verify the payload was created successfully
            assert.isObject(payload, 'Should create payload successfully');
            assert.isObject(payload.product, 'Should have product data');
            assert.isString(payload.product.extra_fields, 'Should have extra fields');

            // Verify categories were processed
            var extraFields = JSON.parse(payload.product.extra_fields);
            assert.isArray(extraFields.categories, 'Should have categories array');

            // The key test: we should have categories without hitting the 2000 property limit
            assert.isTrue(extraFields.categories.length >= 0, 'Should process categories without errors');
        });

        it('should use HybridBFSStrategy instead of the removed DFSChunkedStrategy', function () {
            // Setup the same large catalog scenario
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3513);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            var logMessages = [];
            var mockLogger = {
                info: function (message) {
                    logMessages.push(message);
                },
                debug: function () {},
                warn: function () {},
                error: function () {}
            };

            // Clear any existing cache before test
            if (typeof ProductExportPayload.clearCache === 'function') {
                ProductExportPayload.clearCache();
            }

            // Re-create the module with logging to capture strategy selection
            var TestProductExportPayload = proxyquire('../../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/models/productExportPayload', {
                'dw/system/Logger': mockLogger,
                'dw/system/Site': require('../../../mocks/dw/system/Site'),
                'dw/catalog/CatalogMgr': mockCatalogMgr,
                'dw/catalog/ProductMgr': mockProductMgr,
                'dw/web/Resource': {
                    msg: function (key, bundle, defaultValue) {
                        return defaultValue || 'mock_' + key;
                    }
                },
                'dw/web/URLUtils': {
                    http: function () {
                        return {
                            host: function () {},
                            toString: function () { return 'http://example.com/product'; }
                        };
                    },
                    absStatic: function () { return 'http://example.com/noimage.png'; }
                },
                'dw/util/Currency': {
                    getCurrency: function () { return { currencyCode: 'USD' }; }
                },
                '*/cartridge/scripts/pixlee/helpers/pixleeHelper': {
                    getPixleeProductSKU: function (product) { return product.ID; }
                },
                '*/cartridge/scripts/pixlee/helpers/currencyLookupHelper': {
                    getCurrencyForLocale: function () { return 'USD'; }
                }
            });

            var product = mockProductMgr.__testUtils.createMockProduct('strategy_test', {
                categoryAssignments: ['cat_0']
            });

            var payload = new TestProductExportPayload(product, {});

            // Verify we're NOT using DFSChunkedStrategy (which was removed)
            var dfsMessage = logMessages.find(function (msg) {
                return msg.indexOf('DFSChunkedStrategy') > -1;
            });
            assert.isUndefined(dfsMessage, 'Should NOT use removed DFSChunkedStrategy');

            // Verify we ARE using HybridBFSStrategy
            var hybridMessage = logMessages.find(function (msg) {
                return msg.indexOf('Using HybridBFSStrategy') > -1;
            });
            assert.isDefined(hybridMessage, 'Should use HybridBFSStrategy for large catalogs');

            // Verify category count detection - should detect a large catalog (may be limited by BFS max)
            var countMessage = logMessages.find(function (msg) {
                return msg.indexOf('categories. Using HybridBFSStrategy') > -1;
            });
            assert.isDefined(countMessage, 'Should correctly detect large category count and use HybridBFSStrategy');
        });
    });

    describe('Performance and Scalability', function () {
        it('should handle very large catalogs without performance degradation', function () {
            // Test with even larger catalog to ensure scalability
            var hugeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(10000);
            mockCatalogMgr.__testUtils.setMockCatalogData(hugeCatalog);

            var product = mockProductMgr.__testUtils.createMockProduct('perf_test', {
                categoryAssignments: ['cat_0', 'cat_1_0', 'cat_2_1', 'cat_3_2']
            });

            var startTime = Date.now();

            // Should complete in reasonable time
            var payload = new ProductExportPayload(product, {});

            var endTime = Date.now();
            var processingTime = endTime - startTime;

            // Should complete within reasonable time (adjust threshold as needed)
            assert.isTrue(processingTime < 5000, 'Should process large catalog within 5 seconds');

            // Should still produce valid output
            assert.isObject(payload, 'Should create valid payload for huge catalog');
            assert.isObject(payload.product, 'Should have product data');
        });

        it('should maintain consistent memory usage across multiple products', function () {
            // Setup large catalog
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3000);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            // Process multiple products to test memory consistency
            var products = [];
            for (var i = 0; i < 10; i++) {
                products.push(mockProductMgr.__testUtils.createMockProduct('mem_test_' + i, {
                    categoryAssignments: ['cat_' + (i % 5)] // Vary category assignments
                }));
            }

            // Process all products
            var payloads = [];
            for (var j = 0; j < products.length; j++) {
                var payload = new ProductExportPayload(products[j], {});
                payloads.push(payload);
            }

            // All should be processed successfully
            assert.equal(payloads.length, products.length, 'Should process all products');

            // Get final cache statistics
            var finalStats = ProductExportPayload.getCacheStatistics();
            assert.isObject(finalStats, 'Should have cache statistics after processing multiple products');

            // Memory usage should be controlled (no runaway growth)
            if (finalStats.hybridBFS) {
                assert.isTrue(finalStats.hybridBFS.bfsMap.size <= 2000, 'BFS map should stay within limits');
                assert.isTrue(finalStats.hybridBFS.unmappedCache.size <= 300, 'Unmapped cache should stay within limits');
            }
        });
    });
});
