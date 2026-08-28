import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildCompraventaEmpresaFollowUpMessage,
    buildCompraventaPersonaFollowUpMessage,
    buildCompraventaVehicleGroupIntroMessage,
    pickCompraventaEmpresaWave,
    pickCompraventaPersonaWave,
    sliceCompraventaPendingVariables,
} from './compraventa-question-pacing.js';

const empresaSellerBase = {
    sellerIsCompany: 'Empresa',
    sellerTypeLabel: 'la sociedad',
    sellerLegalName: 'ACME Motors S.R.L.',
    sellerFullAddress: 'Av. Churchill 123, Santo Domingo',
};

describe('pickCompraventaEmpresaWave', () => {
    it('wave 0 is jurisdiction only when empresa details missing', () => {
        const missing = [
            'sellerJurisdiction',
            'sellerCompanyOrigin',
            'sellerRnc',
            'sellerRepTitle',
        ];
        const wave = pickCompraventaEmpresaWave('seller', missing, empresaSellerBase);
        assert.deepEqual(wave?.keys, ['sellerJurisdiction']);
        assert.equal(wave?.waveIndex, 0);
    });

    it('wave 4 is rep title, name, nationality after origin and RNC path set', () => {
        const vars = {
            ...empresaSellerBase,
            sellerJurisdiction: 'República Dominicana',
            sellerCompanyOrigin: 'Nacional',
            sellerIncludeRncInContract: 'Sí',
            sellerRnc: '1-01-23456-7',
        };
        const missing = ['sellerRepTitle', 'sellerRepFullName', 'sellerRepNationality'];
        const wave = pickCompraventaEmpresaWave('seller', missing, vars);
        assert.deepEqual(wave?.keys, ['sellerRepTitle', 'sellerRepFullName', 'sellerRepNationality']);
        assert.equal(wave?.waveIndex, 3);
    });

    it('wave 2 is RNC when Nacional and RNC missing', () => {
        const vars = {
            ...empresaSellerBase,
            sellerJurisdiction: 'República Dominicana',
            sellerCompanyOrigin: 'Nacional',
            sellerIncludeRncInContract: 'Sí',
        };
        const wave = pickCompraventaEmpresaWave('seller', ['sellerRnc'], vars);
        assert.deepEqual(wave?.keys, ['sellerRnc']);
        assert.equal(wave?.waveIndex, 2);
    });
});

describe('pickCompraventaPersonaWave', () => {
    it('wave 0 is gender when persona without gender and name already set', () => {
        const wave = pickCompraventaPersonaWave(
            'seller',
            ['sellerGender', 'sellerNationality'],
            { sellerIsCompany: 'Persona física' },
        );
        assert.deepEqual(wave?.keys, ['sellerGender']);
        assert.equal(wave?.waveIndex, 0);
    });

    it('asks for legal name before gender when name is still missing', () => {
        const wave = pickCompraventaPersonaWave(
            'seller',
            ['sellerLegalName', 'sellerGender', 'sellerNationality'],
            { sellerIsCompany: 'Persona física' },
        );
        assert.deepEqual(wave?.keys, ['sellerLegalName']);
    });
});

describe('sliceCompraventaPendingVariables', () => {
    const variables = [
        { key: 'sellerJurisdiction', label: 'Jurisdicción', type: 'text', required: true },
        { key: 'sellerRepTitle', label: 'Cargo', type: 'text', required: false },
    ];

    it('empresa seller exposes only current wave variables', () => {
        const sliced = sliceCompraventaPendingVariables(
            'seller',
            variables,
            ['sellerJurisdiction', 'sellerRepTitle'],
            empresaSellerBase,
        );
        assert.deepEqual(sliced.map((v) => v.key), ['sellerJurisdiction']);
    });

    it('persona física seller slices to persona wave', () => {
        const sliced = sliceCompraventaPendingVariables(
            'seller',
            [
                { key: 'sellerGender', label: 'Género', type: 'dropdown', required: true },
                { key: 'sellerNationality', label: 'Nacionalidad', type: 'text', required: true },
            ],
            ['sellerGender', 'sellerNationality'],
            { sellerIsCompany: 'Persona física' },
        );
        assert.deepEqual(sliced.map((v) => v.key), ['sellerGender']);
    });
});

describe('buildCompraventaEmpresaFollowUpMessage', () => {
    it('seller wave 0 matches exact jurisdiction-only copy', () => {
        const msg = buildCompraventaEmpresaFollowUpMessage('seller', {
            waveIndex: 0,
            keys: ['sellerJurisdiction'],
        });
        assert.ok(msg);
        assert.match(msg!, /país donde se constituyó la sociedad/);
    });

    it('seller wave 4 asks rep cargo, nombre, nacionalidad', () => {
        const msg = buildCompraventaEmpresaFollowUpMessage('seller', {
            waveIndex: 4,
            keys: ['sellerRepTitle', 'sellerRepFullName', 'sellerRepNationality'],
        });
        assert.ok(msg);
        assert.match(msg!, /cargo de su representante legal/);
        assert.match(msg!, /opcional/);
    });
});

describe('buildCompraventaPersonaFollowUpMessage', () => {
    it('asks género as hombre o mujer without the phrase es hombre', () => {
        const msg = buildCompraventaPersonaFollowUpMessage('seller', {
            waveIndex: 0,
            keys: ['sellerGender'],
        });
        assert.match(msg!, /género del vendedor/i);
        assert.doesNotMatch(msg!, /¿es hombre o mujer\?/i);
    });

    it('asks comunidad de bienes on wave 3', () => {
        const msg = buildCompraventaPersonaFollowUpMessage('seller', {
            waveIndex: 3,
            keys: ['sellerHasCommunityProperty'],
        });
        assert.match(msg!, /comunidad de bienes/i);
    });
});

describe('buildCompraventaVehicleGroupIntroMessage', () => {
    it('returns vehicle intro for vehicle group', () => {
        const msg = buildCompraventaVehicleGroupIntroMessage('vehicle');
        assert.ok(msg);
        assert.match(msg!, /información relacionada con el vehículo/i);
    });
});
