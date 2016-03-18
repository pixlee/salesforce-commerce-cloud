#! /bin/bash

# Package up all the files required for the Pixlee extension to be deployed.
# Creates a zip named "Pixlee_Demandware.zip", which should be extracted
# and imported into Eclipse and linked with the Demandware server

FILE=tempfile_versionhash
gitVersion=".git/refs/heads/master"
versionString=$(cat "$gitVersion")

SCRIPT_FILE="int_pixlee/cartridge/templates/default/utils/versionhash.isml"
searchString="var versionHash"

while read line; do
    if [[ $line == "$searchString"* ]]; then
        echo "var versionHash = '$versionString';" >> $FILE
    else
        echo $line >> $FILE
    fi
done < $SCRIPT_FILE

mv tempfile_versionhash $SCRIPT_FILE
rm -rf tempfile_versionhash

mkdir Pixlee_Demandware
cp -R documentation Pixlee_Demandware/documentation
cp -R int_pixlee Pixlee_Demandware/int_pixlee
cp -R metadata Pixlee_Demandware/metadata

zip -r -X Pixlee_Demandware.zip Pixlee_Demandware

rm -rf ./Pixlee_Demandware
