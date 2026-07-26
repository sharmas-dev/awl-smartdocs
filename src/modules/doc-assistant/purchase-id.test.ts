import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPurchaseBootstrapPromptOnly } from './purchase-id.js';

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
