import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isInvalidPersonNameValue,
    parseGenderChoiceFromNameLikePhrase,
    sanitizePersonNameIfValid,
} from './person-name-sanitize.js';

describe('parseGenderChoiceFromNameLikePhrase', () => {
    it('maps es hombre / hombre to Hombre', () => {
        assert.equal(parseGenderChoiceFromNameLikePhrase('es hombre'), 'Hombre');
        assert.equal(parseGenderChoiceFromNameLikePhrase('hombre'), 'Hombre');
    });

    it('maps es mujer to Mujer', () => {
        assert.equal(parseGenderChoiceFromNameLikePhrase('es mujer'), 'Mujer');
    });

    it('does not treat real names as gender', () => {
        assert.equal(parseGenderChoiceFromNameLikePhrase('Prem Weken'), undefined);
        assert.equal(parseGenderChoiceFromNameLikePhrase('Juan Pérez'), undefined);
    });
});

describe('isInvalidPersonNameValue', () => {
    it('rejects gender phrases used as names', () => {
        assert.equal(isInvalidPersonNameValue('es hombre'), true);
        assert.equal(isInvalidPersonNameValue('es mujer'), true);
    });

    it('accepts ordinary personal names', () => {
        assert.equal(isInvalidPersonNameValue('Prem Weken'), false);
        assert.equal(sanitizePersonNameIfValid('prem weken'), 'prem weken');
    });
});
