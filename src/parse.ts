import * as N3 from 'n3';
import { getLogger } from "log4js";

const logger = getLogger();

export {
    parseN3,
    parseStatements,
    store2string
};

// Given an N3.Store return an Notation3 string
async function store2string(store: N3.Store) : Promise<string> {
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

// Parse a Notation3 string into an N3.Store
async function parseN3(N3String: string) : Promise<N3.Store> {
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