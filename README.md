# NO3 - A Notation3 inference engine

NO3 is a small forward-chaining inference engine for a subset of the [Notation3](https://w3c.github.io/N3/spec/) language.

## Notation3 support

All NO3 formulas need to be simple:

- No cited formulas
- No paths
- No backward-chaining `<=`
- No owl:sameAs symbol `=`
- Limited support for built-ins (at this moment NONE)

A supported formula:

```
{ ?X :cooks ?Y. } => { ?Y :isCookedBy ?X . } .
```

An unsupported formula:

```
{ ?X :says { ?X :cooks ?Y } } => { ?X :means { ?Y :isCookedBy ?X } } .
```

NO3 does support simple inferences:

Given:

```
:Socrates a :Man.
:Man rdfs:subClassOf :Mortal.

{
    ?A rdfs:subClassOf ?B. 
    ?S a ?A.
} => 
{
    ?S a ?B
}.
```

Results in:

```
:Socrates a :Mortal.
```

Formules can be given in any order:

Given:

```
:Hank :cooks :Soup .

{ ?X :isCookedBy ?Y . } => { ?X :isOnMenuOf ?Y . }.

{ ?X :cooks ?Y. } => { ?Y :isCookedBy ?X . } .
```

Results in (irrespective of order of formulas):

```
:Soup :isCookedBy :Hank;
    :isOnMenuOf :Hank.
```

Support for existential and universal quantifiers.

Given:

```
:Hank :plays :Guitar.
:Emily :plays :Piano.

:Guitar a :MusicInstrument .
:Piano a :MusicInstrument .

{ ?S :plays [ a :MusicInstrument ] .  } => { ?S :canEnter :Recital. }.
```

Results in:

```
:Hank :canEnter :Recital .
:Emily :canEnter :Recital .
```

## Raison d'être

NO3 was developed to have basic Notation3 support in JavaScript for environments
that don't require all features of a [CWM](https://github.com/sbp/cwm) or [EYE](https://josd.github.io/eye/) processor.

## Naming

NO3 read as Notation 0.3 (because the lack of features) and interpreted as the chemical compound 
Nitrate (NO-3), which can be a fertilizer but also an explosive.

This code was written for the Mellon Project "Scholarly Communication on the decentralized web" as
a proof of concept.