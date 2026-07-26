import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOMESTIC_INDEFINITE_DURATION_PHRASE } from './domestic-salary-format.js';
import {
    backfillContratoDomesticaDocumentSigningDateFromFragments,
    domesticAdditionalBenefitsUpdatePatch,
    fillDomesticContractIndefiniteDuration,
    fillDomesticContractNotaryFromEmployerAddress,
    fillDomesticContractNotaryFromSigningProvince,
    syncDomesticAdditionalBenefitsGate,
} from './domestic-contract-enrichment.js';

describe('fillDomesticContractIndefiniteDuration', () => {
    it('fills canonical phrase when kind is Por tiempo indefinido and field empty', () => {
        const out: Record<string, string | number> = {
            contractDurationKind: 'Por tiempo indefinido',
        };
        assert.equal(fillDomesticContractIndefiniteDuration(out), true);
        assert.equal(out.contractDurationIndefinite, DOMESTIC_INDEFINITE_DURATION_PHRASE);
    });

    it('normalizes verbose user wording to canonical tail phrase', () => {
        const out: Record<string, string | number> = {
            contractDurationKind: 'Por tiempo indefinido',
            contractDurationIndefinite:
                'El presente contrato tiene una duración por tiempo indefinido',
        };
        assert.equal(fillDomesticContractIndefiniteDuration(out), true);
        assert.equal(out.contractDurationIndefinite, DOMESTIC_INDEFINITE_DURATION_PHRASE);
    });

    it('does nothing when kind is Por plazo fijo', () => {
        const out: Record<string, string | number> = {
            contractDurationKind: 'Por plazo fijo',
            contractDurationNumber: '1',
        };
        assert.equal(fillDomesticContractIndefiniteDuration(out), false);
        assert.equal(out.contractDurationIndefinite, undefined);
    });
});

describe('backfillContratoDomesticaDocumentSigningDateFromFragments', () => {
    it('composes documentSigningDate from legacy PDF fragments', () => {
        const out: Record<string, string | number> = {
            signingDayNumbers: '15',
            signingMonthLetters: 'marzo',
            signingYearNumbers: '2026',
        };
        assert.equal(backfillContratoDomesticaDocumentSigningDateFromFragments(out), true);
        assert.equal(out.documentSigningDate, '15 de marzo de 2026');
    });

    it('does nothing when documentSigningDate already set', () => {
        const out: Record<string, string | number> = {
            documentSigningDate: '20 de mayo de 2026',
            signingDayNumbers: '15',
            signingMonthLetters: 'marzo',
            signingYearNumbers: '2026',
        };
        assert.equal(backfillContratoDomesticaDocumentSigningDateFromFragments(out), false);
    });

    it('prefers signing province for notary jurisdiction when signing date exists', () => {
        const out: Record<string, string | number> = {
            signingProvince: 'Distrito Nacional',
            documentSigningDate: '15 de marzo de 2026',
        };
        assert.equal(fillDomesticContractNotaryFromSigningProvince(out), true);
        assert.equal(out.notaryJurisdiction, 'Distrito Nacional');
    });

    it('infers Distrito Nacional from Santo Domingo employer address', () => {
        const out: Record<string, string | number> = {
            employerFullAddress: 'Av. Winston Churchill, Santo Domingo, República Dominicana',
        };
        assert.equal(fillDomesticContractNotaryFromEmployerAddress(out), true);
        assert.equal(out.notaryJurisdiction, 'Distrito Nacional');
    });
});

describe('syncDomesticAdditionalBenefitsGate', () => {
    it('opens Sí gate when otherBenefits has content but gate is No', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'No',
            otherBenefits:
                'Aporte a la TSS pagado por el empleador; Un día de descanso semanal; Una hora de almuerzo',
        };
        assert.equal(syncDomesticAdditionalBenefitsGate(out), true);
        assert.equal(out.hasAdditionalBenefits, 'Sí');
    });

    it('does nothing when gate already Sí', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'Sí',
            otherBenefits: 'Comedor subsidiado',
        };
        assert.equal(syncDomesticAdditionalBenefitsGate(out), false);
    });

    it('does not force No when otherBenefits empty (mid-collection Sí)', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'Sí',
            otherBenefits: '',
        };
        assert.equal(syncDomesticAdditionalBenefitsGate(out), false);
        assert.equal(out.hasAdditionalBenefits, 'Sí');
    });
});

describe('domesticAdditionalBenefitsUpdatePatch', () => {
    it('pairs non-empty otherBenefits with hasAdditionalBenefits Sí', () => {
        assert.deepEqual(domesticAdditionalBenefitsUpdatePatch('otherBenefits', 'TSS; Descanso semanal'), {
            otherBenefits: 'TSS; Descanso semanal',
            hasAdditionalBenefits: 'Sí',
        });
    });

    it('pairs empty otherBenefits with No', () => {
        assert.deepEqual(domesticAdditionalBenefitsUpdatePatch('otherBenefits', ''), {
            otherBenefits: '',
            hasAdditionalBenefits: 'No',
        });
    });

    it('clears otherBenefits when hasAdditionalBenefits set to No', () => {
        assert.deepEqual(domesticAdditionalBenefitsUpdatePatch('hasAdditionalBenefits', 'No'), {
            hasAdditionalBenefits: 'No',
            otherBenefits: '',
        });
    });
});
