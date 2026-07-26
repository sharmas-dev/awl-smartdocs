import { formatDominicanPesoAmount } from './currency-amount-format.js';

/**
 * Template-specific display formatting for:
 *   Contrato de Trabajadora Doméstica
 *
 * Requirements from product feedback:
 * - Amount in words should display with initial capitals for key words:
 *     "Treinta Mil Pesos Dominicanos con 00/100"
 * - Numeric currency should display as RD$ (not "$... DOP"):
 *     "(RD$30,000)"
 */

const DOMESTIC_TEMPLATE_NAME = 'contrato de trabajadora doméstica';

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

export function isDomesticContractTemplate(templateName: string): boolean {
    return fold(templateName) === fold(DOMESTIC_TEMPLATE_NAME);
}

/** Keep common short Spanish connectors in lowercase for a natural legal style. */
const LOWERCASE_WORDS = new Set(['con', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'al']);

function titleCasePreservingSeparators(input: string): string {
    const parts = input.split(/(\s+|\/|-)/g);
    return parts
        .map((part) => {
            if (!part) return part;
            if (/^\s+$/.test(part) || part === '/' || part === '-') return part;
            if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(part)) return part;
            const lower = part.toLowerCase();
            if (LOWERCASE_WORDS.has(lower)) return lower;
            const first = part.charAt(0).toUpperCase();
            return first + part.slice(1).toLowerCase();
        })
        .join('');
}

export function normalizeDomesticSalaryInWordsDisplay(raw: string): string {
    const s = raw.trim().replace(/\s+/g, ' ');
    if (!s) return raw;
    return titleCasePreservingSeparators(s);
}

/**
 * Accept common user-provided variants and normalize to RD$ display:
 *   "$30,000 DOP" -> "RD$30,000"
 *   "30,000 DOP"  -> "RD$30,000"
 *   "RD$30000"    -> "RD$30,000"
 */
export function normalizeDomesticSalaryCurrencyDisplay(raw: string): string {
    const s = raw.trim();
    if (!s) return raw;

    // Already close to canonical: let existing formatter standardize commas/decimals,
    // then enforce the domestic contract display style with a space after RD$.
    const normalizeFormatted = (value: string) => formatDominicanPesoAmount(value).replace(/^RD\$\s?/, 'RD$ ');
    if (/^RD\$/i.test(s)) {
        return normalizeFormatted(s);
    }

    // Normalize "$... DOP", "... DOP", or "... RD$" variants to "RD$ ..."
    const stripped = s
        .replace(/[()]/g, '')
        .replace(/\bDOP\b/gi, '')
        .replace(/\bRD\$\s*$/i, '')
        .replace(/^\$/, '')
        .trim();

    if (!/^\d[\d,\s]*(?:\.\d+)?$/.test(stripped)) return raw;

    const body = stripped.replace(/\s+/g, '');
    return normalizeFormatted(`RD$${body}`);
}

/** Canonical tail phrase for section 9 when contractDurationKind is Por tiempo indefinido. */
export const DOMESTIC_INDEFINITE_DURATION_PHRASE = 'por tiempo indefinido';

/** `contractDurationIndefinite` is printed after "La duración del Contrato es ...". */
export function isDomesticIndefiniteDurationKey(key: string): boolean {
    return key.toLowerCase() === 'contractdurationindefinite';
}

/**
 * Avoid duplicated phrasing in section 9 (Vigencia).
 *
 * Template already writes:
 *   "La duración del Contrato es {{contractDurationIndefinite}}."
 *
 * So if the stored value is:
 *   "El presente contrato tiene una duración por tiempo indefinido"
 * the rendered sentence becomes redundant. We normalize this field to only
 * keep the tail phrase expected by the template.
 */
export function normalizeDomesticIndefiniteDurationPhrase(raw: string): string {
    const s = raw.trim().replace(/\s+/g, ' ');
    if (!s) return raw;

    const noTrailPunct = s.replace(/[.;:!?]+$/g, '').trim();
    const f = fold(noTrailPunct);

    // Canonical expected phrase for indefinite duration in this template.
    if (/\bindefinid[oa]?\b/.test(f)) {
        return DOMESTIC_INDEFINITE_DURATION_PHRASE;
    }

    // Remove duplicated heads that users often type verbatim.
    let out = noTrailPunct
        .replace(/^la\s+duraci[oó]n\s+del?\s+contrato\s+es\s+/i, '')
        .replace(/^el\s+presente\s+contrato\s+tiene\s+una\s+duraci[oó]n\s+/i, '')
        .replace(/^este\s+contrato\s+tiene\s+una\s+duraci[oó]n\s+/i, '')
        .trim();

    if (!out) return DOMESTIC_INDEFINITE_DURATION_PHRASE;

    // Keep phrase-style tail (not sentence-case lead) after "... es ".
    out = out.charAt(0).toLowerCase() + out.slice(1);
    return out;
}

