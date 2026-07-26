import { parsePesoAmountToNumber } from './currency-amount-format.js';

const RECIBO_TEMPLATE = 'Recibo de Descargo Laboral';

function isYes(v: unknown): boolean {
    const s = String(v ?? '')
        .trim()
        .toLowerCase();
    return s === 'sí' || s === 'si' || s === 'yes';
}

/**
 * When desglose is enabled, sum of line items must equal totalAmountWithCurrency.
 */
export function validateReciboDescargoLaboralBreakdownSum(
    templateName: string,
    variables: Record<string, string | number>,
): { ok: true } | { ok: false; messageEs: string } {
    if (templateName !== RECIBO_TEMPLATE) return { ok: true };
    if (!isYes(variables.hasDetailedBreakdown)) return { ok: true };

    const total = parsePesoAmountToNumber(variables.totalAmountWithCurrency);
    if (total === null) return { ok: true };

    const lineKeys = ['preavisoAmount', 'cesantiaAmount', 'navidadAmount', 'vacacionesAmount'] as const;
    let sum = 0;
    for (const k of lineKeys) {
        if (variables[k] === undefined) return { ok: true };
        const val = variables[k];
        const n = parsePesoAmountToNumber(val);
        if (val === null || String(val).trim() === '' || String(val).toLowerCase().includes('aplica')) {
            sum += 0;
        } else if (n !== null) {
            sum += n;
        } else {
            return { ok: true };
        }
    }

    if (isYes(variables.hasAdditionalConcept1)) {
        if (variables.additionalConcept1Amount === undefined) return { ok: true };
        const val = variables.additionalConcept1Amount;
        const n = parsePesoAmountToNumber(val);
        if (val === null || String(val).trim() === '' || String(val).toLowerCase().includes('aplica')) {
            sum += 0;
        } else if (n !== null) {
            sum += n;
        } else {
            return { ok: true };
        }
    }
    if (isYes(variables.hasAdditionalConcept2)) {
        if (variables.additionalConcept2Amount === undefined) return { ok: true };
        const val = variables.additionalConcept2Amount;
        const n = parsePesoAmountToNumber(val);
        if (val === null || String(val).trim() === '' || String(val).toLowerCase().includes('aplica')) {
            sum += 0;
        } else if (n !== null) {
            sum += n;
        } else {
            return { ok: true };
        }
    }

    const eps = 0.01;
    if (Math.abs(sum - total) > eps) {
        const sumFmt = sum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const totalStr = `RD$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return {
            ok: false,
            messageEs: `La suma del desglose (RD$${sumFmt}) no coincide con el monto total que indicaste (${totalStr}). Ajusta los montos de Preaviso, Auxilio de Cesantía, Navidad, Vacaciones y los conceptos adicionales para que sumen exactamente el total, o corrige el monto total.`,
        };
    }

    return { ok: true };
}
