/**
 * Prevent duplicated duties in "Contrato de Trabajadora Doméstica".
 *
 * The template already prints a fixed enumerated list (i..vi) for standard
 * household duties. If the user types the same duties in `primaryResponsibility`,
 * the rendered paragraph repeats them.
 *
 * This normalizer keeps only extra/non-duplicated items and falls back to a
 * neutral phrase when the user input is fully covered by the built-in list.
 */

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const STANDARD_DUTY_PATTERNS: readonly RegExp[] = [
    /\b(limpiar|limpieza|mantenimiento|barrer|trapear|bano|bano?s?|cocina|hogar|casa)\b/i,
    /\b(lavar|lavado|secado|planchado|ropa|toallas|prendas)\b/i,
    /\b(cocinar|cocina|preparacion de alimentos?|alimentos?|utensilios?)\b/i,
    /\b(organizacion|orden del hogar|organizar)\b/i,
    /\b(nin[oa]s?|cuidado de nin[oa]s?|supervision|acompanamiento)\b/i,
];

function isStandardDomesticDuty(text: string): boolean {
    const f = fold(text);
    if (!f) return false;
    return STANDARD_DUTY_PATTERNS.some((re) => re.test(f));
}

function splitItems(raw: string): string[] {
    const s = raw
        .replace(/\s+/g, ' ')
        .replace(/\b(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\./gi, ';')
        .replace(/(?:^|[\s;])(?:\d+|[a-z])\)\s*/gi, ';')
        .trim();

    return s
        .split(/[;\n]+|,\s+/)
        .map((item) => item.trim())
        .map((item) => item.replace(/^[\-*•\s]+/, '').replace(/[.;,:]+$/, '').trim())
        .filter(Boolean);
}

/**
 * Applies only to key `primaryResponsibility`.
 */
export function isDomesticPrimaryResponsibilityKey(key: string): boolean {
    return key.toLowerCase() === 'primaryresponsibility';
}

export function normalizeDomesticPrimaryResponsibility(raw: string): string {
    const input = raw.trim().replace(/\s+/g, ' ');
    if (!input) return raw;

    const items = splitItems(input);
    if (items.length === 0) return raw;

    const seen = new Set<string>();
    const kept: string[] = [];
    for (const item of items) {
        const id = fold(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (!isStandardDomesticDuty(item)) {
            kept.push(item);
        }
    }

    if (kept.length === 0) {
        return 'Labores domésticas complementarias acordadas entre las Partes';
    }

    return kept.join('; ');
}

