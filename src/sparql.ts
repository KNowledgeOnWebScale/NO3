import { newEngine } from '@comunica/actor-init-sparql-rdfjs';
import { IQueryResultBindings } from '@comunica/actor-init-sparql';
import { BlankNodeScoped } from '@comunica/data-factory';
import { DataFactory } from 'rdf-data-factory';
import type * as RDF from '@rdfjs/types';
import * as N3 from 'n3';

export async function sparqlQuery(query: string, store: N3.Store) {
    const myEngine = newEngine();
    const result = <IQueryResultBindings> await myEngine.query(query, { sources: [store] });

    return result.bindings();
}

export function unSkolemizedValue(term: RDF.Term ) : string | undefined {
    if (term instanceof BlankNodeScoped) {
        const skolemizedName = (<BlankNodeScoped> term).skolemized.value;
        const unSkolemizedName = skolemizedName.replace("urn:comunica_skolem:source_0:",""); 
        return unSkolemizedName;
    }
    else {
        return term.value;
    } 
}