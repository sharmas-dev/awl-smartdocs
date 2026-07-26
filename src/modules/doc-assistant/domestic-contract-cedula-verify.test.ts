import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DocAssistantService } from './doc-assistant.service.js';

const TEMPLATE = 'Contrato de Trabajadora Doméstica';

describe('Contrato de Trabajadora Doméstica — cédula validation for PDF', () => {
    const svc = new DocAssistantService();

    const baseEmployerEmployee = {
        employerFullName: 'Juan Pérez Gómez',
        employerIdType: 'Cédula',
        employerFullAddress: 'Av. Los Próceres, Santo Domingo',
        employeeFullName: 'María López Rodríguez',
        employeeNationality: 'dominicana',
        employeeMaritalStatus: 'soltero(a)',
        employeeAge: '32',
        employeeGender: 'Femenino',
        employeeIdType: 'Cédula',
        employeeFullAddress: 'Calle Duarte, Santiago',
    };

    it('accepts standard 11-digit cédulas (001-1234567-8) for generate_pdf guard', () => {
        const check = svc.verifyRequiredFields(TEMPLATE, {
            ...baseEmployerEmployee,
            employerIdNumber: '001-1234567-8',
            employeeIdNumber: '402-7654321-9',
        });
        assert.equal(check.ok, true, JSON.stringify(check));
    });

    it('rejects 8–9 digit partial cédulas like 1234567-8', () => {
        const check = svc.verifyRequiredFields(TEMPLATE, {
            ...baseEmployerEmployee,
            employerIdNumber: '1234567-8',
            employeeIdNumber: '7654321-9',
        });
        assert.equal(check.ok, false);
        if (!check.ok) {
            const keys = check.missingFields.map((f) => f.key);
            assert.ok(keys.includes('employerIdNumber'));
            assert.ok(keys.includes('employeeIdNumber'));
        }
    });

    it('getNextGroup keeps employer group when employee cédula is invalid', async () => {
        const session = (svc as unknown as { session: { start: Function; clearByPurchaseId: Function } }).session;
        const userId = 'cedula-verify-user';
        const purchaseId = '6a0dcb83193200f1946624d4';
        await session.start(TEMPLATE, userId, '507f1f77bcf86cd799439012', purchaseId);
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employer', {
            employerFullName: 'Juan Pérez Gómez',
            employerIdType: 'Cédula',
            employerIdNumber: '001-1234567-8',
            employerFullAddress: 'Av. Los Próceres, Santo Domingo',
        });
        await svc.storeGroupVariablesByPurchaseId(purchaseId, userId, 'employee', {
            employeeFullName: 'María López Rodríguez',
            employeeNationality: 'dominicana',
            employeeMaritalStatus: 'soltero(a)',
            employeeAge: '32',
            employeeGender: 'Femenino',
            employeeIdType: 'Cédula',
            employeeIdNumber: '7654321-9',
            employeeFullAddress: 'Calle Duarte, Santiago',
        });
        const next = await svc.getNextGroupByPurchaseId(TEMPLATE, userId, purchaseId);
        assert.ok(!('error' in next), JSON.stringify(next));
        assert.ok(!('allComplete' in next));
        if ('allComplete' in next) return;
        assert.equal(next.group.id, 'employee');
        assert.ok(
            next.group.variables.some((v) => v.key === 'employeeIdNumber'),
            'invalid employee cédula should stay pending',
        );
    });
});
