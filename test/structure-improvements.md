# Test Structure Improvements

## Recommended Optimizations for Centralized Test Structure

### 1. Organize by Cartridge Within Central Directory

```
test/
├── unit/
│   ├── int_pixlee/           # Tests for int_pixlee cartridge
│   │   └── controllers/
│   │       └── PixleeEvents.js
│   ├── int_pixlee_core/      # Tests for int_pixlee_core cartridge  
│   │   ├── jobs/
│   │   │   └── ExportProducts.js
│   │   ├── models/
│   │   │   └── productExportPayload.js
│   │   └── services/
│   │       └── PixleeService.js
│   └── int_pixlee_sfra/      # Tests for int_pixlee_sfra cartridge
│       └── models/
│           └── product/
│               └── fullProduct.js
├── integration/
│   ├── pixlee/               # Cross-cartridge integration tests
│   │   ├── largeCatalogBugFix.js
│   │   └── addToCartData.js
│   ├── core/                 # int_pixlee_core specific integration
│   └── sfra/                 # int_pixlee_sfra specific integration
├── mocks/
│   ├── dw/                   # Shared SFCC mocks
│   ├── cartridge-specific/   # Cartridge-specific mocks
│   │   ├── int_pixlee/
│   │   ├── int_pixlee_core/
│   │   └── int_pixlee_sfra/
│   └── shared/               # Cross-cartridge shared mocks
└── utils/
    ├── test-helpers.js       # Shared test utilities
    └── cartridge-loaders.js  # Dynamic cartridge loading
```

### 2. Cartridge-Specific Test Scripts

Add to package.json:
```json
{
  "scripts": {
    "test": "sgmf-scripts --test test/unit/**/*.js",
    "test:core": "sgmf-scripts --test test/unit/int_pixlee_core/**/*.js",
    "test:sfra": "sgmf-scripts --test test/unit/int_pixlee_sfra/**/*.js", 
    "test:base": "sgmf-scripts --test test/unit/int_pixlee/**/*.js",
    "test:integration": "sgmf-scripts --integration test/integration/**/*.js",
    "test:integration:core": "sgmf-scripts --integration test/integration/core/**/*.js",
    "test:cartridge": "npm run test:core && npm run test:sfra && npm run test:base"
  }
}
```

### 3. Improved Mock Organization

```
mocks/
├── dw/                       # Core SFCC API mocks (shared)
│   ├── catalog/
│   ├── system/
│   └── web/
├── cartridges/               # Cartridge-specific mocks
│   ├── int_pixlee_core/
│   │   └── services/
│   │       └── PixleeService.js
│   └── int_pixlee_sfra/
│       └── models/
└── fixtures/                 # Test data fixtures
    ├── products.json
    ├── categories.json
    └── orders.json
```

### 4. Test Configuration by Cartridge

```javascript
// test/config/cartridge-config.js
module.exports = {
    int_pixlee_core: {
        testPattern: 'test/unit/int_pixlee_core/**/*.js',
        mockPath: 'test/mocks/cartridges/int_pixlee_core',
        coverage: {
            threshold: 80
        }
    },
    int_pixlee_sfra: {
        testPattern: 'test/unit/int_pixlee_sfra/**/*.js', 
        mockPath: 'test/mocks/cartridges/int_pixlee_sfra',
        coverage: {
            threshold: 85
        }
    }
};
```

### 5. Enhanced Test Runner

```javascript
// test/run-cartridge-tests.js
#!/usr/bin/env node

const config = require('./config/cartridge-config');

function runCartridgeTests(cartridgeName) {
    const cartridgeConfig = config[cartridgeName];
    // Run tests specific to cartridge
    // Apply cartridge-specific mocks
    // Report cartridge-specific coverage
}

// Usage: node test/run-cartridge-tests.js int_pixlee_core
```
