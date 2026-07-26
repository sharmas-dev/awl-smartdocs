/**
 * Schema choice literals for empresa / persona física (capitalization matters for conditions).
 */

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

export function isPartyCompanyChoiceKey(key: string): boolean {
    return /IsCompany$/i.test(key);
}

/**
 * Map conversational answers to exact schema strings: "Empresa" | "Persona física".
 */
export function normalizePartyCompanyChoice(raw: string): string {
    const t = raw.trim();
    if (!t) return raw;
    if (t === 'Empresa' || t === 'Persona física') return t;

    const f = foldAscii(t);
    if (
        f === 'empresa' ||
        f === 'compania' ||
        f === 'sociedad' ||
        f === 'persona juridica' ||
        f === 'persona jurídica' ||
        (f.includes('empresa') && !f.includes('persona'))
    ) {
        return 'Empresa';
    }
    if (
        f === 'persona fisica' ||
        f === 'persona física' ||
        f.includes('fisica') ||
        f.includes('física') ||
        f === 'individuo' ||
        f === 'particular'
    ) {
        return 'Persona física';
    }
    return raw;
}
