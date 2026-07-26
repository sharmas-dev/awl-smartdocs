import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocAssistantService } from './doc-assistant.service.js';
import { inferGenderFromName, normalizeNationalityGender, normalizeNameConjunction, normalizeMaritalStatus } from './gender-choice-format.js';

const svc = new DocAssistantService();

const normalize = (
    svc as unknown as {
        normalizeFieldValuesForStorage: (
            templateName: string,
            vars: Record<string, string | number>,
        ) => Record<string, string | number>;
    }
).normalizeFieldValuesForStorage.bind(svc);

describe('inferGenderFromName', () => {
    it('infers female for single female names', () => {
        assert.equal(inferGenderFromName('Maria Lopez'), 'Mujer');
        assert.equal(inferGenderFromName('Isabella Pezotti'), 'Mujer');
        assert.equal(inferGenderFromName('Frayni Encarnacion'), 'Mujer');
        assert.equal(inferGenderFromName('Julia'), 'Mujer');
        assert.equal(inferGenderFromName('Ana'), 'Mujer');
    });

    it('infers male for single male names', () => {
        assert.equal(inferGenderFromName('Juan Perez'), 'Hombre');
        assert.equal(inferGenderFromName('Carlos'), 'Hombre');
    });

    it('handles joint female names as female', () => {
        assert.equal(inferGenderFromName('Frayni Encarnacion e Isabella Pezotti'), 'Mujer');
        assert.equal(inferGenderFromName('Maria y Julia'), 'Mujer');
    });

    it('handles mixed or joint male names as male', () => {
        assert.equal(inferGenderFromName('Juan y Maria'), 'Hombre');
        assert.equal(inferGenderFromName('Frayni y Carlos'), 'Hombre');
        assert.equal(inferGenderFromName('Juan y Carlos'), 'Hombre');
    });

    it('respects first name and surname exclusion sets', () => {
        assert.equal(inferGenderFromName('Jose Garcia'), 'Hombre');
        assert.equal(inferGenderFromName('Sharma'), 'Hombre');
        assert.equal(inferGenderFromName('Bautista'), 'Hombre');
        assert.equal(inferGenderFromName('Garcia'), 'Hombre');
        assert.equal(inferGenderFromName('Nikita'), 'Hombre');
    });
});

describe('normalizeNationalityGender', () => {
    it('normalizes parenthesized choices based on gender', () => {
        assert.equal(normalizeNationalityGender('dominicano(a)', 'Mujer'), 'dominicana');
        assert.equal(normalizeNationalityGender('dominicano(a)', 'Hombre'), 'dominicano');
        assert.equal(normalizeNationalityGender('dominicana/o', 'Mujer'), 'dominicana');
        assert.equal(normalizeNationalityGender('dominicana/o', 'Hombre'), 'dominicano');
    });

    it('normalizes single nationality strings based on gender', () => {
        assert.equal(normalizeNationalityGender('dominicano', 'Mujer'), 'dominicana');
        assert.equal(normalizeNationalityGender('dominicana', 'Hombre'), 'dominicano');
        assert.equal(normalizeNationalityGender('venezolana', 'Hombre'), 'venezolano');
        assert.equal(normalizeNationalityGender('español', 'Mujer'), 'española');
        assert.equal(normalizeNationalityGender('espanola', 'Hombre'), 'espanol');
        assert.equal(normalizeNationalityGender('croata', 'Hombre'), 'croata'); // neutral exclusion
        assert.equal(normalizeNationalityGender('belga', 'Mujer'), 'belga'); // neutral exclusion
    });
});

describe('Declaración Jurada de Domicilio - derived gender variables', () => {

    it('derives correct variables when both witnesses are female', () => {
        const out = normalize('Declaración Jurada de Domicilio', {
            declarantFullName: 'Maria Perez',
            declarantNationality: 'dominicano(a)',
            witness1FullName: 'Frayni Encarnacion',
            witness1Nationality: 'Dominicana',
            witness2FullName: 'Isabella Pezotti',
            witness2Nationality: 'dominicano(a)',
        });

        assert.equal(out.declarantGender, 'Mujer');
        assert.equal(out.witness1Gender, 'Mujer');
        assert.equal(out.witness2Gender, 'Mujer');

        assert.equal(out.declarantNationality, 'dominicana');
        assert.equal(out.witness1Nationality, 'dominicana');
        assert.equal(out.witness2Nationality, 'dominicana');

        assert.equal(out.witnessesHeader, 'de las señoras');
        assert.equal(out.witness2Header, '');
        assert.equal(out.signersHeader, 'las señoras');
    });

    it('derives correct variables when both witnesses are male', () => {
        const out = normalize('Declaración Jurada de Domicilio', {
            declarantFullName: 'Maria Perez',
            declarantNationality: 'dominicano(a)',
            witness1FullName: 'Juan Perez',
            witness1Nationality: 'dominicana',
            witness2FullName: 'Carlos Martinez',
            witness2Nationality: 'dominicano(a)',
        });

        assert.equal(out.declarantGender, 'Mujer');
        assert.equal(out.witness1Gender, 'Hombre');
        assert.equal(out.witness2Gender, 'Hombre');

        assert.equal(out.declarantNationality, 'dominicana');
        assert.equal(out.witness1Nationality, 'dominicano');
        assert.equal(out.witness2Nationality, 'dominicano');

        assert.equal(out.witnessesHeader, 'de los señores');
        assert.equal(out.witness2Header, '');
        assert.equal(out.signersHeader, 'los señores');
    });

    it('derives correct variables for W1 female, W2 male mixed group', () => {
        const out = normalize('Declaración Jurada de Domicilio', {
            declarantFullName: 'Juan Perez',
            declarantNationality: 'dominicano(a)',
            witness1FullName: 'Frayni Encarnacion',
            witness1Nationality: 'dominicano(a)',
            witness2FullName: 'Carlos Martinez',
            witness2Nationality: 'dominicano(a)',
        });

        assert.equal(out.declarantGender, 'Hombre');
        assert.equal(out.witness1Gender, 'Mujer');
        assert.equal(out.witness2Gender, 'Hombre');

        assert.equal(out.declarantNationality, 'dominicano');
        assert.equal(out.witness1Nationality, 'dominicana');
        assert.equal(out.witness2Nationality, 'dominicano');

        assert.equal(out.witnessesHeader, 'de la señora');
        assert.equal(out.witness2Header, 'el señor ');
        assert.equal(out.signersHeader, 'los señores');
    });

    it('derives correct variables for W1 male, W2 female mixed group', () => {
        const out = normalize('Declaración Jurada de Domicilio', {
            declarantFullName: 'Juan Perez',
            declarantNationality: 'dominicano(a)',
            witness1FullName: 'Carlos Martinez',
            witness1Nationality: 'dominicano(a)',
            witness2FullName: 'Frayni Encarnacion',
            witness2Nationality: 'dominicano(a)',
        });

        assert.equal(out.declarantGender, 'Hombre');
        assert.equal(out.witness1Gender, 'Hombre');
        assert.equal(out.witness2Gender, 'Mujer');

        assert.equal(out.declarantNationality, 'dominicano');
        assert.equal(out.witness1Nationality, 'dominicano');
        assert.equal(out.witness2Nationality, 'dominicana');

        assert.equal(out.witnessesHeader, 'del señor');
        assert.equal(out.witness2Header, 'la señora ');
        assert.equal(out.signersHeader, 'los señores');
    });
});

describe('normalizeNameConjunction', () => {
    it('normalizes y to e before i and hi sounds', () => {
        assert.equal(normalizeNameConjunction('Sharma y Isabella'), 'Sharma e Isabella');
        assert.equal(normalizeNameConjunction('Pedro y Hilario'), 'Pedro e Hilario');
    });

    it('keeps y before non-i/hi sounds', () => {
        assert.equal(normalizeNameConjunction('Sharma y Kevin'), 'Sharma y Kevin');
        assert.equal(normalizeNameConjunction('Pedro y María'), 'Pedro y María');
    });

    it('preserves/restores y before diphthongs ia/hie/etc.', () => {
        assert.equal(normalizeNameConjunction('Pedro e Ian'), 'Pedro y Ian');
        assert.equal(normalizeNameConjunction('Pedro e Hieronimo'), 'Pedro y Hieronimo');
    });

    it('handles capitalization and spacing properly', () => {
        assert.equal(normalizeNameConjunction('Sharma Y Isabella'), 'Sharma E Isabella');
        assert.equal(normalizeNameConjunction('Sharma   y   Isabella'), 'Sharma   e   Isabella');
    });
});

describe('normalizeMaritalStatus', () => {
    it('normalizes casado(a) and soltero(a) correctly based on gender', () => {
        assert.equal(normalizeMaritalStatus('casado(a)', 'Mujer'), 'casada');
        assert.equal(normalizeMaritalStatus('casado(a)', 'Hombre'), 'casado');
        assert.equal(normalizeMaritalStatus('soltero(a)', 'Mujer'), 'soltera');
        assert.equal(normalizeMaritalStatus('soltero(a)', 'Hombre'), 'soltero');
    });

    it('preserves casing and capitalization', () => {
        assert.equal(normalizeMaritalStatus('Casado(a)', 'Mujer'), 'Casada');
        assert.equal(normalizeMaritalStatus('CASADO(A)', 'Mujer'), 'CASADA');
        assert.equal(normalizeMaritalStatus('Soltero(a)', 'Hombre'), 'Soltero');
    });
});

describe('normalizeFieldValuesForStorage - Marital Status', () => {
    it('correctly normalizes marital status based on associated name', () => {
        const out = normalize('Contrato de Trabajo', {
            employeeFullName: 'María Pérez',
            employeeMaritalStatus: 'casado(a)',
            employerLegalName: 'Juan Pérez',
            employerMaritalStatus: 'soltero(a)',
        });

        assert.equal(out.employeeMaritalStatus, 'casada');
        assert.equal(out.employerMaritalStatus, 'soltero');
    });

    it('correctly normalizes marital status using gender field or type label', () => {
        const out1 = normalize('Contrato de Compraventa Vehículo', {
            sellerLegalName: 'Alex', // Ambiguous name
            sellerMaritalStatus: 'casado(a)',
            sellerGender: 'Femenino',
        });
        assert.equal(out1.sellerMaritalStatus, 'casada');

        const out2 = normalize('Contrato de Compraventa Vehículo', {
            buyerLegalName: 'Jean', // Ambiguous name
            buyerMaritalStatus: 'soltero(a)',
            buyerTypeLabel: 'la señora',
        });
        assert.equal(out2.buyerMaritalStatus, 'soltera');
    });
});

