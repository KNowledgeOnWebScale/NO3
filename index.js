const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

doit();

async function parse() {
    const parser = new N3.Parser({ format: 'Notation3' });
    const store = new N3.Store();    
    await parser.parse(
        `
        PREFIX c: <http://example.org/cartoons#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> 
        c:Tom a c:Cat.
        c:Jerry a c:Mouse;
                c:smarterThan c:Tom.
        c:Mouse c:drinks "wine" .
        c:Mouse c:date "2001-08-10"^^xsd:date .
        c:Mouse c:knows ( c:Paul c:Dave ) .
        c:Cat a c:Animal .
                
        { 
            ?brol a c:Animal .
        }         
        => 
        {
            ?s c:say "Meow".
        }.

        `,
        (error, quad, prefixes) => {
        if (quad) {
            store.add(quad);
        }
        else {
            // We are done with parsing
        }

        if (error) {
            throw new Error(error);
        }
    });

    return store;
}

async function doit() {
    const store = await parse();
    store.forEach( (quad) => {
        console.log('-------');
        const res1 = shakeGraph(store,quad.subject);
        console.log(res1);
    }, undefined, namedNode('http://www.w3.org/2000/10/swap/log#implies'),undefined, undefined);
}

function shakeGraph(store,graph) {
    let bindings = [];

    const result = store.every( (quad) => {
        const subject   = quad.subject;
        const predicate = quad.predicate;
        const object    = quad.object;
     
        let matchCollector;

        if (hasVariable(quad) && bindings.length != 0) {
            // Try all possible bindings
            bindings = bindings.filter( binding => {
                let _subject;
                let _predicate;
                let _object;

                let result = true;

                if (isVariable(subject)) {
                    _subject = subject.value in binding ?
                                 binding[ subject.value ] :
                                 subject;
                }
                else {
                    _subject = subject;
                }

                if (isVariable(predicate)) {
                    _predicate = predicate.value in binding ?
                                 binding[ predicate.value ] :
                                 predicate;
                }
                else {
                    _predicate = predicate;
                }

                if (isVariable(object)) {
                    _object = object.value in binding ?
                                 binding[ object.value ] :
                                 object;
                }
                else {
                    _object = object;
                }

                const match = collect(store,_subject,_predicate,_object);

                if (match === undefined) {
                    // No results found
                    result = false;
                }
                else {
                    // Append them to the other results
                    match.forEach( item => {
                        if (matchCollector === undefined) {
                            matchCollector = [item];
                        }
                        else {
                            matchCollector.push(item);
                        }
                    });
                }

                return result;
            });
        }
        else {
            // Keep 
            matchCollector = collect(store,subject,predicate,object);
        }

        // When we find no match for the triple in the rule
        // then it we have no result
        if (matchCollector === undefined) {
            return false;
        }

        // We were given a variable but didn't find a match...
        if ( hasVariable(quad) && matchCollector.length == 0 ){
            return false;
        }

        // When we didn't have a binding yet add it to the possible
        // bindings and return true
        if (bindings.length == 0) {
            matchCollector.forEach( item => bindings.push(item ));
            return true;
        }

        // Add all the matches to the bindings...
        let newBindings = [];
        matchCollector.forEach( match => {
            bindings.forEach( binding => {
                newBindings.push( Object.assign(binding,match) );
            });
        });

        binding = newBindings;

        return true;
    }, undefined, undefined, undefined , graph);

    if (result) {
        return bindings;
    }
    else {
        return undefined;
    }
}

function hasVariable(quad) {
    return isVariable(quad.subject) ||
           isVariable(quad.predicate) ||
           isVariable(quad.object);
}

function isVariable(term) {
    return term.termType === 'Variable';
}

function isBlankNode(term) {
    return term.termType === 'BlankNode';
}

function collect(store,subject,predicate,object,graph) {
    const collector = [];
    
    if (graph === undefined) {
        graph = defaultGraph();
    }

    // Find the binding for this quad and check if there is some
    // match of the quad in the defaultGraph
    let count = 0;
    store.forEach( (quad) => {
        count++;

        let binding = {};

        if (isVariable(subject)) {
            binding[ subject.value ] = quad.subject;
        }

        if (isVariable(predicate)) {
            binding[ predicate.value ] = quad.predicate;
        }

        if (isVariable(object)) {
            binding[ object.value ] = quad.object;
        }
           
        if (binding.size != 0) {
            collector.push( binding );
        }
    } , isVariable(subject) ? undefined : subject
      , isVariable(predicate) ? undefined : predicate 
      , isVariable(object) ? undefined : object 
      , graph
    );

    if (count == 0) {
        return undefined;
    }
    else {
        return collector;
    }
}