# Pixlee SFCC Integration Tests

This directory contains comprehensive tests for the Pixlee SFCC integration, including category processing, product export functionality, service integration, and SFCC compliance validation.

## Cartridge Architecture

This project follows SFCC's architecture pattern with three cartridges:

- **`int_pixlee_core`** - Shared business logic (jobs, models, services) used by both architectures
- **`int_pixlee_sfra`** - SFRA-specific implementation (controllers, models, templates)
- **`int_pixlee`** - SiteGenesis-specific implementation (controllers, pipelines, templates)

**Deployment**: Only two cartridges are uploaded per instance:
- **SFRA instances**: `int_pixlee_core` + `int_pixlee_sfra`
- **SiteGenesis instances**: `int_pixlee_core` + `int_pixlee`

## Test Structure

```
test/
├── unit/                           # Unit tests by cartridge
│   ├── int_pixlee_core/           # Shared business logic tests
│   │   ├── jobs/                  # Export jobs, batch processing
│   │   ├── models/                # Product models, category processing
│   │   │   └── productExportPayload.js    # Category strategy tests
│   │   └── services/              # Pixlee API integration
│   ├── int_pixlee_sfra/           # SFRA-specific tests
│   │   └── models/                # SFRA model decorators
│   └── int_pixlee/                # SiteGenesis-specific tests (if any)
├── integration/                    # End-to-end integration tests
│   └── pixlee/
│       └── categoryProcessing.js          # Cross-cartridge category processing
├── mocks/                          # Mock SFCC objects (shared)
│   ├── dw/                        # SFCC API mocks
│   │   ├── catalog/               # Catalog management
│   │   └── system/                # Site and system objects
│   └── globals.js                 # SFCC global objects
└── README.md                       # This file
```

## Test Categories

### Category Processing Tests
- **SFCC Compliance**: Ensures no `api.jsObjectSize` quota violations
- **Strategy Selection**: Validates correct strategy for different catalog sizes
- **Memory Management**: Tests caching and performance optimization
- **Scalability**: Verifies handling of enterprise-level catalogs

### Product Export Tests
- **Payload Generation**: Validates product data structure and content
- **Regional Processing**: Tests multi-locale and currency handling
- **API Integration**: Verifies service communication and error handling

### Service Integration Tests
- **Pixlee API**: Tests communication with Pixlee services
- **Error Handling**: Validates graceful failure and retry logic
- **Authentication**: Verifies API key and security handling

## Testing Strategy by Cartridge

### **`int_pixlee_core` (Shared Logic)**
- **Focus**: Business logic, jobs, services, models
- **Critical Tests**: Category processing (the >2000 categories fix), product export, API integration
- **Coverage**: High priority - this code runs on both SFRA and SiteGenesis

### **`int_pixlee_sfra` (SFRA-Specific)**
- **Focus**: SFRA controllers, model decorators, template integration
- **Tests**: SFRA-specific product model enhancements, controller logic
- **Coverage**: Medium priority - SFRA-only functionality

### **`int_pixlee` (SiteGenesis-Specific)**
- **Focus**: SiteGenesis controllers, pipelines, template integration
- **Tests**: SiteGenesis-specific implementations (if any)
- **Coverage**: Low priority - legacy architecture support

## Running the Tests

### Prerequisites

#### Node.js Version
This project requires **Node.js ≥18** for modern tooling (`sgmf-scripts@3`):

```bash
# Check your Node version
node --version

# Should show v18.x.x or higher
# If you have an older version, use nvm to upgrade:
nvm install 18
nvm use 18
```

**Important**: While tests run on Node 18+, SFCC server-side code is ES5-compatible for Rhino engine compatibility. ESLint enforces ES5 syntax for cartridge code and allows ES6+ for client-side code.

#### Dependencies
```bash
# Install dependencies (with correct Node version)
npm install
```

### Quick Start
```bash
# All unit tests
npm run test

# All integration tests
npm run test:integration

# With coverage
npm run cover

# Specific cartridge tests
npm run test:core          # int_pixlee_core (shared logic)
npm run test:sfra          # int_pixlee_sfra (SFRA-specific)
npm run test:sg            # int_pixlee (SiteGenesis-specific)

# Run specific test patterns
npm run test -- --grep "Category Strategy Tests"
npm run test:integration -- --grep "Large Catalog"
```

## Test Scenarios Covered

### 🔴 Critical SFCC Compliance Tests
- **Large Catalog Handling**: 3513+ categories (enterprise-level scenarios)
- **Threshold Boundary**: Exactly 1800 categories (CATEGORY_SAFETY_LIMIT)
- **Object Property Limits**: Verify no object exceeds 2000 properties
- **Strategy Selection**: Confirm correct strategy for catalog size
- **Memory Management**: Ensure efficient resource usage

### 📊 Strategy Selection Tests
- **Small Catalogs** (<1800 categories): `SingleMapStrategy`
- **Large Catalogs** (≥1800 categories): `HybridBFSStrategy`
- **Threshold Transition**: Proper strategy switching at 1800 category limit
- **Fallback Handling**: Graceful degradation on initialization failures

### 🚀 Performance & Scalability Tests
- **Large Catalogs**: Up to 10,000 categories
- **Memory Management**: Session cache stays under 10KB SFCC limit
- **Processing Time**: Reasonable performance for enterprise catalogs
- **Consistency**: Stable performance across multiple runs

### 🛡️ Edge Case Tests
- **No Categories**: Products without category assignments
- **Invalid Products**: Malformed product objects
- **Deep Hierarchies**: Complex category tree structures
- **Cache Limits**: Proper cache size management

## Test Results Interpretation

### ✅ Success Indicators
```
✓ should use SingleMapStrategy for catalogs under 1800 categories
✓ should handle threshold boundary without SFCC object size violations
✓ should use HybridBFSStrategy for catalogs over safety threshold
✓ should respect SFCC object property limits regardless of catalog size
✓ should handle large catalogs without exceeding SFCC api.jsObjectSize quota
✓ should handle threshold catalog size without exceeding SFCC object limits
✓ should scale to enterprise-level catalogs without memory issues
```

### ❌ Failure Indicators to Watch For
```
✗ api.jsObjectSize exceeded errors
✗ Strategy selection failures
✗ Memory limit violations
✗ Performance degradation
```

### 📋 Key Metrics Monitored
- **BFS Map Size**: Should stay ≤ 1950 properties
- **Unmapped Cache Size**: Should stay ≤ 300 properties
- **Session Cache Size**: Should stay < 10KB
- **Processing Time**: Should complete within reasonable limits
- **Strategy Selection**: Correct strategy for catalog size

## Mock Data Configuration

### Creating Test Catalogs
```javascript
// Small catalog (triggers SingleMapStrategy)
var smallCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(1700);

// Large catalog (triggers HybridBFSStrategy)
var largeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(3513);

// Huge catalog (stress test)
var hugeCatalog = mockCatalogMgr.__testUtils.createLargeCatalogMock(10000);
```

### Creating Test Products
```javascript
// Product with category assignments
var product = mockProductMgr.__testUtils.createMockProduct('test1', {
    categoryAssignments: ['cat1', 'cat2_0', 'cat3_1_2']
});

// Product without categories
var product = mockProductMgr.__testUtils.createMockProduct('no_cats', {
    categoryAssignments: []
});
```

## Debugging Test Failures

### Common Issues

1. **Mock Setup Problems**
   ```bash
   # Clear module cache if tests interfere with each other
   npm run test -- --no-cache
   ```

2. **Memory Limit Errors**
   ```javascript
   // Check session cache size in test output
   // Look for "Session cache approaching size limit" warnings
   ```

3. **Strategy Selection Issues**
   ```javascript
   // Verify category count detection in logs
   // Check for "Detected X categories" messages
   ```

### Verbose Logging
```bash
# Run tests with detailed logging
DEBUG=* npm run test:integration
```

## Continuous Integration

### Required Test Passes
All tests in this suite must pass before deploying the category processing fix:

1. **Unit Tests**: `npm run test`
2. **Integration Tests**: `npm run test:integration`
3. **Coverage**: `npm run cover` (should maintain >80% coverage)

### Performance Benchmarks
- **Small Catalog** (<1800 categories): <1 second
- **Large Catalog** (1800-5000 categories): <5 seconds
- **Huge Catalog** (5000+ categories): <10 seconds

## JavaScript Compatibility

### SFCC Rhino vs Node.js Environment

**Important**: SFCC runs on Rhino JavaScript engine (ES5 only), while tests run in Node.js (ES6+ supported).

✅ **All code uses ES5-compatible syntax** for consistency:
- **Cartridge Code**: Always ES5 (runs in SFCC Rhino)
- **Test Files**: ES5-compatible (runs in Node.js)
- **Test Runners**: ES5-compatible (runs in Node.js)
- **Mock Objects**: ES5-compatible (runs in Node.js)

```javascript
// ✅ GOOD - ES5 Compatible
function processCategories() {
    var results = categories.map(function(cat) {
        return cat.name;
    });
}

// ❌ BAD - ES6+ (won't work in SFCC)
const processCategories = () => {
    const results = categories.map(cat => cat.name);
}
```

**ESLint Configuration**: The project uses ESLint to enforce ES5 syntax for server-side code while allowing ES6+ for client-side JavaScript in the `client/` directories.

## Contributing

When adding new tests:

1. **Follow Naming Convention**: Descriptive test names explaining the scenario
2. **Use ES5 Syntax**: Ensure compatibility with SFCC Rhino engine
3. **Use Proper Mocks**: Leverage existing mock infrastructure
4. **Test Edge Cases**: Include boundary conditions and error scenarios
5. **Verify Cleanup**: Ensure tests don't interfere with each other
6. **Document Expected Behavior**: Clear assertions and error messages

## Related Documentation

- [SFCC Object Size Limits](https://documentation.b2c.commercecloud.salesforce.com/DOC1/topic/com.demandware.dochelp/DWAPI/scriptapi/html/api/class_TopLevel_Object.html)
- [Category Processing Strategies](../cartridges/int_pixlee_core/cartridge/scripts/pixlee/models/productExportPayload.js)
- [Export Job Implementation](../cartridges/int_pixlee_core/cartridge/scripts/pixlee/jobs/ExportProducts.js)
