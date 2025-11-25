# int_pixlee_sfra: Emplifi UGC SFRA Cartridge

[![Version](https://img.shields.io/badge/version-1.5.1-blue.svg)](../../package.json)
[![SFRA](https://img.shields.io/badge/SFRA-compatible-green.svg)](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture)

This cartridge provides SFRA-specific components for integrating Emplifi's User Generated Content (UGC) platform with Salesforce Commerce Cloud Storefront Reference Architecture (SFRA) storefronts.

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Components](#components)
- [Installation](#installation)
- [Configuration](#configuration)
- [Cartridge Path](#cartridge-path)
- [Development](#development)

## Overview

`int_pixlee_sfra` extends `int_pixlee_core` with SFRA-specific implementations, including:

- **SFRA Controllers**: Route handlers for cart and order events
- **Client-Side JavaScript**: Browser-side widgets and event tracking
- **Product Model Decorators**: Extensions to SFRA product models
- **SFRA Templates**: Integration with SFRA page structure and layout

## Dependencies

### Required Cartridges

- **int_pixlee_core**: Core functionality (service definitions, job steps, shared helpers)
- **app_storefront_base**: SFRA base cartridge (or your custom SFRA base)

### Node.js Dependencies

- Node.js >= 18 (see [../../.nvmrc](../../.nvmrc))
- All dependencies listed in [../../package.json](../../package.json)

## Installation

### Prerequisites

1. **SFRA Base Cartridge**: Ensure you have access to the SFRA base cartridge
   - Default path: `../storefront-reference-architecture/cartridges/app_storefront_base/`
   - Update `paths.base` in [../../package.json](../../package.json) if your path differs

2. **Install Dependencies**:
   ```bash
   npm install
   ```

### Step 1: Compile Client-Side Code

Compile the client-side JavaScript:

```bash
npm run compile:js
```

This compiles all JavaScript files in `cartridge/client/` using the build configuration.

> **Note**: This cartridge does not contain SCSS/stylesheets, so no SCSS compilation is required.

### Step 2: Configure dw.json

Create or update `dw.json` in the project root:

```json
{
    "hostname": "<your-hostname.demandware.net>",
    "username": "<username>",
    "password": "<your_webdav_access_key>",
    "code-version": "<version_to_upload_to>"
}
```

See the [SFRA repository](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture) for detailed `dw.json` configuration instructions.

### Step 3: Upload Cartridges

Upload both `int_pixlee_core` and `int_pixlee_sfra`:

```bash
npm run uploadCartridge
```

This command uploads both cartridges to the environment and code version specified in `dw.json`.

### Step 4: Configure Cartridge Path

1. In Business Manager, navigate to **Administration > Sites > Manage Sites**
2. Select your site and go to the **Settings** tab
3. Update the **Cartridges** field:

   ```
   app_client:int_pixlee_sfra:int_pixlee_core:app_storefront_base:modules
   ```

   > **Important**: Replace `app_client` with your custom client cartridge if applicable.

4. Click **Apply**

### Step 5: Import Metadata

If not already done, import the metadata (see main [README.md](../../README.md) for details).

## Configuration

### Site Preferences

Configure Pixlee preferences in Business Manager:

1. Navigate to **Merchant Tools > Site Preferences > Custom Preferences**
2. Set required preferences:
    1. Cartridge Configuration
        - `PixleeEnabled` to `True`
        - Additional preferences as needed
    2. API Access Credentials from [Pixlee Account](https://app.pixlee.com/app#settings/pixlee_api)
        - `PixleeAccountId` - Account ID
        - `PixleeApiKey` - Account API Key
        - `PixleePrivateApiKey` - Account Private API Key
        - `PixleeSecretKey` - Account Secret Key

See the [Pixlee Developer Documentation](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware#configuring-site-preferences) for complete configuration details.

### Widget Placement

The Pixlee widgets are automatically included in:

- **Product Detail Pages**: Via `product/productDetails.isml` template extension
- **Category Landing Pages**: Via `rendering/category/catLanding.isml` template extension

Widgets are initialized through client-side JavaScript that loads on page load.

## Cartridge Path

### Recommended Path

```
app_client:int_pixlee_sfra:int_pixlee_core:app_storefront_base:modules
```

### Path Explanation

- **app_client**: Your custom client cartridge (if applicable)
- **int_pixlee_sfra**: This cartridge (SFRA-specific components)
- **int_pixlee_core**: Core shared functionality
- **app_storefront_base**: SFRA base cartridge
- **modules**: SFRA modules

### Why This Order?

1. `int_pixlee_sfra` must be to the left of `int_pixlee_core` to allow overriding core templates
2. Both Pixlee cartridges should be to the left of `app_storefront_base` to extend SFRA templates
3. `int_pixlee_core` provides shared services and models used by `int_pixlee_sfra`

## Development

### Compiling Client-Side Code

The `paths.base` property in `package.json` must point to your SFRA base cartridge:

```json
{
  "paths": {
    "base": "../storefront-reference-architecture/cartridges/app_storefront_base/"
  }
}
```

### Watch Mode

Watch for changes and automatically upload:

```bash
npm run watch
```

### Linting

Lint JavaScript files:

```bash
npm run lint:js
```

Auto-fix linting issues:

```bash
npm run lint:fix
```

### Testing

Run tests for this cartridge:

```bash
npm run test:sfra
```

### Customization

#### Overriding Templates

To customize Pixlee templates:

1. Create a custom cartridge (e.g., `app_pixlee_custom`)
2. Place it to the left of `int_pixlee_sfra` in the cartridge path
3. Create templates with the same path structure:
   ```
   cartridge/templates/default/pixlee/widgets/pdp.isml
   ```

#### Extending Controllers

Extend Pixlee controllers in your custom cartridge:

```javascript
'use strict';

var base = module.superModule;
var pixleeEvents = require('int_pixlee_sfra/cartridge/controllers/PixleeEvents');

module.exports = pixleeEvents.extend({
    // Your customizations
});
```

#### Custom Widget Configuration

Modify widget initialization in client-side JavaScript:

```javascript
// In your custom cartridge's client/default/js/pixlee/widgets/pdp.js
var base = require('int_pixlee_sfra/cartridge/client/default/js/pixlee/widgets/pdp');

module.exports = {
    init: function() {
        base.init();
        // Your custom initialization
    }
};
```

## Additional Resources

- **Main Project README**: [../../README.md](../../README.md)
- **Core Cartridge README**: [../int_pixlee_core/README.md](../int_pixlee_core/README.md)
- **Developer Documentation**: [https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware)
- **SFRA Repository**: [https://github.com/SalesforceCommerceCloud/storefront-reference-architecture](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture)

---

**Note**: This cartridge requires `int_pixlee_core` to function. Always deploy both cartridges together.
