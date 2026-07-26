import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    ensureDominicanAddressCompleteness,
    stripTrailingDominicanCountryForDuplicatingTemplate,
    formatAddressLineTitleCase,
} from './address-text-format.js';

function normalizeDeclarantAddress(val: string): string {
    let n = ensureDominicanAddressCompleteness(val);
    n = stripTrailingDominicanCountryForDuplicatingTemplate('declarantAddress', n);
    return n;
}

describe('stripTrailingDominicanCountryForDuplicatingTemplate', () => {
    it('removes repeated trailing país for workLocationFullAddress (Propuesta HBS adds país)', () => {
        const raw =
            'Federico Geraldino #43, Santo Domingo, Distrito Nacional, República Dominicana, República Dominicana';
        const out = stripTrailingDominicanCountryForDuplicatingTemplate('workLocationFullAddress', raw);
        assert.equal(out.includes('República Dominicana'), false);
        assert.match(out, /Distrito Nacional$/);
    });

    it('does not strip país from declarantAddress (full address stored in variable)', () => {
        const raw = 'Calle 1, Santo Domingo, Distrito Nacional, República Dominicana';
        const out = stripTrailingDominicanCountryForDuplicatingTemplate('declarantAddress', raw);
        assert.equal(out, raw);
    });

    it('leaves workLocationFullAddress unchanged when key is not in strip set', () => {
        const raw = 'Av. 1, Santo Domingo, República Dominicana';
        const out = stripTrailingDominicanCountryForDuplicatingTemplate('employerFullAddress', raw);
        assert.equal(out, raw);
    });

    it('strips trailing country for employeeFullAddress and companyAddress', () => {
        const raw = 'Calle Principal, Santo Domingo, República Dominicana';
        const outEmployee = stripTrailingDominicanCountryForDuplicatingTemplate('employeeFullAddress', raw);
        assert.equal(outEmployee, 'Calle Principal, Santo Domingo');

        const outCompany = stripTrailingDominicanCountryForDuplicatingTemplate('companyAddress', raw);
        assert.equal(outCompany, 'Calle Principal, Santo Domingo');
    });
});

describe('normalizeDeclarantAddress (ensure + strip)', () => {
    it('completes bare Santo Domingo with provincia and país', () => {
        const out = normalizeDeclarantAddress('Santo Domingo');
        assert.equal(out, 'Santo Domingo de Guzmán, Distrito Nacional, República Dominicana');
    });

    it('preserves Santo Domingo when Distrito Nacional already provided (no silent de Guzmán)', () => {
        const out = normalizeDeclarantAddress('Calle Duarte No. 22, Santo Domingo, Distrito Nacional');
        assert.match(out, /Santo Domingo, Distrito Nacional/);
        assert.ok(!out.includes('de Guzmán'));
    });

    describe('no silent Santo Domingo → de Guzmán when province already known', () => {
        const cases: Array<{ raw: string; mustKeep?: RegExp }> = [
            {
                raw: 'Calle Duarte No. 22, Santo Domingo, Distrito Nacional',
                mustKeep: /Santo Domingo, Distrito Nacional/i,
            },
            {
                raw: 'Av. Winston Churchill No. 5, Santo Domingo, Distrito Nacional, República Dominicana',
                mustKeep: /Santo Domingo, Distrito Nacional/i,
            },
            {
                raw: 'Ens. Naco, Santo Domingo, D.N.',
                mustKeep: /Santo Domingo/i,
            },
            {
                raw: 'Calle El Conde, Zona Colonial, Santo Domingo, DN',
                mustKeep: /Santo Domingo/i,
            },
            {
                raw: 'Calle 1ra, Santo Domingo, distrito nacional',
                mustKeep: /Santo Domingo/i,
            },
            {
                raw: 'Residencial Las Palmas Apt. 3B, Santo Domingo, Distrito Nacional',
                mustKeep: /Santo Domingo, Distrito Nacional/i,
            },
        ];

        for (const { raw, mustKeep } of cases) {
            it(`preserves user city wording: ${raw.slice(0, 48)}…`, () => {
                const out = normalizeDeclarantAddress(raw);
                assert.ok(!out.includes('de Guzmán'), out);
                if (mustKeep) assert.match(out, mustKeep);
            });
        }

        it('still expands bare capital city when DN is absent', () => {
            const variants = [
                'Santo Domingo',
                'Calle Duarte, Santo Domingo',
                'Federico Geraldino #43, Santo Domingo, República Dominicana',
            ];
            for (const raw of variants) {
                const out = normalizeDeclarantAddress(raw);
                assert.match(out, /Santo Domingo de Guzmán/, raw);
                assert.match(out, /Distrito Nacional/, raw);
            }
        });

        it('does not rewrite Santo Domingo Este/Oeste/Norte to de Guzmán', () => {
            for (const city of ['Santo Domingo Este', 'Santo Domingo Oeste', 'Santo Domingo Norte']) {
                const out = normalizeDeclarantAddress(`Calle Principal No. 10, ${city}`);
                assert.ok(!out.includes('de Guzmán'), city);
                assert.match(out, new RegExp(city.replace(/\s+/g, '\\s+')));
                assert.ok(!out.includes('Distrito Nacional'), city);
            }
        });

        it('keeps user-supplied Santo Domingo de Guzmán as-is', () => {
            const out = normalizeDeclarantAddress(
                'Calle Las Damas, Santo Domingo de Guzmán, Distrito Nacional',
            );
            assert.match(out, /Santo Domingo de Guzmán, Distrito Nacional/);
        });

        it('title-case keeps lowercase particle in de Guzmán when expanded', () => {
            const out = formatAddressLineTitleCase(
                ensureDominicanAddressCompleteness('Calle 8, Santo Domingo'),
            );
            assert.match(out, /Santo Domingo de Guzmán/);
            assert.ok(!out.includes('De Guzmán'));
        });
    });

    it('completes street + city with provincia and país', () => {
        const out = normalizeDeclarantAddress('Federico Geraldino #43, Santo Domingo');
        assert.match(out, /Federico Geraldino #43, Santo Domingo de Guzmán, Distrito Nacional, República Dominicana/);
    });

    it('keeps país when assistant already included República Dominicana', () => {
        const out = normalizeDeclarantAddress(
            'Federico Geraldino #43, Santo Domingo de Guzmán, Distrito Nacional, República Dominicana',
        );
        assert.equal(
            out,
            'Federico Geraldino #43, Santo Domingo de Guzmán, Distrito Nacional, República Dominicana',
        );
    });

    it('preserves foreign country at end (India) and does not append República Dominicana', () => {
        const raw =
            'Calle Duarte No. 12, Santiago de los Caballeros, Santiago, India';
        const out = normalizeDeclarantAddress(raw);
        assert.match(out, /India$/);
        assert.equal(out.includes('República Dominicana'), false);
    });

    it('preserves India for Santo Domingo Oeste (golden Laboral user input)', () => {
        const raw =
            'Calle Primera No. 22, Sector Herrera, Santo Domingo Oeste, India';
        const out = normalizeDeclarantAddress(raw);
        assert.match(out, /Santo Domingo Oeste, India$/);
        assert.ok(!out.includes('Distrito Nacional'));
        assert.ok(!out.includes('República Dominicana'));
    });

    it('golden reside-en narrative: parse then normalize keeps India', async () => {
        const { parseDeclarantInfoNarrative } = await import('./declarant-info-parse.js');
        const narrative =
            'El trabajador reside en Calle Primera No. 22, Sector Herrera, Santo Domingo Oeste, India';
        const parsed = parseDeclarantInfoNarrative(narrative);
        assert.equal(parsed.declarantFullName, undefined);
        const addr = normalizeDeclarantAddress(String(parsed.declarantAddress ?? ''));
        assert.match(addr, /India$/);
        assert.ok(!addr.includes('República Dominicana'));
    });

    it('does not insert Distrito Nacional before foreign país (Santo Domingo, India)', () => {
        const raw =
            'Calle Las Flores No. 18, Sector Villa Juana, Santo Domingo, India';
        const out = normalizeDeclarantAddress(raw);
        assert.match(out, /Santo Domingo, India$/);
        assert.ok(!out.includes('Distrito Nacional'));
        assert.ok(!out.includes('República Dominicana'));
    });

    it('appends República Dominicana for typical RD address without país', () => {
        const out = normalizeDeclarantAddress(
            'Calle Duarte No. 12, Santiago de los Caballeros, Santiago',
        );
        assert.match(out, /República Dominicana$/);
        assert.ok(!out.includes('India'));
    });

    it('strips leading "En" / "en" preposition from Dominican address', () => {
        const out = normalizeDeclarantAddress('En Calle Duarte No. 12, Santiago');
        assert.ok(!out.startsWith('En '));
        assert.ok(!out.startsWith('en '));
        assert.match(out, /^Calle Duarte No. 12/);
    });
});

describe('Street Abbreviation and Title Case Formatting', () => {
    it('standardizes street abbreviations like Av, Avda, Ave', () => {
        assert.equal(formatAddressLineTitleCase('Av Anacaona'), 'Av. Anacaona');
        assert.equal(formatAddressLineTitleCase('Avda Anacaona'), 'Avda. Anacaona');
        assert.equal(formatAddressLineTitleCase('Ave Anacaona'), 'Ave. Anacaona');
        assert.equal(formatAddressLineTitleCase('Ave. Anacaona'), 'Ave. Anacaona');
    });
});
