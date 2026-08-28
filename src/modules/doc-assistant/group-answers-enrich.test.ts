import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichGroupAnswers } from './group-answers-enrich.js';

describe('enrichGroupAnswers compraventa names', () => {
    const sellerVars = [
        { key: 'sellerGender', label: 'Género del vendedor', type: 'dropdown', options: ['Hombre', 'Mujer'] },
        { key: 'sellerLegalName', label: 'Nombre completo del vendedor', type: 'text' },
    ];

    it('does not treat vendedor es hombre as a legal name', () => {
        const out = enrichGroupAnswers(
            'seller',
            sellerVars,
            {},
            'el vendedor es hombre y vive en Santo Domingo centro de la ciudad',
        );
        assert.notEqual(String(out.mapped.sellerLegalName ?? ''), 'es hombre');
    });

    it('reclaims es hombre submitted as sellerLegalName into Gender', () => {
        const out = enrichGroupAnswers('seller', sellerVars, { sellerLegalName: 'es hombre' });
        assert.equal(out.mapped.sellerLegalName, '');
        assert.equal(out.mapped.sellerGender, 'Hombre');
    });
});
