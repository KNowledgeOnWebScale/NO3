import * as N3 from 'n3';
import * as fs from 'fs';

export async function parse(path: string) {
    const N3String = fs.readFileSync(path, { encoding: "utf8", flag: "r" });
    const store = await parseN3(N3String);
    store.forEach( (q) => {
        // const res1 = shakeGraph(store,quad.subject);
        const res1 = parseStatements(store, null, null, null,q.subject);
        res1.forEach( item => console.log(item) );
    }, null, N3.DataFactory.namedNode('http://www.w3.org/2000/10/swap/log#implies'), null, null);
}

export async function parseN3(N3String: string) {
    const parser = new N3.Parser({ format: 'Notation3' });
    const store  = new N3.Store();    

    parser.parse(N3String,
        (error, quad, prefixes) => {
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

export function parseStatements(store: N3.Store, subject: N3.OTerm, predicate: N3.OTerm, object: N3.OTerm, graph: N3.OTerm) { 
    const quads = store.getQuads(subject, predicate, object, graph);

    let result = [];

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
        accumulator.push(q);

        const r = nextStatementFollow(quads,q.object);
        r.forEach( item => accumulator.push(item));

        return accumulator;
    }
    else {
        // We have a blank node ...
        // Handling blank nodes
        accumulator.push(q);

        const rs = nextStatementFollow(quads,q.subject);
        rs.forEach(item => accumulator.push(item));

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
        // We have a blanc node
    }

    const followQuad : N3.Quad[] = [];

    console.log(term);

    // Loop over all quads and find the matching blank nodes
    quads.forEach( quad => {
        console.log(`${quad.subject.id} ${quad.predicate.id} ${quad.object.id}`);

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

    followQuad.forEach( quad  => {
        const r = nextStatementFollow(quads,quad.object);
        r.forEach( item => accumulator.push(item)); 
    });

    // Remove the quads we just found from the quad array
    accumulator.forEach( item => {
        const index = quads.indexOf(item);
        if (index > -1) {
            quads.splice(index,1);
        }
    });

    return accumulator;
}