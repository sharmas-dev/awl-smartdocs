import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeDomesticSalaryCurrencyDisplay } from './domestic-salary-format.js';

describe('normalizeDomesticSalaryCurrencyDisplay', () => {
    it('formats RD$ prefix with a space for domestic contract display', () => {
        assert.equal(normalizeDomesticSalaryCurrencyDisplay('RD$40000'), 'RD$ 40,000.00');
        assert.equal(normalizeDomesticSalaryCurrencyDisplay('RD$ 40,000'), 'RD$ 40,000.00');
    });

    it('normalizes suffix RD$ values to RD$ 40,000.00', () => {
        assert.equal(normalizeDomesticSalaryCurrencyDisplay('40,000 RD$'), 'RD$ 40,000.00');
        assert.equal(normalizeDomesticSalaryCurrencyDisplay('(40,000 RD$)'), 'RD$ 40,000.00');
    });
});
