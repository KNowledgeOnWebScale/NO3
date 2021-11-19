#!/usr/bin/env node

const log4js   = require('log4js');
const fs       = require('fs');
const N3       = require('n3');
const parse    = require('../js/parse.js');
const reasoner = require('../js/reasoner.js');
const { program } = require('commander');

program.version('0.0.1')
       .argument('<rules>')
       .option('--file [path]', 'a local file', collect, [])
       .option('--url [url]','a remote data file', collect, [])
       .option('--sparql [url]','a sparql endpoint', collect, [])
       .option('-d,--info','output debugging messages')
       .option('-dd,--debug','output more debugging messages')
       .option('-ddd,--trace','output much more debugging messages');

program.parse(process.argv);

const opts   = program.opts();
const logger = log4js.getLogger();

if (opts.info) {
    logger.level = "info";
}
if (opts.debug) {
    logger.level = "debug";
}
if (opts.trace) {
    logger.level = "trace";
}

const data = [];

if (opts.file.length > 0) {
    opts.file.forEach( item => {
        const store = rdfjsParse(item);
        data.push( { type: "rdfjsSource" , value: store});
    });
}

if (opts.url.length > 0) {
    opts.url.forEach( item => data.push( { type: "file" , value: item }) );
}

if (opts.sparql.length > 0) {
    opts.sparql.forEach( item => data.push( { type: "sparql" , value: item }) );
}

doit(program.args[0],data);

function collect(value, previous) {
    return previous.concat([value]);
}

async function doit(path,data) {
    logger.info(`start reading ${path}`);

    const n3String = fs.readFileSync(path, { encoding: "utf8", flag: "r" });

    logger.info('parse N3');
    const parsedN3  = await parse.parseN3(n3String);

    logger.info('think');
    const inferred = await reasoner.think(parsedN3,data);

    logger.info('store2string');
    const str = await parse.store2string(inferred);
    console.log(str); 

    logger.info(`end reading processing`);
}

function rdfjsParse(path) {
    const parser = new N3.Parser();
    const stream = fs.createReadStream(path);
    const store = new N3.Store();
    parser.parse(stream, (error, quad, _) => { 
        if (error) {
            console.error(error);
            process.exit(2);
        }
        if (quad) {
            store.add(quad);
        }
    });
    return store;
}