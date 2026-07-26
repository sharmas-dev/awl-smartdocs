import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompraventaSigningDateFragments } from './compraventa-signing-date.js';

describe('normalizeCompraventaSigningDateFragments', () => {
    it('strips duplicate parenthetical from day letters when numbers match', () => {
        const out: Record<string, string | number> = {
            signingDateLetters: 'Treinta (30)',
            signingDateNumbers: '30',
            signingMonthLetters: 'junio',
            signingYearLetters: 'Dos Mil Veintiséis (2026)',
            signingYearNumbers: '2026',
        };
        assert.equal(normalizeCompraventaSigningDateFragments(out), true);
        assert.equal(out.signingDateLetters, 'treinta');
        assert.equal(out.signingDateNumbers, '30');
        assert.equal(out.signingYearLetters, 'dos mil veintiséis');
        assert.equal(out.signingYearNumbers, '2026');
    });

    it('converts numeric-only day letters to Spanish words', () => {
        const out: Record<string, string | number> = {
            signingDateLetters: '30',
            signingDateNumbers: '30',
            signingMonthLetters: 'junio',
            signingYearLetters: '2026',
            signingYearNumbers: '2026',
        };
        normalizeCompraventaSigningDateFragments(out);
        assert.equal(out.signingDateLetters, 'treinta');
        assert.equal(out.signingYearLetters, 'dos mil veintiséis');
    });

    it('expands from documentSigningDate to clean fragments', () => {
        const out: Record<string, string | number> = {
            documentSigningDate: '30 de junio de 2026',
            signingDateLetters: 'Treinta (30)',
            signingDateNumbers: '30',
            signingMonthLetters: 'junio',
            signingYearLetters: 'Dos Mil Veintiséis (2026)',
            signingYearNumbers: '2026',
        };
        normalizeCompraventaSigningDateFragments(out);
        assert.equal(out.signingDateLetters, 'treinta');
        assert.equal(out.signingDateNumbers, '30');
        assert.equal(out.signingMonthLetters, 'junio');
        assert.equal(out.signingYearLetters, 'dos mil veintiséis');
        assert.equal(out.signingYearNumbers, '2026');
    });
});
