import * as N3 from 'n3';
import * as fs from 'fs';

const builtins = {
    'http://www.w3.org/2000/10/swap/list#in': function (store: N3.Store, quad: N3.Quad) {
        return true;
    }
}

export interface BuiltIn {
    (store: N3.Store, statements: N3.Quad[][]) : boolean;
}

export function reasoner(store: N3.Store, statements: N3.Quad[][]) {
    let bindings : Map<string,N3.Term>[] = [];

    statements.forEach(statement => {
        const builtin = hasBuiltIn(statement);

        if (builtin) {
            // ignore
        }
        else {
            // Test if all the quads in the statement match the data
            const isValidStatement = statement.every( q => {
                let matchCollector : Map<string,N3.Term>[] | undefined;

                // If the quad contains wildcards (a variable or an blank nodes) and
                // we have previous bindings then we need to substitute these bindings
                // and try to find new bindings...
                if (hasWildcard(q) && bindings.length != 0) {
                    bindings = bindings.filter( binding => {
                        const match = bindingMatchCollector(store,q,binding);

                        // When we get an array (empty or not) something was found
                        // When we get an undefined, nothing as found
                        if (match === undefined) {
                            return false;
                        }

                        if (matchCollector === undefined) {
                            matchCollector = [];  
                        }

                        if (match.length > 0) {
                            match.forEach( item => {
                                if (matchCollector === undefined) {
                                    matchCollector = [ item ];
                                }
                                else {
                                    matchCollector.push(item);
                                }
                            });
                        }

                        return true;
                    });
                }
                else {
                    matchCollector = simpleMatchCollector(store,q);
                }

                // No quads or bindinigs found in the data...
                if (matchCollector === undefined) {
                    console.error('This quad resulted in no quads or bindigs');
                    console.error(q);
                    return false;
                }

                // We got wildcards but no new matches...
                if (hasWildcard(q) && matchCollector.length == 0) {
                    return false;
                }

                // When we didn't have a binding yet add it to the possible 
                // bindings
                if (bindings.length == 0) {
                    matchCollector.forEach( item => bindings.push(item ));
                }
                else { 
                    // Add all the matches to the bindings...
                    let newBindings : Map<string,N3.Term>[] = [];

                    matchCollector.forEach( match => {
                        bindings.forEach( binding => {
                            const newBinding = new Map();
                            binding.forEach( (value,key) => newBinding.set(key,value));
                            match.forEach( (value,key) => newBinding.set(key,value));
                            newBindings.push( newBinding );
                        });
                    });

                    bindings = newBindings;
                }

                return true;
            });
        }
    });

    return bindings;
}

export function bindingMatchCollector(store: N3.Store, quad: N3.Quad, binding: Map<string,N3.Term>) : Map<string,N3.Term>[] | undefined { 
    let subject : N3.Term;
    let predicate : N3.Term;
    let object : N3.Term;

    // Fill out the subject binding variable or blank node
    if (N3.Util.isVariable(quad.subject) || N3.Util.isBlankNode(quad.subject)) {
        const bind = binding.get(quad.subject.value);
        subject = bind ? bind : quad.subject;
    }
    else {
        subject = quad.subject;
    }

    // Fill out the predicate binding variable
    if (N3.Util.isVariable(quad.predicate)) {
        const bind = binding.get(quad.predicate.value); 
        predicate = bind ? bind : quad.predicate;
    }
    else {
        predicate = quad.predicate;
    }

    // Fill out the object binding variable
    if (N3.Util.isVariable(quad.object)) {
        const bind = binding.get(quad.object.value);
        object = bind ? bind : quad.object;
    }
    else {
        object = quad.object;
    }

    const matchCollector = collect(store,subject,predicate,object);

    return matchCollector;
}

export function simpleMatchCollector(store: N3.Store, quad: N3.Quad) : Map<string,N3.Term>[] | undefined {
    const matchCollector = collect(store,quad.subject,quad.predicate,quad.object); 
    return matchCollector;
}

export async function parse(path: string) : Promise<void> {
    const N3String = fs.readFileSync(path, { encoding: "utf8", flag: "r" });
    const store = await parseN3(N3String);
    store.forEach( (quad) => {

        const statements   = parseStatements(store, null, null, null, quad.subject);
        const implications = parseStatements(store, null, null, null, quad.object);
       
        const bindings     = reasoner(store,statements);

        console.log(bindings);

    }, null, N3.DataFactory.namedNode('http://www.w3.org/2000/10/swap/log#implies'), null, null);
}

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

function hasWildcard(quad: N3.Quad) : boolean {
    return N3.Util.isVariable(quad.subject) ||
           N3.Util.isBlankNode(quad.subject) ||
           N3.Util.isVariable(quad.predicate) ||
           N3.Util.isVariable(quad.object);
}

function hasBuiltIn(statements: N3.Quad[]) : N3.Quad[] | undefined {
    const builtin = statements.filter( stat => {
        return stat.predicate.value in builtins;
    });
    return builtin.length > 0 ? builtin : undefined;
}

// Find all quads in the store that match a quad.
// The quads may contain variables or blank nodes.
function collect(store:N3.Store
        , subject: N3.Term, predicate: N3.Term, object: N3.Term, graph?: N3.Term) : Map<string,N3.Term>[] | undefined {
    const collector : Map<string,N3.Term>[] = [];
    
    if (graph === undefined) {
        graph = N3.DataFactory.defaultGraph();
    }

    // Find the binding for this quad and check if there is some
    // match of the quad in the defaultGraph
    let count = 0;
    store.forEach( (quad) => {
        count++;

        let binding = new Map<string,N3.Term>();

        if (N3.Util.isVariable(subject) || N3.Util.isBlankNode(subject)) {
            binding.set(subject.value,quad.subject);
        }

        if (N3.Util.isVariable(predicate)) {
            binding.set(predicate.value, quad.predicate);
        }

        if (N3.Util.isVariable(object)) {
            binding.set(object.value, quad.object);
        }
           
        if (binding.size != 0) {
            collector.push(binding);
        }
    } , N3.Util.isVariable(subject) || N3.Util.isBlankNode(subject) ? null : subject
      , N3.Util.isVariable(predicate) ? null : predicate 
      , N3.Util.isVariable(object) || N3.Util.isBlankNode(object) ? null : object 
      , graph
    );

    if (count == 0) {
        return undefined;
    }
    else {
        return collector;
    }
}