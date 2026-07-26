import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DocAssistantService } from './doc-assistant.service.js';
import type { SessionData } from './session-store.js';

const TEMPLATE = 'Contrato de Trabajadora Doméstica';

function testSession(
    templateName: string,
    variables: Record<string, string | number> = {},
): SessionData {
    return {
        sessionId: 'auto-preview-session-test',
        userId: 'auto-preview-session-user',
        documentId: '507f1f77bcf86cd799439012',
        templateName,
        variables: { ...variables },
        completedGroups: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/** Minimal complete session for reconcile / verifyRequiredFields (domestic contract). */
function completeDomesticVars(): Record<string, string | number> {
    return {
        employerFullName: 'Juan Pérez Gómez',
        employerIdType: 'Cédula',
        employerIdNumber: '001-1234567-9',
        employerFullAddress: 'Av. Los Próceres #45, Santo Domingo, Distrito Nacional',
        employeeFullName: 'María López Rodríguez',
        employeeNationality: 'dominicana',
        employeeMaritalStatus: 'soltero(a)',
        employeeAge: '30',
        employeeGender: 'Femenino',
        employeeIdType: 'Cédula',
        employeeIdNumber: '001-2345678-9',
        employeeFullAddress: 'Calle Duarte #10, Santo Domingo',
        startDate: '15 de marzo de 2026',
        workDays: 'lunes a viernes',
        workSchedule: 'de 8:00 a.m. a 5:00 p.m.',
        primaryResponsibility: 'Limpieza general',
        salaryInWords: 'veinticinco mil pesos dominicanos',
        salaryAmountWithCurrency: 'RD$25000',
        paymentFrequency: 'mensuales',
        paymentSchedule: 'los días 15 y 30',
        hasAdditionalBenefits: 'Sí',
        otherBenefits: 'Un día libre adicional al mes',
        contractDurationKind: 'Por tiempo indefinido',
        minimumNoticeNumber: '5',
        minimumNoticeNumberWords: 'cinco',
        minimumNoticeUnit: 'días',
        signingCity: 'Santo Domingo de Guzmán',
        signingProvince: 'Distrito Nacional',
        documentSigningDate: '15 de marzo de 2026',
        notaryJurisdiction: 'Distrito Nacional',
    };
}

describe('domestic contract session ready for auto-preview', () => {
    const svc = new DocAssistantService();

    it('reconcile marks all groups complete with documentSigningDate only', async () => {
        const session = testSession(TEMPLATE, completeDomesticVars());
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(progress.allComplete, true);
        assert.equal(session.variables.contractDurationIndefinite, 'por tiempo indefinido');
        assert.equal(session.variables.signingDayNumbers, '15');
    });

    it('verifyRequiredFields passes for a complete domestic session', () => {
        const check = svc.verifyRequiredFields(TEMPLATE, completeDomesticVars());
        assert.equal(check.ok, true);
    });
});
