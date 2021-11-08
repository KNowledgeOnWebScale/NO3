import * as N3 from 'n3';
import type * as RDF from '@rdfjs/types';

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

export function parseStatements(store: N3.Store
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
export function statementsAsSPARQL(statements: N3.Quad[][],quantifierMap: Map<string,string> = new Map<string,string>()) : string {
    const sparql = 'SELECT * {' + statements.map( s => statementSExpression(s, quantifierMap, false) ).join("\n") + '}';
    return sparql;
}

// Translate a statement (array of quads[]) to a SPARQL S-Expression.
// The quantifierMap is a local mapping of extentials and universals to S-Expression variables
function statementSExpression(quads: N3.Quad[], quantifierMap: Map<string,string> = new Map<string,string>(), isImplication: boolean = false) : string {
    // TODO this is wrong and needs to be set outside this function
    let quantifierCounter = 0;
    let skolemCounter = 0;

    const sexpressionPart = (term: N3.Term) => {
        if (N3.Util.isNamedNode(term)) {
            return `<${term.value}>`;
        }
        else if (N3.Util.isBlankNode(term)) {
            if (isImplication) {
                if (quantifierMap.has(term.value)) {
                    // We are ok
                }
                else {
                    quantifierMap.set(term.value, '_:sk_' + (skolemCounter++));
                }

                return quantifierMap.get(term.value);
            }
            else {
                if (quantifierMap.has(term.value)) {
                    // We are ok
                }
                else {
                    quantifierMap.set(term.value,'?U_' + (quantifierCounter++));
                }
                return quantifierMap.get(term.value); 
            }
        }
        else if (N3.Util.isVariable(term)) {
            if (quantifierMap.has(term.value)) {
                // We are ok
            }
            else {
                quantifierMap.set(term.value,'?U_' + (quantifierCounter++));
            }

            return quantifierMap.get(term.value); 
        }
        else if (N3.Util.isLiteral(term)) {
            return `"${term.value}"`;
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