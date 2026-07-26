import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyContratoTeletrabajoEmployerBranchNormalization,
    filterTeletrabajoCostsPendingVariables,
    fillContratoTeletrabajoDerivedFields,
} from './contrato-teletrabajo-employer-branch.js';

describe('contrato-teletrabajo-employer-branch', () => {
    it('prunes persona keys when empresa', () => {
        const out = {
            employerIsCompany: 'Empresa',
            employerNationality: 'dominicana',
            employerRepFullName: 'Juan Pérez',
            employerLegalName: 'ACME SRL',
        };
        assert.equal(applyContratoTeletrabajoEmployerBranchNormalization(out), true);
        assert.equal('employerNationality' in out, false);
        assert.equal(out.employerRepFullName, 'Juan Pérez');
    });

    it('filters cost detail when hasCostCoverage is No', () => {
        const vars = [
            { key: 'costResponsible', label: 'Responsable' },
            { key: 'cost1', label: 'Costo 1' },
            { key: 'monthlyAmountInWords', label: 'Monto' },
        ];
        const filtered = filterTeletrabajoCostsPendingVariables('costs', vars, { hasCostCoverage: 'No' });
        assert.deepEqual(filtered.map((v) => v.key), ['costResponsible']);
    });

    it('fills employerOrRepFullName from rep when empresa', () => {
        const out: Record<string, string | number> = {
            employerIsCompany: 'Empresa',
            employerRepFullName: 'María López',
            employerLegalName: 'Tech SRL',
        };
        assert.equal(fillContratoTeletrabajoDerivedFields(out), true);
        assert.equal(out.employerOrRepFullName, 'María López');
    });
});
