import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collapseAbbreviationDoubleDots, collapseGenericDoubleDots } from './abbreviation-dot-cleanup.js';

describe('collapseAbbreviationDoubleDots', () => {
    it('normalizes common abbreviation trailing dots', () => {
        assert.equal(collapseAbbreviationDoubleDots('8 a.m. a 5 p.m..'), '8 a.m. a 5 p.m.');
        assert.equal(collapseAbbreviationDoubleDots('Reunión a las 9 a.m..'), 'Reunión a las 9 a.m.');
        assert.equal(collapseAbbreviationDoubleDots('firma S.A..'), 'firma S.A.');
        assert.equal(collapseAbbreviationDoubleDots('p.m...'), 'p.m.');
    });

    it('does not touch ordinary single punctuation or abbreviations with trailing content', () => {
        assert.equal(collapseAbbreviationDoubleDots('8 a.m. a 5 p.m., híbrido.'), '8 a.m. a 5 p.m., híbrido.');
    });
});

describe('collapseGenericDoubleDots', () => {
    it('collapses exactly two consecutive periods into one', () => {
        assert.equal(collapseGenericDoubleDots('alquiler..'), 'alquiler.');
        assert.equal(collapseGenericDoubleDots('ej..'), 'ej.');
        assert.equal(collapseGenericDoubleDots('responsabilidad..'), 'responsabilidad.');
    });

    it('preserves legitimate ellipses (3 or more periods)', () => {
        assert.equal(collapseGenericDoubleDots('...'), '...');
        assert.equal(collapseGenericDoubleDots('algo...'), 'algo...');
        assert.equal(collapseGenericDoubleDots('Dominicana....'), 'Dominicana....');
        assert.equal(collapseGenericDoubleDots('8 a.m. ...'), '8 a.m. ...');
    });
});
