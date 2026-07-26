import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyCompraventaPartyBranchNormalization,
    applyCompraventaTypeLabelFromChoice,
    buildCompraventaPartyGroupHint,
    filterCompraventaPendingVariables,
    inferCompraventaPartyIsCompany,
    isCompraventaTypeLabelAutoFilled,
} from './compraventa-party-branch.js';

describe('applyCompraventaPartyBranchNormalization', () => {
    it('normalizes compañía / persona jurídica / sociedad to Empresa', () => {
        for (const raw of ['compañía', 'persona jurídica', 'sociedad']) {
            const out: Record<string, string | number> = { sellerIsCompany: raw };
            assert.equal(applyCompraventaPartyBranchNormalization(out), true);
            assert.equal(out.sellerIsCompany, 'Empresa');
        }
    });

    it('infers Empresa from la sociedad type label when IsCompany missing', () => {
        const out: Record<string, string | number> = {
            sellerTypeLabel: 'la sociedad',
            sellerLegalName: 'ACME Motors S.R.L.',
        };
        assert.equal(applyCompraventaPartyBranchNormalization(out), true);
        assert.equal(out.sellerIsCompany, 'Empresa');
    });

    it('infers Persona física from el señor type label', () => {
        const out: Record<string, string | number> = {
            sellerTypeLabel: 'el señor',
            sellerLegalName: 'Juan Pérez',
        };
        assert.equal(applyCompraventaPartyBranchNormalization(out), true);
        assert.equal(out.sellerIsCompany, 'Persona física');
    });

    it('Empresa branch clears person-only seller fields', () => {
        const out: Record<string, string | number> = {
            sellerIsCompany: 'Empresa',
            sellerNationality: 'dominicano',
            sellerMaritalStatus: 'soltero(a)',
            sellerIdType: 'de la cédula de identidad y electoral',
            sellerIdNumber: '001-1234567-8',
            sellerSpouseFullName: 'María López',
            sellerJurisdiction: 'República Dominicana',
        };
        assert.equal(applyCompraventaPartyBranchNormalization(out), true);
        assert.equal(out.sellerIsCompany, 'Empresa');
        assert.equal(out.sellerJurisdiction, 'República Dominicana');
        assert.equal(out.sellerNationality, undefined);
        assert.equal(out.sellerMaritalStatus, undefined);
        assert.equal(out.sellerIdType, undefined);
        assert.equal(out.sellerIdNumber, undefined);
        assert.equal(out.sellerSpouseFullName, undefined);
    });

    it('clears spouse when comunidad de bienes is No', () => {
        const out: Record<string, string | number> = {
            sellerIsCompany: 'Persona física',
            sellerMaritalStatus: 'casado(a)',
            sellerHasCommunityProperty: 'No',
            sellerSpouseFullName: 'María López',
        };
        assert.equal(applyCompraventaPartyBranchNormalization(out), true);
        assert.equal(out.sellerSpouseFullName, undefined);
    });

    it('Persona física branch clears company/rep seller fields', () => {
        const out: Record<string, string | number> = {
            sellerIsCompany: 'Persona física',
            sellerJurisdiction: 'República Dominicana',
            sellerRnc: '1-01-23456-7',
            sellerRepFullName: 'Carlos Rodríguez',
            sellerNationality: 'dominicano',
        };
        assert.equal(applyCompraventaPartyBranchNormalization(out), true);
        assert.equal(out.sellerNationality, 'dominicano');
        assert.equal(out.sellerJurisdiction, undefined);
        assert.equal(out.sellerRnc, undefined);
        assert.equal(out.sellerRepFullName, undefined);
    });
});

describe('inferCompraventaPartyIsCompany', () => {
    it('returns Empresa when RNC is present', () => {
        assert.equal(
            inferCompraventaPartyIsCompany('buyer', { buyerRnc: '1-31-45678-9' }),
            'Empresa',
        );
    });
});

describe('applyCompraventaTypeLabelFromChoice', () => {
    it('sets la sociedad for Empresa', () => {
        const out: Record<string, string | number> = { sellerIsCompany: 'Empresa' };
        assert.equal(applyCompraventaTypeLabelFromChoice('seller', out), true);
        assert.equal(out.sellerTypeLabel, 'la sociedad');
    });

    it('sets el señor from Gender Hombre', () => {
        const out: Record<string, string | number> = {
            sellerIsCompany: 'Persona física',
            sellerGender: 'Hombre',
        };
        applyCompraventaTypeLabelFromChoice('seller', out);
        assert.equal(out.sellerTypeLabel, 'el señor');
        assert.equal(isCompraventaTypeLabelAutoFilled('seller', out), true);
    });
});

describe('filterCompraventaPendingVariables', () => {
    it('removes person fields when Empresa', () => {
        const vars = [
            { key: 'sellerNationality' },
            { key: 'sellerJurisdiction' },
        ];
        const filtered = filterCompraventaPendingVariables('seller', vars, {
            sellerIsCompany: 'Empresa',
        });
        assert.deepEqual(
            filtered.map((v) => v.key),
            ['sellerJurisdiction'],
        );
    });
});

describe('buildCompraventaPartyGroupHint', () => {
    it('forbids main-party person fields when Empresa', () => {
        const hint = buildCompraventaPartyGroupHint('seller', { sellerIsCompany: 'Empresa' });
        assert.match(hint, /FORBIDDEN.*sellerNationality/i);
        assert.match(hint, /estado civil/i);
    });

    it('forbids rep fields when Persona física', () => {
        const hint = buildCompraventaPartyGroupHint('buyer', { buyerIsCompany: 'Persona física' });
        assert.match(hint, /FORBIDDEN.*buyerRep/i);
    });
});
