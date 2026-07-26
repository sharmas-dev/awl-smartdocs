/**
 * Normalize human-entered telephone numbers into a uniform institutional format
 * suitable for user contact, e.g. **+1 809-555-1234**.
 *
 * Dominican Republic (and the rest of the NANP) uses country code **+1**.
 * Users frequently type a bare 10-digit local number ("8095551234"),
 * apply mixed punctuation ("(809) 555-1234"), or add noise like "tel.".
 * We canonicalize to "+<country> <area>-<exchange>-<line>" so the rendered
 * deliverable is consistent across documents.
 *
 * Non-NANP / international numbers (anything that does not resolve to a clean
 * 10-digit local number, optionally prefixed by a country code) are returned
 * trimmed but otherwise untouched — we never mangle a number we cannot parse
 * with confidence.
 */

/** Keys whose value is a contact telephone number. */
export function isPhoneNumberVariableKey(key: string): boolean {
    const k = key.toLowerCase();
    if (k.includes('fax')) return false;
    return /(phone|telefono|tel[eé]fono|\btel\b|mobile|celular|whatsapp)/i.test(k);
}

/** Format the 10 NANP digits as "AAA-EEE-LLLL". */
function formatNanpLocal(tenDigits: string): string {
    return `${tenDigits.slice(0, 3)}-${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

/**
 * Normalize a phone string. Returns a canonical "+1 809-555-1234" shape when the
 * input resolves to a NANP number; otherwise returns the trimmed original.
 */
export function normalizePhoneNumber(raw: string): string {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return trimmed;

    // Keep a leading "+" (explicit international prefix) for detection.
    const hadPlus = /\+/.test(trimmed);
    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) return trimmed;

    // NANP local (10 digits) → assume +1 country code.
    if (digits.length === 10) {
        return `+1 ${formatNanpLocal(digits)}`;
    }

    // 11 digits starting with 1 → NANP with country code (e.g. 1 809 555 1234).
    if (digits.length === 11 && digits.startsWith('1')) {
        return `+1 ${formatNanpLocal(digits.slice(1))}`;
    }

    // Explicit "+1 ..." with the leading 1 already counted above; if a user wrote
    // "+1809..." it folds to 11 digits and is handled. For other international
    // numbers, preserve a "+" prefix and group digits lightly without guessing.
    if (hadPlus && digits.length >= 8 && digits.length <= 15) {
        return `+${digits}`;
    }

    return trimmed;
}
