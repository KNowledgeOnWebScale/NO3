import * as fs from 'fs';
import * as N3 from 'n3';
import { parse } from './reasoner';
import { store2string } from './util';

if (process.argv.length != 3) {
    console.error("usage: demo.js data.n3");
    process.exit(1);
}

doit(process.argv[2]);

async function doit(path: string) {
    const store = await parse(path);
    const str = await store2string(store);
    console.log(str); 
}
