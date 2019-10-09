**Development Setup**
=====================

1. Pixlee is a Salesforce Commerce Cloud partner and all partners get a sandbox accounts for development and testing purposes.
Our Sandbox is located [here](https://pixlee01-tech-prtnr-na01-dw.demandware.net/on/demandware.store/Sites-Site/default/ViewApplication-DisplayWelcomePage). Ask Satnam to make a seat for you.
3. After you're logged in, the documentation can be access at the "Infocenter" via the book icon in the top-right corner.
4. Infocenter has detailed information in "Getting Started for Developers" on how to get up for development.
5. After you've completed all the steps in the official guide, follow instructions at [developers.pixlee.com](https://developers.pixlee.com) on how to install the Pixlee cartridge.

**Demandware Cartridge**
=======================

Please note that the actual Demandware repository is in [bitbucket](https://bitbucket.org/demandware/link_pixlee). All changes should be done in the bitbucket repository and mirrored into this Github repository. Click [here](https://help.github.com/articles/duplicating-a-repository/) to learn more about mirroring a repository.

Manual Distribution of Demandware Cartridge
------------------------------------------

If there is a need to distribute the cartridge manually, zip the whole repository up (excluding unnecessary directories like .git and this README.md) and distribute it.

Relavant Branches
-----------------

- feature/CR-2093/satnam (Changes the conversions architecture to an hourly job vs. DW script)
