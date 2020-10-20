# demandware

There are two key branches:

sfra (master)

and

sitegenesis

depending on what version of SFCC they are using.  Much more likely to be SFRA as time passes.

To update the repo and push the changes up to s3:

Make your changes in the repo

run 

sh package.sh

if sfra, run

 mv Pixlee_Demandware.zip Pixlee_SFCC_SFRA.zip
 
 if sitegenesis, run
 
  mv Pixlee_Demandware.zip Pixlee_SFCC_Sitegenesis.zip
  
Upload this zip file here: https://s3.console.aws.amazon.com/s3/buckets/assets.pixlee.com/demandware/?region=us-east-1&tab=overview

Allowing public read.

bust fastly cache with

curl -XPOST -H "Fastly-Key:<FASTLY_API_KEY>" "https://api.fastly.com/service/6ZOYO75DiAyHoS7rTHgcqk/purge_all"
