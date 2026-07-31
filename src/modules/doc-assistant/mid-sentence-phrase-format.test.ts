import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMidSentencePhrase, isMidSentencePhraseKey } from './mid-sentence-phrase-format.js';

describe('isMidSentencePhraseKey', () => {
    it('recognizes contactMethod and commercialLicenseScope as mid-sentence keys', () => {
        assert.equal(isMidSentencePhraseKey('contactMethod'), true);
        assert.equal(isMidSentencePhraseKey('commercialLicenseScope'), true);
        assert.equal(isMidSentencePhraseKey('userContentLicenseScope'), true);
    });

    it('excludes job titles and semicolon-list keys from mid-sentence lowercasing', () => {
        assert.equal(isMidSentencePhraseKey('positionTitle'), false);
        assert.equal(isMidSentencePhraseKey('supervisorPositionTitle'), false);
        assert.equal(isMidSentencePhraseKey('functionsList'), false);
        assert.equal(isMidSentencePhraseKey('servicesList'), false);
        assert.equal(isMidSentencePhraseKey('additionalBenefitsList'), false);
    });
});

describe('normalizeMidSentencePhrase', () => {
    it('lowercases the first letter of mid-sentence phrases', () => {
        assert.equal(normalizeMidSentencePhrase('No exclusivo'), 'no exclusivo');
        assert.equal(normalizeMidSentencePhrase('Mal comportamiento'), 'mal comportamiento');
        assert.equal(normalizeMidSentencePhrase('Daños graves al inmueble'), 'daños graves al inmueble');
    });

    it('preserves proper nouns at the start of the phrase', () => {
        assert.equal(normalizeMidSentencePhrase('Juan Pérez como testigo'), 'Juan Pérez como testigo');
        assert.equal(normalizeMidSentencePhrase('República Dominicana y sus leyes'), 'República Dominicana y sus leyes');
        assert.equal(normalizeMidSentencePhrase('Banco Popular y sus sucursales'), 'Banco Popular y sus sucursales');
        assert.equal(normalizeMidSentencePhrase('Santo Domingo es la capital'), 'Santo Domingo es la capital');
    });

    it('preserves acronyms at the start of the phrase', () => {
        assert.equal(normalizeMidSentencePhrase('RNC entregado por la empresa'), 'RNC entregado por la empresa');
        assert.equal(normalizeMidSentencePhrase('ITBIS incluido en el precio'), 'ITBIS incluido en el precio');
    });

    it('strips trailing sentence punctuation', () => {
        assert.equal(normalizeMidSentencePhrase('Mal comportamiento.'), 'mal comportamiento');
        assert.equal(normalizeMidSentencePhrase('daños graves, '), 'daños graves');
        assert.equal(normalizeMidSentencePhrase('motivos;'), 'motivos');
        assert.equal(normalizeMidSentencePhrase('incumplimiento:'), 'incumplimiento');
    });

    it('handles combinations of lowercasing and punctuation stripping', () => {
        assert.equal(normalizeMidSentencePhrase('Mal comportamiento, daños graves... del contrato de alquiler.'), 'mal comportamiento, daños graves... del contrato de alquiler');
        assert.equal(normalizeMidSentencePhrase('Devolver íntegramente al propietario;'), 'devolver íntegramente al propietario');
    });

    it('handles empty or blank inputs safely', () => {
        assert.equal(normalizeMidSentencePhrase(''), '');
        assert.equal(normalizeMidSentencePhrase('   '), '   ');
    });
});
