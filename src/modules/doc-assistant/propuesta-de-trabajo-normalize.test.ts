import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPropuestaDeTrabajoNormalizations,
    isPropuestaDeTrabajoTemplate,
    normalizePropuestaPayrollDays,
    normalizePropuestaSiNo,
    propuestaAdditionalBenefitsUpdatePatch,
    syncPropuestaAdditionalBenefitsGate,
} from './propuesta-de-trabajo-normalize.js';

describe('isPropuestaDeTrabajoTemplate', () => {
    it('matches canonical name', () => {
        assert.equal(isPropuestaDeTrabajoTemplate('Propuesta de Trabajo'), true);
        assert.equal(isPropuestaDeTrabajoTemplate('Contrato de Trabajo'), false);
    });
});

describe('normalizePropuestaPayrollDays', () => {
    it('strips de cada mes from day phrases', () => {
        assert.equal(normalizePropuestaPayrollDays('15 y 30 de cada mes'), '15 y 30');
        assert.equal(normalizePropuestaPayrollDays('15 y último de cada mes'), '15 y último');
        assert.equal(normalizePropuestaPayrollDays('15 y 30 de cada mes.'), '15 y 30');
        assert.equal(normalizePropuestaPayrollDays('15 y 30 De Cada Mes'), '15 y 30');
    });

    it('leaves clean day-only values unchanged (returns null)', () => {
        assert.equal(normalizePropuestaPayrollDays('15 y 30'), null);
        assert.equal(normalizePropuestaPayrollDays('15 y último'), null);
        assert.equal(normalizePropuestaPayrollDays(''), null);
    });
});

describe('normalizePropuestaSiNo', () => {
    it('maps common variants to Sí/No', () => {
        assert.equal(normalizePropuestaSiNo('Si'), 'Sí');
        assert.equal(normalizePropuestaSiNo('yes'), 'Sí');
        assert.equal(normalizePropuestaSiNo('NO'), 'No');
        assert.equal(normalizePropuestaSiNo('Sí'), 'Sí');
        assert.equal(normalizePropuestaSiNo('maybe'), null);
    });
});

describe('syncPropuestaAdditionalBenefitsGate', () => {
    it('opens gate when list is non-empty and gate is No', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'No',
            additionalBenefitsList:
                'Seguro médico complementario; Bono de alimentación mensual de RD$3,500',
        };
        assert.equal(syncPropuestaAdditionalBenefitsGate(out), true);
        assert.equal(out.hasAdditionalBenefits, 'Sí');
    });

    it('opens gate when list is set but gate missing', () => {
        const out: Record<string, string | number> = {
            additionalBenefitsList: 'Teléfono celular corporativo con plan de datos',
        };
        assert.equal(syncPropuestaAdditionalBenefitsGate(out), true);
        assert.equal(out.hasAdditionalBenefits, 'Sí');
    });

    it('canonicalizes Si → Sí when list present', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'Si',
            additionalBenefitsList: 'Seguro médico',
        };
        assert.equal(syncPropuestaAdditionalBenefitsGate(out), true);
        assert.equal(out.hasAdditionalBenefits, 'Sí');
    });

    it('no-ops when already Sí with list', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'Sí',
            additionalBenefitsList: 'Seguro médico',
        };
        assert.equal(syncPropuestaAdditionalBenefitsGate(out), false);
    });

    it('no-ops when list empty', () => {
        const out: Record<string, string | number> = {
            hasAdditionalBenefits: 'No',
            additionalBenefitsList: '',
        };
        assert.equal(syncPropuestaAdditionalBenefitsGate(out), false);
    });
});

describe('propuestaAdditionalBenefitsUpdatePatch', () => {
    it('pairs non-empty list with Sí', () => {
        assert.deepEqual(
            propuestaAdditionalBenefitsUpdatePatch(
                'additionalBenefitsList',
                'Seguro médico; Bono de alimentación',
            ),
            {
                additionalBenefitsList: 'Seguro médico; Bono de alimentación',
                hasAdditionalBenefits: 'Sí',
            },
        );
    });

    it('clears list when gate set to No', () => {
        assert.deepEqual(propuestaAdditionalBenefitsUpdatePatch('hasAdditionalBenefits', 'No'), {
            hasAdditionalBenefits: 'No',
            additionalBenefitsList: '',
        });
    });
});

describe('applyPropuestaDeTrabajoNormalizations', () => {
    it('rewrites payrollDays and opens benefits gate together', () => {
        const out: Record<string, string | number> = {
            payrollDays: '15 y 30 de cada mes',
            hasAdditionalBenefits: 'No',
            additionalBenefitsList:
                'Seguro médico complementario para el empleado y su familia; Bono de alimentación mensual de RD$3,500; Un día adicional de vacaciones remuneradas por cada año de servicio; Teléfono celular corporativo con plan de datos.',
        };
        assert.equal(applyPropuestaDeTrabajoNormalizations(out), true);
        assert.equal(out.payrollDays, '15 y 30');
        assert.equal(out.hasAdditionalBenefits, 'Sí');
    });

    it('no-ops when already clean', () => {
        const out: Record<string, string | number> = {
            payrollDays: '15 y 30',
            hasAdditionalBenefits: 'Sí',
            additionalBenefitsList: 'Seguro médico',
        };
        assert.equal(applyPropuestaDeTrabajoNormalizations(out), false);
    });
});
