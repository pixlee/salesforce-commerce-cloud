#! /bin/bash

# Package up all the files required for the Pixlee extension to be deployed.
# Creates a zip named "Pixlee_Demandware.zip", which should be extracted
# and imported into Eclipse and linked with the Demandware server

gitVersion=".git/refs/heads/master"
versionString=$(cat "$gitVersion")

RESOURCE_FILE="cartridges/int_pixlee_core/cartridge/templates/resources/pixleehash.properties"

echo "pixlee.version.hash=$versionString" > $RESOURCE_FILE

mkdir Pixlee_Demandware
cp -R documentation Pixlee_Demandware/documentation
cp -R cartridges Pixlee_Demandware/cartridges
cp -R metadata Pixlee_Demandware/metadata
filesToCopy=.eslintignore,.eslintrc.json,.gitignore,.stylelintrc.json,README.md,package.json,webpack.config.js
for fileToCopy in ${filesToCopy//,/ }
do
    cp $fileToCopy Pixlee_Demandware/$fileToCopy
done

zip -r -X Pixlee_Demandware.zip Pixlee_Demandware

rm -rf ./Pixlee_Demandware
