import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildContratoTeletrabajoConflictInstruction,
    detectContratoTeletrabajoConflicts,
    stripConflictingTeletrabajoKeys,
} from './contrato-teletrabajo-conflicts.js';

describe('contrato-teletrabajo-conflicts', () => {
    it('detects salary change', () => {
        const conflict = detectContratoTeletrabajoConflicts(
            { salaryAmountWithCurrency: 'RD$40,000.00' },
            { salaryAmountWithCurrency: 'RD$50,000.00' },
        );
        assert.ok(conflict);
        assert.equal(conflict?.key, 'salaryAmountWithCurrency');
    });

    it('ignores minor formatting differences', () => {
        const conflict = detectContratoTeletrabajoConflicts(
            { employeeIdNumber: '001-1234567-8' },
            { employeeIdNumber: '00112345678' },
        );
        assert.equal(conflict, null);
    });

    it('strips conflicting keys from incoming map', () => {
        const conflict = detectContratoTeletrabajoConflicts(
            { salaryAmountWithCurrency: 'RD$40,000.00' },
            { salaryAmountWithCurrency: 'RD$50,000.00', salaryInWords: 'cincuenta mil' },
        );
        assert.ok(conflict);
        const stripped = stripConflictingTeletrabajoKeys(
            { salaryAmountWithCurrency: 'RD$50,000.00', salaryInWords: 'cincuenta mil', employeeFullName: 'Ana' },
            conflict!,
        );
        assert.equal(stripped.salaryAmountWithCurrency, undefined);
        assert.equal(stripped.salaryInWords, undefined);
        assert.equal(stripped.employeeFullName, 'Ana');
    });

    it('builds Spanish instruction', () => {
        const instruction = buildContratoTeletrabajoConflictInstruction({
            key: 'employeeIdNumber',
            label: 'número de documento',
            previous: '001-1111111-1',
            next: '001-2222222-2',
        });
        assert.match(instruction, /CONFLICTO DE DATOS/);
        assert.match(instruction, /001-1111111-1/);
    });
});
