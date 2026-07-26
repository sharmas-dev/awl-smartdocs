import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    applyCorretajeInmobiliarioNormalizations,
    corretajeMissingCriticalFields,
    isCorretajeInmobiliarioTemplate,
    normalizeCorretajeContractDuration,
    normalizeCorretajeTransactionType,
    reconcileCorretajePartyCompanyBranches,
    sanitizeCorretajeRenderedHtml,
} from './corretaje-inmobiliario-normalize.js';

describe('isCorretajeInmobiliarioTemplate', () => {
    it('matches canonical and alias titles', () => {
        assert.equal(
            isCorretajeInmobiliarioTemplate('Contrato de Representación Agente de Bienes Raíces'),
            true,
        );
        assert.equal(
            isCorretajeInmobiliarioTemplate('Contrato de Intermediación y Corretaje Inmobiliario'),
            true,
        );
        assert.equal(isCorretajeInmobiliarioTemplate('Contrato de Teletrabajo'), false);
    });
});

describe('normalizeCorretajeTransactionType', () => {
    it('maps long venta phrases to Venta', () => {
        assert.equal(
            normalizeCorretajeTransactionType('Venta de un inmueble residencial'),
            'Venta',
        );
        assert.equal(normalizeCorretajeTransactionType('venta'), 'Venta');
    });

    it('maps alquiler / arrendamiento phrases to Alquiler', () => {
        assert.equal(normalizeCorretajeTransactionType('Alquiler'), 'Alquiler');
        assert.equal(
            normalizeCorretajeTransactionType('arrendamiento de local comercial'),
            'Alquiler',
        );
    });
});

describe('reconcileCorretajePartyCompanyBranches', () => {
    it('forces Empresa and migrates agentFullName → agentLegalName', () => {
        const out: Record<string, string | number> = {
            agentIsCompany: 'Persona física',
            agentFullName: 'Inmobiliaria Costa Azul, SRL',
            agentRnc: '1-31-12345-6',
            agentRepFullName: 'María Pérez',
        };
        assert.equal(reconcileCorretajePartyCompanyBranches(out), true);
        assert.equal(out.agentIsCompany, 'Empresa');
        assert.equal(out.agentLegalName, 'Inmobiliaria Costa Azul, SRL');
    });
});

describe('normalizeCorretajeContractDuration', () => {
    it('moves multi-unit phrase from Numbers to Words and keeps a bare digit', () => {
        const out: Record<string, string | number> = {
            contractDurationWords: '',
            contractDurationNumbers: '1 año, 6 meses y 15 días',
        };
        assert.equal(normalizeCorretajeContractDuration(out), true);
        assert.equal(out.contractDurationWords, '1 año, 6 meses y 15 días');
        assert.equal(out.contractDurationNumbers, '1');
        assert.equal(out.contractDurationHasUnit, undefined);
    });
});

describe('sanitizeCorretajeRenderedHtml', () => {
    it('collapses duplicated como', () => {
        assert.equal(
            sanitizeCorretajeRenderedHtml('denominado(a) como como "EL PROPIETARIO"'),
            'denominado(a) como "EL PROPIETARIO"',
        );
    });
});

describe('applyCorretajeInmobiliarioNormalizations + missing critical', () => {
    it('normalizes venta + company agent and clears missing list', () => {
        const out: Record<string, string | number> = {
            transactionType: 'Venta de un inmueble residencial',
            agentIsCompany: 'Persona física',
            agentFullName: 'Inmobiliaria Costa Azul, SRL',
            agentRnc: '1-31-12345-6',
            agentRepFullName: 'María Pérez',
            commissionPercentWords: 'cinco',
            commissionPercentNumber: '5',
            contractDurationWords: 'un',
            contractDurationNumbers: '1',
        };
        assert.equal(applyCorretajeInmobiliarioNormalizations(out), true);
        assert.equal(out.transactionType, 'Venta');
        assert.equal(out.agentIsCompany, 'Empresa');
        assert.equal(out.agentLegalName, 'Inmobiliaria Costa Azul, SRL');
        assert.deepEqual(corretajeMissingCriticalFields(out), []);
    });

    it('flags missing commission months on Alquiler', () => {
        const out: Record<string, string | number> = {
            transactionType: 'Alquiler',
            agentFullName: 'Juan Pérez',
            agentIsCompany: 'Persona física',
        };
        assert.ok(corretajeMissingCriticalFields(out).some((m) => m.includes('commissionMonths')));
    });
});
