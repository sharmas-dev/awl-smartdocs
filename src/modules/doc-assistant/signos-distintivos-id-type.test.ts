import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    applySignosDistintivosIdTypeNormalizations,
    isPoderSignosDistintivosTemplate,
    normalizeSignosDistintivosTitularDeIdType,
} from './signos-distintivos-id-type.js';

describe('isPoderSignosDistintivosTemplate', () => {
    it('matches catalog and QA alias titles', () => {
        assert.equal(
            isPoderSignosDistintivosTemplate('Poder de Representación Signos Distintivos'),
            true,
        );
        assert.equal(
            isPoderSignosDistintivosTemplate('Poder para Registrar Signo Distintivo'),
            true,
        );
        assert.equal(isPoderSignosDistintivosTemplate('Contrato de Teletrabajo'), false);
    });
});

describe('normalizeSignosDistintivosTitularDeIdType', () => {
    it('maps legacy de/del options onto titular-de article form', () => {
        assert.equal(
            normalizeSignosDistintivosTitularDeIdType('de la Cédula de Identidad y Electoral'),
            'la Cédula de Identidad y Electoral',
        );
        assert.equal(normalizeSignosDistintivosTitularDeIdType('del Pasaporte'), 'el Pasaporte');
        assert.equal(
            normalizeSignosDistintivosTitularDeIdType('la Cédula de Identidad y Electoral'),
            'la Cédula de Identidad y Electoral',
        );
    });
});

describe('applySignosDistintivosIdTypeNormalizations', () => {
    it('fixes principal and proxy without touching principalRepIdType', () => {
        const out: Record<string, string | number> = {
            principalIdType: 'de la Cédula de Identidad y Electoral',
            proxyIdType: 'del Pasaporte',
            principalRepIdType: 'de la Cédula de Identidad y Electoral',
        };
        assert.equal(applySignosDistintivosIdTypeNormalizations(out), true);
        assert.equal(out.principalIdType, 'la Cédula de Identidad y Electoral');
        assert.equal(out.proxyIdType, 'el Pasaporte');
        assert.equal(out.principalRepIdType, 'de la Cédula de Identidad y Electoral');
    });
});
