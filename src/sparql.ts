import { newEngine } from '@comunica/actor-init-sparql-rdfjs';
import { IQueryResultBindings } from '@comunica/actor-init-sparql';
import * as N3 from 'n3';

export async function sparqlQuery(query: string, store: N3.Store) {
    const myEngine = newEngine();
    const result = <IQueryResultBindings> await myEngine.query(query, { sources: [store] });

    const bindings = result.bindings();

    return bindings;
}