import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { DocAssistantService } from './doc-assistant.service.js';
import { validateReciboDescargoLaboralBreakdownSum } from './recibo-breakdown-coherence.js';
import { ensureDominicanAddressCompleteness } from './address-text-format.js';

const TEMPLATE = 'Recibo de Descargo Laboral';

const svc = new DocAssistantService();
const normalize = svc.getNormalizedVariablesForStorage.bind(svc);

/** DocAssistantService keeps an LRU/session handle open; exit after assertions so node:test can finish. */
after(() => {
    setImmediate(() => process.exit(0));
});

describe('Recibo Laboral — nationality gender agreement', () => {
    it('fixes dominicana → dominicano for male declarant (Juan Rafael)', () => {
        const out = normalize(TEMPLATE, {
            declarantFullName: 'Juan Rafael Méndez Cabrera',
            declarantNationality: 'dominicana',
        });
        assert.equal(out.declarantNationality, 'dominicano');
    });

    it('fixes dominicano → dominicana for female declarant', () => {
        const out = normalize(TEMPLATE, {
            declarantFullName: 'María Pérez Cruz',
            declarantNationality: 'dominicano',
        });
        assert.equal(out.declarantNationality, 'dominicana');
    });

    it('resolves parenthesized dominicano(a) by inferred gender', () => {
        const male = normalize(TEMPLATE, {
            declarantFullName: 'Carlos Martínez',
            declarantNationality: 'dominicano(a)',
        });
        assert.equal(male.declarantNationality, 'dominicano');

        const female = normalize(TEMPLATE, {
            declarantFullName: 'Ana Lucía Gómez',
            declarantNationality: 'dominicano(a)',
        });
        assert.equal(female.declarantNationality, 'dominicana');
    });

    it('resolves slash form dominicana/o by inferred gender', () => {
        const out = normalize(TEMPLATE, {
            declarantFullName: 'Pedro Antonio Vargas',
            declarantNationality: 'dominicana/o',
        });
        assert.equal(out.declarantNationality, 'dominicano');
    });

    it('genders other nationality adjectives (venezolano/a, español/a)', () => {
        const out = normalize(TEMPLATE, {
            declarantFullName: 'Luis Fernández',
            declarantNationality: 'venezolana',
        });
        assert.equal(out.declarantNationality, 'venezolano');

        const out2 = normalize(TEMPLATE, {
            declarantFullName: 'Carmen Díaz',
            declarantNationality: 'español',
        });
        assert.equal(out2.declarantNationality, 'española');
    });

    it('leaves nationality unchanged when already correct', () => {
        const out = normalize(TEMPLATE, {
            declarantFullName: 'José Alberto Núñez',
            declarantNationality: 'dominicano',
        });
        assert.equal(out.declarantNationality, 'dominicano');
    });

    it('does not invent nationality when the field is empty', () => {
        const out = normalize(TEMPLATE, {
            declarantFullName: 'Juan Pérez',
            declarantNationality: '',
        });
        assert.equal(out.declarantNationality, '');
    });

    it('does not change nationality when declarant name is missing', () => {
        const out = normalize(TEMPLATE, {
            declarantNationality: 'dominicana',
        });
        assert.equal(out.declarantNationality, 'dominicana');
    });
});

describe('Recibo Laboral — total vs desglose normalize (no silent overwrite)', () => {
    const mismatchLines = {
        hasDetailedBreakdown: 'Sí',
        preavisoAmount: 'RD$40,000.00',
        cesantiaAmount: 'RD$80,000.00',
        navidadAmount: 'RD$15,000.00',
        vacacionesAmount: 'RD$15,000.00',
    } as const;

    it('preserves user total when it disagrees with line sum (185k vs 150k)', () => {
        const out = normalize(TEMPLATE, {
            ...mismatchLines,
            totalAmountWithCurrency: 'RD$185,000.00',
            totalAmountInWords: 'Ciento Ochenta y Cinco Mil Pesos Dominicanos con 00/100',
        });
        assert.equal(out.totalAmountWithCurrency, 'RD$185,000.00');
        assert.match(String(out.totalAmountInWords), /Ciento Ochenta y Cinco/i);
    });

    it('preserves a lower user total that disagrees with lines', () => {
        const out = normalize(TEMPLATE, {
            ...mismatchLines,
            totalAmountWithCurrency: 'RD$100,000.00',
        });
        assert.equal(String(out.totalAmountWithCurrency).includes('100,000'), true);
        assert.equal(String(out.totalAmountWithCurrency).includes('150,000'), false);
    });

    it('preserves bare-digit user total on mismatch', () => {
        const out = normalize(TEMPLATE, {
            ...mismatchLines,
            totalAmountWithCurrency: '185000',
        });
        const n = String(out.totalAmountWithCurrency).replace(/[^\d.]/g, '');
        assert.ok(n.startsWith('185000') || n.startsWith('185000.00') || n.includes('185,000'));
    });

    it('fills missing total from line sum when total was never provided', () => {
        const out = normalize(TEMPLATE, {
            ...mismatchLines,
        });
        assert.match(String(out.totalAmountWithCurrency), /150,000/);
        assert.ok(String(out.totalAmountInWords ?? '').length > 0);
    });

    it('does not invent a total when lines are incomplete', () => {
        const out = normalize(TEMPLATE, {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$40,000.00',
            cesantiaAmount: 'RD$80,000.00',
            // navidad / vacaciones omitted
        });
        assert.equal(out.totalAmountWithCurrency, undefined);
    });

    it('leaves matching total untouched', () => {
        const out = normalize(TEMPLATE, {
            hasDetailedBreakdown: 'Sí',
            totalAmountWithCurrency: 'RD$150,000.00',
            preavisoAmount: 'RD$40,000.00',
            cesantiaAmount: 'RD$80,000.00',
            navidadAmount: 'RD$15,000.00',
            vacacionesAmount: 'RD$15,000.00',
        });
        assert.match(String(out.totalAmountWithCurrency), /150,000/);
    });

    it('after normalize, mismatch still fails validation (ask-user path)', () => {
        const out = normalize(TEMPLATE, {
            ...mismatchLines,
            totalAmountWithCurrency: 'RD$200,000.00',
        });
        const check = validateReciboDescargoLaboralBreakdownSum(
            TEMPLATE,
            out as Record<string, string | number>,
        );
        assert.equal(check.ok, false);
    });

    it('No desglose: does not rewrite total from absent lines', () => {
        const out = normalize(TEMPLATE, {
            hasDetailedBreakdown: 'No',
            totalAmountWithCurrency: 'RD$185,000.00',
            preavisoAmount: 'RD$1.00',
            cesantiaAmount: 'RD$1.00',
            navidadAmount: 'RD$1.00',
            vacacionesAmount: 'RD$1.00',
        });
        assert.match(String(out.totalAmountWithCurrency), /185,000/);
    });
});

describe('Recibo Laboral — address normalize via ensureDominicanAddressCompleteness', () => {
    it('preserves Santo Domingo when DN already present (several phrasings)', () => {
        const cases = [
            'Calle Duarte No. 22, Santo Domingo, Distrito Nacional',
            'Av. Winston Churchill, Santo Domingo, D.N.',
            'Ens. Naco, Santo Domingo, DN, República Dominicana',
            'Calle 1, Santo Domingo, distrito nacional',
        ];
        for (const raw of cases) {
            const out = ensureDominicanAddressCompleteness(raw);
            assert.ok(!out.includes('de Guzmán'), raw);
            assert.match(out, /Santo Domingo/i);
        }
    });

    it('still expands bare Santo Domingo without DN', () => {
        const out = ensureDominicanAddressCompleteness('Calle 5, Santo Domingo');
        assert.match(out, /Santo Domingo de Guzmán/);
        assert.match(out, /Distrito Nacional/);
    });

    it('does not force de Guzmán onto Santo Domingo Este/Oeste/Norte', () => {
        for (const city of ['Santo Domingo Este', 'Santo Domingo Oeste', 'Santo Domingo Norte']) {
            const out = ensureDominicanAddressCompleteness(`Calle Principal, ${city}`);
            assert.ok(!out.includes('de Guzmán'), city);
            assert.match(out, new RegExp(city));
        }
    });
});
