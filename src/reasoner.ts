import * as N3 from 'n3';
import * as fs from 'fs';
import * as RDF from "@rdfjs/types";
import { parseN3 , parseStatements, statementsAsSPARQL, store2string } from './util';
import { sparqlQuery } from './sparql';

// Calculate the log:implies for the current store with implicator the left branch of the implies and
// implications the right branch of implies.
// Returns a N3.Store with new generated triples
export async function reasoner(store: N3.Store, implicator: N3.Quad[][], implications: N3.Quad[][]) : Promise<N3.Store> {
    const quantifierMap = new Map<string,string>();

    const sparql        = statementsAsSPARQL(implicator,quantifierMap);

    console.info(sparql);

    const bindings      = await sparqlQuery(sparql,store);
    const production    = new N3.Store(); 

    if (bindings.length == 0) {
        return production;
    }

    bindings.forEach( binding => {
        implications.forEach( st => {
            st.forEach( q  => {
                let subject : N3.Term;
                let predicate : N3.Term;
                let object : N3.Term;

                if (quantifierMap.has(q.subject.value)) {
                    const key = <string> quantifierMap.get(q.subject.value);
                    subject = <N3.Term> binding.get(key);
                } 
                else {
                    subject = q.subject;
                }

                if (quantifierMap.has(q.predicate.value)) {
                    const key = <string> quantifierMap.get(q.predicate.value);
                    predicate = <N3.Term> binding.get(key);
                } 
                else {
                    predicate = q.predicate;
                } 

                if (quantifierMap.has(q.object.value)) {
                    const key = <string> quantifierMap.get(q.object.value);
                    const val = binding.get(key);
                    object = <N3.Term> binding.get(key);
                } 
                else {
                    object = q.object;
                }

                production.add(N3.DataFactory.quad(subject as RDF.Quad_Subject,
                                                  predicate as RDF.Quad_Predicate,
                                                  object as RDF.Quad_Object));
            });
        });
    });

    return production;
}

export async function parse(path: string) {
    const N3String   = fs.readFileSync(path, { encoding: "utf8", flag: "r" });
    const store      = await parseN3(N3String);

    // WorkStore contains a copy of the input data where we will add the produced graphs
    const workStore = new N3.Store();

    store.forEach( quad => {
        workStore.add(quad);
    }, null, null, null, null);

    // Store that holds the produced graphs
    const production = new N3.Store();

    // Need to read the quads first to be able to run the reasoner in order
    // of found log:implies quads
    const impliesQuads = store.getQuads(
                            null, 
                            N3.DataFactory.namedNode('http://www.w3.org/2000/10/swap/log#implies'), 
                            null, 
                            N3.DataFactory.defaultGraph()
    );
  
    let totalResult = 0;

    do {
        for (const quad of impliesQuads) {
            const implicator   = parseStatements(workStore, null, null, null, quad.subject);
            const implications = parseStatements(workStore, null, null, null, quad.object);

            const tmpStore     = await reasoner(workStore,implicator,implications);

            totalResult += tmpStore.size - production.size;

            console.info(`Got: ${tmpStore.size} quads`);

            // Add the result to the workStore
            tmpStore.forEach( quad => {
                workStore.add(quad);
                production.add(quad);
            },null,null,null,N3.DataFactory.defaultGraph());
        }

        console.info(`Total: ${totalResult} new quads`);
    } while (totalResult != 0);

    return production;
}
