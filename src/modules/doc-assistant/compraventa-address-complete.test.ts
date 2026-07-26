import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatCompraventaAddressMissingPrompt,
    isCompraventaAddressComplete,
    missingCompraventaAddressComponents,
} from './compraventa-address-complete.js';

describe('compraventa-address-complete', () => {
    it('flags incomplete short addresses', () => {
        const missing = missingCompraventaAddressComponents('Santo Domingo');
        assert.ok(missing.includes('street'));
        assert.ok(missing.includes('country'));
    });

    it('accepts structured DR address', () => {
        const addr =
            'Av. Churchill 123, Piantini, Santo Domingo, Distrito Nacional, República Dominicana';
        assert.equal(isCompraventaAddressComplete(addr), true);
    });

    it('builds missing-part prompt', () => {
        const msg = formatCompraventaAddressMissingPrompt(['street', 'country']);
        assert.ok(msg);
        assert.match(msg!, /calle y número/);
        assert.match(msg!, /país/);
    });
});
