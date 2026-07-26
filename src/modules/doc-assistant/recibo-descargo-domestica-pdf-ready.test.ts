import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ensureReciboDescargoDomesticaPdfDates } from './recibo-descargo-date-expand.js';
import { verifyReciboDomesticaPdfReady } from './recibo-descargo-domestica-pdf-ready.js';

describe('verifyReciboDomesticaPdfReady', () => {
    it('passes when canonical dates expand to PDF fragments', () => {
        const vars: Record<string, string | number> = {
            employmentStartDate: '1 de junio de 2024',
            employmentEndDate: '26 de mayo de 2026',
            contractTerminationDate: '26 de mayo de 2026',
            lastSalaryPeriodDate: '1 de abril de 2026',
            vacationCoverageThroughDate: 'hasta el año 2025',
            documentSigningDate: '26 de mayo de 2026',
        };
        ensureReciboDescargoDomesticaPdfDates(vars);
        const result = verifyReciboDomesticaPdfReady(vars);
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.expanded.startDayNumbers, '1');
            assert.equal(result.expanded.signingDayNumbers, '26');
            assert.equal(result.expanded.salaryMonthLetters, 'abril');
        }
    });

    it('fails when canonical date is present but unparseable and fragments empty', () => {
        const vars: Record<string, string | number> = {
            employmentStartDate: 'fecha inválida xyz',
            employmentEndDate: '26 de mayo de 2026',
            contractTerminationDate: '26 de mayo de 2026',
            lastSalaryPeriodDate: '1 de abril de 2026',
            vacationCoverageThroughDate: 'hasta el año 2025',
            documentSigningDate: '26 de mayo de 2026',
        };
        const result = verifyReciboDomesticaPdfReady(vars);
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.ok(result.issues.some((i) => i.key === 'employmentStartDate'));
        }
    });
});
