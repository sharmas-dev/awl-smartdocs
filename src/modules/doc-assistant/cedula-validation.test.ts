import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    detectCedulaValidationErrorsFromUserMessage,
    extractCedulaDigits,
    getInvalidCedulaFieldsInVariables,
    isCedulaFieldValueValid,
    isRncVariableKey,
    looksLikeDominicanCedulaAttempt,
    normalizeCedulaNumberInput,
    normalizeRncNumberInput,
    shouldApplyCedulaDigitValidation,
    shouldApplyRncDigitValidation,
    validateAndNormalizeCedulaAnswers,
} from './cedula-validation.js';

describe('normalizeCedulaNumberInput', () => {
    it('formats 11 digits without hyphens', () => {
        const r = normalizeCedulaNumberInput('00123456789');
        assert.equal(r.ok, true);
        if (r.ok) assert.equal(r.formatted, '001-2345678-9');
    });

    it('formats 11 digits with hyphens and spaces', () => {
        const r = normalizeCedulaNumberInput('001-2345678-9');
        assert.equal(r.ok, true);
        if (r.ok) assert.equal(r.formatted, '001-2345678-9');
    });

    it('rejects wrong digit count', () => {
        assert.equal(normalizeCedulaNumberInput('001345789').ok, false);
        assert.equal(normalizeCedulaNumberInput('001345789012').ok, false);
    });
});

describe('validateAndNormalizeCedulaAnswers', () => {
    it('normalizes seller id when tipo is cédula', () => {
        const { normalized, rejected } = validateAndNormalizeCedulaAnswers(
            {
                sellerIdType: 'de la cédula de identidad y electoral',
                sellerIdNumber: '00123456789',
            },
            {},
        );
        assert.equal(rejected.length, 0);
        assert.equal(normalized.sellerIdNumber, '001-2345678-9');
    });

    it('rejects invalid cédula and leaves pasaporte unchanged', () => {
        const { normalized, rejected } = validateAndNormalizeCedulaAnswers(
            {
                buyerIdType: 'del pasaporte',
                buyerIdNumber: 'AB123456',
                sellerIdType: 'de la Cédula de Identidad y Electoral',
                sellerIdNumber: '12345',
            },
            {},
        );
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0]?.key, 'sellerIdNumber');
        assert.equal(normalized.buyerIdNumber, 'AB123456');
        assert.equal(normalized.sellerIdNumber, undefined);
    });
});

describe('shouldApplyCedulaDigitValidation', () => {
    it('applies to id number keys with cédula tipo', () => {
        assert.equal(
            shouldApplyCedulaDigitValidation('declarantIdNumber', 'de la Cédula de Identidad y Electoral', '001'),
            true,
        );
        assert.equal(shouldApplyCedulaDigitValidation('declarantIdNumber', 'del Pasaporte', '00123456789'), false);
    });
});

describe('isCedulaFieldValueValid', () => {
    it('rejects 10-digit employer cédula', () => {
        assert.equal(
            isCedulaFieldValueValid('employerIdNumber', '0018527413', 'Cédula'),
            false,
        );
        assert.equal(
            isCedulaFieldValueValid('employerIdNumber', '001-8527413.', 'Cédula'),
            false,
        );
    });

    it('rejects placeholder cédula with middle zeros', () => {
        assert.equal(
            isCedulaFieldValueValid('employerIdNumber', '001-0000000-0', 'Cédula'),
            false,
        );
    });

    it('accepts 11-digit formatted cédula', () => {
        assert.equal(
            isCedulaFieldValueValid('employerIdNumber', '001-2345678-9', 'Cédula'),
            true,
        );
    });
});

describe('detectCedulaValidationErrorsFromUserMessage', () => {
    it('rejects short standalone 10-digit reply for employer', () => {
        const errors = detectCedulaValidationErrorsFromUserMessage(
            '0018527413',
            [{ key: 'employerIdNumber', label: 'Número de documento' }],
            { employerIdType: 'Cédula' },
            {},
        );
        assert.equal(errors.length, 1);
        assert.equal(errors[0]?.key, 'employerIdNumber');
    });
});

describe('looksLikeDominicanCedulaAttempt', () => {
    it('detects digit-only cédula replies under 15 chars', () => {
        assert.equal(looksLikeDominicanCedulaAttempt('0018527413'), true);
        assert.equal(looksLikeDominicanCedulaAttempt('Juan Pérez'), false);
    });
});

describe('extractCedulaDigits', () => {
    it('strips separators', () => {
        assert.equal(extractCedulaDigits('001-2345678-9'), '00123456789');
        assert.equal(extractCedulaDigits('00123456789').length, 11);
    });
});

describe('normalizeRncNumberInput', () => {
    it('formats 9 digits without hyphens', () => {
        const r = normalizeRncNumberInput('131643388');
        assert.equal(r.ok, true);
        if (r.ok) assert.equal(r.formatted, '131-64338-8');
    });

    it('formats 9 digits with hyphens and spaces', () => {
        const r = normalizeRncNumberInput('131-64338-8');
        assert.equal(r.ok, true);
        if (r.ok) assert.equal(r.formatted, '131-64338-8');
    });

    it('rejects wrong RNC digit count', () => {
        assert.equal(normalizeRncNumberInput('13164338').ok, false);
        assert.equal(normalizeRncNumberInput('1316433880').ok, false);
    });
});

describe('shouldApplyRncDigitValidation', () => {
    it('applies to rnc key', () => {
        assert.equal(shouldApplyRncDigitValidation('employerRnc', '', '131643388'), true);
    });

    it('applies to id number key with rnc tipo', () => {
        assert.equal(shouldApplyRncDigitValidation('employerIdNumber', 'RNC', '131643388'), true);
    });

    it('applies to id number key with empty tipo and 9 digits', () => {
        assert.equal(shouldApplyRncDigitValidation('employerIdNumber', '', '131643388'), true);
    });

    it('does not apply to HasDominicanRnc / IncludeRnc flags', () => {
        assert.equal(shouldApplyRncDigitValidation('employerHasDominicanRnc', '', 'Sí'), false);
        assert.equal(
            shouldApplyRncDigitValidation('employerIncludeRncMercantileIdentificationInContract', '', 'Sí'),
            false,
        );
        assert.equal(shouldApplyRncDigitValidation('sellerIncludeRncInContract', '', 'No'), false);
    });
});

describe('isRncVariableKey', () => {
    it('matches RNC number fields only', () => {
        assert.equal(isRncVariableKey('employerRnc'), true);
        assert.equal(isRncVariableKey('sellerRnc'), true);
        assert.equal(isRncVariableKey('companyRnc'), true);
        assert.equal(isRncVariableKey('employerIncludeRncMercantileIdentificationInContract'), false);
        assert.equal(isRncVariableKey('employerHasDominicanRnc'), false);
        assert.equal(isRncVariableKey('sellerIncludeRncInContract'), false);
        assert.equal(isRncVariableKey('buyerHasDominicanRnc'), false);
    });
});

describe('getInvalidCedulaFieldsInVariables (RNC flags)', () => {
    it('accepts dashed employerRnc alongside IncludeRnc Sí flag', () => {
        const errors = getInvalidCedulaFieldsInVariables({
            employerIncludeRncMercantileIdentificationInContract: 'Sí',
            employerRnc: '131-64338-8',
        });
        assert.equal(errors.length, 0);
    });

    it('accepts undashed employerRnc alongside IncludeRnc Sí flag', () => {
        const errors = getInvalidCedulaFieldsInVariables({
            employerIncludeRncMercantileIdentificationInContract: 'Sí',
            employerRnc: '131643388',
        });
        assert.equal(errors.length, 0);
    });

    it('does not reject HasDominicanRnc Sí alone', () => {
        const errors = getInvalidCedulaFieldsInVariables({
            employerHasDominicanRnc: 'Sí',
        });
        assert.equal(errors.length, 0);
    });
});

describe('validateAndNormalizeCedulaAnswers (with RNC)', () => {
    it('normalizes RNC fields', () => {
        const { normalized, rejected } = validateAndNormalizeCedulaAnswers(
            {
                employerRnc: '131643388',
                employerIdType: 'RNC',
                employerIdNumber: '131643388',
            },
            {},
        );
        assert.equal(rejected.length, 0);
        assert.equal(normalized.employerRnc, '131-64338-8');
        assert.equal(normalized.employerIdNumber, '131-64338-8');
    });
});
