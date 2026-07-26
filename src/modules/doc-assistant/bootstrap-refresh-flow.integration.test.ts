/**
 * Simulates page refresh / Clear Chat: first submit_group_answers call resets the
 * purchase session and returns the AWL opening for group 1 (employer on Trabajadora Doméstica).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildOpeningChatMessage, shouldUseAwliOpeningPhase } from './awl-opening-message.js';
import { DocAssistantService } from './doc-assistant.service.js';
import type { SessionManager } from './session-store.js';

const TEMPLATE = 'Contrato de Trabajadora Doméstica';
const USER = 'bootstrap-refresh-test-user';
const PURCHASE = '6a0dcb83193200f1946624d4';
const CATALOG = '507f1f77bcf86cd799439012';

/** Mirrors submit_group_answers fresh-bootstrap branch in doc-assistant.tools.ts */
async function applyFreshBootstrap(
    svc: DocAssistantService,
    templateName: string,
    userId: string,
    catalogDocumentId: string,
    purchaseId: string,
): Promise<void> {
    const existing = await svc.getPurchaseSession(purchaseId, userId);
    if (existing) {
        await svc.clearSessionByPurchaseId(purchaseId, userId, existing.templateName || templateName);
    }
    await svc.session.start(templateName, userId, catalogDocumentId, purchaseId);
}

function nonEmptyVarCount(vars: Record<string, string | number>): number {
    return Object.keys(vars).filter((k) => String(vars[k] ?? '').trim() !== '').length;
}

describe('bootstrap refresh — Contrato de Trabajadora Doméstica', () => {
    const svc = new DocAssistantService();
    const session = (svc as unknown as { session: SessionManager }).session;

    it('mid-flow session advances past employer; after fresh bootstrap returns employer + opening', async () => {
        await applyFreshBootstrap(svc, TEMPLATE, USER, CATALOG, PURCHASE);

        await svc.storeGroupVariablesByPurchaseId(PURCHASE, USER, 'employer', {
            employerFullName: 'Juan Pérez Gómez',
            employerIdType: 'Cédula',
            employerIdNumber: '001-1234567-8',
            employerFullAddress: 'Av. Winston Churchill, Santo Domingo, Distrito Nacional',
        });

        const midNext = await svc.getNextGroupByPurchaseId(TEMPLATE, USER, PURCHASE);
        assert.ok(!('error' in midNext), JSON.stringify(midNext));
        assert.ok(!('allComplete' in midNext));
        if ('allComplete' in midNext) return;
        assert.equal(
            midNext.group.id,
            'employee',
            'before refresh, next group should be employee (mid-flow)',
        );

        const completedBefore = await svc.getCompletedGroupsByPurchaseId(PURCHASE, USER);
        assert.ok(completedBefore.includes('employer'));
        assert.ok(nonEmptyVarCount(await svc.getSessionVariablesByPurchaseId(PURCHASE, USER)) > 0);

        await applyFreshBootstrap(svc, TEMPLATE, USER, CATALOG, PURCHASE);

        const varsAfter = await svc.getSessionVariablesByPurchaseId(PURCHASE, USER);
        const completedAfter = await svc.getCompletedGroupsByPurchaseId(PURCHASE, USER);
        assert.equal(nonEmptyVarCount(varsAfter), 0, 'session variables cleared after bootstrap');
        assert.deepEqual(completedAfter, [], 'completed groups cleared after bootstrap');

        const afterNext = await svc.getNextGroupByPurchaseId(TEMPLATE, USER, PURCHASE);
        assert.ok(!('error' in afterNext));
        assert.ok(!('allComplete' in afterNext));
        if ('allComplete' in afterNext) return;
        assert.equal(afterNext.group.id, 'employer', 'after refresh, first group is employer again');
        assert.equal(afterNext.groupIndex, 1, 'after refresh, groupIndex is 1 (opening)');

        const isOpening = shouldUseAwliOpeningPhase({
            completedGroups: completedAfter,
            savedAnswerKeys: [],
            sessionVariableCount: nonEmptyVarCount(varsAfter),
        });
        assert.equal(isOpening, true, 'awliPhase should be opening');

        const openingChatMessage = buildOpeningChatMessage(
            TEMPLATE,
            afterNext.group.id,
            afterNext.group.variables.map((v) => ({ key: v.key, label: v.label })),
        );
        assert.ok(openingChatMessage, 'openingChatMessage must be set');
        assert.match(openingChatMessage, /Contrato de Trabajadora Doméstica/);
        assert.match(openingChatMessage, /asistente legal/i);
        assert.match(openingChatMessage, /parte empleadora/);
        assert.match(openingChatMessage, /Cédula o Pasaporte/);
        assert.doesNotMatch(openingChatMessage, /asistente virtual/i);
        assert.doesNotMatch(openingChatMessage, /Qué gusto saludarte/i);
    });

    it('second purchase on same template does not leak session when bootstrap uses distinct purchase id', async () => {
        const purchaseB = '507f1f77bcf86cd799439013';
        await applyFreshBootstrap(svc, TEMPLATE, USER + '-b', CATALOG, purchaseB);
        await svc.storeGroupVariablesByPurchaseId(purchaseB, USER + '-b', 'employer', {
            employerFullName: 'María López',
            employerIdType: 'Cédula',
            employerIdNumber: '001-0000001-2',
            employerFullAddress: 'Calle 10, Santiago',
        });

        await applyFreshBootstrap(svc, TEMPLATE, USER + '-b', CATALOG, purchaseB);
        const vars = await svc.getSessionVariablesByPurchaseId(purchaseB, USER + '-b');
        assert.equal(nonEmptyVarCount(vars), 0);
    });
});
