//https://snyk.io/vuln/SNYK-JS-JSINI-1048970
 
  const fs = require("fs");
  const path = require("path");
  const ini = require("js-ini");
  obj = {};

   

  ini.parse(fs.readFileSync(path.resolve(__dirname, "./payload.ini"), "utf-8"));
// End of file
