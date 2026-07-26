/** Reject values that are clearly not a person's legal name (address bleed, narrative, ID lines). */

const ADDRESS_LIKE =
    /^(?:reside\s+en|domicilio|direcci[oó]n|con\s+domicilio|calle\s+|av\.|avenida\s+)/i;

const CEDULA_IN_NAME = /\b\d{3}-\d{7}-\d\b/;

export function isInvalidPersonNameValue(value: string): boolean {
    const t = value.trim();
    if (!t || t.length < 2) return true;
    if (t.length > 80) return true;
    if (ADDRESS_LIKE.test(t)) return true;
    if (CEDULA_IN_NAME.test(t)) return true;
    if (/empleador\s*:/i.test(t)) return true;
    if (/titular\s+(?:de\s+la\s+)?c[eé]dula/i.test(t)) return true;
    return false;
}

/**
 * Return trimmed name if valid; otherwise undefined (do not overwrite a good existing value).
 */
export function sanitizePersonNameIfValid(value: string | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    const t = String(value).trim().replace(/\s+/g, ' ');
    if (!t || isInvalidPersonNameValue(t)) return undefined;
    return t;
}
