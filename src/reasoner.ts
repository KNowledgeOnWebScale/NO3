import * as N3 from 'n3';
import * as RDF from "@rdfjs/types";
import { sha256 } from 'js-sha256';
import { sparqlQuery, unSkolemizedValue } from './sparql';

interface Rule {
    implicator: {
        sparql: string;
        map: Map<string, string>;
        statements: N3.Quad[][];
     };
    implications: {
        sparql: string;
        map: Map<string, string>;
        statements: N3.Quad[][];
    };
}

// Calculate the log:implies for the current store with implicator the left branch of the implies and
// implications the right branch of implies.
// Returns a N3.Store with new generated triples
export async function reasoner(store: N3.Store, rule: Rule) : Promise<N3.Store> {
    const production = new N3.Store(); 

    console.info(rule.implicator.sparql);

    // Calculate the bindings for the SPARQL
    const bindings      = await sparqlQuery(rule.implicator.sparql,store);

    if (bindings.length == 0) {
        return production;
    }

    const implicatorMap   = rule.implicator.map;
    const implications    = rule.implications.statements;
    const implicationsMap = rule.implications.map;

    const currentBlankNodeMap = new Map<string,string>();

    bindings.forEach( binding => {
        implications.forEach( st => {
            st.forEach( q  => {
                let subject : N3.Term;
                let predicate : N3.Term;
                let object : N3.Term;

                if (implicatorMap.has(q.subject.value)) {
                    const key = <string> implicatorMap.get(q.subject.value);
                    subject = <N3.Term> binding.get(key);
                } 
                else if (implicationsMap.has(q.subject.value)) {
                    subject = N3.DataFactory.blankNode(implicationsMap.get(q.subject.value)); 
                }
                else if (currentBlankNodeMap.has(q.subject.value)) {
                    subject = N3.DataFactory.blankNode(currentBlankNodeMap.get(q.subject.value));
                }
                else if (N3.Util.isBlankNode(q.subject)) {
                    subject = nextSkolem();
                    currentBlankNodeMap.set(q.subject.value,subject.value);
                }
                else {
                    subject = q.subject;
                }

                if (implicatorMap.has(q.predicate.value)) {
                    const key = <string> implicatorMap.get(q.predicate.value);
                    predicate = <N3.Term> binding.get(key);
                } 
                else if (implicationsMap.has(q.predicate.value)) {
                    predicate = N3.DataFactory.blankNode(implicationsMap.get(q.predicate.value)); 
                }
                else if (currentBlankNodeMap.has(q.predicate.value)) {
                    predicate = N3.DataFactory.blankNode(currentBlankNodeMap.get(q.predicate.value));
                }
                else if (N3.Util.isBlankNode(q.predicate)) {
                    predicate = nextSkolem();
                    currentBlankNodeMap.set(q.predicate.value,predicate.value);
                }
                else {
                    predicate = q.predicate;
                } 

                if (implicatorMap.has(q.object.value)) {
                    const key = <string> implicatorMap.get(q.object.value);
                    const val = binding.get(key);
                    object = <N3.Term> binding.get(key);
                } 
                else if (implicationsMap.has(q.object.value)) {
                    object = N3.DataFactory.blankNode(implicationsMap.get(q.object.value)); 
                }
                else if (currentBlankNodeMap.has(q.object.value)) {
                    object = N3.DataFactory.blankNode(currentBlankNodeMap.get(q.object.value));
                }
                else if (N3.Util.isBlankNode(q.object)) {
                    object = nextSkolem();
                    currentBlankNodeMap.set(q.object.value,object.value);
                }
                else {
                    object = q.object;
                }

                // SPARQL 1.1. requires blank nodes to be skolemized over different scopes
                // This we have to undo to be able to reason about existing blank nodes...
                if (N3.Util.isBlankNode(subject)) {
                    subject = N3.DataFactory.blankNode(unSkolemizedValue(subject));
                }

                if (N3.Util.isBlankNode(predicate)) {
                    predicate = N3.DataFactory.blankNode(unSkolemizedValue(predicate));
                }

                if (N3.Util.isBlankNode(object)) {
                    object = N3.DataFactory.blankNode(unSkolemizedValue(object));
                }

                production.add(N3.DataFactory.quad(subject as RDF.Quad_Subject,
                                                  predicate as RDF.Quad_Predicate,
                                                  object as RDF.Quad_Object));
            });
        });
    });

    // Add the blank nodes to known blank nodes
    currentBlankNodeMap.forEach( (value: string, key:string) => {
        rule.implications.map.set(key,value);
    });

    return production;
}

function compileRules(store: N3.Store) : Rule[] {
    const impliesQuads = store.getQuads(
        null, 
        N3.DataFactory.namedNode('http://www.w3.org/2000/10/swap/log#implies'), 
        null, 
        N3.DataFactory.defaultGraph()
    ); 

    let count = 0;

    const rules = [];

    for (const quad of impliesQuads) {
        const implicator   = parseStatements(store, null, null, null, quad.subject);
        const implications = parseStatements(store, null, null, null, quad.object);

        const implicatorMap      = new Map<string,string>();
        const implicatorSparql   = statementsAsSPARQL(implicator,implicatorMap);
        
        const implicationsMap    = new Map<string,string>();
        const implicationsSparql = statementsAsSPARQL(implications);

        const paramterMap = {
            'implicator' : {
                'sparql'     : implicatorSparql ,
                'map'        : implicatorMap,
                'statements' : implicator
            },
            'implications' : {
                'sparql'     : implicationsSparql ,
                'map'        : implicationsMap, 
                'statements' : implications
            }
        };

        rules.push(paramterMap);
    }

    return rules;
}

// Execute all the rules in the N3.Store and return a new N3.Store containing all
// inferred quads
export async function think(store: N3.Store) : Promise<N3.Store> {
    // WorkStore contains a copy of the input data where we will add the produced graphs
    const workStore = new N3.Store();

    store.forEach( quad => {
        workStore.add(quad);
    }, null, null, null, null);

    // Store that holds the produced graphs
    const production = new N3.Store();

    const rules = compileRules(store);

    let productionDelta    = 0;
    let prevProductionSize = production.size;

    // This is the CWM think loop that can run for ever with simple self-referencing N3 rules
    // See: data/loop.n3
    do {
        for (const rule of rules) {
            // Here we start calculating all the inferred quads..
            const tmpStore     = await reasoner(workStore,rule);

            console.info(`Got: ${tmpStore.size} quads`);

            const str = await store2string(tmpStore);

            console.info(`===\n${str}\n---\n`);

            // Add the result to the workStore
            tmpStore.forEach( quad => {
                workStore.add(quad);
                production.add(quad);
            },null,null,null,N3.DataFactory.defaultGraph());

            productionDelta    =  production.size - prevProductionSize;
            prevProductionSize = production.size;
        }

        console.info(`Total: ${productionDelta} new quads`);
    } while (productionDelta != 0);

    return production;
}

// Parse a Notation3 string into a N3.Store
export async function parseN3(N3String: string) : Promise<N3.Store> {
    const parser = new N3.Parser({ format: 'Notation3' });
    const store  = new N3.Store();    

    parser.parse(N3String,
        (error, quad, _prefixes) => {
            if (quad) {
                store.add(quad);
            }
            else {
                // We are done with parsing
            }

            if (error) {
                throw new Error(error.message);
            }
        });

    return store;
}

// Parse all quads in a (sub)graph into an array of N3.Quad[] statements.
// We will use these qauds to execute Notation3 built-ins.
function parseStatements(store: N3.Store
    , subject: N3.OTerm, predicate: N3.OTerm, object: N3.OTerm, graph: N3.OTerm) : N3.Quad[][] { 
    const quads = store.getQuads(subject, predicate, object, graph);

    let result: N3.Quad[][] = [];

    let next: N3.Quad[];

    do {
        next = nextStatement(quads);
        if (next.length > 0) {
            result.push(next);
        }
    } while (next.length > 0);

    return result;
}

// Part of parseStatments
function nextStatement(quads: N3.Quad[]) : N3.Quad[] {
    // We are done when there are no more quads..
    if (quads.length == 0) {
        return [];
    }

    const accumulator = [];

    // Grab the first quad..and try to find the matching terms...
    const q = quads.shift();

    if (! q) {
        // This should never happen
        return [];
    }
    else if (N3.Util.isVariable(q.subject)) {
        // Keep the variable..only need to find all blank nodes in the object (if there are any)
        accumulator.push(q);

        const r = nextStatementFollow(quads,q.object);
        r.forEach( item => accumulator.push(item));

        return accumulator;
    }
    else if (N3.Util.isNamedNode(q.subject)) {
        // Keep the namedNode .. only need to find all blank nodes in the object (if there are any)
        accumulator.push(q);

        const r = nextStatementFollow(quads,q.object);
        r.forEach( item => accumulator.push(item));

        return accumulator;
    }
    else if (N3.Util.isLiteral(q.subject)) {
        // Keep the literal .. only need to find all blank nodes in the object (it there are any)
        accumulator.push(q);

        const r = nextStatementFollow(quads,q.object);
        r.forEach( item => accumulator.push(item));

        return accumulator;
    }
    else {
        // We have a blank node ...
        accumulator.push(q);

        // Follow all links in the subject for more blank nodes...
        const rs = nextStatementFollow(quads,q.subject);
        rs.forEach(item => accumulator.push(item));

        // Follow all links in the object for more blank nodes...
        const ro = nextStatementFollow(quads,q.object);
        ro.forEach(item => accumulator.push(item));

        return accumulator;
    }
}

// Part of parseStatements.
// Given a term find all the blank nodes linked to a term
function nextStatementFollow(quads: N3.Quad[], term: N3.Term) : N3.Quad[] {
    const accumulator : N3.Quad[] = [];

    if (quads.length == 0) {
        return [];
    }

    if (N3.Util.isVariable(term)) {
        return [];
    }
    else if (N3.Util.isLiteral(term)) {
        return [];
    }
    else if (N3.Util.isNamedNode(term)) {
        return [];
    }
    else {
        // We have a blank node
    }

    const followQuad : N3.Quad[] = [];

    // Loop over all quads and find the matching blank nodes
    quads.forEach( quad => {
        // console.log(`${quad.subject.id} ${quad.predicate.id} ${quad.object.id}`);

        if ( N3.Util.isBlankNode(quad.subject) && quad.subject.id === term.id) {
            accumulator.push(quad);
            followQuad.push(quad);
        }
        else if (N3.Util.isBlankNode(quad.object) && quad?.object.id === term.id) {
            accumulator.push(quad);
        }
        else {
            // No match found
        }
    });

    // Remove the quads we just found from the quad array
    accumulator.forEach( item => {
        const index = quads.indexOf(item);
        if (index > -1) {
            quads.splice(index,1);
        }
    });

    // Follow the quads we just found for more links
    followQuad.forEach( quad  => {
        const r = nextStatementFollow(quads,quad.object);
        r.forEach( item => accumulator.push(item)); 
    });

    return accumulator;
}

// Translates statements into a SPARQL query
function statementsAsSPARQL(statements: N3.Quad[][],quantifierMap: Map<string,string> = new Map<string,string>()) : string {
    const sparql = 'SELECT * {' + 
                    statements.map( s => statementSExpression(s, quantifierMap) ).join("\n") + 
                   '}';
    return sparql;
}

// Translate a statement (array of quads[]) to a SPARQL S-Expression.
// The quantifierMap is a local mapping of extentials and universals to S-Expression variables
function statementSExpression(quads: N3.Quad[], quantifierMap: Map<string,string>) : string {

    const sexpressionPart = (term: N3.Term) => {
        if (N3.Util.isNamedNode(term)) {
            return `<${term.value}>`;
        }
        else if (N3.Util.isBlankNode(term)) {
            if (quantifierMap.has(term.value)) {
                // We are ok
            }
            else {
                quantifierMap.set(term.value, '?' + nextQuantifier().value);
            }
            return quantifierMap.get(term.value); 
        }
        else if (N3.Util.isVariable(term)) {
            if (quantifierMap.has(term.value)) {
                // We are ok
            }
            else {
                quantifierMap.set(term.value, '?' + nextQuantifier().value);
            }

            return quantifierMap.get(term.value); 
        }
        else if (N3.Util.isLiteral(term)) {
            return `"${term.value}"`;
        }
        else {
            console.error(`Found an unknown term type ${term}`);
            throw new Error(`Unknown term type`);
        }
    };

    const parts: string[] = quads.map( quad => {
        let str = "";

        str += sexpressionPart(quad.subject);
        str += " ";
        str += sexpressionPart(quad.predicate);
        str += " ";
        str += sexpressionPart(quad.object);
        str += ".";

        return str;
    });

    const sparqlQuery = parts.join("\n");

    return sparqlQuery;
}

// Given an N3.Store return an Notation3 string
export async function store2string(store: N3.Store) : Promise<string> {
    const writer = new N3.Writer();
   
    store.forEach( quad => {
        writer.addQuad(quad);
    }, null, null, null, null);  

    return new Promise<string>( (resolve,reject) => {
        writer.end((error,result) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(result);
            }
        });        
    });
}

let quantifierCounter = 0;
function nextQuantifier() : N3.Term {
    return N3.DataFactory.variable('U_' + quantifierCounter++);
}

let skolemCounter = 0;
function nextSkolem() : N3.Term {
    return N3.DataFactory.blankNode('sk_' + skolemCounter++);
}

function make_skolem_namespace() : string {
    const rand  = Math.floor(Math.random() * (2**62)).toString();
    const genid = Buffer.from(sha256(rand)).toString('base64url');
    return `http://phochste.github.io/.well-known/genid/${genid}#`;
}