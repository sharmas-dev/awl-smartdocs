import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isPurchaseBootstrapPromptOnly,
    purchaseIdFromChatMetadata,
    resolvePurchaseIdWithMetadata,
} from './purchase-id.js';

const PURCHASE_ID = '6a0dcb83193200f1946624d4';

describe('isPurchaseBootstrapPromptOnly', () => {
    it('detects Nitro default bootstrap phrase', () => {
        assert.equal(
            isPurchaseBootstrapPromptOnly(`Fill out the document for ${PURCHASE_ID}`, PURCHASE_ID),
            true,
        );
    });

    it('returns false for real field answers', () => {
        assert.equal(
            isPurchaseBootstrapPromptOnly(
                `Juan Pérez, dominicano, cédula 001-1234567-8, ${PURCHASE_ID}`,
                PURCHASE_ID,
            ),
            false,
        );
    });

    it('returns false when message has no purchase id', () => {
        assert.equal(isPurchaseBootstrapPromptOnly('Hola, quiero empezar', PURCHASE_ID), false);
    });
});

describe('purchaseIdFromChatMetadata', () => {
    it('recovers the id from _meta.prompt (canonical Spanish phrase)', () => {
        assert.equal(
            purchaseIdFromChatMetadata({
                prompt: `Completa el documento ${PURCHASE_ID}. Responde solo en español.`,
            }),
            PURCHASE_ID,
        );
    });

    it('recovers the id from _meta.url / _meta.pageUrl (encoded prompt in querystring)', () => {
        const url = `https://chat.example.com/?standaloneMode=true&prompt=Completa%20el%20documento%20${PURCHASE_ID}`;
        assert.equal(purchaseIdFromChatMetadata({ url }), PURCHASE_ID);
        assert.equal(purchaseIdFromChatMetadata({ pageUrl: url }), PURCHASE_ID);
    });

    it('recovers the id from legacy English phrase in metadata', () => {
        assert.equal(
            purchaseIdFromChatMetadata({ initialPrompt: `Fill out the document for ${PURCHASE_ID}` }),
            PURCHASE_ID,
        );
    });

    it('returns null when metadata is missing or has no purchase id', () => {
        assert.equal(purchaseIdFromChatMetadata(undefined), null);
        assert.equal(purchaseIdFromChatMetadata({}), null);
        assert.equal(purchaseIdFromChatMetadata({ prompt: 'Hola, quiero empezar' }), null);
    });
});

describe('resolvePurchaseIdWithMetadata (submit_group_answers fallback)', () => {
    it('model-supplied arg wins when well-formed', () => {
        const argId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
        const result = resolvePurchaseIdWithMetadata(argId, {
            prompt: `Completa el documento ${PURCHASE_ID}`,
        });
        assert.equal(result.purchaseId, argId);
        assert.equal(result.recoveredFromMetadata, false);
    });

    it('falls back to _meta.prompt when the arg is empty', () => {
        const result = resolvePurchaseIdWithMetadata(undefined, {
            prompt: `Completa el documento ${PURCHASE_ID}. Responde solo en español.`,
        });
        assert.equal(result.purchaseId, PURCHASE_ID);
        assert.equal(result.recoveredFromMetadata, true);
    });

    it('falls back to _meta.url when the arg is malformed', () => {
        const result = resolvePurchaseIdWithMetadata('not-an-object-id', {
            pageUrl: `https://chat.example.com/?prompt=Completa%20el%20documento%20${PURCHASE_ID}`,
        });
        assert.equal(result.purchaseId, PURCHASE_ID);
        assert.equal(result.recoveredFromMetadata, true);
    });

    it('keeps the empty arg (error path preserved) when no metadata anchor exists', () => {
        const result = resolvePurchaseIdWithMetadata(undefined, undefined);
        assert.equal(result.purchaseId, '');
        assert.equal(result.recoveredFromMetadata, false);
    });

    it('keeps the malformed arg (error path preserved) when metadata has no id', () => {
        const result = resolvePurchaseIdWithMetadata('bad-id', { prompt: 'Hola' });
        assert.equal(result.purchaseId, 'bad-id');
        assert.equal(result.recoveredFromMetadata, false);
    });
});
