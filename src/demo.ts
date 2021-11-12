import * as fs from 'fs';
import { parseN3 , store2string } from './parse';
import { think } from './reasoner';

if (process.argv.length != 3) {
    console.error("usage: demo.js data.n3");
    process.exit(1);
}

doit(process.argv[2]);

async function doit(path: string) {
    const n3String = fs.readFileSync(path, { encoding: "utf8", flag: "r" });
    const n3Store  = await parseN3(n3String);
    const inferred = await think(n3Store);

    const str = await store2string(inferred);
    console.log(str); 
}
