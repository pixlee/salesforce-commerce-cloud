'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Import test utilities
require('../../../mocks/globals');

describe('ExportProducts Job', function () {
    var ExportProducts;
    var mockLogger;
    var mockStatus;
    var mockSite;
    var mockPixleeService;
    var mockProductExportPayload;
    var mockProductMgr;
    var mockProductSearchModel;

    beforeEach(function () {
        // Reset global mocks
        var mockGlobals = require('../../../mocks/globals');
        mockGlobals.resetGlobals();

        // Setup Logger mock
        mockLogger = require('../../../mocks/dw/system/Logger');
        mockLogger.__testUtils.clearLogs();

        // Setup Status mock
        mockStatus = function (status, code, message) {
            this.status = status;
            this.code = code;
            this.message = message;
        };
        mockStatus.OK = 'OK';
        mockStatus.ERROR = 'ERROR';

        // Setup Site mock
        mockSite = {
            ID: 'test-site',
            getCustomPreferenceValue: function (key) {
                var preferences = {
                    'PixleeEnabled': true,
                    'PixleePrivateApiKey': 'test-private-key',
                    'PixleeSecretKey': 'test-secret-key'
                };
                return preferences[key];
            },
            getCurrent: function () {
                return this;
            }
        };

        // Setup PixleeService mock
        mockPixleeService = {
            notifications: [],
            notifyExportStatus: function (status, jobId, totalProducts) {
                var notification = {
                    status: status,
                    jobId: jobId,
                    totalProducts: totalProducts
                };
                this.notifications.push(notification);
                this.lastNotification = notification;
            },
            postProduct: function (productPayload) {
                this.lastPostedProduct = productPayload;
                if (productPayload.product && productPayload.product.sku === 'fail-product') {
                    throw new Error('Simulated export failure');
                }
            },
            lastNotification: null,
            lastPostedProduct: null
        };

        // Setup ProductExportPayload mock
        mockProductExportPayload = function (product, options) {
            this.product = {
                sku: product.ID,
                name: product.name || 'Test Product',
                native_product_id: product.ID
            };
            this.title = product.name || 'Test Product';
        };
        mockProductExportPayload.preInitializeCategoryProcessing = function () {
            // Simulate successful initialization
        };
        mockProductExportPayload.getCacheStatistics = function () {
            return {
                strategyType: 'SingleMapStrategy',
                moduleCache: { categoryMapExists: true }
            };
        };

        // Setup ProductMgr mock
        mockProductMgr = {
            getProduct: function (productId) {
                if (productId === 'non-existent') {
                    return null;
                }
                return {
                    ID: productId,
                    name: 'Test Product ' + productId,
                    online: true,
                    searchable: true,
                    variant: false
                };
            },
            queryAllSiteProducts: function () {
                return {
                    count: 3,
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {
                        // Mock close
                    },
                    _index: 0,
                    _products: [
                        { ID: 'product-1', name: 'Product 1', online: true, searchable: true, variant: false },
                        { ID: 'product-2', name: 'Product 2', online: true, searchable: true, variant: false },
                        { ID: 'product-3', name: 'Product 3', online: true, searchable: true, variant: false }
                    ]
                };
            }
        };

        // Setup ProductSearchModel mock
        mockProductSearchModel = function () {
            this.categoryID = null;
            this.count = 2;
        };
        mockProductSearchModel.prototype.search = function () {
            // Mock search
        };
        mockProductSearchModel.prototype.getProductSearchHits = function () {
            return {
                hasNext: function () {
                    return this._index < this._hits.length;
                },
                next: function () {
                    return this._hits[this._index++];
                },
                _index: 0,
                _hits: [
                    { product: { ID: 'search-product-1', name: 'Search Product 1', online: true, searchable: true, variant: false } },
                    { product: { ID: 'search-product-2', name: 'Search Product 2', online: true, searchable: true, variant: false } }
                ]
            };
        };

        // Load ExportProducts with mocks
        ExportProducts = proxyquire('../../../../cartridges/int_pixlee_core/cartridge/scripts/pixlee/jobs/ExportProducts', {
            'dw/system/Logger': mockLogger,
            'dw/system/Status': mockStatus,
            'dw/system/Site': mockSite,
            'dw/catalog/ProductMgr': mockProductMgr,
            'dw/catalog/ProductSearchModel': mockProductSearchModel,
            'dw/util/UUIDUtils': require('../../../mocks/dw/util/UUIDUtils'),
            '~/cartridge/scripts/pixlee/services/PixleeService': mockPixleeService,
            '~/cartridge/scripts/pixlee/models/productExportPayload': mockProductExportPayload
        });
    });

    describe('Job Configuration Validation', function () {
        it('should return OK status when Pixlee is disabled', function () {
            mockSite.getCustomPreferenceValue = function (key) {
                if (key === 'PixleeEnabled') return false;
                return 'test-value';
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should return OK status');
            assert.equal(result.code, 'OK', 'Should return OK code');
            assert.include(result.message, 'disabled', 'Should indicate Pixlee is disabled');
        });

        it('should return ERROR status when Private API Key is missing', function () {
            mockSite.getCustomPreferenceValue = function (key) {
                if (key === 'PixleeEnabled') return true;
                if (key === 'PixleePrivateApiKey') return null;
                return 'test-value';
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'ERROR', 'Should return ERROR status');
            assert.equal(result.code, 'FINISHED_WITH_WARNINGS', 'Should return FINISHED_WITH_WARNINGS code');
            assert.include(result.message, 'Private API Key', 'Should indicate missing Private API Key');
        });

        it('should return ERROR status when Secret Key is missing', function () {
            mockSite.getCustomPreferenceValue = function (key) {
                if (key === 'PixleeEnabled') return true;
                if (key === 'PixleePrivateApiKey') return 'test-key';
                if (key === 'PixleeSecretKey') return null;
                return 'test-value';
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'ERROR', 'Should return ERROR status');
            assert.equal(result.code, 'FINISHED_WITH_WARNINGS', 'Should return FINISHED_WITH_WARNINGS code');
            assert.include(result.message, 'Secret Key', 'Should indicate missing Secret Key');
        });
    });

    describe('Product Source Selection', function () {
        it('should use ProductMgr.queryAllSiteProducts when not using search index', function () {
            var jobParameters = {
                'Products Source': 'ALL_PRODUCTS'
            };

            var result = ExportProducts.execute(jobParameters);

            assert.equal(result.status, 'OK', 'Should complete successfully');
            assert.equal(mockPixleeService.lastNotification.totalProducts, 3, 'Should process all site products');
        });

        it('should use ProductSearchModel when using search index', function () {
            var jobParameters = {
                'Products Source': 'SEARCH_INDEX'
            };

            var result = ExportProducts.execute(jobParameters);

            assert.equal(result.status, 'OK', 'Should complete successfully');
            assert.equal(mockPixleeService.lastNotification.totalProducts, 2, 'Should process search index products');
        });

        it('should use SingleProductIterator for test product', function () {
            var jobParameters = {
                'Test Product ID': 'test-product-123'
            };

            var result = ExportProducts.execute(jobParameters);

            assert.equal(result.status, 'OK', 'Should complete successfully');
            assert.equal(mockPixleeService.lastNotification.totalProducts, 1, 'Should process single test product');
        });
    });

    describe('Export Options Processing', function () {
        it('should handle image view type option', function () {
            var jobParameters = {
                'Images View Type': 'medium'
            };

            var result = ExportProducts.execute(jobParameters);

            assert.equal(result.status, 'OK', 'Should complete successfully');
            // Verify that export options were passed correctly (implementation-dependent)
        });

        it('should handle regional-only export for non-main sites', function () {
            mockSite.ID = 'regional-site';
            var jobParameters = {
                'Main site ID': 'main-site'
            };

            var result = ExportProducts.execute(jobParameters);

            assert.equal(result.status, 'OK', 'Should complete successfully');
            // Verify that onlyRegionalDetails option was set (implementation-dependent)
        });

        it('should handle break after parameter', function () {
            // Mock a product that will fail
            mockProductMgr.queryAllSiteProducts = function () {
                return {
                    count: 2,
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {},
                    _index: 0,
                    _products: [
                        { ID: 'fail-product', name: 'Fail Product', online: true, searchable: true, variant: false },
                        { ID: 'fail-product', name: 'Fail Product 2', online: true, searchable: true, variant: false }
                    ]
                };
            };

            var jobParameters = {
                'Break After': '1'
            };

            var result = ExportProducts.execute(jobParameters);

            assert.equal(result.status, 'ERROR', 'Should return ERROR status after consecutive failures');
        });
    });

    describe('Product Processing', function () {
        it('should only process online, searchable, non-variant products', function () {
            mockProductMgr.queryAllSiteProducts = function () {
                return {
                    count: 4,
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {},
                    _index: 0,
                    _products: [
                        { ID: 'online-product', name: 'Online Product', online: true, searchable: true, variant: false },
                        { ID: 'offline-product', name: 'Offline Product', online: false, searchable: true, variant: false },
                        { ID: 'unsearchable-product', name: 'Unsearchable Product', online: true, searchable: false, variant: false },
                        { ID: 'variant-product', name: 'Variant Product', online: true, searchable: true, variant: true }
                    ]
                };
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully');
            // Only the first product should be processed
            assert.equal(mockPixleeService.lastPostedProduct.product.sku, 'online-product', 'Should only process eligible products');
        });

        it('should handle product export failures gracefully', function () {
            mockProductMgr.queryAllSiteProducts = function () {
                return {
                    count: 2,
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {},
                    _index: 0,
                    _products: [
                        { ID: 'fail-product', name: 'Fail Product', online: true, searchable: true, variant: false },
                        { ID: 'success-product', name: 'Success Product', online: true, searchable: true, variant: false }
                    ]
                };
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'ERROR', 'Should return ERROR status with warnings');
            assert.equal(result.code, 'FINISHED_WITH_WARNINGS', 'Should indicate warnings');
            assert.include(result.message, 'failed to export', 'Should indicate export failures');
        });

        it('should log progress at appropriate intervals', function () {
            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully');

            var logs = mockLogger.__testUtils.getLogMessages('info');
            assert.isTrue(logs.length > 0, 'Should have logged progress information');

            // Check for specific log patterns
            var hasProgressLog = logs.some(function (log) {
                return log.includes('Processing product') || log.includes('successfully exported');
            });
            assert.isTrue(hasProgressLog, 'Should have logged processing progress');
        });

        it('should handle unknown total product count gracefully', function () {
            // Mock iterator that returns undefined for getCount() (simulating unknown total)
            mockProductMgr.queryAllSiteProducts = function () {
                return {
                    count: undefined, // Simulate unknown count
                    getCount: function () {
                        return undefined; // This will cause totalProductsToProcess to be undefined
                    },
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {},
                    _index: 0,
                    _products: [
                        { ID: 'test-product-1', name: 'Test Product 1', online: true, searchable: true, variant: false },
                        { ID: 'test-product-2', name: 'Test Product 2', online: true, searchable: true, variant: false }
                    ]
                };
            };

            var result = ExportProducts.execute({});

            // Should complete successfully even with unknown total count
            assert.equal(result.status, 'OK', 'Should complete successfully with unknown total count');

            // Check that logs show "unknown" instead of "undefined"
            var logs = mockLogger.__testUtils.getLogMessages('info');
            var hasUnknownLog = logs.some(function (log) {
                return log.includes('/unknown') && log.includes('Processing product');
            });
            assert.isTrue(hasUnknownLog, 'Should log "unknown" for total count when count is unavailable');

            // Verify no NaN values in logs
            var hasNaNLog = logs.some(function (log) {
                return log.includes('NaN');
            });
            assert.isFalse(hasNaNLog, 'Should not have any NaN values in logs');
        });
    });

    describe('Category Processing Integration', function () {
        it('should pre-initialize category processing', function () {
            var preInitCalled = false;
            mockProductExportPayload.preInitializeCategoryProcessing = function () {
                preInitCalled = true;
            };

            var result = ExportProducts.execute({});

            assert.isTrue(preInitCalled, 'Should call preInitializeCategoryProcessing');
            assert.equal(result.status, 'OK', 'Should complete successfully');
        });

        it('should handle category processing initialization failures gracefully', function () {
            mockProductExportPayload.preInitializeCategoryProcessing = function () {
                throw new Error('Category processing failed');
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully despite category init failure');

            var logs = mockLogger.__testUtils.getLogMessages('warn');
            var hasCategoryWarning = logs.some(function (log) {
                return log.includes('Failed to build category processing');
            });
            assert.isTrue(hasCategoryWarning, 'Should log category processing warning');
        });

        it('should log final cache statistics', function () {
            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully');

            var logs = mockLogger.__testUtils.getLogMessages('info');
            var hasCacheStats = logs.some(function (log) {
                return log.includes('Final cache statistics');
            });
            assert.isTrue(hasCacheStats, 'Should log final cache statistics');
        });
    });

    describe('Service Integration', function () {
        it('should notify export status at start', function () {
            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully');
            assert.isTrue(mockPixleeService.notifications.length >= 2, 'Should have multiple notifications');

            var startedNotification = mockPixleeService.notifications.find(function(n) { return n.status === 'started'; });
            assert.isNotNull(startedNotification, 'Should have started notification');
            assert.equal(startedNotification.status, 'started', 'Should notify started status');
            assert.isString(startedNotification.jobId, 'Should include job ID');
        });

        it('should post products to Pixlee service', function () {
            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully');
            assert.isNotNull(mockPixleeService.lastPostedProduct, 'Should have posted product to service');
            assert.isObject(mockPixleeService.lastPostedProduct.product, 'Should have product data');
        });
    });

    describe('Error Handling', function () {
        it('should return error when no products are exported', function () {
            mockProductMgr.queryAllSiteProducts = function () {
                return {
                    count: 1,
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {},
                    _index: 0,
                    _products: [
                        { ID: 'offline-product', name: 'Offline Product', online: false, searchable: true, variant: false }
                    ]
                };
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'ERROR', 'Should return ERROR status');
            // The message might be an Error object, so handle both cases
            var messageText = result.message instanceof Error ? result.message.message : result.message;
            assert.isString(messageText, 'Should have error message text');
            assert.include(messageText, 'No products exported', 'Should indicate no products were exported');
        });

        it('should handle iterator close failures gracefully', function () {
            mockProductMgr.queryAllSiteProducts = function () {
                return {
                    count: 1,
                    hasNext: function () {
                        return this._index < this._products.length;
                    },
                    next: function () {
                        return this._products[this._index++];
                    },
                    close: function () {
                        throw new Error('Iterator close failed');
                    },
                    _index: 0,
                    _products: [
                        { ID: 'test-product', name: 'Test Product', online: true, searchable: true, variant: false }
                    ]
                };
            };

            var result = ExportProducts.execute({});

            assert.equal(result.status, 'OK', 'Should complete successfully despite iterator close failure');

            var logs = mockLogger.__testUtils.getLogMessages('error');
            var hasIteratorError = logs.some(function (log) {
                return log.includes('Failed to close iterator');
            });
            assert.isTrue(hasIteratorError, 'Should log iterator close error');
        });
    });
});
