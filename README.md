# Pixlee TurnTo Social UGC for Salesforce Commerce Cloud

Use this Salesforce Commerce Cloud (SFCC) cartridge to connect to Salesforce Commerce Cloud's Storefront Reference Architecture (SFRA) and SiteGenesis platforms.

To view additional documentation online, navigate to:
https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware

* * *

## Installation Instructions

### Prerequisites

1. Download the latest release from this repository.

### Update Metadata

This metadata update includes:
- Extensions to SFCC systems objects (site and organization preferences)
- Service definition
- Two sample jobs

The easiest way to update the metadata of your environment with the above is to do a site import.

1. Open the metadata folder and create a zip of the **pixlee_site_template** directory with the same name
2. In the SFCC Business Manager, navigate to _Administration >  Site Development >  Site Import & Export_
3. Click the button to choose a file
4. Select the zip file created in step 1 and click **Upload**
5. Select the uploaded file from the import list, click **Import**, and click **OK** to confirm

A successful import will result in the following:
- Pixlee site preferences in _Merchant Tools > Site Preferences > Custom Preferences_.
- Pixlee Organization preferences in _Administration >  Global Preferences >  Global Custom Preferences_.
- Pixlee service definition (**pixlee.http.service**) in _Administration >  Operations >  Services_.
- Two sample jobs (**Pixlee Product Export – SFRA** and **Pixlee Product Export – SiteGenesis**) in _Administration >  Operations >  Jobs_.

### Install Cartridge

1. Run `npm install` to install all the local dependencies (SFRA has been tested with v12.21.0 and is recommended)
2. Run `npm run compile:js` from the command line that would compile all client-side JS files.
3. Create `dw.json` file in the root of the project. Providing a [WebDAV access key from BM](https://help.salesforce.com/s/articleView?id=cc.b2c_access_keys_for_business_manager.htm&type=5) in the password field is optional, as you will be prompted if it is not provided.
    ```json
    {
        "hostname": "<your-hostname.demandware.net>",
        "username": "<username>",
        "password": "<your_webdav_access_key>",
        "code-version": "<version_to_upload_to>"
    }
    ```
4. Run `npm run uploadCartridge`. It will upload `int_pixlee_core` and `int_pixlee_sfra` cartridges to the sandbox you specified in `dw.json` file.
5. Add the `int_pixlee_core` and `int_pixlee_sfra` cartridge to your cartridge path in _Administration > Sites > Manage Sites > RefArch - Settings_

***

## Configure Cartridge Site Preferences

See [Pixlee Developer documentation for configuring preferences](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware#configuring-site-preferences)

***

## Configure Jobs

See [Pixlee Developer documentation for configuring jobs](https://developers.pixlee.com/docs/salesforce-commerce-cloud-sfra-demandware#configuring-jobs)

