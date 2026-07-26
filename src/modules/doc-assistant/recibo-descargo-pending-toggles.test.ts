import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    clearReciboLaboralAdditionalConceptFieldsWhenDisabled,
    extractSiNoChoiceFromNarrative,
    hasReciboLaboralAdditionalConcept1Content,
    isReciboLaboralShortSiNoUserMessage,
    mergeReciboLaboralPendingSiNoAnswers,
    parseShortSiNoChoiceReply,
    resolveReciboLaboralAdditionalConceptToggles,
} from './recibo-descargo-pending-toggles.js';

const breakdownGroups = [
    {
        id: 'breakdownAmounts',
        condition: { field: 'hasDetailedBreakdown', equals: 'Sí' },
        variables: [
            { key: 'preavisoAmount', label: 'Preaviso', required: true },
            { key: 'hasAdditionalConcept1', label: 'Additional?', required: true },
        ],
    },
    {
        id: 'signingInfo',
        variables: [
            { key: 'signingCity', label: 'City', required: true },
            { key: 'signingProvince', label: 'Province', required: true },
            { key: 'documentSigningDate', label: 'Date', required: true },
        ],
    },
] as const;

describe('parseShortSiNoChoiceReply', () => {
    it('accepts punctuation and markdown', () => {
        assert.equal(parseShortSiNoChoiceReply('**No.**', ['Sí', 'No']), 'No');
        assert.equal(parseShortSiNoChoiceReply('not', ['Sí', 'No']), 'No');
    });
});

describe('extractSiNoChoiceFromNarrative', () => {
    it('reads trailing No after breakdown amounts in one message', () => {
        const msg =
            'Preaviso: DOP 60,000.00, Cesantía: DOP 95,000.00, Navidad: DOP 30,000.00, Vacaciones: DOP 25,000.00. No.';
        assert.equal(extractSiNoChoiceFromNarrative(msg, ['Sí', 'No']), 'No');
    });

    it('reads "no existen conceptos adicionales" as No', () => {
        const msg =
            'No existen conceptos adicionales que desee incluir en el desglose de prestaciones.';
        assert.equal(extractSiNoChoiceFromNarrative(msg, ['Sí', 'No']), 'No');
    });
});

describe('hasReciboLaboralAdditionalConcept1Content', () => {
    it('does not treat hasAdditionalConcept2 No as content', () => {
        assert.equal(
            hasReciboLaboralAdditionalConcept1Content({
                hasAdditionalConcept2: 'No',
                preavisoAmount: 'RD$1',
            }),
            false,
        );
    });

    it('treats real label as content', () => {
        assert.equal(
            hasReciboLaboralAdditionalConcept1Content({
                additionalConcept1Label: 'Comisiones',
                additionalConcept1Amount: 'RD$100',
            }),
            true,
        );
    });

    it('ignores Ninguno placeholder label', () => {
        assert.equal(
            hasReciboLaboralAdditionalConcept1Content({
                additionalConcept1Label: 'Ninguno',
                additionalConcept1Amount: '0.00',
            }),
            false,
        );
    });
});

describe('mergeReciboLaboralPendingSiNoAnswers', () => {
    it('maps No from userMessage when save group is signingInfo', () => {
        const merged = mergeReciboLaboralPendingSiNoAnswers(
            'Recibo de Descargo Laboral',
            {},
            'No',
            { hasDetailedBreakdown: 'Sí', preavisoAmount: 'RD$1' },
            ['hasAdditionalConcept1'],
        );
        assert.equal(merged.hasAdditionalConcept1, 'No');
    });

    it('maps No from answers value even with unrelated key', () => {
        const merged = mergeReciboLaboralPendingSiNoAnswers(
            'Recibo de Descargo Laboral',
            { userReply: 'No' },
            undefined,
            {},
            ['hasAdditionalConcept1'],
        );
        assert.equal(merged.hasAdditionalConcept1, 'No');
    });

    it('does not treat long signing narrative as Si/No', () => {
        const msg =
            'City where the document will be signed: Santo Domingo. Date of signing: May 21, 2024. Full name: Luis Alberto Martínez Pérez.';
        assert.equal(isReciboLaboralShortSiNoUserMessage(msg), false);
        const merged = mergeReciboLaboralPendingSiNoAnswers(
            'Recibo de Descargo Laboral',
            { signingCity: 'Santo Domingo' },
            msg,
            {},
            ['hasAdditionalConcept1'],
        );
        assert.equal(merged.hasAdditionalConcept1, undefined);
    });
});

describe('resolveReciboLaboralAdditionalConceptToggles', () => {
    it('hasAdditionalConcept2 No alone does not flip concept1 to Sí', () => {
        const vars: Record<string, string | number> = {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$1',
            cesantiaAmount: 'RD$2',
            navidadAmount: 'RD$3',
            vacacionesAmount: 'RD$4',
            hasAdditionalConcept2: 'No',
            additionalConcept1Label: 'Ninguno',
            additionalConcept1Amount: '0.00',
        };
        resolveReciboLaboralAdditionalConceptToggles(vars, {
            trigger: 'reconcile',
            groups: breakdownGroups as unknown as Parameters<typeof resolveReciboLaboralAdditionalConceptToggles>[1]['groups'],
            isGroupApplicable: (g) => !g.condition || String(vars[g.condition.field]) === String(g.condition.equals),
            getGroupMissingFields: (g, v) =>
                g.variables
                    .filter((f) => f.required && (v[f.key] === undefined || String(v[f.key]).trim() === ''))
                    .map((f) => ({ key: f.key, label: f.label })),
        });
        assert.equal(vars.hasAdditionalConcept1, 'No');
        assert.equal(vars.additionalConcept1Label, undefined);
        assert.equal(vars.additionalConcept1Amount, undefined);
    });

    it('corrects spurious Sí when only Ninguno placeholders and concept2 No', () => {
        const vars: Record<string, string | number> = {
            hasDetailedBreakdown: 'Sí',
            hasAdditionalConcept1: 'Sí',
            preavisoAmount: 'RD$1',
            cesantiaAmount: 'RD$2',
            navidadAmount: 'RD$3',
            vacacionesAmount: 'RD$4',
            hasAdditionalConcept2: 'No',
            additionalConcept1Label: 'Ninguno',
            additionalConcept1Amount: '0.00',
        };
        resolveReciboLaboralAdditionalConceptToggles(vars, { trigger: 'generate_pdf', groups: [], isGroupApplicable: () => true, getGroupMissingFields: () => [] });
        assert.equal(vars.hasAdditionalConcept1, 'No');
        assert.equal(vars.additionalConcept1Label, undefined);
    });

    it('generate_pdf trigger closes when breakdown amounts exist without signing', () => {
        const vars: Record<string, string | number> = {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$1',
            cesantiaAmount: 'RD$2',
            navidadAmount: 'RD$3',
            vacacionesAmount: 'RD$4',
        };
        const changed = resolveReciboLaboralAdditionalConceptToggles(vars, {
            trigger: 'generate_pdf',
            groups: breakdownGroups as unknown as Parameters<typeof resolveReciboLaboralAdditionalConceptToggles>[1]['groups'],
            isGroupApplicable: (g) => !g.condition || String(vars[g.condition.field]) === String(g.condition.equals),
            getGroupMissingFields: (g, v) =>
                g.variables
                    .filter((f) => f.required && (v[f.key] === undefined || String(v[f.key]).trim() === ''))
                    .map((f) => ({ key: f.key, label: f.label })),
        });
        assert.equal(changed, true);
        assert.equal(vars.hasAdditionalConcept1, 'No');
    });
});
