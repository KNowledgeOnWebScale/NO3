const N3 = require('n3');
const fs = require('fs');
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

doit(process.argv[2]);

const BUILTIN  = Symbol('built-in');
const BUILTINS = {
    'http://www.w3.org/2000/10/swap/list#in': function (store,quad) {
        return list_in(store,quad);
    },
    'http://www.w3.org/2000/10/swap/list#length': function (store,quad) {
        return list_length(store,quad);
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
    let builtInValues = new Set();

    const result = store.every( (q) => {
        const subject   = q.subject;
        const predicate = q.predicate;
        const object    = q.object;
        const graph     = q.graph;

        // Match collector is an array of bindings that are found for the current quad
        let matchCollector;

        // Ignore subjects that are part of a built-in subgraph
        if (builtInValues.has(subject.value)) {
            if (isBlankNode(object)) {
                builtInValues.add(object.value);
            }
            return true;
        }

        // If the quad contains wildcards (a variable or an blank nodes) and
        // we have previous bindings then we need to substitute these bindings
        // and try to find new bindings...
        if (hasWildcard(q) && bindings.length != 0) {
            // Filter our the bindings that clash with new found bindings...
            bindings = bindings.filter( binding => {
                let _subject;
                let _predicate;
                let _object;

                // Result will decide if we need to delete a previous
                // binding that doesn't match given then new quad...
                let result = true;

                // Fill out the subject binding variable or blank node
                if (isVariableOrBlank(subject)) {
                    _subject = subject.value in binding ?
                                 binding[ subject.value ] :
                                 subject;
                }
                else {
                    _subject = subject;
                }

                // Fill out the predicate binding variable
                if (isVariable(predicate)) {
                    _predicate = predicate.value in binding ?
                                 binding[ predicate.value ] :
                                 predicate;
                }
                else {
                    _predicate = predicate;
                }

                // Fill out the object binding variable
                if (isVariable(object)) {
                    _object = object.value in binding ?
                                 binding[ object.value ] :
                                 object;
                }
                else {
                    _object = object;
                }

                // Match is the new binding
                let match;

                // Is the predicate a built-in? Add it to the buildInValues we should
                // ignore for now and calculate the true value of the builtIn predicate
                if (isBuiltIn(_predicate.value)) {
                    console.error(`${_predicate.value} is a built-in`);
                    // Request to ignore these built-in sub-graphs
                    if (isBlankNode(_subject)) {
                        builtInValues.add(_subject.value);
                    }
                    if (isBlankNode(_object)) {
                        builtInValues.add(_object.value);
                    }
                    matchCollector = BUILTIN; // An indicator we are dealing with a special built-in match
                    return result = builtIn(_predicate.value,store,quad(
                        _subject,
                        _predicate,
                        _object,
                        graph
                    ));
                }
                // Find new matches: undefined when nothing can be found
                // otherwise an array of bindings (hashes)
                else {
                    match = collect(store,_subject,_predicate,_object);
                }

                // Nothing can be found..this binding can't be correct
                // remove it...
                if (match === undefined) {
                    console.error('Match is undefined');
                    console.log(q);
                    // No results found
                    result = false;
                }
                // We found new bindings, append them to the rest
                else {
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
            // No previous binding exists, find the first binding
            // or undefined when the triple can't be found
            matchCollector = collect(store,subject,predicate,object);
        }

        // When we find no match for the triple in the rule
        // then it we have no result
        if (matchCollector === undefined) {
            console.error('No matches found');
            return false;
        }

        // If we have a built-in then we can assume the processing is already done
        if (matchCollector === BUILTIN) {
            return true;
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

function builtIn(url,store,quad) {
    if (! isBuiltIn(url) ) {
        return undefined;
    }
    else {
        return BUILTINS[url](store,quad);
    }
}

function isBuiltIn(url) {
    return url in BUILTINS;
}

function hasBuiltIn(quad) {
    return isBuiltIn(quad.predicate);
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
    return (typeof term !== 'undefined') && term.termType === 'Variable';
}

function isBlankNode(term) {
    return (typeof term !== 'undefined') && term.termType === 'BlankNode';
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
    const match = store.getQuads(
            undefined ,
            undefined,
            quad.subject,
            quad.graph
        );
    return match.length > 0;
}

function list_length(store,quad) {
    return true;
}