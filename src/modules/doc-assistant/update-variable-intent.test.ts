import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    looksLikeStandaloneReplacementValue,
    matchCompraventaPartyLegalNameLabel,
    parseNewValueFromChangePhrase,
    parsePendingUpdateVariable,
    serializePendingUpdateVariable,
} from './update-variable-intent.js';

describe('parseNewValueFromChangePhrase', () => {
    it('extracts the name after change to', () => {
        assert.equal(parseNewValueFromChangePhrase('i want to change to prem weken'), 'prem weken');
        assert.equal(parseNewValueFromChangePhrase('change to morales'), 'morales');
        assert.equal(parseNewValueFromChangePhrase('cambiar a Ana López'), 'Ana López');
    });

    it('returns undefined for plain labels', () => {
        assert.equal(parseNewValueFromChangePhrase('nombre del comprador'), undefined);
    });
});

describe('looksLikeStandaloneReplacementValue', () => {
    it('accepts a bare new name after lookup', () => {
        assert.equal(looksLikeStandaloneReplacementValue('prem weken'), true);
        assert.equal(looksLikeStandaloneReplacementValue('morales'), true);
    });

    it('rejects schema-like labels', () => {
        assert.equal(looksLikeStandaloneReplacementValue('nombre del comprador'), false);
    });
});

describe('pending update serialization', () => {
    it('round-trips', () => {
        const pending = { groupId: 'buyer', key: 'buyerLegalName', label: 'Nombre completo del comprador' };
        assert.deepEqual(parsePendingUpdateVariable(serializePendingUpdateVariable(pending)), pending);
    });
});

describe('matchCompraventaPartyLegalNameLabel', () => {
    const schema = {
        groups: [
            {
                id: 'seller',
                label: 'A. EL VENDEDOR',
                variables: [
                    { key: 'sellerLegalName', label: 'Nombre completo del vendedor (nombre y apellidos, o razón social)' },
                    { key: 'sellerSpouseFullName', label: 'Nombre completo del cónyuge del vendedor' },
                ],
            },
            {
                id: 'buyer',
                label: 'B. EL COMPRADOR',
                variables: [
                    { key: 'buyerLegalName', label: 'Nombre completo del comprador (nombre y apellidos, o razón social)' },
                ],
            },
        ],
    };

    it('maps nombre del comprador to buyerLegalName not seller', () => {
        const match = matchCompraventaPartyLegalNameLabel('nombre del comprador', schema);
        assert.equal(match?.key, 'buyerLegalName');
    });

    it('maps seller name phrasing to sellerLegalName', () => {
        const match = matchCompraventaPartyLegalNameLabel("seller's name", schema);
        assert.equal(match?.key, 'sellerLegalName');
    });
});
