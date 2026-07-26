import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DocAssistantService } from './doc-assistant.service.js';
import type { SessionManager } from './session-store.js';
import {
    buildDomesticReciboEmployerAcknowledgment,
    buildDomesticReciboNotaryAcknowledgment,
} from './recibo-descargo-domestica-enrichment.js';
import { groupUserMessageStorageKey } from './recibo-domestica-session-backfill.js';

const TEMPLATE = 'Recibo de Descargo Trabajadora Doméstica';
const USER = 'flow-test-user';
const PURCHASE = '507f1f77bcf86cd799439011';
const CATALOG = '507f1f77bcf86cd799439012';

function forbiddenPendingKeys(keys: string[]): string[] {
    return keys.filter((k) =>
        [
            'employerReference',
            'payerReference',
            'employerReferenceShort',
            'terminationDayLetters',
            'terminationDayNumbers',
            'terminationMonthLetters',
            'terminationYearLetters',
            'terminationYearNumbers',
            'notaryJurisdiction',
        ].includes(k),
    );
}

describe('Recibo de Descargo Trabajadora Doméstica — end-to-end flow', () => {
    const svc = new DocAssistantService();
    const session = (svc as unknown as { session: SessionManager }).session;

    it('issue 1: employer narrative → inferred refs, no grammatical follow-ups', async () => {
        await session.start(TEMPLATE, USER, CATALOG, PURCHASE);
        const narrative =
            'Av los proceres #45, Santo Domingo. Empleador: Juan Pérez Gómez, Dominicano, Pasaporte: 34354534';

        await svc.storeGroupVariables(
            'employerInfo',
            { userMessage: narrative },
            TEMPLATE,
            USER,
        );

        const vars = await svc.getSessionVariables(TEMPLATE, USER);
        assert.equal(vars.employerFullName, 'Juan Pérez Gómez');
        assert.equal(vars.domesticEmployerGender, 'Hombre');
        assert.equal(vars.workplaceDescription, 'del señor');
        assert.equal(vars.employerReference, 'el Empleador');
        assert.equal(vars.payerReference, 'del Empleador');
        assert.equal(vars.employerReferenceShort, 'al Empleador');
        assert.ok(vars.employerInferredLocation);

        const ack = buildDomesticReciboEmployerAcknowledgment(vars);
        assert.ok(ack?.includes('Juan Pérez Gómez'));
        assert.ok(ack?.includes('el Empleador'));

        const next = await svc.getNextGroup(TEMPLATE, USER);
        assert.ok(!('error' in next));
        assert.ok(!('allComplete' in next));
        if ('group' in next) {
            assert.notEqual(next.group.id, 'employerInfo');
            const pendingKeys = next.group.variables.map((v: { key: string }) => v.key);
            assert.deepEqual(forbiddenPendingKeys(pendingKeys), []);
            assert.ok(!pendingKeys.includes('domesticEmployerGender'));
            assert.ok(!pendingKeys.includes('workplaceDescription'));
        }
    });

    it('issue 2: one termination date → PDF fragments, not in pending', async () => {
        await session.start(TEMPLATE, USER + '-term', CATALOG, PURCHASE + '1');
        await svc.storeGroupVariables(
            'terminationInfo',
            {
                terminationReason: 'por MI DECISIÓN UNILATERAL DE RENUNCIAR AL PUESTO DE TRABAJO',
                contractTerminationDate: '30 de diciembre de 2025',
            },
            TEMPLATE,
            USER + '-term',
        );

        const vars = await svc.getSessionVariables(TEMPLATE, USER + '-term');
        assert.equal(vars.terminationDayNumbers, '30');
        assert.equal(vars.terminationMonthLetters, 'diciembre');
        assert.equal(vars.terminationYearNumbers, '2025');
        assert.ok(String(vars.terminationDayLetters ?? '').length > 0);

        const next = await svc.getNextGroup(TEMPLATE, USER + '-term');
        if ('group' in next) {
            const pendingKeys = next.group.variables.map((v: { key: string }) => v.key);
            assert.deepEqual(forbiddenPendingKeys(pendingKeys), []);
        }
    });

    it('after termination submit, still asks vacationInfo then signingInfo (no cross-group date steal)', async () => {
        const userId = USER + '-vac-sign';
        const purchaseId = PURCHASE + 'vac';
        await session.start(TEMPLATE, userId, CATALOG, purchaseId);

        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'declarantInfo', {
            declarantFullName: 'María López Rodríguez',
            declarantNationality: 'dominicana',
            declarantIdType: 'de la Cédula de Identidad y Electoral',
            declarantIdNumber: '402-7654321-9',
            declarantAddress: 'Calle Duarte No. 12, Santiago de los Caballeros, Santiago, República Dominicana',
        });
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employerInfo', {
            employerFullName: 'Juan Pérez Gómez',
            domesticEmployerGender: 'Hombre',
            employerNationality: 'dominicana',
            employerIdType: 'de la Cédula de Identidad y Electoral',
            employerIdNumber: '001-1234567-8',
            workplaceDescription: 'del señor Juan Pérez Gómez',
        });
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employmentDates', {
            employmentStartDate: '1 de junio de 2024',
            employmentEndDate: '26 de mayo de 2026',
        });
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'paymentInfo', {
            navidadAmountInWords: 'Diez Mil Pesos Dominicanos',
            navidadAmountInNumbers: '10,000.00',
            salaryAmountInWords: 'Veinte Mil Pesos Dominicanos',
            salaryAmountInNumbers: '20,000.00',
            lastSalaryPeriodDate: '1 de abril de 2026',
        });
        await svc.storeGroupVariablesByPurchaseId(
            purchaseId,
            userId,
            'terminationInfo',
            {
                terminationReason: 'por MUTUO ACUERDO entre las partes',
                contractTerminationDate: '26 de mayo de 2026',
                [groupUserMessageStorageKey('terminationInfo')]:
                    'Por mutuo acuerdo; fecha efectiva el 26 de mayo de 2026.',
            },
        );

        const varsAfterTerm = await svc.getSessionVariablesByPurchaseId(purchaseId, userId);
        assert.equal(String(varsAfterTerm.vacationCoverageThroughDate ?? '').trim(), '');
        assert.equal(String(varsAfterTerm.documentSigningDate ?? '').trim(), '');

        const nextVacation = await svc.getNextGroupByPurchaseId(TEMPLATE, userId, purchaseId);
        assert.ok(!('error' in nextVacation));
        assert.ok(!('allComplete' in nextVacation), 'must not skip to preview before vacation');
        if ('group' in nextVacation) {
            assert.equal(nextVacation.group.id, 'vacationInfo');
            assert.ok(
                nextVacation.group.variables.some((v) => v.key === 'vacationCoverageThroughDate'),
            );
        }

        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'vacationInfo', {
            vacationCoverageThroughDate: '31 de diciembre de 2025',
            [groupUserMessageStorageKey('vacationInfo')]: 'Vacaciones hasta el año 2025.',
        });

        const nextSigning = await svc.getNextGroupByPurchaseId(TEMPLATE, userId, purchaseId);
        assert.ok(!('error' in nextSigning));
        assert.ok(!('allComplete' in nextSigning), 'must not skip to preview before signing date');
        if ('group' in nextSigning) {
            assert.equal(nextSigning.group.id, 'signingInfo');
            assert.ok(
                nextSigning.group.variables.some((v) => v.key === 'documentSigningDate'),
            );
        }
    });

    it('issue 3: address → notary/signing inferred, not in pending or compact schema', async () => {
        await session.start(TEMPLATE, USER + '-notary', CATALOG, PURCHASE + '2');
        await svc.storeGroupVariables(
            'declarantInfo',
            {
                declarantFullName: 'María Pérez Cruz',
                declarantNationality: 'dominicana',
                declarantIdType: 'de la Cédula de Identidad y Electoral',
                declarantIdNumber: '001-1234567-8',
                declarantAddress: 'Av. Los Próceres #45, Santo Domingo, D.N.',
            },
            TEMPLATE,
            USER + '-notary',
        );

        const vars = await svc.getSessionVariables(TEMPLATE, USER + '-notary');
        assert.equal(vars.signingCity, 'Santo Domingo');
        assert.equal(vars.signingProvince, 'Distrito Nacional');
        assert.equal(vars.notaryJurisdiction, 'Distrito Nacional');

        const notaryAck = buildDomesticReciboNotaryAcknowledgment(vars);
        assert.ok(notaryAck?.includes('Santo Domingo'));
        assert.ok(notaryAck?.includes('Dado que las partes están en'));

        const compact = svc.getCompactSchema(TEMPLATE);
        assert.ok(!('error' in compact));
        const signingGroup = compact.groups.find((g) => g.id === 'signingInfo');
        assert.ok(signingGroup);
        assert.ok(!signingGroup!.variables.some((v) => v.key === 'notaryJurisdiction'));

        const next = await svc.getNextGroup(TEMPLATE, USER + '-notary');
        if ('group' in next) {
            if (next.group.id === 'signingInfo') {
                const pendingKeys = next.group.variables.map((v: { key: string }) => v.key);
                assert.ok(!pendingKeys.includes('notaryJurisdiction'));
            }
        }
    });
});
