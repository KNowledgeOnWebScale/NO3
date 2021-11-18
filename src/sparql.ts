import { newEngine } from '@comunica/actor-init-sparql-rdfjs';
import { IQueryResultBindings } from '@comunica/actor-init-sparql';
import { BlankNodeScoped } from '@comunica/data-factory';
import { Bindings } from '@comunica/bus-query-operation';
import * as N3 from 'n3';
import { getLogger } from "log4js";
import { DataFactory } from 'rdf-data-factory';

const logger   = getLogger();
const myEngine = newEngine();
const DF       = new DataFactory();

export async function sparqlQuery(query: string, store: N3.Store) : Promise<Bindings[]> {
    const result = <IQueryResultBindings> await myEngine.query(query, { sources: [store] });
    const bindings = await result.bindings();

    return bindings.map( (bs) => {
        let bind : any = {};

        bs.forEach( (value, key) => {
            if (key && value && value instanceof BlankNodeScoped) {
                const skolemizedName = (<BlankNodeScoped> value).skolemized.value;
                const unSkolemizedName = skolemizedName.replace("urn:comunica_skolem:source_0:",""); 
                console.log(`>>>>>>>here ${key}`);
                bind[key] = DF.namedNode(unSkolemizedName);
            }
            else if (key && value) {
                bind[key] = value;
            }
        });

        return Bindings(bind);
    });
}