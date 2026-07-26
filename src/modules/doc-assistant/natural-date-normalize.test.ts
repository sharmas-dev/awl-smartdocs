import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    formatSpanishLegalDateDual,
    parseStoredCalendarDateToYMD,
} from './natural-date-normalize.js';

describe('formatSpanishLegalDateDual', () => {
    it('formats calendar date to new dual legal format without parenthesized month number and with lowercase words', () => {
        const out = formatSpanishLegalDateDual('16 de mayo de 2026');
        assert.equal(out, 'dieciséis (16) de mayo del dos mil veintiséis (2026)');
    });

    it('is idempotent on already-correct dual strings', () => {
        const dual = 'dieciséis (16) de mayo del dos mil veintiséis (2026)';
        assert.equal(formatSpanishLegalDateDual(dual), dual);
    });

    it('migrates legacy dual strings with month number to new dual format', () => {
        const legacy = 'Dieciséis (16) de Mayo (5) del Dos Mil Veintiséis (2026)';
        assert.equal(
            formatSpanishLegalDateDual(legacy),
            'dieciséis (16) de mayo del dos mil veintiséis (2026)',
        );
    });

    it('migrates legacy dual strings without month number to new dual format', () => {
        const legacy = 'Dieciséis (16) de Mayo del Dos Mil Veintiséis (2026)';
        assert.equal(
            formatSpanishLegalDateDual(legacy),
            'dieciséis (16) de mayo del dos mil veintiséis (2026)',
        );
    });
});

describe('parseStoredCalendarDateToYMD dual formats', () => {
    it('parses new dual format (month name only)', () => {
        const ymd = parseStoredCalendarDateToYMD(
            'Dieciséis (16) de Mayo del Dos Mil Veintiséis (2026)',
        );
        assert.deepEqual(ymd, { d: 16, m: 5, y: 2026 });
    });

    it('parses legacy dual format (month number in parentheses)', () => {
        const ymd = parseStoredCalendarDateToYMD(
            'Dieciséis (16) de Mayo (5) del Dos Mil Veintiséis (2026)',
        );
        assert.deepEqual(ymd, { d: 16, m: 5, y: 2026 });
    });

    it('parses el-prefixed Spanish dates', () => {
        const ymd = parseStoredCalendarDateToYMD('el 30 de diciembre de 2025.');
        assert.deepEqual(ymd, { d: 30, m: 12, y: 2025 });
    });
});

import { normalizeNaturalDateInput } from './natural-date-normalize.js';

describe('normalizeNaturalDateInput relative dates', () => {
    const ref = new Date('2026-07-23T12:00:00Z'); // Thursday July 23, 2026
    const opts = { reference: ref, timeZone: 'America/Santo_Domingo' };

    it('normalizes today and its variations', () => {
        assert.equal(normalizeNaturalDateInput('hoy', opts), '23 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('today', opts), '23 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('el día de hoy', opts), '23 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('a partir de hoy', opts), '23 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('desde hoy', opts), '23 de julio de 2026');
    });

    it('normalizes yesterday and its variations', () => {
        assert.equal(normalizeNaturalDateInput('ayer', opts), '22 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('yesterday', opts), '22 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('el día de ayer', opts), '22 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('desde ayer', opts), '22 de julio de 2026');
    });

    it('normalizes tomorrow and future relative phrases', () => {
        assert.equal(normalizeNaturalDateInput('mañana', opts), '24 de julio de 2026');
        assert.equal(normalizeNaturalDateInput('pasado mañana', opts), '25 de julio de 2026');
    });
});
