#!/usr/bin/env node

const log4js   = require("log4js");
const fs       = require("fs");
const parse    = require("../js/parse.js");
const reasoner = require("../js/reasoner.js");

if (process.argv.length != 3) {
    console.error("usage: demo.js data.n3");
    process.exit(1);
}

const logger = log4js.getLogger();
logger.level = "info";

doit(process.argv[2]);

async function doit(path) {
    logger.info(`start reading ${path}`);

    const n3String = fs.readFileSync(path, { encoding: "utf8", flag: "r" });

    logger.info('parse N3');
    const n3Store  = await parse.parseN3(n3String);

    logger.info('think');
    const inferred = await reasoner.think(n3Store);

    logger.info('store2string');
    const str = await parse.store2string(inferred);
    console.log(str); 

    logger.info(`end reading processing`);
}