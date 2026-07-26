import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseContratoTeletrabajoEmployerNarrative } from './contrato-teletrabajo-employer-parse.js';

describe('parseContratoTeletrabajoEmployerNarrative', () => {
    it('parses empresa, legal name, address and nacional', () => {
        const parsed = parseContratoTeletrabajoEmployerNarrative(
            'Empresa\nNombre legal o razón social: Tecnologías Globales, S.R.L.\n' +
                'Dirección: Avenida John F. Kennedy No. 88, Santo Domingo, Distrito Nacional, República Dominicana.\n' +
                'La empresa es nacional constituida bajo las leyes de la República Dominicana.',
        );
        assert.equal(parsed.employerIsCompany, 'Empresa');
        assert.match(parsed.employerLegalName ?? '', /Tecnologías Globales/i);
        assert.ok(parsed.employerFullAddressStreet);
        assert.equal(parsed.employerCompanyNationalOrForeign, 'Nacional');
        assert.equal(parsed.employerJurisdiction, 'República Dominicana');
    });

    it('infers extranjera from narrative', () => {
        const parsed = parseContratoTeletrabajoEmployerNarrative(
            'Empresa colombiana Tech Andes S.A.S., sin RNC en República Dominicana.',
        );
        assert.equal(parsed.employerIsCompany, 'Empresa');
        assert.equal(parsed.employerCompanyNationalOrForeign, 'Extranjera');
    });
});
