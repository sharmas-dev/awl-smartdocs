import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTeletrabajoEmpresaFollowUpMessage,
    pickTeletrabajoEmpresaWave,
    sliceTeletrabajoOpeningEmployerKeys,
    sliceTeletrabajoPendingVariables,
} from './contrato-teletrabajo-question-pacing.js';

describe('contrato-teletrabajo-question-pacing', () => {
    it('opening slice excludes RNC and nacional/extranjera on first turn', () => {
        const keys = sliceTeletrabajoOpeningEmployerKeys([
            'employerIsCompany',
            'employerLegalName',
            'employerCompanyNationalOrForeign',
            'employerHasDominicanRnc',
            'employerFullAddressStreet',
        ]);
        assert.deepEqual(keys, ['employerIsCompany', 'employerLegalName', 'employerFullAddressStreet']);
    });

    it('nacional empresa skips extranjera RNC wave', () => {
        const vars = {
            employerIsCompany: 'Empresa',
            employerCompanyNationalOrForeign: 'Nacional',
            employerIncludeRncMercantileIdentificationInContract: 'Sí',
        };
        const wave = pickTeletrabajoEmpresaWave(
            ['employerHasDominicanRnc', 'employerRnc', 'employerMercantileRegistryNumber'],
            vars,
        );
        assert.ok(wave);
        assert.ok(wave.keys.includes('employerRnc'));
        assert.equal(wave.keys.includes('employerHasDominicanRnc'), false);
    });

    it('extranjera sin RNC omits RNC keys from pending slice', () => {
        const vars = {
            employerIsCompany: 'Empresa',
            employerCompanyNationalOrForeign: 'Extranjera',
            employerHasDominicanRnc: 'No',
            employerIncludeRncMercantileIdentificationInContract: 'No',
        };
        const variables = [
            { key: 'employerRnc', label: 'RNC', type: 'text', required: true },
            { key: 'employerJurisdiction', label: 'Jurisdicción', type: 'text', required: true },
        ];
        const sliced = sliceTeletrabajoPendingVariables('employer', variables, ['employerRnc', 'employerJurisdiction'], vars);
        const keys = sliced.map((v) => v.key);
        assert.equal(keys.includes('employerRnc'), false);
        assert.ok(keys.includes('employerJurisdiction'));
    });

    it('wave 2 follow-up asks nacional o extranjera', () => {
        const msg = buildTeletrabajoEmpresaFollowUpMessage({ waveIndex: 2, keys: ['employerCompanyNationalOrForeign'] }, {});
        assert.ok(msg);
        assert.match(msg!, /nacional.*extranjera/i);
    });
});
