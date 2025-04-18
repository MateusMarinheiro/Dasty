// DO NOT INSTRUMENT

const {createCodeFlow} = require('./taintProxies/taint-val');
const url = require('url');
const path = require('path');
const querystring = require('querystring');
const {isTaintProxy, checkTaints} = require("./utils");
const {DEFAULT_CHECK_DEPTH} = require("./conf/analysis-conf");
const { create } = require('domain');

// Todo - deep taint check

const builtins = new Map([
    [
        Array.prototype.join,
        (iid, result, arr, f, args) => {
            const taintArg = arr.find(arg => arg?.__x_taint);
            if (!taintArg) return null;

            taintArg.__x_type = 'string';
            const cf = createCodeFlow(iid, 'functionArgResult', 'Array.join');
            return taintArg.__x_copyTaint(result, cf, 'string');
        }
    ], [
        JSON.stringify,
        (iid, result, target, f, args) => {
            if (!args[0]?.__x_taint) return null;

            const res = JSON.stringify(args[0].__x_val);
            const cf = createCodeFlow(iid, 'functionArgResult', 'JSON.stringify');
            return args[0].__x_copyTaint(res, cf, 'string');
        }
    ], [
        RegExp.prototype.exec,
        (iid, result, target, f, args) => {
            const taintArg = args[0];
            if (!taintArg) return null;

            const cf = createCodeFlow(iid, 'functionArgResult', 'RegExp.exec');
            // return taintArg.__x_copyTaint(result, cf, 'object');
            return result;
        }
    ], [
        decodeURIComponent,
        (iid, result, target, f, args) => {
            if(!args[0]?.__x_taint) return null;

            const res = decodeURIComponent(args[0].__x_val);
            const cf = createCodeFlow(iid, 'functionArgResult', 'decodeURIComponent');
            return args[0].__x_copyTaint(res, cf, 'string');
        }
    ], [
        Array.prototype.includes,
        (iid, result, target, f, args) => {
            if (!args[0]?.__x_taint) return null;
            let res;
            if (!target?.__x_taint) {
                res =  target.includes(args[0].__x_val);
            } else {
                res = target.__x_val.includes(args[0].__x_val);
            }

            const cf = createCodeFlow(iid, 'functionArgResult', 'includes');
            return args[0].__x_copyTaint(res, cf, 'boolean');
        }
    ], [
        Object.getPrototypeOf,
        (iid, result, target, f, args) => {
            if (!args[0].__x_taint) return null;

            const res = Object.getPrototypeOf(args[0].__x_val);
            const cf = createCodeFlow(iid, 'functionArgResult', 'getPrototypeOf');
            return args[0].__x_copyTaint(res, cf, 'object');
        }
    ], [
        Object.keys,
        (iid, result, target, f, args) => {
            if (!args[0].__x_taint) return null;

            const res = Object.keys(args[0].__x_val);
            const cf = createCodeFlow(iid, 'functionArgResult', 'keys');
            return args[0].__x_copyTaint(res, cf, 'array');
        }
    ], [
        Array.isArray,
        (iid, result, target, f, args) => {
            if (!args[0]?.__x_taint) return null;

            const res = Array.isArray(args[0].__x_val);
            const cf = createCodeFlow(iid, 'functionArgResult', 'keys');
            // TODO return a taint here
            // return args[0].__x_copyTaint(res, cf, 'boolean');
            return res;
        }
    ]
]);

const nodeJsFns = new Map();
nodeJsFns.set('node:url', new Map([
    [
        url.parse,
        (iid, result, args) =>
            emulate(iid, result, args, 'url.parse', false, [0], 'object')
    ], [
        url.format,
        (iid, result, args) =>
            emulate(iid, result, args, 'url.format', true, [0])
    ], [
        url.resolve,
        (iid, result, args) =>
            emulate(iid, result, args, 'url.resolve', false, [0, 1])
    ], [
        url.pathToFileURL,
        (iid, result, args) =>
            emulate(iid, result, args, 'url.pathToFileUrl', false, [0], 'object')
    ], [
        url.URL,
        (iid, result, args) =>
            emulate(iid, result, args, 'new URL', false, [0], 'object')
    ]]));

nodeJsFns.set('node:path', new Map([[
    path.resolve,
    (iid, result, args) =>
        emulate(iid, result, args, 'path.resolve', false, [0])
], [
    path.join,
    (iid, result, args) =>
        emulate(iid, result, args, 'path.join', false)
], [
    path.normalize,
    (iid, result, args) =>
        emulate(iid, result, args, 'path.normalize', false, [0])
], [
    path.dirname,
    (iid, result, args) =>
        emulate(iid, result, args, 'path.dirname', false, [0])
], [
    path.extname,
    (iid, result, args) =>
        emulate(iid, result, args, 'path.extname', false, [0])
], [
    path.basename,
    (iid, result, args) =>
        emulate(iid, result, args, 'path.basename', false, [0])
]]));

nodeJsFns.set('node:buffer', new Map([[
    Buffer.concat,
    (iid, result, args) =>
        emulate(iid, result, args, 'Buffer.concat', true, [0])
], [
    Buffer,
    (iid, result, args) =>
        emulate(iid, result, args, 'new Buffer', true, [0])
], [
    Buffer.from,
    (iid, result, args) =>
        emulate(iid, result, args, 'Buffer.from', true, [0])
]]));

nodeJsFns.set('node:querystring', new Map([[
    querystring.stringify,
    (iid, result, args) =>
        emulate(iid, result, args, 'querystring.stringify', true, [0])
], [
    querystring.escape,
    (iid, result, args) =>
        emulate(iid, result, args, 'querystring.escape', false, [0])
], [
    querystring.parse,
    (iid, result, args) =>
        emulate(iid, result, args, 'querystring.parse', false, [0], 'object')
]]));

// [
//     nodeUtil._extend,
//     (iid, result, args) =>
//         emulate(iid, result, args, 'util.extend', true, [0, 1], 'object')
// ]

function emulate(iid, result, args, fName, checkDeep = false, argsToCheck = null, resultType = 'string') {
    let argIndices = argsToCheck ?? [...Array(args.length).keys()]

    let taintVal = null;
    let taintIdx = -1;
    for (const idx of argIndices) {
        if (checkDeep) {
            const taints = checkTaints(args[idx], DEFAULT_CHECK_DEPTH);
            if (taints && taints.length > 0) {
                taintVal = taints[0];
                taintIdx = idx;
                break;
            }
        } else if (isTaintProxy(args[idx])) {
            taintVal = args[idx];
            taintIdx = idx;
            break;
        }
    }

    if (!taintVal) return null;

    const cf = createCodeFlow(iid, 'functionArgResult', fName, {'argIndex': taintIdx});
    return taintVal.__x_copyTaint(result, cf, resultType);
}

function emulateBuiltin(iid, result, target, f, args) {
    const builtin = builtins.get(f);
    const emulatedResult = builtin ? builtin(iid, result, target, f, args) : null;
    return emulatedResult;
}

function emulateNodeJs(module, iid, result, target, f, args) {
    const nodeFn = nodeJsFns.get(module)?.get(f);
    return nodeFn ? nodeFn(iid, result, args) : null;
}

module.exports = {emulateBuiltin, emulateNodeJs}