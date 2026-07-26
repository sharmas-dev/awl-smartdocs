import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyCompraventaCompanyRncFlags,
    inferCompraventaCompanyOriginFromJurisdiction,
} from './compraventa-company-rnc.js';

describe('inferCompraventaCompanyOriginFromJurisdiction', () => {
    it('detects República Dominicana as Nacional', () => {
        assert.equal(inferCompraventaCompanyOriginFromJurisdiction('República Dominicana'), 'Nacional');
    });

    it('detects foreign jurisdiction as Extranjera', () => {
        assert.equal(inferCompraventaCompanyOriginFromJurisdiction('Estado de Delaware'), 'Extranjera');
    });
});

describe('applyCompraventaCompanyRncFlags', () => {
    it('Nacional empresa includes RNC in contract', () => {
        const out: Record<string, string | number> = {
            sellerIsCompany: 'Empresa',
            sellerJurisdiction: 'República Dominicana',
        };
        assert.equal(applyCompraventaCompanyRncFlags(out), true);
        assert.equal(out.sellerCompanyOrigin, 'Nacional');
        assert.equal(out.sellerIncludeRncInContract, 'Sí');
    });

    it('Extranjera without DR RNC omits RNC clause and clears RNC', () => {
        const out: Record<string, string | number> = {
            sellerIsCompany: 'Empresa',
            sellerCompanyOrigin: 'Extranjera',
            sellerHasDominicanRnc: 'No',
            sellerRnc: '1-01-11111-1',
        };
        assert.equal(applyCompraventaCompanyRncFlags(out), true);
        assert.equal(out.sellerIncludeRncInContract, 'No');
        assert.equal(out.sellerRnc, '');
    });
});
