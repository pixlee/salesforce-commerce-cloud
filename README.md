# Emplifi UGC for Salesforce Commerce Cloud

[![Version](https://img.shields.io/badge/version-1.5.1-blue.svg)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](.nvmrc)

This repository contains Salesforce Commerce Cloud (SFCC) cartridges that integrate Emplifi's User Generated Content
(UGC) platform with both Storefront Reference Architecture (SFRA) and SiteGenesis storefronts.

## Table of Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Cartridge Structure](#cartridge-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Development](#development)
- [Support](#support)

## Overview

The Emplifi UGC integration enables merchants to display curated UGC (photos & videos) collected from social media
platforms like Instagram, TikTok, X, Facebook, and more on their SFCC storefronts. 

The integration consists of three cartridges:
- **int_pixlee_core**: Shared core functionality used by both SFRA and SiteGenesis implementations
- **int_pixlee_sfra**: SFRA-specific implementation for modern SFCC storefronts
- **int_pixlee**: SiteGenesis implementation (deprecated - Salesforce stopped supporting SiteGenesis in 2020)

## Requirements

- **Node.js**: >= 18 (see [.nvmrc](.nvmrc) for version)
- **SFCC Environment**: Sandbox or production environment with Business Manager access
- **WebDAV Access**: WebDAV access key for cartridge upload (optional, will prompt if not provided)
- **SFRA**: For SFRA implementations, ensure you have SFRA base cartridge available

## Installation

### Prerequisites

1. **Download the Repository**
   ```bash
   git clone <repository-url>
   cd salesforce-commerce-cloud
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

### Step 1: Import Metadata

The metadata import includes:
- Extensions to SFCC system objects (site and organization preferences)
- Service definition (`pixlee.http.service`)
- Default job configurations

**To import metadata:**

1. Navigate to the `metadata` folder and create a zip file of the `pixlee_site_template` directory
2. In SFCC Business Manager, navigate to **Administration > Site Development > Site Import & Export**
3. Click **Choose File** and select the zip file created in step 1
4. Click **Upload**
5. Select the uploaded file from the import list, click **Import**, and confirm with **OK**

**After successful import, you should see:**
- Pixlee site preferences in **Merchant Tools > Site Preferences > Custom Preferences**
- Pixlee organization preferences in **Administration > Global Preferences > Global Custom Preferences**
- Pixlee service definition (`pixlee.http.service`) in **Administration > Operations > Services**
- Jobs in **Administration > Operations > Jobs**:
  - `Pixlee Product Export – SFRA`
  - `Pixlee Product Export – SiteGenesis`

### Step 2: Configure Deployment

Create a `dw.json` file in the root directory with your SFCC environment details:

```json
{
    "hostname": "<your-hostname.demandware.net>",
    "username": "<username>",
    "password": "<your_webdav_access_key>",
    "code-version": "<version_to_upload_to>"
}
```

> **Note**: The password field is optional. If not provided, you will be prompted for your WebDAV access key during upload. See [SFCC documentation](https://help.salesforce.com/s/articleView?id=cc.b2c_access_keys_for_business_manager.htm&type=5) for creating access keys.

### Step 3: Upload Cartridges

**For SFRA implementations:**
```bash
npm run uploadCartridge
```
This uploads both `int_pixlee_core` and `int_pixlee_sfra` cartridges.

**For SiteGenesis implementations (deprecated):**
```bash
npm run uploadSiteGen
```
This uploads both `int_pixlee_core` and `int_pixlee` cartridges.

### Step 4: Configure Cartridge Path

1. In Business Manager, navigate to **Administration > Sites > Manage Sites**
2. Select your site and go to the **Settings** tab
3. Update the **Cartridges** field with the appropriate cartridge path:

   **For SFRA:**
   ```
   app_client:int_pixlee_sfra:int_pixlee_core:app_storefront_base:modules
   ```

   **For SiteGenesis (deprecated):**
   ```
   client_sitegenesis_controllers:client_sitegenesis_core:int_pixlee:int_pixlee_core
   ```

4. Click **Apply**

> **Important**: The cartridge order matters. Application-specific cartridges (`int_pixlee_sfra` or `int_pixlee`) must be placed to the left of `int_pixlee_core`.

## Configuration

### Site Preferences

Configure Pixlee site preferences in Business Manager:

1. Navigate to **Merchant Tools > Site Preferences > Custom Preferences**
2. Configure the following preferences:
   1. Cartridge Configuration
      - `PixleeEnabled` to `True`
      - Additional preferences as needed
   2. API Access Credentials from [Pixlee Account](https://app.pixlee.com/app#settings/pixlee_api)
      - `PixleeAccountId` - Account ID 
      - `PixleeApiKey` - Account API Key
      - `PixleePrivateApiKey` - Account Private API Key
      - `PixleeSecretKey` - Account Secret Key

For detailed configuration instructions, see the [Pixlee Developer Documentation](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware#configuring-site-preferences).

### Job Configuration

Configure product export jobs:

1. Navigate to **Administration > Operations > Jobs**
2. Select the appropriate job (`Pixlee Product Export – SFRA` or `Pixlee Product Export – SiteGenesis`)
3. Configure job parameters:
   - **Products Source**: `CATALOG_API` or `SEARCH_INDEX`
   - **Images View Type**: Product image view type (default: `large`)
   - **Main site ID**: ID of the main site for full product export
   - **Test Product ID**: (Optional) Single product ID for testing

For detailed job configuration, see the [Pixlee Developer Documentation](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware#configuring-jobs).

## Documentation

- **Online Documentation**: [Pixlee Developer Documentation for SFCC](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware)
- **Cartridge-Specific Documentation**: See individual cartridge README files:
  - [int_pixlee_core README](cartridges/int_pixlee_core/README.md)
  - [int_pixlee_sfra README](cartridges/int_pixlee_sfra/README.md)
  - [int_pixlee README](cartridges/int_pixlee/README.md) (SiteGenesis - deprecated)

## Development

### Available Scripts

- `npm install` - Install all dependencies
- `npm run compile:js` - Compile client-side JavaScript files
- `npm run uploadCartridge` - Upload SFRA cartridges (`int_pixlee_core` and `int_pixlee_sfra`)
- `npm run uploadSiteGen` - Upload SiteGenesis cartridges (`int_pixlee_core` and `int_pixlee`)
- `npm run lint` - Run linting for CSS, JavaScript, and ISML
- `npm run lint:js` - Lint JavaScript files
- `npm run lint:fix` - Auto-fix JavaScript linting issues
- `npm run lint:isml` - Lint ISML templates
- `npm test` - Run unit tests
- `npm run test:core` - Run tests for int_pixlee_core
- `npm run test:sfra` - Run tests for int_pixlee_sfra
- `npm run test:sg` - Run tests for int_pixlee
- `npm run watch` - Watch for changes and upload automatically

### Code Standards

- **Server-side JavaScript**: Rhino (ES5 enforced by ESLint)
- **Client-side JavaScript**: ES2020
- **Linting**: ESLint with Airbnb base config and SFCC-specific rules
- **Documentation**: JSDoc comments required for server-side code

### Testing

Run the test suite:

```bash
npm test
```

Run tests for specific cartridges:

```bash
npm run test:core    # Test int_pixlee_core
npm run test:sfra    # Test int_pixlee_sfra
npm run test:sg      # Test int_pixlee (SiteGenesis)
```

## Support

For additional support and documentation:

- **Developer Documentation**: [developers.pixlee.com](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware)
- **Issues**: Please report issues through your support channel or repository issue tracker
