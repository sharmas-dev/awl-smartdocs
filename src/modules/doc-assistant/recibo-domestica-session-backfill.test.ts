import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    backfillReciboDomesticaDatesFromSessionText,
    htmlHasEmptyReciboDomesticaDatePlaceholders,
} from './recibo-domestica-session-backfill.js';
import { ensureReciboDescargoDomesticaPdfDates } from './recibo-descargo-date-expand.js';
import { verifyReciboDomesticaPdfReady } from './recibo-descargo-domestica-pdf-ready.js';

describe('Recibo doméstica session date backfill', () => {
    it('extracts dates from stored narrative blobs when canonical keys are empty', () => {
        const out: Record<string, string | number> = {
            declarantAddress: 'Calle Duarte No. 12, Santiago',
            __userMsg_employmentDates:
                'El trabajo comenzó el 1 de junio de 2024 y terminó el 26 de mayo de 2026.',
            __userMsg_paymentInfo: 'Último salario del mes de abril de 2026.',
            __userMsg_vacationInfo: 'Vacaciones hasta el año 2025.',
            __userMsg_signingInfo: 'Firma en Santo Domingo el 26 de mayo de 2026.',
            __userMsg_terminationInfo: 'Terminación efectiva el 26 de mayo de 2026.',
        };
        assert.equal(backfillReciboDomesticaDatesFromSessionText(out), true);
        assert.equal(out.employmentStartDate, '1 de junio de 2024');
        assert.equal(out.employmentEndDate, '26 de mayo de 2026');
        assert.equal(out.lastSalaryPeriodDate, '1 de abril de 2026');
        const ready = verifyReciboDomesticaPdfReady(out);
        assert.equal(ready.ok, true);
    });

    it('detects broken HTML with empty date parentheses', () => {
        assert.equal(
            htmlHasEmptyReciboDomesticaDatePlaceholders(
                '<p>desde el día () de del año () hasta el día () de del año ()</p>',
            ),
            true,
        );
        assert.equal(
            htmlHasEmptyReciboDomesticaDatePlaceholders(
                '<p>desde el día primero (1) de junio del año dos mil veinticuatro (2024)</p>',
            ),
            false,
        );
    });

    it('combined backfill does not steal vacation or signing dates from termination text', () => {
        const out: Record<string, string | number> = {
            terminationReason: 'por MUTUO ACUERDO entre las partes',
            __userMsg_terminationInfo:
                'Terminación por mutuo acuerdo; fecha efectiva el 26 de mayo de 2026.',
        };
        backfillReciboDomesticaDatesFromSessionText(out);
        assert.equal(out.contractTerminationDate, '26 de mayo de 2026');
        assert.equal(out.vacationCoverageThroughDate, undefined);
        assert.equal(out.documentSigningDate, undefined);
    });

    it('backfill + expand yields PDF fragment keys', () => {
        const vars: Record<string, string | number> = {
            employerFullName: 'Juan Pérez Gómez',
            domesticEmployerGender: 'Hombre',
            __userMsg_employmentDates:
                'Trabajé desde el 1 de junio de 2024 hasta el 26 de mayo de 2026.',
            __userMsg_signingInfo: 'Firmamos en Santo Domingo el 26 de mayo de 2026.',
            __userMsg_paymentInfo: 'Último salario del mes de abril de 2026.',
            __userMsg_vacationInfo: 'Vacaciones hasta el año 2025.',
            __userMsg_terminationInfo: 'Terminación el 26 de mayo de 2026.',
        };
        backfillReciboDomesticaDatesFromSessionText(vars);
        ensureReciboDescargoDomesticaPdfDates(vars);
        const ready = verifyReciboDomesticaPdfReady(vars);
        assert.equal(ready.ok, true);
        if (ready.ok) {
            assert.equal(ready.expanded.startDayNumbers, '1');
            assert.equal(ready.expanded.signingDayNumbers, '26');
            assert.equal(ready.expanded.salaryMonthLetters, 'abril');
        }
    });
});
