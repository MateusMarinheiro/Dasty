// DO NOT INSTRUMENT

const EmptyAnalysis = require('./analysis/empty-analysis');
const LogAnalysis = require('./analysis/log-analysis');

function runAnalysis(sandbox, log) {
    sandbox.addAnalysis(log ? new LogAnalysis() : new EmptyAnalysis() , {includes: '/testi/'});
}

// console.log = () => {};

runAnalysis(J$, true);