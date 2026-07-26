import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEmployerInfoNarrative } from './employer-info-parse.js';
import {
    buildDomesticReciboNotaryAcknowledgment,
    fillDomesticReciboEmployerAutoFields,
    fillReciboDescargoDomesticaLocationAndNotary,
    inferDomesticEmployerGenderFromName,
} from './recibo-descargo-domestica-enrichment.js';
import {
    ensureReciboDescargoDomesticaPdfDates,
    expandReciboDescargoDomesticaCanonicalDates,
} from './recibo-descargo-date-expand.js';
import { parseStoredCalendarDateToYMD } from './natural-date-normalize.js';

describe('Recibo de Descargo Trabajadora Doméstica enrichment', () => {
    it('parses employer narrative with address and infers gender/refs', () => {
        const narrative =
            'Av los proceres #45, Santo Domingo. Empleador: Juan Pérez Gómez, Dominicano, Pasaporte: 34354534';
        const parsed = parseEmployerInfoNarrative(narrative);
        assert.equal(parsed.employerFullName, 'Juan Pérez Gómez');
        assert.equal(parsed.employerNationality, 'dominicano');
        assert.ok(parsed.employerInferredLocation?.includes('Santo Domingo'));

        const out: Record<string, string | number> = { userMessage: narrative, ...parsed };
        assert.equal(fillDomesticReciboEmployerAutoFields(out), true);
        assert.equal(out.domesticEmployerGender, 'Hombre');
        assert.equal(out.workplaceDescription, 'del señor');
        assert.equal(out.employerReference, 'el Empleador');
        assert.equal(out.payerReference, 'del Empleador');
        assert.equal(out.employerReferenceShort, 'al Empleador');
    });

    it('infers feminine gender from given name', () => {
        assert.equal(inferDomesticEmployerGenderFromName('Julia Martínez López'), 'Mujer');
    });

    it('expands contractTerminationDate into termination fragments', () => {
        const out: Record<string, string | number> = {
            contractTerminationDate: '30 de diciembre de 2025',
        };
        assert.equal(expandReciboDescargoDomesticaCanonicalDates(out), true);
        assert.equal(out.terminationDayNumbers, '30');
        assert.equal(out.terminationMonthLetters, 'diciembre');
        assert.equal(out.terminationYearNumbers, '2025');
    });

    it('infers signing place and notary from declarant address', () => {
        const out: Record<string, string | number> = {
            declarantAddress: 'Calle 1, Santo Domingo, D.N.',
        };
        assert.equal(fillReciboDescargoDomesticaLocationAndNotary(out), true);
        assert.equal(out.signingCity, 'Santo Domingo');
        assert.equal(out.signingProvince, 'Distrito Nacional');
        assert.equal(out.notaryJurisdiction, 'Distrito Nacional');
    });

    it('dedupes consecutive duplicate employer full name', () => {
        const out: Record<string, string | number> = {
            employerFullName: 'Juan Pérez Gómez Juan Pérez Gómez',
            domesticEmployerGender: 'Hombre',
        };
        assert.equal(fillDomesticReciboEmployerAutoFields(out), true);
        assert.equal(out.employerFullName, 'Juan Pérez Gómez');
    });

    it('parseStoredCalendarDateToYMD accepts el-prefixed Spanish dates', () => {
        const ymd = parseStoredCalendarDateToYMD('el 30 de diciembre de 2025.');
        assert.deepEqual(ymd, { d: 30, m: 12, y: 2025 });
    });

    it('ensureReciboDescargoDomesticaPdfDates hydrates from fragments when canonical missing', () => {
        const out: Record<string, string | number> = {
            startDayNumbers: '1',
            startMonthLetters: 'enero',
            startYearNumbers: '2020',
            endDayNumbers: '31',
            endMonthLetters: 'diciembre',
            endYearNumbers: '2025',
        };
        assert.equal(ensureReciboDescargoDomesticaPdfDates(out), true);
        assert.equal(out.startDayLetters, 'primero');
        assert.equal(out.employmentStartDate, '1 de enero de 2020');
    });

    it('buildDomesticReciboNotaryAcknowledgment uses Santo Domingo in Spanish confirmation', () => {
        const msg = buildDomesticReciboNotaryAcknowledgment({
            declarantAddress: 'Av. Los Próceres #45, Santo Domingo, D.N.',
        });
        assert.ok(msg?.includes('Dado que las partes están en Santo Domingo'));
        assert.ok(msg?.includes('jurisdicción notarial'));
        assert.ok(msg?.includes('podemos completar el trámite'));
    });

    it('resets redundant and repeated names in workplaceDescription', () => {
        const out: Record<string, string | number> = {
            employerFullName: 'Vinicio Dominguez',
            workplaceDescription: 'casa familia Dominguez',
            domesticEmployerGender: 'Hombre',
        };
        assert.equal(fillDomesticReciboEmployerAutoFields(out), true);
        assert.equal(out.workplaceDescription, 'de la familia de');
    });

    it('normalizes de la familia to de la familia de', () => {
        const out: Record<string, string | number> = {
            employerFullName: 'Vinicio Dominguez',
            workplaceDescription: 'de la familia',
            domesticEmployerGender: 'Hombre',
        };
        assert.equal(fillDomesticReciboEmployerAutoFields(out), true);
        assert.equal(out.workplaceDescription, 'de la familia de');
    });
});
