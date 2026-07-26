import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildOpeningChatMessage,
    buildOpeningFirstQuestions,
    shouldUseAwliOpeningPhase,
} from './awl-opening-message.js';

const declarantPending = [
    { key: 'declarantFullName', label: 'Nombre legal completo del trabajador(a)' },
    { key: 'declarantNationality', label: 'Nacionalidad del trabajador(a)' },
    { key: 'declarantIdType', label: 'Tipo de documento de identidad del trabajador(a)' },
    { key: 'declarantIdNumber', label: 'Número de cédula o pasaporte del trabajador(a)' },
    { key: 'declarantAddress', label: 'Dirección completa de domicilio del trabajador(a)' },
];

describe('buildOpeningChatMessage', () => {
    it('Recibo Laboral: AWL branded intro + declarant questions without address', () => {
        const msg = buildOpeningChatMessage(
            'Recibo de Descargo Laboral',
            'declarantInfo',
            declarantPending,
        );
        assert.ok(msg);
        assert.match(msg, /^¡Hola!,/);
        assert.match(msg, /Soy AWLi, tu asistente legal para completar tu documento legal Recibo de Descargo Laboral/);
        assert.match(msg, /Desde AWL, como plataforma/);
        assert.doesNotMatch(msg, /asistente virtual/i);
        assert.doesNotMatch(msg, /Qué gusto saludarte/i);
        assert.match(msg, /del trabajador, su nacionalidad/);
        assert.doesNotMatch(msg, /dirección completa de domicilio/i);
        assert.match(msg, /Estaré al tanto/);
    });

    it('Recibo Trabajadora Doméstica: same structure, rol femenino canónico', () => {
        const laboral = buildOpeningChatMessage(
            'Recibo de Descargo Laboral',
            'declarantInfo',
            declarantPending,
        );
        const domestica = buildOpeningChatMessage(
            'Recibo de Descargo Trabajadora Doméstica',
            'declarantInfo',
            declarantPending.map((f) => ({
                ...f,
                label: f.label.replace(/trabajador\(a\)/i, 'trabajadora doméstica'),
            })),
        );
        assert.ok(laboral && domestica);
        assert.equal(
            laboral.replace(/del trabajador/g, 'ROLE').replace(/Recibo de Descargo Laboral/g, 'DOC'),
            domestica
                .replace(/de la trabajadora doméstica/g, 'ROLE')
                .replace(/Recibo de Descargo Trabajadora Doméstica/g, 'DOC'),
        );
    });

    it('Contrato de Trabajadora Doméstica: employer block, not generic virtual intro', () => {
        const msg = buildOpeningChatMessage('Contrato de Trabajadora Doméstica', 'employer', [
            { key: 'employerFullName', label: 'Nombre completo del empleador' },
            { key: 'employerIdType', label: 'Tipo de documento de identidad del empleador' },
            { key: 'employerIdNumber', label: 'Número de documento de identidad del empleador' },
            { key: 'employerFullAddress', label: 'Dirección completa del empleador' },
        ]);
        assert.ok(msg);
        assert.match(msg, /asistente legal/i);
        assert.doesNotMatch(msg, /asistente virtual/i);
        assert.match(msg, /parte empleadora/);
        assert.match(msg, /Cédula o Pasaporte/);
    });

    it('Contrato de Compraventa Vehículo: seller opener is branch-neutral (no jurisdiction)', () => {
        const q = buildOpeningFirstQuestions('Contrato de Compraventa Vehículo', 'seller', [
            { key: 'sellerIsCompany', label: '¿El vendedor es empresa o persona física?' },
            { key: 'sellerTypeLabel', label: 'Tipo de vendedor' },
            { key: 'sellerLegalName', label: 'Nombre legal completo del vendedor' },
            { key: 'sellerFullAddress', label: 'Dirección completa del vendedor' },
        ]);
        assert.match(q, /empresa o persona física/i);
        assert.match(q, /dirección completa/i);
        assert.doesNotMatch(q, /jurisdicción/i);
    });

    it('Contrato de Teletrabajo: standard AWL opener + neutral employer questions', () => {
        const msg = buildOpeningChatMessage('Contrato de Teletrabajo', 'employer', [
            { key: 'employerIsCompany', label: 'Tipo de contribuyente' },
            { key: 'employerLegalName', label: 'Nombre legal' },
            { key: 'employerFullAddressStreet', label: 'Calle' },
        ]);
        assert.ok(msg);
        assert.match(msg, /^¡Hola!,/);
        assert.match(msg, /Soy AWLi, tu asistente legal para completar tu documento legal Contrato de Teletrabajo/);
        assert.match(msg, /Desde AWL, como plataforma/);
        assert.match(msg, /Como primer paso/);
        assert.match(msg, /parte empleadora/);
        assert.doesNotMatch(msg, /jurisdicci[oó]n de constituci[oó]n y su RNC/i);
    });
});

describe('buildOpeningChatMessage — all deployed templates', () => {
    const templates: Array<{ name: string; groupId: string; keys: string[] }> = [
        { name: 'Contrato de Trabajadora Doméstica', groupId: 'employer', keys: ['employerFullName', 'employerIdType', 'employerIdNumber', 'employerFullAddress'] },
        { name: 'Contrato de Trabajo', groupId: 'employer', keys: ['employerIsCompany', 'employerLegalName', 'employerJurisdiction', 'employerRnc'] },
        { name: 'Contrato de Teletrabajo', groupId: 'employer', keys: ['employerIsCompany', 'employerLegalName', 'employerCompanyNationalOrForeign', 'employerHasDominicanRnc'] },
        { name: 'Recibo de Descargo Laboral', groupId: 'declarantInfo', keys: ['declarantFullName', 'declarantNationality', 'declarantIdType', 'declarantIdNumber'] },
        { name: 'Propuesta de Trabajo', groupId: 'company', keys: ['companyLegalName', 'companyRnc', 'companyRm', 'companyRnl'] },
        { name: 'Contrato de Compraventa Vehículo', groupId: 'seller', keys: ['sellerIsCompany', 'sellerTypeLabel', 'sellerLegalName', 'sellerJurisdiction'] },
    ];

    for (const t of templates) {
        it(`${t.name} returns non-empty AWL opening`, () => {
            const pending = t.keys.map((key) => ({ key, label: key }));
            const msg = buildOpeningChatMessage(t.name, t.groupId, pending);
            assert.ok(msg && msg.length > 100);
            assert.doesNotMatch(msg, /asistente virtual/i);
        });
    }
});

describe('shouldUseAwliOpeningPhase', () => {
    it('true for fresh purchase with empty session', () => {
        assert.equal(
            shouldUseAwliOpeningPhase({
                completedGroups: [],
                savedAnswerKeys: [],
                sessionVariableCount: 0,
            }),
            true,
        );
    });

    it('true for bootstrap repeat when session exists but has no answers', () => {
        assert.equal(
            shouldUseAwliOpeningPhase({
                completedGroups: [],
                savedAnswerKeys: [],
                sessionVariableCount: 0,
            }),
            true,
        );
    });

    it('false after any answers were saved', () => {
        assert.equal(
            shouldUseAwliOpeningPhase({
                completedGroups: [],
                savedAnswerKeys: ['declarantFullName'],
                sessionVariableCount: 1,
            }),
            false,
        );
    });
});

describe('buildOpeningFirstQuestions', () => {
    it('Recibo opening excludes address even when fifth pending field exists', () => {
        const q = buildOpeningFirstQuestions(
            'Recibo de Descargo Laboral',
            'declarantInfo',
            declarantPending,
        );
        assert.doesNotMatch(q, /dirección/i);
        assert.match(q, /número correspondiente/);
    });
});
