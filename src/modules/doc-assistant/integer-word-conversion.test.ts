import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeCombinedIntegerValue,
    normalizeCombinedIntegerKeys
} from './integer-word-conversion.js';

describe('normalizeCombinedIntegerValue', () => {
    it('normalizes simple numbers', () => {
        assert.equal(normalizeCombinedIntegerValue('16', 'masculine-apocope'), 'dieciséis (16)');
        assert.equal(normalizeCombinedIntegerValue('40', 'plain'), 'cuarenta (40)');
    });

    it('normalizes simple words', () => {
        assert.equal(normalizeCombinedIntegerValue('dieciséis', 'masculine-apocope'), 'dieciséis (16)');
        assert.equal(normalizeCombinedIntegerValue('cuarenta', 'plain'), 'cuarenta (40)');
    });

    it('retains values already having the digit in parentheses, avoiding feedback loops', () => {
        assert.equal(normalizeCombinedIntegerValue('Dieciséis (16) años', 'masculine-apocope'), 'Dieciséis (16)');
        assert.equal(normalizeCombinedIntegerValue('dieciséis (16) años', 'masculine-apocope'), 'dieciséis (16)');
        assert.equal(normalizeCombinedIntegerValue('40 horas (40)', 'plain'), '40 (40)');
    });

    it('retains simple normalized format', () => {
        assert.equal(normalizeCombinedIntegerValue('dieciséis (16)', 'masculine-apocope'), 'dieciséis (16)');
        assert.equal(normalizeCombinedIntegerValue('cuarenta (40)', 'plain'), 'cuarenta (40)');
    });
});

describe('normalizeCombinedIntegerKeys', () => {
    it('normalizes the minimumAge key correctly', () => {
        const out = {
            minimumAge: 'Dieciséis (16) años'
        };
        const changed = normalizeCombinedIntegerKeys(out);
        assert.equal(changed, true);
        assert.equal(out.minimumAge, 'Dieciséis (16)');
    });

    it('normalizes unnormalized minimumAge correctly', () => {
        const out = {
            minimumAge: 'Dieciséis años'
        };
        const changed = normalizeCombinedIntegerKeys(out);
        assert.equal(changed, true);
        assert.equal(out.minimumAge, 'Dieciséis (16)');
    });
});
