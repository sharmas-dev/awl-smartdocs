import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isNotApplicableValue,
    blankNotApplicableValues,
    stripOrphanEnumerationsFromHtml
} from './not-applicable-cleanup.js';

describe('isNotApplicableValue', () => {
    it('returns false for normal strings and values', () => {
        assert.equal(isNotApplicableValue('Acceso a catálogo'), false);
        assert.equal(isNotApplicableValue('Servicios Individuales'), false);
        assert.equal(isNotApplicableValue(''), false);
        assert.equal(isNotApplicableValue(null), false);
        assert.equal(isNotApplicableValue(undefined), false);
    });

    it('returns true for traditional not-applicable values', () => {
        assert.equal(isNotApplicableValue('n/a'), true);
        assert.equal(isNotApplicableValue('N/A'), true);
        assert.equal(isNotApplicableValue('no aplica'), true);
        assert.equal(isNotApplicableValue('No Aplica.'), true);
        assert.equal(isNotApplicableValue('none'), true);
        assert.equal(isNotApplicableValue('ninguno'), true);
        assert.equal(isNotApplicableValue('Ninguna'), true);
        assert.equal(isNotApplicableValue('nada'), true);
        assert.equal(isNotApplicableValue('Dejar vacio'), true);
        assert.equal(isNotApplicableValue('dejar vacío'), true);
        assert.equal(isNotApplicableValue('0'), true);
        assert.equal(isNotApplicableValue(0), true);
        assert.equal(isNotApplicableValue('Cero'), true);
    });

    it('returns true for negated sentences and no-aplica variations', () => {
        assert.equal(isNotApplicableValue('no aplica periodo de no competencia'), true);
        assert.equal(isNotApplicableValue('Confirmo que no aplica ningún período de no competencia post-empleo.'), true);
        assert.equal(isNotApplicableValue('no aplica ningun periodo'), true);
    });

    it('returns true for hyphen-like placeholders', () => {
        assert.equal(isNotApplicableValue('-'), true);
        assert.equal(isNotApplicableValue('--'), true);
        assert.equal(isNotApplicableValue('---'), true);
        assert.equal(isNotApplicableValue('----'), true);
    });
});

describe('blankNotApplicableValues', () => {
    it('blanks out whole-value match placeholders but leaves others', () => {
        const out = {
            service1: 'Servicios Individuales',
            service2: '---',
            service3: 'no aplica',
            service4: 'Acceso a RNC'
        };
        blankNotApplicableValues(out);
        assert.deepEqual(out, {
            service1: 'Servicios Individuales',
            service2: '',
            service3: '',
            service4: 'Acceso a RNC'
        });
    });
});

describe('stripOrphanEnumerationsFromHtml', () => {
    it('correctly scrubs trailing empty enumerations and collapses semicolons/periods', () => {
        const rawHtml = '<p style="text-align:justify"><strong>a)</strong> Servicio 1; <strong>b)</strong> Servicio 2; <strong>c)</strong> Servicio 3; <strong>d)</strong> ; <strong>e)</strong> ; <strong>f)</strong> .</p>';
        const cleaned = stripOrphanEnumerationsFromHtml(rawHtml);
        assert.equal(cleaned, '<p style="text-align:justify"><strong>a)</strong> Servicio 1; <strong>b)</strong> Servicio 2; <strong>c)</strong> Servicio 3.</p>');
    });

    it('correctly scrubs intermediate and trailing empty benefits', () => {
        const rawHtml = '<p>Los beneficios son: <strong>a)</strong> B1; <strong>b)</strong> ; <strong>c)</strong> B3; <strong>d)</strong> .</p>';
        const cleaned = stripOrphanEnumerationsFromHtml(rawHtml);
        assert.equal(cleaned, '<p>Los beneficios son: <strong>a)</strong> B1; <strong>b)</strong> B3.</p>');
    });

    it('drops empty cost letter before template continuation and renumbers', () => {
        const rawHtml =
            '<p><strong>a)</strong> Servicio de internet; <strong>b)</strong> ; <strong>c)</strong> ; <strong>d)</strong> para la prestación del servicio serán asumidos</p>';
        const cleaned = stripOrphanEnumerationsFromHtml(rawHtml);
        assert.equal(
            cleaned,
            '<p><strong>a)</strong> Servicio de internet para la prestación del servicio serán asumidos</p>',
        );
    });

    it('does not advance letter counter from one paragraph into the next', () => {
        const rawHtml =
            '<p><strong>a)</strong> Servicio 1;</p><p><strong>b)</strong> Servicio 2.</p>' +
            '<p><strong>a)</strong> Ser mayor;</p><p><strong>b)</strong> Contar con acceso.</p>';
        const cleaned = stripOrphanEnumerationsFromHtml(rawHtml);
        assert.match(cleaned, /<strong>a\)<\/strong> Servicio 1/);
        assert.match(cleaned, /<strong>b\)<\/strong> Servicio 2/);
        assert.match(cleaned, /<strong>a\)<\/strong> Ser mayor/);
        assert.match(cleaned, /<strong>b\)<\/strong> Contar con acceso/);
    });
});
