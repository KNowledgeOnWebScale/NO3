import * as N3 from 'n3';
import { parseN3 } from "../src/parse";
import { think } from "../src/reasoner";

describe("think", () => {
    test("Returns a store", async () => {
        const store    = await parseN3('<a> a <b> .'); 
        const inferred = await think(store);
        expect(inferred).toBeInstanceOf(N3.Store);
    });

    test("Simple inference 1", async () => {
        const store    = await parseN3(`
@prefix : <urn:x:> .

:Felix a :Cat.

{ ?X a :Cat .} => { ?X :likes :CatFood .} .
        `); 
        const inferred = await think(store);
        expect(inferred.getQuads(null,null,null,null).length).toBe(1);
    });

    test("Simple inference 2", async () => {
        const store    = await parseN3(`
@prefix : <urn:x:> .

:Felix a :Cat.

{ ?X a :Cat .} => { ?X :likes :CatFood .} .
        `); 
        const inferred = await think(store);
        const quads = inferred.getQuads(null,null,null,null);

        expect(quads.length).toBe(1);
        expect(quads[0].subject.value).toBe('urn:x:Felix');
        expect(quads[0].predicate.value).toBe('urn:x:likes');
        expect(quads[0].object.value).toBe('urn:x:CatFood');
    });
});