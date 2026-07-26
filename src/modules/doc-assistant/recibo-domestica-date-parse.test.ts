import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { DocAssistantService } from './doc-assistant.service.js';
import type { SessionManager } from './session-store.js';
import {
    detectPendingVacationDisclosure,
    enrichReciboDomesticaGroupDates,
    extractLastSalaryPeriodFromText,
    extractSpanishMonthYearFromText,
    fillReciboDomesticaTerminationDateFromEmploymentEnd,
    reconcileReciboDomesticaLastSalaryPeriod,
} from './recibo-domestica-date-parse.js';
import {
    isDomesticReciboNotaryAlreadyOffered,
    NOTARY_JURISDICTION_ACK_SENT_KEY,
    shouldOfferDomesticReciboNotaryConfirmation,
} from './recibo-descargo-domestica-enrichment.js';
import { NOTARY_JURISDICTION_OFFERED_KEY } from './pdf-preview-session.js';

const TEMPLATE = 'Recibo de Descargo Trabajadora Doméstica';

after(() => {
    setImmediate(() => process.exit(0));
});

describe('Recibo doméstica date parse from user narrative', () => {
    it('extracts employment start and end from one message', () => {
        const mapped: Record<string, string | number> = {};
        const text =
            'El trabajo en el hogar comenzó el 1 de junio de 2024 y terminó el 26 de mayo de 2026.';
        assert.equal(enrichReciboDomesticaGroupDates('employmentDates', mapped, text), true);
        assert.equal(mapped.employmentStartDate, '1 de junio de 2024');
        assert.equal(mapped.employmentEndDate, '26 de mayo de 2026');
    });

    it('extracts month-year for last salary period', () => {
        const month = extractSpanishMonthYearFromText(
            'El último salario corresponde al período del mes de abril de 2026.',
        );
        assert.equal(month, '1 de abril de 2026');
    });

    it('vacationInfo does not use termination date without vacation keywords', () => {
        const mapped: Record<string, string | number> = {};
        const terminationOnly =
            'La terminación fue por mutuo acuerdo y la fecha efectiva fue el 26 de mayo de 2026.';
        assert.equal(enrichReciboDomesticaGroupDates('vacationInfo', mapped, terminationOnly), false);
        assert.equal(mapped.vacationCoverageThroughDate, undefined);
    });

    it('vacationInfo extracts year when text mentions vacaciones', () => {
        const mapped: Record<string, string | number> = {};
        assert.equal(
            enrichReciboDomesticaGroupDates(
                'vacationInfo',
                mapped,
                'Las vacaciones ya tomadas cubren hasta el año 2025.',
            ),
            true,
        );
        assert.equal(mapped.vacationCoverageThroughDate, '31 de diciembre de 2025');
    });

    it('mapAnswersToGroupSchema + normalize expands dates for PDF', async () => {
        const svc = new DocAssistantService();
        const session = (svc as unknown as { session: SessionManager }).session;
        const userId = 'date-parse-user';
        const purchaseId = '507f1f77bcf86cd799439021';
        await session.start(TEMPLATE, userId, '507f1f77bcf86cd799439022', purchaseId);

        const employmentNarrative =
            'El trabajo en el hogar comenzó el 1 de junio de 2024 y terminó el 26 de mayo de 2026.';
        const enriched = svc.mapAnswersToGroupSchema(TEMPLATE, 'employmentDates', {}, employmentNarrative);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employmentDates', enriched.mapped);

        const terminationNarrative =
            'La terminación del contrato fue por mutuo acuerdo entre las partes, y la fecha efectiva de terminación fue el 26 de mayo de 2026.';
        const term = svc.mapAnswersToGroupSchema(TEMPLATE, 'terminationInfo', {}, terminationNarrative);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'terminationInfo', term.mapped);

        const vacationNarrative = 'Las vacaciones ya tomadas cubren hasta el año 2025.';
        const vac = svc.mapAnswersToGroupSchema(TEMPLATE, 'vacationInfo', {}, vacationNarrative);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'vacationInfo', vac.mapped);

        const salaryNarrative = 'El último salario corresponde al período del mes de abril de 2026.';
        const pay = svc.mapAnswersToGroupSchema(TEMPLATE, 'paymentInfo', {}, salaryNarrative);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'paymentInfo', pay.mapped);

        const signingNarrative =
            'El documento será firmado en Santo Domingo, Distrito Nacional, el día 26 de mayo de 2026.';
        const sign = svc.mapAnswersToGroupSchema(TEMPLATE, 'signingInfo', {}, signingNarrative);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'signingInfo', sign.mapped);

        const vars = await svc.syncNormalizedSessionVariablesByPurchaseId(purchaseId, userId);
        assert.equal(vars.startDayNumbers, '1');
        assert.equal(vars.startMonthLetters, 'junio');
        assert.equal(vars.startYearNumbers, '2024');
        assert.equal(vars.endDayNumbers, '26');
        assert.equal(vars.terminationDayNumbers, '26');
        assert.equal(vars.salaryMonthLetters, 'abril');
        assert.equal(vars.salaryYearNumbers, '2026');
        assert.equal(vars.signingDayNumbers, '26');

        const pdf = await svc.fillAndExportPdf(TEMPLATE, vars, true);
        assert.equal(pdf.success, true, pdf.error);
        assert.ok(!pdf.htmlContent.includes('() de del año ()'));
        assert.ok(pdf.htmlContent.includes('junio'));
        assert.ok(pdf.htmlContent.includes('2024'));
    });
});

describe('lastSalaryPeriodDate must not copy employment start', () => {
    it('does not treat employment start full dates as last salary period', () => {
        const employmentNarrative =
            'Trabajó desde el 3 de marzo de 2019 hasta el 30 de junio de 2026. Salario RD$18,000.';
        assert.equal(extractLastSalaryPeriodFromText(employmentNarrative), null);
    });

    it('extracts salary period when salary context is present', () => {
        assert.equal(
            extractLastSalaryPeriodFromText(
                'El último salario corresponde al mes de junio de 2026 por RD$18,000.',
            ),
            '1 de junio de 2026',
        );
    });

    it('paymentInfo enrich does not steal March 2019 from a hire/end narrative', () => {
        const mapped: Record<string, string | number> = {
            employmentStartDate: '3 de marzo de 2019',
            employmentEndDate: '30 de junio de 2026',
            salaryAmountInNumbers: '18,000.00',
        };
        enrichReciboDomesticaGroupDates(
            'paymentInfo',
            mapped,
            'Empleo del 3 de marzo de 2019 al 30 de junio de 2026. Último salario 18000.',
        );
        assert.equal(mapped.lastSalaryPeriodDate, '30 de junio de 2026');
    });

    it('reconcile replaces start-month salary period with employment end', () => {
        const out: Record<string, string | number> = {
            employmentStartDate: '3 de marzo de 2019',
            employmentEndDate: '30 de junio de 2026',
            lastSalaryPeriodDate: '1 de marzo de 2019',
            salaryAmountInNumbers: '18,000.00',
        };
        assert.equal(reconcileReciboDomesticaLastSalaryPeriod(out), true);
        assert.equal(out.lastSalaryPeriodDate, '30 de junio de 2026');
    });

    it('reconcile fills missing period from end when salary amount exists', () => {
        const out: Record<string, string | number> = {
            employmentEndDate: '30 de junio de 2026',
            salaryAmountInWords: 'dieciocho mil pesos',
        };
        assert.equal(reconcileReciboDomesticaLastSalaryPeriod(out), true);
        assert.equal(out.lastSalaryPeriodDate, '30 de junio de 2026');
    });

    it('reconcile leaves an explicit mid-employment salary month alone', () => {
        const out: Record<string, string | number> = {
            employmentStartDate: '3 de marzo de 2019',
            employmentEndDate: '30 de junio de 2026',
            lastSalaryPeriodDate: '1 de abril de 2026',
            salaryAmountInNumbers: '18,000.00',
        };
        assert.equal(reconcileReciboDomesticaLastSalaryPeriod(out), false);
        assert.equal(out.lastSalaryPeriodDate, '1 de abril de 2026');
    });
});

describe('termination date reuse from employment end', () => {
    it('fills contractTerminationDate from employmentEndDate when missing', () => {
        const out: Record<string, string | number> = {
            employmentEndDate: '30 de junio de 2026',
        };
        assert.equal(fillReciboDomesticaTerminationDateFromEmploymentEnd(out), true);
        assert.equal(out.contractTerminationDate, '30 de junio de 2026');
    });

    it('does not overwrite an explicit termination date', () => {
        const out: Record<string, string | number> = {
            employmentEndDate: '30 de junio de 2026',
            contractTerminationDate: '15 de junio de 2026',
        };
        assert.equal(fillReciboDomesticaTerminationDateFromEmploymentEnd(out), false);
        assert.equal(out.contractTerminationDate, '15 de junio de 2026');
    });

    it('terminationInfo enrich prefers the last date in the message', () => {
        const mapped: Record<string, string | number> = {};
        enrichReciboDomesticaGroupDates(
            'terminationInfo',
            mapped,
            'Inició el 3 de marzo de 2019 y la terminación efectiva fue el 30 de junio de 2026.',
        );
        assert.equal(mapped.contractTerminationDate, '30 de junio de 2026');
    });
});

describe('pending vacation disclosure', () => {
    it('detects pending vacation balance language', () => {
        assert.equal(
            detectPendingVacationDisclosure(
                'María disfrutó sus vacaciones hasta diciembre de 2025. El período pendiente de liquidar es enero a junio de 2026.',
            ),
            true,
        );
        assert.equal(
            detectPendingVacationDisclosure('Las vacaciones ya tomadas cubren hasta el año 2025.'),
            false,
        );
    });

    it('does not auto-fill vacationCoverageThroughDate when pending is disclosed', () => {
        const mapped: Record<string, string | number> = {};
        const text =
            'Disfrutó vacaciones hasta diciembre de 2025. El período pendiente de liquidar es enero a junio de 2026.';
        assert.equal(enrichReciboDomesticaGroupDates('vacationInfo', mapped, text), false);
        assert.equal(mapped.vacationCoverageThroughDate, undefined);
    });
});

describe('notary confirmation offered at most once', () => {
    it('stops offering after NOTARY_JURISDICTION_OFFERED_KEY is set', () => {
        const vars: Record<string, string | number> = {
            declarantAddress: 'Calle 1, Santo Domingo, Distrito Nacional, República Dominicana',
            [NOTARY_JURISDICTION_OFFERED_KEY]: 'true',
        };
        assert.equal(isDomesticReciboNotaryAlreadyOffered(vars), true);
        assert.equal(shouldOfferDomesticReciboNotaryConfirmation(vars), false);
    });

    it('offers once when address-inferred and not yet offered', () => {
        const vars: Record<string, string | number> = {
            declarantAddress: 'Calle 1, Santo Domingo, Distrito Nacional, República Dominicana',
        };
        assert.equal(shouldOfferDomesticReciboNotaryConfirmation(vars), true);
    });

    it('does not offer after ack sent', () => {
        const vars: Record<string, string | number> = {
            declarantAddress: 'Calle 1, Santo Domingo, Distrito Nacional, República Dominicana',
            [NOTARY_JURISDICTION_ACK_SENT_KEY]: 'Sí',
        };
        assert.equal(shouldOfferDomesticReciboNotaryConfirmation(vars), false);
    });
});
