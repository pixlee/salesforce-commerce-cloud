# int_pixlee: Emplifi UGC SiteGenesis Cartridge (Deprecated)

> [!WARNING]
> **This cartridge is deprecated.** Salesforce stopped supporting SiteGenesis in 2020. This cartridge is maintained for legacy implementations only. New implementations should use `int_pixlee_sfra` for SFRA-based storefronts.

[![Version](https://img.shields.io/badge/version-1.5.1-blue.svg)](../../package.json)
[![Status](https://img.shields.io/badge/status-deprecated-red.svg)](https://help.salesforce.com/s/articleView?id=sf.rn_cc_sitegenesis_eol.htm&type=5)

This cartridge provides SiteGenesis-specific components for integrating Emplifi's User Generated Content (UGC) platform
with Salesforce Commerce Cloud SiteGenesis storefronts.

## Table of Contents

- [Overview](#overview)
- [Deprecation Notice](#deprecation-notice)
- [Dependencies](#dependencies)
- [Components](#components)
- [Installation](#installation)
- [Cartridge Path](#cartridge-path)
- [Migration Guide](#migration-guide)

## Overview

`int_pixlee` extends `int_pixlee_core` with SiteGenesis-specific implementations, including:

- **SiteGenesis Controllers**: Route handlers for Pixlee events
- **Pipelets**: Order processing pipelets for event tracking
- **SiteGenesis Templates**: Integration with SiteGenesis page structure
- **Helpers**: SiteGenesis-specific helper functions

## Deprecation Notice

### End of Life

Salesforce announced the end of life for SiteGenesis in 2020. This cartridge is provided for:

- **Legacy Support**: Existing SiteGenesis implementations that cannot migrate immediately
- **Reference**: Historical reference for understanding the integration architecture

### Migration Recommendation

**All new implementations must use `int_pixlee_sfra`** for SFRA-based storefronts. If you are currently using this cartridge, plan to migrate to SFRA and `int_pixlee_sfra` as soon as possible.

For migration assistance, see:
- [SFRA Migration Guide](https://developer.salesforce.com/docs/commerce/sfra/guide/b2c-sfra-migration-guide.html)
- [Emplifi SFRA Cartridge Documentation](../int_pixlee_sfra/README.md)

## Dependencies

### Required Cartridges

- **int_pixlee_core**: Core functionality (service definitions, job steps, shared helpers)
- **client_sitegenesis_controllers**: SiteGenesis controllers cartridge
- **client_sitegenesis_core**: SiteGenesis core cartridge

## Components

### Controllers

Located in `cartridge/controllers/`:

- **PixleeEvents.js**: Handles Pixlee event tracking endpoints for SiteGenesis

### Scripts

Located in `cartridge/scripts/pixlee/`:

- **helpers/currencyLookupHelper.js**: Currency conversion utilities
- **helpers/eventsHelper.js**: Event tracking helper functions
- **pipelets/ProcessAddProductListItem.js**: Pipelet for processing add-to-cart events

### Templates

Located in `cartridge/templates/default/pixlee/`:

- **events/**: Event tracking templates
  - `init.isml`: Initialization script
  - `addtocart.isml`: Add to cart event template
  - `confirmation.isml`: Order confirmation event template
- **widgets/**: Widget display templates
  - `pdp.isml`: Product Detail Page widget
  - `clp.isml`: Category Landing Page widget

### Resources

- **templates/resources/pixlee.properties**: Localization strings

## Installation

### Prerequisites

1. **SiteGenesis Storefront**: This cartridge requires an existing SiteGenesis implementation
2. **Core Cartridge**: Ensure `int_pixlee_core` is available

### Step 1: Upload Cartridges

Upload both `int_pixlee_core` and `int_pixlee`:

```bash
npm run uploadSiteGen
```

This command uploads both cartridges to the environment specified in `dw.json`.

### Step 2: Configure Cartridge Path

1. In Business Manager, navigate to **Administration > Sites > Manage Sites**
2. Select your site and go to the **Settings** tab
3. Update the **Cartridges** field:

   ```
   client_sitegenesis_controllers:client_sitegenesis_core:int_pixlee:int_pixlee_core
   ```

   > **Note**: Adjust the path based on your specific SiteGenesis cartridge structure.

4. Click **Apply**

### Step 3: Import Metadata

If not already done, import the metadata (see main [README.md](../../README.md) for details).

### Step 4: Configure Site Preferences

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

## Cartridge Path

### Recommended Path

```
client_sitegenesis_controllers:client_sitegenesis_core:int_pixlee:int_pixlee_core
```

### Path Explanation

- **client_sitegenesis_controllers**: SiteGenesis controllers cartridge
- **client_sitegenesis_core**: SiteGenesis core cartridge
- **int_pixlee**: This cartridge (SiteGenesis-specific components)
- **int_pixlee_core**: Core shared functionality

### Why This Order?

1. `int_pixlee` must be to the left of `int_pixlee_core` to allow overriding core templates
2. `int_pixlee_core` provides shared services used by `int_pixlee`

## Migration Guide

### Why Migrate?

- **Support**: SiteGenesis is no longer supported by Salesforce
- **Features**: SFRA receives regular updates and new features
- **Performance**: SFRA offers improved performance and modern architecture
- **Community**: Active development and community support for SFRA

### Migration Steps

1. **Plan Migration**: Review your SiteGenesis implementation and plan the migration to SFRA
2. **Set Up SFRA**: Install and configure SFRA base cartridge
3. **Install SFRA Cartridge**: Deploy `int_pixlee_sfra` instead of `int_pixlee`
4. **Update Templates**: Migrate custom templates to SFRA structure
5. **Test Integration**: Verify Pixlee widgets and events work correctly
6. **Decommission**: Remove `int_pixlee` cartridge after successful migration

### Resources

- **SFRA Migration Guide**: [Salesforce Documentation](https://developer.salesforce.com/docs/commerce/sfra/guide/b2c-sfra-migration-guide.html)
- **SFRA Cartridge README**: [../int_pixlee_sfra/README.md](../int_pixlee_sfra/README.md)
- **SFRA Repository**: [https://github.com/SalesforceCommerceCloud/storefront-reference-architecture](https://github.com/SalesforceCommerceCloud/storefront-reference-architecture)

## Additional Resources

- **Main Project README**: [../../README.md](../../README.md)
- **Core Cartridge README**: [../int_pixlee_core/README.md](../int_pixlee_core/README.md)
- **SFRA Cartridge README**: [../int_pixlee_sfra/README.md](../int_pixlee_sfra/README.md)
- **Developer Documentation**: [https://developers.pixlee.com/docs/salesforce-commerce-cloud-demandware](https://developers.pixlee.com/docs/salesforce-commerce-cloud-demandware)
- **SiteGenesis EOL Notice**: [Salesforce Help Article](https://help.salesforce.com/s/articleView?id=sf.rn_cc_sitegenesis_eol.htm&type=5)

---

**⚠️ Important**: This cartridge is deprecated. Use `int_pixlee_sfra` for all new implementations and plan migration for existing SiteGenesis implementations.
