/**
 * Propuesta de Trabajo — fill normalizations (HBS unchanged).
 *
 * §6 Salario hardcodes «de cada mes» after {{payrollDays}}.
 * §7 Beneficios lists customs only when hasAdditionalBenefits === "Sí".
 */

import { normalizeTemplateNameKey } from './template-name.js';

export function isPropuestaDeTrabajoTemplate(templateName: string): boolean {
    return normalizeTemplateNameKey(templateName) === normalizeTemplateNameKey('Propuesta de Trabajo');
}

function foldChoice(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

/**
 * Strip trailing / embedded «de cada mes» (and close variants) from payrollDays.
 * Keeps day tokens only, e.g. «15 y 30», «15 y último».
 */
export function normalizePropuestaPayrollDays(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    const next = s
        .replace(/\s*de\s+cada\s+mes\b\.?/giu, '')
        .replace(/\s*del?\s+mes\b\.?/giu, '')
        .replace(/\s+/g, ' ')
        .replace(/[,\s;]+$/u, '')
        .trim();

    if (!next) return null;
    return next === s ? null : next;
}

/** Map free-text / typos onto schema literals Sí | No. */
export function normalizePropuestaSiNo(raw: unknown): 'Sí' | 'No' | null {
    const f = foldChoice(String(raw ?? ''));
    if (!f) return null;
    if (f === 'si' || f === 'yes' || f === 'true' || f === '1' || f === 's') return 'Sí';
    if (f === 'no' || f === 'false' || f === '0' || f === 'n') return 'No';
    return null;
}

/**
 * HBS §7 lists extras only when hasAdditionalBenefits === "Sí".
 * If additionalBenefitsList has content but the gate is still No/empty/non-canonical, open it.
 */
export function syncPropuestaAdditionalBenefitsGate(out: Record<string, string | number>): boolean {
    const benefits = String(out.additionalBenefitsList ?? '').trim();
    if (!benefits) {
        return false;
    }
    const has = String(out.hasAdditionalBenefits ?? '').trim();
    if (foldChoice(has) === foldChoice('Sí')) {
        if (has !== 'Sí') {
            out.hasAdditionalBenefits = 'Sí';
            return true;
        }
        return false;
    }
    out.hasAdditionalBenefits = 'Sí';
    return true;
}

/** Patch for update_variable so the HBS §7 gate stays coherent with the list. */
export function propuestaAdditionalBenefitsUpdatePatch(
    key: string,
    newValue: string,
): Record<string, string> | null {
    if (key === 'additionalBenefitsList') {
        const trimmed = newValue.trim();
        if (trimmed) {
            return { additionalBenefitsList: newValue, hasAdditionalBenefits: 'Sí' };
        }
        return { additionalBenefitsList: newValue, hasAdditionalBenefits: 'No' };
    }
    if (key === 'hasAdditionalBenefits') {
        const canon = normalizePropuestaSiNo(newValue) ?? (foldChoice(newValue) === foldChoice('Sí') ? 'Sí' : null);
        if (canon === 'No' || foldChoice(newValue) === foldChoice('No')) {
            return { hasAdditionalBenefits: 'No', additionalBenefitsList: '' };
        }
        if (canon === 'Sí') {
            return { hasAdditionalBenefits: 'Sí' };
        }
    }
    return null;
}

export function applyPropuestaDeTrabajoNormalizations(
    out: Record<string, string | number>,
): boolean {
    let changed = false;

    const payroll = normalizePropuestaPayrollDays(out.payrollDays);
    if (payroll != null && String(out.payrollDays ?? '') !== payroll) {
        out.payrollDays = payroll;
        changed = true;
    }

    if (out.hasAdditionalBenefits != null && String(out.hasAdditionalBenefits).trim()) {
        const canon = normalizePropuestaSiNo(out.hasAdditionalBenefits);
        if (canon && String(out.hasAdditionalBenefits) !== canon) {
            out.hasAdditionalBenefits = canon;
            changed = true;
        }
    }

    if (syncPropuestaAdditionalBenefitsGate(out)) {
        changed = true;
    }

    return changed;
}
