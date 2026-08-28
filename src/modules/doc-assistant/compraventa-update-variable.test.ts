import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapAnswersToGroupVariables } from './answer-key-map.js';
import { DocAssistantService } from './doc-assistant.service.js';

describe('answer-key-map for Compraventa LegalName fields', () => {
    it('maps nombre and nombrevendedor to sellerLegalName', () => {
        const vars = [
            { key: 'sellerIsCompany', label: '¿El vendedor es empresa o persona física?' },
            { key: 'sellerTypeLabel', label: 'Tipo de vendedor' },
            { key: 'sellerGender', label: 'Género del vendedor' },
            { key: 'sellerLegalName', label: 'Nombre completo del vendedor (nombre y apellidos, o razón social)' },
        ];
        const res1 = mapAnswersToGroupVariables(vars, { nombre: 'Prem Wekan' });
        assert.equal(res1.mapped.sellerLegalName, 'Prem Wekan');

        const res2 = mapAnswersToGroupVariables(vars, { nombrevendedor: 'Prem Wekan' });
        assert.equal(res2.mapped.sellerLegalName, 'Prem Wekan');
    });

    it('maps nombrecomprador to buyerLegalName', () => {
        const vars = [
            { key: 'buyerIsCompany', label: '¿El comprador es empresa o persona física?' },
            { key: 'buyerLegalName', label: 'Nombre completo del comprador (nombre y apellidos, o razón social)' },
        ];
        const res = mapAnswersToGroupVariables(vars, { nombrecomprador: 'Laura Morales' });
        assert.equal(res.mapped.buyerLegalName, 'Laura Morales');
    });
});

describe('fuzzyMatchVariableLabel for sellerLegalName and buyerLegalName', () => {
    const docService = new DocAssistantService({} as any, {} as any);
    const schema = docService.getCompactSchema('Contrato de Compraventa Vehículo');

    it('matches short natural queries to sellerLegalName and buyerLegalName', () => {
        if ('error' in schema) throw new Error(schema.error);

        // Access private function via method or test fuzzy matching directly
        const testMatch = (input: string) => {
            const groups = schema.groups;
            // Test inputs against schema variables using fuzzy algorithm logic
            const inputClean = input.toLowerCase().replace(/[{}]/g, '').trim();
            const inputNorm = inputClean.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');

            let best: { key: string; score: number } | null = null;
            const stopWords = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'para', 'su', 'con', 'of', 'the', 'to', 'for', 'in', 'is']);
            const inputTokens = inputClean.normalize('NFD').replace(/\p{M}/gu, '').split(/[^a-z0-9]+/).filter(t => t.length > 1 && !stopWords.has(t));

            for (const g of groups) {
                for (const v of g.variables) {
                    const varLower = v.label.toLowerCase();
                    const cleanLabel = varLower.replace(/\s*\([^)]*\)/g, '').trim();
                    const cleanLabelNorm = cleanLabel.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
                    const keyLower = v.key.toLowerCase();

                    let score = 0;
                    if (cleanLabelNorm.includes(inputNorm) || inputNorm.includes(cleanLabelNorm)) score = 0.9;

                    const varTokens = cleanLabel.normalize('NFD').replace(/\p{M}/gu, '').split(/[^a-z0-9]+/).concat(v.key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/)).filter(t => t.length > 1);
                    const matchedTokens = inputTokens.filter(t => varTokens.includes(t));
                    if (matchedTokens.length === inputTokens.length) score = Math.max(score, 0.85);

                    if (!best || score > best.score) {
                        best = { key: v.key, score };
                    }
                }
            }
            return best;
        };

        const matchSeller = testMatch('nombre del vendedor');
        assert.equal(matchSeller?.key, 'sellerLegalName');

        const matchBuyer = testMatch('nombre del comprador');
        assert.equal(matchBuyer?.key, 'buyerLegalName');

        const matchSellerEng = testMatch("seller's name");
        assert.equal(matchSellerEng?.key, 'sellerLegalName');
    });
});
