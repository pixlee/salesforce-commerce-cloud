#! /bin/bash

# Package up all the files required for the Pixlee extension to be deployed.
# Creates a zip named "Pixlee_Demandware.zip", which should be extracted
# and imported into Eclipse and linked with the Demandware server

read -r -d '' PIXLEE <<EOF
./documentation
./int_pixlee
./metadata
EOF

FILE1=tempfile_package
echo "$PIXLEE" > $FILE1

FILE2=tempfile_versionhash

gitVersion=".git/refs/heads/master"
versionString=$(cat "$gitVersion")

SCRIPT_FILE="int_pixlee/cartridge/templates/default/utils/versionhash.isml"
searchString="var versionHash"

while read line; do
    if [[ $line == "$searchString"* ]]; then
        echo "var versionHash = '$versionString';" >> $FILE2
    else
        echo $line >> $FILE2
    fi
done < $SCRIPT_FILE

mv tempfile_versionhash $SCRIPT_FILE

rm -rf tempfile_package
rm -rf tempfile_versionhash


# cat <<EOF > ./app/code/community/Pixlee/Base/version.txt
# $versionString
# EOF

# tar zcf Pixlee_Magento.tgz --files-from="$FILE"
# (cd MagentoTarToConnect && ./magento-tar-to-connect.phar pixlee-config.php)
# echo "Created file Pixlee_Magento.tgz with the following files:"
# tar -tf Pixlee_Magento.tgz
# rm -rf Pixlee_Magento.tgz
# mv ./magento_format/Pixlee_Magento.tgz ./Pixlee_Magento.tgz
