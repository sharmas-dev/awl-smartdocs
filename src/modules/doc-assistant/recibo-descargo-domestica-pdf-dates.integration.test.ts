import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DocAssistantService } from './doc-assistant.service.js';

const TEMPLATE = 'Recibo de Descargo Trabajadora Doméstica';

describe('Recibo de Descargo Trabajadora Doméstica PDF dates', () => {
    const svc = new DocAssistantService();

    it('fillAndExportPdf renders employment and signing date fragments', async () => {
        const variables = {
            declarantFullName: 'Luisa María Hernández Peña',
            declarantNationality: 'dominicana',
            declarantIdType: 'de la Cédula de Identidad y Electoral',
            declarantIdNumber: '001-1234567-8',
            declarantAddress: 'Santo Domingo',
            employerFullName: 'Elena Patricia Núñez Rodríguez',
            domesticEmployerGender: 'Mujer',
            employerNationality: 'dominicana',
            employerIdType: 'de la Cédula de Identidad y Electoral',
            employerIdNumber: '001-3698524-1',
            workplaceDescription: 'de la señora',
            employerReference: 'la Empleadora',
            payerReference: 'de la Empleadora',
            employerReferenceShort: 'a la Empleadora',
            employmentStartDate: '1 de enero de 2020',
            employmentEndDate: '31 de diciembre de 2025',
            navidadAmountInWords: 'Diez Mil Pesos Dominicanos',
            navidadAmountInNumbers: '10,000.00',
            salaryAmountInWords: 'Quince Mil Pesos Dominicanos',
            salaryAmountInNumbers: '15,000.00',
            lastSalaryPeriodDate: '1 de diciembre de 2025',
            terminationReason: 'por MI DECISIÓN UNILATERAL DE RENUNCIAR AL PUESTO DE TRABAJO',
            contractTerminationDate: '31 de diciembre de 2025',
            vacationCoverageThroughDate: '31 de diciembre de 2025',
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            documentSigningDate: '15 de enero de 2026',
            notaryJurisdiction: 'Distrito Nacional',
        };

        const result = await svc.fillAndExportPdf(TEMPLATE, variables, true);
        assert.equal(result.success, true, result.error);
        assert.ok(result.htmlContent.includes('primero'));
        assert.ok(result.htmlContent.includes('(1)'));
        assert.ok(result.htmlContent.includes('enero'));
        assert.ok(result.htmlContent.includes('2020'));
        assert.ok(result.htmlContent.includes('diciembre'));
        assert.ok(result.htmlContent.includes('2025'));
        assert.ok(!result.htmlContent.includes('() de del año ()'));
    });
});
