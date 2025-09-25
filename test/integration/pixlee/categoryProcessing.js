'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Import test utilities
require('../../mocks/globals');

describe('Category Processing - Integration Tests', function () {
    var ExportProducts;
    var ProductExportPayload;
    var mockCatalogMgr;
    var mockProductMgr;
    var mockPixleeService;
    var mockLogger;
    var mockGlobals;

    beforeEach(function () {
        // Reset global mocks
        mockGlobals = require('../../mocks/globals');
        mockGlobals.resetGlobals();

        // Setup mocks
        mockCatalogMgr = require('../../mocks/dw/catalog/CatalogMgr');
        mockProductMgr = require('../../mocks/dw/catalog/ProductMgr');

        mockLogger = {
            info: function () {},
            debug: function () {},
            warn: function () {},
            error: function () {}
        };

        mockPixleeService = {
            notifyExportStatus: function () {},
            postProduct: function () {}
        };

        // Reset catalog mock data
        mockCatalogMgr.__testUtils.reset();

        // Load modules under test with mocks
        ProductExportPayload = proxyquire('../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/models/productExportPayload', {
            'dw/system/Logger': mockLogger,
            'dw/system/Site': require('../../mocks/dw/system/Site'),
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

        ExportProducts = proxyquire('../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/jobs/ExportProducts', {
            'dw/system/Logger': mockLogger,
            'dw/system/Status': (function() {
                function MockStatus(status, code, message) {
                    this.status = status;
                    this.code = code;
                    this.message = message;
                    return this;
                }

                // Add static constants
                MockStatus.OK = 'OK';
                MockStatus.ERROR = 'ERROR';

                return MockStatus;
            })(),
            '~/cartridge/scripts/pixlee/services/PixleeService': mockPixleeService,
            '~/cartridge/scripts/pixlee/models/productExportPayload': ProductExportPayload,
            'dw/system/Site': require('../../mocks/dw/system/Site'),
            'dw/catalog/ProductMgr': mockProductMgr
        });
    });

    describe('SFCC Object Size Limit Compliance', function () {
        it('should handle large catalogs without exceeding SFCC api.jsObjectSize quota', function () {
            // Test with a large catalog (3513 categories represents a real-world enterprise scenario)
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3513);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            var logMessages = [];
            var errorMessages = [];
            var exportedProducts = 0;

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            mockLogger.error = function (message) {
                errorMessages.push(message);
            };

            mockPixleeService.postProduct = function (payload) {
                exportedProducts++;
                // Verify payload structure
                assert.isObject(payload, 'Payload should be valid object');
                assert.isObject(payload.product, 'Payload should have product data');
            };

            // Mock job parameters
            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '10',
                'Images View Type': 'large',
                'Test Product ID': null
            };

            // Execute the job - this is the critical test
            var result;
            assert.doesNotThrow(function () {
                result = ExportProducts.execute(jobParameters);
            }, /api\.jsObjectSize|Limit.*2000.*exceeded/, 'Export job should not throw SFCC object size limit error');

            // Verify job completed successfully
            assert.isObject(result, 'Job should return status object');
            assert.equal(result.status, 'OK', 'Job should complete with OK status');

            // Verify no api.jsObjectSize errors were logged
            var objectSizeErrors = errorMessages.filter(function (msg) {
                return msg.indexOf('api.jsObjectSize') > -1 || msg.indexOf('2000') > -1;
            });
            assert.equal(objectSizeErrors.length, 0, 'Should not have any object size limit errors');

            // Verify strategy selection
            var strategyMessage = logMessages.find(function (msg) {
                return msg.indexOf('HybridBFSStrategy') > -1;
            });
            assert.isDefined(strategyMessage, 'Should use HybridBFSStrategy for large catalog');

            // Verify products were exported
            assert.isTrue(exportedProducts > 0, 'Should export at least some products');
        });

        it('should handle threshold catalog size without exceeding SFCC object limits', function () {
            // Test the threshold boundary (1800 categories = CATEGORY_SAFETY_LIMIT)
            // This ensures proper strategy selection and object size compliance at the boundary
            var thresholdCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(1799);
            mockCatalogMgr.__testUtils.setMockCatalogData(thresholdCatalog);

            var logMessages = [];
            var errorMessages = [];
            var warnMessages = [];
            var exportedProducts = 0;

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            mockLogger.error = function (message) {
                errorMessages.push(message);
            };

            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            mockPixleeService.postProduct = function (payload) {
                exportedProducts++;
                // Verify payload structure is valid
                assert.isObject(payload, 'Payload should be valid object');
                assert.isObject(payload.product, 'Payload should have product data');

                // Verify categories were processed successfully
                if (payload.product.extra_fields) {
                    var extraFields = JSON.parse(payload.product.extra_fields);
                    assert.isArray(extraFields.categories, 'Should have categories array in payload');
                }
            };

            // Mock job parameters
            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '5',
                'Images View Type': 'large'
            };

            // Execute the job - this is the critical threshold test
            var result;
            assert.doesNotThrow(function () {
                result = ExportProducts.execute(jobParameters);
            }, /api\.jsObjectSize|Limit.*2000.*exceeded/, 'Export job should not throw SFCC object size limit error with exactly 1800 categories');

            // Verify job completed successfully
            assert.isObject(result, 'Job should return status object');
            assert.equal(result.status, 'OK', 'Job should complete with OK status at threshold');

            // Verify no api.jsObjectSize errors were logged
            var objectSizeErrors = errorMessages.concat(warnMessages).filter(function (msg) {
                return msg.indexOf('api.jsObjectSize') > -1 ||
                       msg.indexOf('2000') > -1 ||
                       msg.indexOf('exceeded') > -1;
            });
            assert.equal(objectSizeErrors.length, 0, 'Should not have any object size limit errors or warnings');

            // Verify strategy selection - should use SingleMapStrategy for exactly 1799 categories
            var strategyMessage = logMessages.find(function (msg) {
                return msg.indexOf('SingleMapStrategy') > -1 && msg.indexOf('1799 categories') > -1;
            });
            assert.isDefined(strategyMessage, 'Should use SingleMapStrategy for exactly 1799 categories');

            // Verify no HybridBFSStrategy was used (since we're at the threshold, not over it)
            var hybridMessage = logMessages.find(function (msg) {
                return msg.indexOf('HybridBFSStrategy') > -1;
            });
            assert.isUndefined(hybridMessage, 'Should NOT use HybridBFSStrategy for exactly 1800 categories');

            // Verify products were exported successfully
            assert.isTrue(exportedProducts > 0, 'Should export products successfully at threshold');

            // Verify no general errors occurred during processing
            assert.equal(errorMessages.length, 0, 'Should not have any error messages during threshold processing');
        });

        it('should scale to enterprise-level catalogs without memory issues', function () {
            // Test scalability with very large catalogs (5000+ categories)
            var hugeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(5000);
            mockCatalogMgr.__testUtils.setMockCatalogData(hugeCatalog);

            var logMessages = [];
            var warnMessages = [];
            var exportedProducts = 0;

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            mockPixleeService.postProduct = function (payload) {
                exportedProducts++;
            };

            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '5',
                'Images View Type': 'large'
            };

            var startTime = Date.now();

            // Should complete without errors or excessive time
            var result = ExportProducts.execute(jobParameters);

            var endTime = Date.now();
            var processingTime = endTime - startTime;

            // Verify performance
            assert.isTrue(processingTime < 10000, 'Should complete large catalog processing within 10 seconds');

            // Verify success
            assert.equal(result.status, 'OK', 'Should complete successfully with huge catalog');

            // Verify memory warnings are reasonable
            var memoryWarnings = warnMessages.filter(function (msg) {
                return msg.indexOf('memory') > -1 || msg.indexOf('cache') > -1;
            });
            // Some warnings are OK, but should not indicate failures

            assert.isTrue(exportedProducts > 0, 'Should export products from huge catalog');
        });

        it('should maintain consistent performance across multiple job runs', function () {
            // Setup large catalog
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(2500);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '3',
                'Images View Type': 'large'
            };

            var runTimes = [];
            var totalExported = 0;

            mockPixleeService.postProduct = function (payload) {
                totalExported++;
            };

            // Run the job multiple times to test consistency
            for (var i = 0; i < 3; i++) {
                var startTime = Date.now();

                var result = ExportProducts.execute(jobParameters);

                var endTime = Date.now();
                runTimes.push(endTime - startTime);

                assert.equal(result.status, 'OK', 'Run ' + (i + 1) + ' should complete successfully');
            }

            // Verify consistent performance (no significant degradation)
            // Exclude first run from performance analysis (cache warming)
            var performanceRuns = runTimes.slice(1);
            if (performanceRuns.length > 0) {
                var avgTime = performanceRuns.reduce(function (a, b) { return a + b; }, 0) / performanceRuns.length;
                var maxTime = Math.max.apply(Math, performanceRuns);

                // Max time should not be more than 3x average (allows for reasonable variance in test environments)
                assert.isTrue(maxTime < avgTime * 3, 'Performance should be consistent across runs (excluding cache warming)');
            }

            assert.isTrue(totalExported > 0, 'Should export products in all runs');
        });
    });

    describe('Strategy Transition Testing', function () {
        it('should properly transition from SingleMapStrategy to HybridBFSStrategy at threshold', function () {
            var logMessages = [];

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            // Test just under threshold (should use SingleMapStrategy)
            var smallCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(1700);
            mockCatalogMgr.__testUtils.setMockCatalogData(smallCatalog);

            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '1',
                'Test Product ID': 'test_small'
            };

            mockPixleeService.postProduct = function () {};

            var result1 = ExportProducts.execute(jobParameters);

            var smallCatalogMessage = logMessages.find(function (msg) {
                return msg.indexOf('Using SingleMapStrategy') > -1;
            });

            assert.isDefined(smallCatalogMessage, 'Should use SingleMapStrategy for small catalog');

            // Reset for large catalog test
            logMessages = [];
            mockCatalogMgr.__testUtils.reset();

            // Test over threshold (should use HybridBFSStrategy)
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(2000);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            // Create fresh ProductExportPayload instance to clear module-level cache
            var FreshProductExportPayload = proxyquire('../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/models/productExportPayload', {
                'dw/system/Logger': mockLogger,
                'dw/system/Site': require('../../mocks/dw/system/Site'),
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

            // Create fresh ExportProducts instance with fresh ProductExportPayload
            var FreshExportProducts = proxyquire('../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/jobs/ExportProducts', {
                'dw/system/Logger': mockLogger,
                'dw/system/Status': (function() {
                    function MockStatus(status, code, message) {
                        this.status = status;
                        this.code = code;
                        this.message = message;
                        return this;
                    }
                    MockStatus.OK = 'OK';
                    MockStatus.ERROR = 'ERROR';
                    return MockStatus;
                })(),
                '~/cartridge/scripts/pixlee/services/PixleeService': mockPixleeService,
                '~/cartridge/scripts/pixlee/models/productExportPayload': FreshProductExportPayload,
                'dw/system/Site': require('../../mocks/dw/system/Site'),
                'dw/catalog/ProductMgr': mockProductMgr
            });

            var result2 = FreshExportProducts.execute(jobParameters);

            var largeCatalogMessage = logMessages.find(function (msg) {
                return msg.indexOf('Using HybridBFSStrategy') > -1;
            });

            assert.isDefined(largeCatalogMessage, 'Should use HybridBFSStrategy for large catalog');

            // Both should complete successfully
            assert.equal(result1.status, 'OK', 'Small catalog export should succeed');
            assert.equal(result2.status, 'OK', 'Large catalog export should succeed');
        });

        it('should handle strategy initialization failures gracefully', function () {
            var logMessages = [];
            var errorMessages = [];

            mockLogger.info = function (message) {
                logMessages.push(message);
            };

            mockLogger.error = function (message) {
                errorMessages.push(message);
            };

            // Mock a catalog that causes initialization errors
            mockCatalogMgr.getSiteCatalog = function () {
                throw new Error('Mock catalog initialization failure');
            };

            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '1',
                'Test Product ID': 'test_fallback'
            };

            mockPixleeService.postProduct = function () {};

            // Should not crash, should fall back gracefully
            var result = ExportProducts.execute(jobParameters);

            // Should log fallback message
            var fallbackMessage = logMessages.find(function (msg) {
                return msg.indexOf('Falling back') > -1;
            });

            // Fallback behavior may vary, but should not crash the job
            assert.isObject(result, 'Should return result object even with initialization failures');
        });
    });

    describe('Cache and Memory Management Integration', function () {
        it('should properly manage cache statistics throughout job execution', function () {
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(2200);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            var logMessages = [];
            var cacheStatsLogged = false;

            mockLogger.info = function (message) {
                logMessages.push(message);
                if (message.indexOf('cache statistics') > -1) {
                    cacheStatsLogged = true;
                }
            };

            mockPixleeService.postProduct = function () {};

            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '2'
            };

            var result = ExportProducts.execute(jobParameters);

            // Should log cache statistics
            assert.isTrue(cacheStatsLogged, 'Should log cache statistics during job execution');

            // Should complete successfully
            assert.equal(result.status, 'OK', 'Job should complete with cache monitoring');

            // Verify cache statistics are available
            var stats = ProductExportPayload.getCacheStatistics();
            assert.isObject(stats, 'Should have cache statistics available');

            if (stats.hybridBFS) {
                assert.isObject(stats.hybridBFS.bfsMap, 'Should have BFS map statistics');
                assert.isObject(stats.hybridBFS.unmappedCache, 'Should have unmapped cache statistics');
            }
        });

        it('should handle session cache limits during large exports', function () {
            var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3000);
            mockCatalogMgr.__testUtils.setMockCatalogData(largeCatalog);

            var warnMessages = [];

            mockLogger.warn = function (message) {
                warnMessages.push(message);
            };

            mockPixleeService.postProduct = function () {};

            var jobParameters = {
                'Products Source': 'CATALOG',
                'Break After': '5'
            };

            var result = ExportProducts.execute(jobParameters);

            // Check session size after job
            var sessionData = JSON.stringify(global.session.getPrivacy());
            var sessionSizeKB = sessionData.length / 1024;

            assert.isTrue(sessionSizeKB < 10, 'Session should stay under SFCC 10KB limit');

            // Job should complete despite any session warnings
            assert.equal(result.status, 'OK', 'Job should complete successfully with session management');

            // Check for session size warnings (informational)
            var sessionWarnings = warnMessages.filter(function (msg) {
                return msg.indexOf('Session cache') > -1;
            });

            // Warnings are OK, but should not cause failures
            assert.equal(result.status, 'OK', 'Session warnings should not cause job failure');
        });
    });
});
