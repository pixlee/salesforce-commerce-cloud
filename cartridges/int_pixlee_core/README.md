# int_pixlee_core: Emplifi UGC Core Cartridge

[![Version](https://img.shields.io/badge/version-1.5.1-blue.svg)](../../package.json)

The core cartridge contains shared functionality used by both SFRA and SiteGenesis implementations of the Emplifi UGC integration.

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Components](#components)
- [Deployment](#deployment)
- [Cartridge Path](#cartridge-path)
- [Architecture](#architecture)

## Overview

`int_pixlee_core` provides the foundational components for Emplifi UGC integration, including:

- **Service Definition**: HTTP service configuration for Pixlee API communication
- **Job Step Components**: Product export job step type (`custom.PixleeExportProducts`)
- **Helper Scripts**: Reusable utility functions for currency lookup, Pixlee operations, and data transformation
- **Models**: Data models for events and product export payloads
- **ISML Templates**: Reusable template modules for widgets (PDP, CLP)
- **Resources**: Localization and configuration resources

## Dependencies

This cartridge has **no dependencies** on other cartridges. It is designed to be self-contained and reusable.

## Components

### Service Definition

- **Service**: `pixlee.http.service`
  - Configured in metadata import
  - Handles HTTP communication with Pixlee API
  - Includes request signing and authentication

### Job Step Type

- **Step Type**: `custom.PixleeExportProducts`
  - Defined in `steptypes.json`
  - Exports products to Pixlee platform
  - Supports chunked processing for large catalogs
  - Configurable parameters:
    - Products Source (CATALOG_API or SEARCH_INDEX)
    - Images View Type
    - Main Site ID
    - Test Product ID (for testing)
    - Break After (error handling)

### Script Modules

Located in `cartridge/scripts/pixlee/`:

- **services/PixleeService.js**: Service wrapper for Pixlee API calls
- **jobs/ExportProducts.js**: Product export job implementation
- **models/eventModel.js**: Event data model
- **models/productExportPayload.js**: Product export payload builder
- **helpers/pixleeHelper.js**: Core Pixlee utility functions
- **helpers/currencyLookupHelper.js**: Currency conversion utilities

### Templates

Located in `cartridge/templates/default/pixlee/`:

- **components/widgets/pdpWidgetModule.isml**: Product Detail Page widget module
- **components/widgets/clpWidgetModule.isml**: Category Landing Page widget module
- **components/modules.isml**: Common module includes

### Resources

- **templates/resources/pixlee.properties**: Localization strings

## Deployment

This cartridge **cannot be used standalone**. It must be deployed alongside either:

- `int_pixlee_sfra` for SFRA-based applications
- `int_pixlee` for SiteGenesis applications (deprecated)

### Upload Process

**For SFRA:**
```bash
npm run uploadCartridge
```
This command uploads both `int_pixlee_core` and `int_pixlee_sfra`.

**For SiteGenesis:**
```bash
npm run uploadSiteGen
```
This command uploads both `int_pixlee_core` and `int_pixlee`.

## Cartridge Path

### Placement Rules

The `int_pixlee_core` cartridge should be placed **to the right** of application-specific cartridges in the cartridge path. This ensures proper namespace resolution and allows application cartridges to override core functionality if needed.

### Recommended Paths

**For SFRA:**
```
app_client:int_pixlee_sfra:int_pixlee_core:app_storefront_base:modules
```

**For SiteGenesis (deprecated):**
```
client_sitegenesis_controllers:client_sitegenesis_core:int_pixlee:int_pixlee_core
```

### Why Right Placement?

- `int_pixlee_core` uses its own namespace (`int_pixlee_core`)
- It does not override any base cartridge components
- Application cartridges (`int_pixlee_sfra` or `int_pixlee`) may need to override core templates or scripts
- Right placement ensures core functionality is available but can be extended

## Architecture

### Namespace

All components use the `int_pixlee_core` namespace to avoid conflicts:

### Extension Points

Application-specific cartridges can:

1. **Override Templates**: Place templates with the same path in application cartridge
2. **Extend Scripts**: Require and extend core script modules
3. **Add Controllers**: Add platform-specific controllers that use core services

## Additional Resources

- **Main Project README**: [../../README.md](../../README.md)
- **Developer Documentation**: [https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware)
- **SFRA Cartridge**: [../int_pixlee_sfra/README.md](../int_pixlee_sfra/README.md)
- **SiteGenesis Cartridge**: [../int_pixlee/README.md](../int_pixlee/README.md) (deprecated)

---

**Note**: This cartridge is maintained as part of the Emplifi SFCC integration suite. For issues or questions, refer to the main project documentation.
