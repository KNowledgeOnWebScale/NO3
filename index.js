const N3 = require('n3');
const fs = require('fs');
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

doit(process.argv[2]);

const DYNAMICS = {
    'http://www.w3.org/2000/10/swap/list#in': function (store,quad) {
        return list_in(store,quad);
    }
}

async function parse(N3String) {
    const parser = new N3.Parser({ format: 'Notation3' });
    const store = new N3.Store();    
    await parser.parse(N3String,
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

async function doit(path) {
    const N3String = fs.readFileSync(path, { encoding: "utf8", flag: "r" });
    const store = await parse(N3String);
    store.forEach( (quad) => {
        console.log('-------');
        const res1 = shakeGraph(store,quad.subject);
        console.log(res1);
    }, undefined, namedNode('http://www.w3.org/2000/10/swap/log#implies'),undefined, undefined);
}

function shakeGraph(store,graph) {
    let bindings = [];

    const result = store.every( (q) => {
        const subject   = q.subject;
        const predicate = q.predicate;
        const object    = q.object;
    
        let matchCollector;

        if (hasWildcard(q) && bindings.length != 0) {
            // Try all possible bindings
            bindings = bindings.filter( binding => {
                let _subject;
                let _predicate;
                let _object;

                let result = true;

                if (isVariableOrBlank(subject)) {
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
                    console.log(q);
                    console.error('Match is undefined');
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
            console.error('No matches found');
            return false;
        }

        // We were given a variable but didn't find a match...
        if ( hasWildcard(q) && matchCollector.length == 0 ){
            console.error('Wildcard without a match!');
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
                newBindings.push( Object.assign({},binding,match) );
            });
        });

        bindings = newBindings;

        return true;
    }, undefined, undefined, undefined , graph);

    if (result) {
        return bindings;
    }
    else {
        return undefined;
    }
}

function dynamic(url,store,quad) {
    if (! isDynamic(url)) {
        return undefined;
    }
    else {
        return DYNAMICS[url](store,quad);
    }
}

function isDynamic(url) {
    return url in DYNAMICS;
}

function hasDynamic(quad) {
    return isDynamic(quad.predicate);
}

function hasWildcard(quad) {
    return isVariableOrBlank(quad.subject) ||
           isVariable(quad.predicate) ||
           isVariable(quad.object);
}

function isVariableOrBlank(term) {
    return isVariable(term) || isBlankNode(term);
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

        if (isVariableOrBlank(subject)) {
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
    } , isVariableOrBlank(subject) ? undefined : subject
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

function list_in(store,quad) {
    console.log('hi');
    return [{}];
}