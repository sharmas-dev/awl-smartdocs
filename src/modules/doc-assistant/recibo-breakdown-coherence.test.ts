import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateReciboDescargoLaboralBreakdownSum } from './recibo-breakdown-coherence.js';

const TEMPLATE = 'Recibo de Descargo Laboral';

function validate(vars: Record<string, string | number>, templateName = TEMPLATE) {
    return validateReciboDescargoLaboralBreakdownSum(templateName, vars);
}

/** Four base lines that sum to `total`. */
function matchingBase(total: string, lines: [string, string, string, string]) {
    return {
        hasDetailedBreakdown: 'Sí',
        totalAmountWithCurrency: total,
        preavisoAmount: lines[0],
        cesantiaAmount: lines[1],
        navidadAmount: lines[2],
        vacacionesAmount: lines[3],
    } as Record<string, string | number>;
}

describe('validateReciboDescargoLaboralBreakdownSum', () => {
    describe('skips validation when not applicable', () => {
        it('ignores other templates', () => {
            assert.deepEqual(
                validate(
                    matchingBase('RD$100.00', ['RD$100.00', 'No aplica', 'No aplica', 'No aplica']),
                    'Recibo de Descargo Trabajadora Doméstica',
                ),
                { ok: true },
            );
        });

        it('skips when hasDetailedBreakdown is No / empty / unknown', () => {
            for (const toggle of ['No', 'no', '', 'tal vez']) {
                assert.deepEqual(
                    validate({
                        ...matchingBase('RD$10,000.00', [
                            'RD$1,000.00',
                            'RD$1,000.00',
                            'RD$1,000.00',
                            'RD$1,000.00',
                        ]),
                        hasDetailedBreakdown: toggle,
                    }),
                    { ok: true },
                    `toggle=${toggle}`,
                );
            }
        });

        it('accepts Sí / Si / yes for the toggle', () => {
            for (const toggle of ['Sí', 'Si', 'si', 'yes', 'YES']) {
                const res = validate({
                    ...matchingBase('RD$40,000.00', [
                        'RD$10,000.00',
                        'RD$10,000.00',
                        'RD$10,000.00',
                        'RD$10,000.00',
                    ]),
                    hasDetailedBreakdown: toggle,
                });
                assert.deepEqual(res, { ok: true }, `toggle=${toggle}`);
            }
        });

        it('skips when total is missing or unparseable', () => {
            assert.deepEqual(
                validate({
                    hasDetailedBreakdown: 'Sí',
                    preavisoAmount: 'RD$10,000.00',
                    cesantiaAmount: 'RD$10,000.00',
                    navidadAmount: 'RD$10,000.00',
                    vacacionesAmount: 'RD$10,000.00',
                }),
                { ok: true },
            );
            assert.deepEqual(
                validate({
                    ...matchingBase('pendiente', [
                        'RD$10,000.00',
                        'RD$10,000.00',
                        'RD$10,000.00',
                        'RD$10,000.00',
                    ]),
                }),
                { ok: true },
            );
        });

        it('skips while any base line is still undefined (partial group)', () => {
            assert.deepEqual(
                validate({
                    hasDetailedBreakdown: 'Sí',
                    totalAmountWithCurrency: 'RD$40,000.00',
                    preavisoAmount: 'RD$10,000.00',
                    cesantiaAmount: 'RD$10,000.00',
                    navidadAmount: 'RD$10,000.00',
                    // vacacionesAmount omitted
                }),
                { ok: true },
            );
        });

        it('skips when a line is present but not a peso amount and not "no aplica"', () => {
            assert.deepEqual(
                validate(
                    matchingBase('RD$40,000.00', [
                        'RD$10,000.00',
                        'por calcular',
                        'RD$10,000.00',
                        'RD$10,000.00',
                    ]),
                ),
                { ok: true },
            );
        });
    });

    describe('matching sums (various formats)', () => {
        it('succeeds when sum matches total with exact digits', () => {
            assert.deepEqual(
                validate(
                    matchingBase('RD$75,000.00', [
                        'RD$50,000.00',
                        'No aplica',
                        'RD$10,000.00',
                        'RD$15,000.00',
                    ]),
                ),
                { ok: true },
            );
        });

        it('treats No aplica / no aplica / N/A-style aplica as zero', () => {
            assert.deepEqual(
                validate(
                    matchingBase('RD$20,000.00', [
                        'No aplica',
                        'no aplica',
                        'No Aplica',
                        'RD$20,000.00',
                    ]),
                ),
                { ok: true },
            );
        });

        it('accepts bare digits and comma/period variants that parse to the same total', () => {
            assert.deepEqual(
                validate(
                    matchingBase('150000', [
                        '40000',
                        '80000',
                        '15000',
                        '15000',
                    ]),
                ),
                { ok: true },
            );
            assert.deepEqual(
                validate(
                    matchingBase('RD$150000', [
                        'RD$40,000',
                        'RD$80,000.00',
                        '15000.00',
                        'RD$15,000.00',
                    ]),
                ),
                { ok: true },
            );
        });

        it('accepts numeric (number) line values', () => {
            assert.deepEqual(
                validate({
                    hasDetailedBreakdown: 'Sí',
                    totalAmountWithCurrency: 100000,
                    preavisoAmount: 25000,
                    cesantiaAmount: 25000,
                    navidadAmount: 25000,
                    vacacionesAmount: 25000,
                }),
                { ok: true },
            );
        });

        it('allows empty string lines as zero contribution', () => {
            assert.deepEqual(
                validate(
                    matchingBase('RD$30,000.00', ['RD$30,000.00', '', '   ', 'No aplica']),
                ),
                { ok: true },
            );
        });

        it('matches within floating epsilon (cent rounding)', () => {
            assert.deepEqual(
                validate(
                    matchingBase('RD$100.00', [
                        'RD$33.33',
                        'RD$33.33',
                        'RD$33.34',
                        'No aplica',
                    ]),
                ),
                { ok: true },
            );
        });
    });

    describe('mismatches that must surface to the user (never silent overwrite)', () => {
        it('fails when user total (185k) disagrees with line sum (150k)', () => {
            const res = validate(
                matchingBase('RD$185,000.00', [
                    'RD$40,000.00',
                    'RD$80,000.00',
                    'RD$15,000.00',
                    'RD$15,000.00',
                ]),
            );
            assert.equal(res.ok, false);
            if ('messageEs' in res) {
                assert.match(res.messageEs, /185/);
                assert.match(res.messageEs, /150/);
                assert.match(res.messageEs, /Auxilio de Cesantía/);
            }
        });

        it('fails when total is lower than the desglose', () => {
            const res = validate(
                matchingBase('RD$50,000.00', [
                    'No aplica',
                    'No aplica',
                    'RD$10,000.00',
                    'RD$15,000.00',
                ]),
            );
            assert.equal(res.ok, false);
            if ('messageEs' in res) {
                assert.match(res.messageEs, /no coincide/);
                assert.match(res.messageEs, /25,000/);
            }
        });

        it('fails when total is higher than the desglose by a small but real gap', () => {
            const res = validate(
                matchingBase('RD$100,050.00', [
                    'RD$25,000.00',
                    'RD$25,000.00',
                    'RD$25,000.00',
                    'RD$25,000.00',
                ]),
            );
            assert.equal(res.ok, false);
        });

        it('fails when only one line is wrong (off-by-one thousand)', () => {
            const res = validate(
                matchingBase('RD$100,000.00', [
                    'RD$25,000.00',
                    'RD$25,000.00',
                    'RD$25,000.00',
                    'RD$26,000.00',
                ]),
            );
            assert.equal(res.ok, false);
            if ('messageEs' in res) {
                assert.match(res.messageEs, /101,000/);
            }
        });

        it('fails for large million-scale mismatch', () => {
            const res = validate(
                matchingBase('RD$1,500,000.00', [
                    'RD$500,000.00',
                    'RD$400,000.00',
                    'RD$100,000.00',
                    'RD$100,000.00',
                ]),
            );
            assert.equal(res.ok, false);
            if ('messageEs' in res) {
                assert.match(res.messageEs, /1,100,000/);
                assert.match(res.messageEs, /1,500,000/);
            }
        });

        it('error message uses schema labels (Auxilio de Cesantía, not bare Cesantía alone)', () => {
            const res = validate(
                matchingBase('RD$10.00', [
                    'RD$1.00',
                    'RD$1.00',
                    'RD$1.00',
                    'RD$1.00',
                ]),
            );
            assert.equal(res.ok, false);
            if ('messageEs' in res) {
                assert.match(res.messageEs, /Preaviso/);
                assert.match(res.messageEs, /Auxilio de Cesantía/);
                assert.match(res.messageEs, /Navidad/);
                assert.match(res.messageEs, /Vacaciones/);
            }
        });
    });

    describe('additional concepts', () => {
        it('includes concept 1 in the sum when toggle is Sí', () => {
            assert.deepEqual(
                validate({
                    ...matchingBase('RD$85,000.00', [
                        'RD$50,000.00',
                        'No aplica',
                        'RD$10,000.00',
                        'RD$15,000.00',
                    ]),
                    hasAdditionalConcept1: 'Sí',
                    additionalConcept1Amount: 'RD$10,000.00',
                }),
                { ok: true },
            );
        });

        it('fails when concept 1 amount makes the sum diverge', () => {
            const res = validate({
                ...matchingBase('RD$75,000.00', [
                    'RD$50,000.00',
                    'No aplica',
                    'RD$10,000.00',
                    'RD$15,000.00',
                ]),
                hasAdditionalConcept1: 'Sí',
                additionalConcept1Amount: 'RD$10,000.00',
            });
            assert.equal(res.ok, false);
        });

        it('skips until concept 1 amount is provided when toggle is Sí', () => {
            assert.deepEqual(
                validate({
                    ...matchingBase('RD$75,000.00', [
                        'RD$50,000.00',
                        'No aplica',
                        'RD$10,000.00',
                        'RD$15,000.00',
                    ]),
                    hasAdditionalConcept1: 'Sí',
                }),
                { ok: true },
            );
        });

        it('ignores concept 1 amount when toggle is No', () => {
            assert.deepEqual(
                validate({
                    ...matchingBase('RD$75,000.00', [
                        'RD$50,000.00',
                        'No aplica',
                        'RD$10,000.00',
                        'RD$15,000.00',
                    ]),
                    hasAdditionalConcept1: 'No',
                    additionalConcept1Amount: 'RD$999,999.00',
                }),
                { ok: true },
            );
        });

        it('includes both additional concepts when both toggles are Sí', () => {
            assert.deepEqual(
                validate({
                    ...matchingBase('RD$100,000.00', [
                        'RD$40,000.00',
                        'RD$30,000.00',
                        'RD$10,000.00',
                        'RD$10,000.00',
                    ]),
                    hasAdditionalConcept1: 'Sí',
                    additionalConcept1Amount: 'RD$5,000.00',
                    hasAdditionalConcept2: 'Sí',
                    additionalConcept2Amount: 'RD$5,000.00',
                }),
                { ok: true },
            );
        });

        it('fails when concept 2 pushes the sum over the total', () => {
            const res = validate({
                ...matchingBase('RD$90,000.00', [
                    'RD$40,000.00',
                    'RD$30,000.00',
                    'RD$10,000.00',
                    'RD$10,000.00',
                ]),
                hasAdditionalConcept1: 'Sí',
                additionalConcept1Amount: 'RD$5,000.00',
                hasAdditionalConcept2: 'Sí',
                additionalConcept2Amount: 'RD$5,000.00',
            });
            assert.equal(res.ok, false);
        });

        it('treats additional concept "No aplica" as zero', () => {
            assert.deepEqual(
                validate({
                    ...matchingBase('RD$90,000.00', [
                        'RD$40,000.00',
                        'RD$30,000.00',
                        'RD$10,000.00',
                        'RD$10,000.00',
                    ]),
                    hasAdditionalConcept1: 'Sí',
                    additionalConcept1Amount: 'No aplica',
                }),
                { ok: true },
            );
        });
    });
});
