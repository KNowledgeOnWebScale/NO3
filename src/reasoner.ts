import * as N3 from 'n3';
import * as RDF from "@rdfjs/types";
import { sha256 } from 'js-sha256';
import { sparqlQuery, unSkolemizedValue } from './sparql';
import { IParsedN3, parseStatements, store2string } from './parse';
import { Bindings } from '@comunica/types';
import { getLogger } from "log4js";

export {
    think
};

const logger = getLogger();

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
async function reasoner(store: N3.Store, rule: Rule, skolemitor: () => N3.Term) : Promise<N3.Store> {
    const production = new N3.Store(); 

    logger.debug(rule.implicator.sparql);
    logger.debug(`  ${rule.implications.sparql}`);

    // Calculate the bindings for the SPARQL
    logger.info('execute sparql');
    const bindings      = await sparqlQuery(rule.implicator.sparql,store);

    if (bindings.length == 0) {
        return production;
    }

    const implicatorMap   = rule.implicator.map;
    const implications    = rule.implications.statements;
    const implicationsMap = rule.implications.map;

    const currentBlankNodeMap = new Map<string,string>();
    const currentVariableMap  = new Map<string,string>();

    // Return the bound term or null...
    const boundTerm = (binding: Bindings, term: N3.Term) => {
        if (implicatorMap.has(term.value)) {
            const key = <string> implicatorMap.get(term.value);
            const nextTerm =  <N3.Term> binding.get(key); 
            // See later..why unSkolemized is required...
            if (isBlankNode(nextTerm)) {
                return N3.DataFactory.blankNode(unSkolemizedValue(nextTerm));
            }
            else {
                return nextTerm;
            }
        }
        else {
            return null;
        }
    };

    // Return true when a blank node is already bound in the formula...
    const isBoundBlankOrVariable = (binding: Bindings, term: N3.Term) => {
        if (! isBlankNodeOrVariable(term)) {
            return false;
        }
        
        const testTerm = implicationsMap.get(term.value);

        if (! testTerm ) {
            return false;
        }

        return implications.some( st => {
            return st.some( q => {
                const subjectBound   = boundTerm(binding,q.subject);
                const predicateBound = boundTerm(binding,q.predicate);
                const objectBound    = boundTerm(binding,q.object);

                if (subjectBound != null && isBlankNodeOrVariable(subjectBound) && subjectBound.value === testTerm) {
                    return true;
                }

                if (predicateBound != null && isBlankNodeOrVariable(predicateBound) && predicateBound.value === testTerm) {
                    return true;
                }

                if (objectBound != null && isBlankNodeOrVariable(objectBound) && objectBound.value === testTerm) {
                    return true;
                }

                return false;
            });
        });
    };

    const bindTerm = (binding:Bindings, term:N3.Term) => {
        let nextTerm : N3.Term;

        // Option 1. Does the term match a binding key?
        if (implicatorMap.has(term.value)) {
            logger.debug(`bind 1> ${term.value}`);
            const key = <string> implicatorMap.get(term.value);
            nextTerm = <N3.Term> binding.get(key); 
        }
        // Option 2. Is term a blank node or a unbound variable?
        //           (unbound variables we treat as blank nodes)
        else if (isBlankNodeOrVariable(term)) {
            // Option 2a. In a previous run of this rule, we already saw this blank
            // node, reuse the :sk_N blank node
            if (!isBoundBlankOrVariable(binding,term) && implicationsMap.has(term.value)) {
                logger.debug(`bind 2a> ${term.value}`);
                nextTerm = N3.DataFactory.blankNode(implicationsMap.get(term.value)); 
            }
            // Option 2b. For the current rule, the current run, we already saw
            // this blank node, reuse the :sk_N blank node
            else if (currentBlankNodeMap.has(term.value)) {
                logger.debug(`bind 2b> ${term.value}`);
                nextTerm = N3.DataFactory.blankNode(currentBlankNodeMap.get(term.value));
            }
            // Option 2c. We never saw this blank node, translate it to a new :sk_N blank node
            else {
                logger.debug(`bind 2c> ${term.value}`);
                nextTerm = skolemitor();
                currentBlankNodeMap.set(term.value,nextTerm.value);
            }
        }
        // Option 3.
        else {
            logger.debug(`bind 3> ${term.value}`);
            nextTerm = term; 
        }

        // SPARQL 1.1. requires blank nodes to be skolemized over different scopes
        // This we have to undo to be able to reason about existing blank nodes...
        if (isBlankNode(nextTerm)) {
            return N3.DataFactory.blankNode(unSkolemizedValue(nextTerm));
        }
        else {
            return nextTerm;
        }
    };

    logger.info('bind all quantifiers');
    bindings.forEach( binding => {
        implications.forEach( st => {
            st.forEach( q  => {
                let subject : N3.Term;
                let predicate : N3.Term;
                let object : N3.Term;
                let graph : N3.Term;

                subject   = bindTerm(binding, q.subject);
                predicate = bindTerm(binding, q.predicate);
                object    = bindTerm(binding, q.object);

                logger.debug(`bind => ${subject.value} ${predicate.value} ${object.value}`);

                production.add(N3.DataFactory.quad(subject as RDF.Quad_Subject,
                                                  predicate as RDF.Quad_Predicate,
                                                  object as RDF.Quad_Object,
                                              ));
            });
        });
    });

    // Add the blank nodes to known blank nodes
    currentBlankNodeMap.forEach( (value: string, key:string) => {
        rule.implications.map.set(key,value);
    });

    return production;
}

function compileRules(parsedN3 : IParsedN3) : Rule[] {
    let count = 0;

    const rules = [];

    for (const quad of parsedN3.implies) {
        const implicator   = parseStatements(parsedN3.graphs[quad.subject.value]);
        const implications = parseStatements(parsedN3.graphs[quad.object.value]);

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
async function think(parsedN3: IParsedN3) : Promise<N3.Store> {
    // Store that holds the produced graphs
    const production = new N3.Store();

    // An array of rules (the formulas in the graph)
    const rules = compileRules(parsedN3);

    // A skolem generator 
    const skolemitor = nextSkolem();

    let productionDelta    = 0;
    let prevProductionSize = production.size;

    // This is the CWM think loop that can run for ever with simple self-referencing N3 rules
    // See: data/loop.n3
    do {
        for (const rule of rules) {
            // Here we start calculating all the inferred quads..
            const tmpStore = await reasoner(parsedN3.store,rule,skolemitor);

            logger.info(`Got: ${tmpStore.size} quads`);

            if ( logger.isDebugEnabled() ) {
                const str = await store2string(tmpStore);
                logger.debug('===');
                logger.debug(str);
                logger.debug('---');
            }

            // Add the result to the workStore
            tmpStore.forEach( quad => {
                parsedN3.store.add(quad);
                production.add(quad);
            },null,null,null,N3.DataFactory.defaultGraph());

            productionDelta    = production.size - prevProductionSize;
            prevProductionSize = production.size;
        }

        logger.info(`Total: ${productionDelta} new quads`);
    } while (productionDelta != 0);

    return production;
}

// Translate the statements of one formula into a SPARQL query
function statementsAsSPARQL(statements: N3.Quad[][],quantifierMap: Map<string,string> = new Map<string,string>()) : string {
    const quantifier = nextQuantifier();
    const sparql = 'SELECT * {' + 
                    statements.map( s => statementSExpression(s, quantifierMap, quantifier) ).join("\n") + 
                   '}';
    return sparql;
}

// Translate a statement (array of quads[]) to a SPARQL S-Expression.
// The quantifierMap is a local mapping of extentials and universals to S-Expression variables
function statementSExpression(quads: N3.Quad[], quantifierMap: Map<string,string>, quantifier: () => N3.Term) : string {

    const sexpressionPart = (term: N3.Term) => {
        if (isNamedNode(term)) {
            return `<${term.value}>`;
        }
        else if (isBlankNode(term)) {
            if (quantifierMap.has(term.value)) {
                // We are ok
            }
            else {
                quantifierMap.set(term.value, '?' + quantifier().value);
            }
            return quantifierMap.get(term.value); 
        }
        else if (isVariable(term)) {
            if (quantifierMap.has(term.value)) {
                // We are ok
            }
            else {
                quantifierMap.set(term.value, '?' + quantifier().value);
            }

            return quantifierMap.get(term.value); 
        }
        else if (isLiteral(term)) {
            return `"${term.value}"`;
        }
        else {
            logger.error(`Found an unknown term type ${term}`);
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

    const sparqlQuery = parts.join(" ");

    return sparqlQuery;
}

function nextQuantifier() : () => N3.Term {
    let quantifierCounter = 0;
    return () => { return N3.DataFactory.variable('U_' + quantifierCounter++); };
}

function nextSkolem() : () => N3.Term {
    let skolemCounter = 0;
    return () => { return N3.DataFactory.blankNode('sk_' + skolemCounter++); }
}

function make_skolem_namespace() : string {
    const rand  = Math.floor(Math.random() * (2**62)).toString();
    const genid = Buffer.from(sha256(rand)).toString('base64url');
    return `http://phochste.github.io/.well-known/genid/${genid}#`;
}

function isBlankNode(term: N3.Term) : boolean {
    return N3.Util.isBlankNode(term);
}

function isLiteral(term: N3.Term) : boolean {
    return N3.Util.isBlankNode(term);
}

function isNamedNode(term: N3.Term) : boolean {
    return N3.Util.isNamedNode(term);
}

function isVariable(term: N3.Term) : boolean {
    return N3.Util.isVariable(term);
}

function isBlankNodeOrVariable(term: N3.Term) : boolean {
    return isBlankNode(term) || isVariable(term);
}