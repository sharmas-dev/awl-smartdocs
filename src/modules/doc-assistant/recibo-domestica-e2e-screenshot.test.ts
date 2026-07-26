import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DocAssistantService } from './doc-assistant.service.js';
import type { SessionManager } from './session-store.js';
import { isInvalidPersonNameValue } from './person-name-sanitize.js';

const TEMPLATE = 'Recibo de Descargo Trabajadora Doméstica';

describe('Recibo doméstica — screenshot-equivalent golden path', () => {
    it('renders PDF without empty date parentheses or field corruption', async () => {
        const svc = new DocAssistantService();
        const session = (svc as unknown as { session: SessionManager }).session;
        const userId = 'screenshot-golden-user';
        const purchaseId = '507f1f77bcf86cd799439031';
        await session.start(TEMPLATE, userId, '507f1f77bcf86cd799439032', purchaseId);

        const declarantMsg =
            'La trabajadora se llama María Pérez Cruz, es dominicana, titular de la Cédula de Identidad y Electoral número 402-7654321-9, y su domicilio completo es Calle Duarte No. 12, Santiago De Los Caballeros.';
        const decl = svc.mapAnswersToGroupSchema(TEMPLATE, 'declarantInfo', {}, declarantMsg);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'declarantInfo', decl.mapped, declarantMsg);
        assert.equal(isInvalidPersonNameValue(String(decl.mapped.declarantFullName ?? '')), false);
        assert.ok(!String(decl.mapped.declarantFullName ?? '').toLowerCase().startsWith('reside'));

        const employerMsg =
            'Empleador: Juan Pérez Gómez, dominicano, titular de la Cédula de Identidad y Electoral número 001-1234567-8. El hogar se describe como del señor.';
        const emp = svc.mapAnswersToGroupSchema(TEMPLATE, 'employerInfo', { domesticEmployerGender: 'Hombre' }, employerMsg);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employerInfo', emp.mapped, employerMsg);

        const employmentNarrative =
            'El trabajo en el hogar comenzó el 1 de junio de 2024 y terminó el 26 de mayo de 2026.';
        const empDates = svc.mapAnswersToGroupSchema(TEMPLATE, 'employmentDates', {}, employmentNarrative);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employmentDates', empDates.mapped, employmentNarrative);

        const payMsg =
            'Recibí RD$10,000 por regalía pascual y RD$20,000 por salario del mes de abril de 2026.';
        const pay = svc.mapAnswersToGroupSchema(
            TEMPLATE,
            'paymentInfo',
            {
                navidadAmountInNumbers: '10,000.00',
                salaryAmountInNumbers: '20,000.00',
            },
            payMsg,
        );
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'paymentInfo', pay.mapped, payMsg);

        const termMsg =
            'La terminación fue por MUTUO ACUERDO entre las partes, con fecha efectiva el 26 de mayo de 2026.';
        const term = svc.mapAnswersToGroupSchema(
            TEMPLATE,
            'terminationInfo',
            { terminationReason: 'por MUTUO ACUERDO entre las partes' },
            termMsg,
        );
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'terminationInfo', term.mapped, termMsg);

        const vacMsg = 'Las vacaciones ya tomadas cubren hasta el año 2025.';
        const vac = svc.mapAnswersToGroupSchema(TEMPLATE, 'vacationInfo', {}, vacMsg);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'vacationInfo', vac.mapped, vacMsg);

        const signMsg =
            'El documento será firmado en Santo Domingo, Distrito Nacional, el día 26 de mayo de 2026.';
        const sign = svc.mapAnswersToGroupSchema(TEMPLATE, 'signingInfo', {}, signMsg);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'signingInfo', sign.mapped, signMsg);

        const vars = await svc.syncNormalizedSessionVariablesByPurchaseId(purchaseId, userId);
        const pdfReady = svc.verifyReciboDomesticaPdfDateFragments(TEMPLATE, vars);
        assert.equal(pdfReady.ok, true, pdfReady.ok ? '' : JSON.stringify(pdfReady.issues));

        const pdf = await svc.fillAndExportPdf(TEMPLATE, vars, true);
        assert.equal(pdf.success, true, pdf.error);
        assert.ok(!pdf.htmlContent.includes('() de del año ()'), 'empty date parentheses in HTML');
        assert.ok(pdf.htmlContent.includes('María Pérez Cruz'));
        assert.ok(pdf.htmlContent.includes('junio'));
        assert.ok(pdf.htmlContent.includes('2024'));
        assert.ok(pdf.htmlContent.includes('abril'));
        const primeroMatch = pdf.htmlContent.match(/PRIMERO:[\s\S]*?SEGUNDO:/);
        assert.ok(primeroMatch, 'PRIMERO section missing');
        const primero = primeroMatch![0]!;
        const juanCount = (primero.match(/Juan Pérez Gómez/gi) ?? []).length;
        assert.ok(juanCount <= 2, `employer name repeated ${juanCount} times in PRIMERO`);
    });
});
