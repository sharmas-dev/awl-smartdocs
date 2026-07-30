/**
 * Normalize punctuation and spelling for identification variables (cédula, pasaporte, No., etc.).
 * Dominican Cédula de Identidad y Electoral: 11 digits displayed as XXX-XXXXXXX-X (3 + 7 + 1).
 */

function collapseWhitespace(s: string): string {
    return s.trim().replace(/\s+/g, ' ');
}

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

/** Keys whose values are document-type labels or ID numbers — normalize No./cédula phrasing. */
export function isIdPresentationVariableKey(key: string): boolean {
    const k = key.toLowerCase();
    if (/(nationality|nacionalidad|chasis|matr[ií]cula|invoice|factura|ncf\b)/i.test(k)) return false;
    // RNC number fields only — not HasDominicanRnc / IncludeRnc* Yes/No flags
    const isRncNumberKey = /rnc$/i.test(k) && !/hasdominicanrnc$|includernc/i.test(k);
    return (
        /idtype/i.test(k) ||
        /idnumber/i.test(k) ||
        /cedula|c[eé]dula/i.test(k) ||
        /pasaport/i.test(k) ||
        /employeridblock/i.test(k) ||
        /declarantidtype/i.test(k) ||
        /empleadorid/i.test(k) ||
        isRncNumberKey
    );
}

/** Format exactly 11 digits as Dominican cédula XXX-XXXXXXX-X. */
export function formatDominicanCedula11(digits11: string): string {
    if (digits11.length !== 11 || !/^\d{11}$/.test(digits11)) return digits11;
    return `${digits11.slice(0, 3)}-${digits11.slice(3, 10)}-${digits11.slice(10)}`;
}

/** Format exactly 9 digits as Dominican RNC XXX-XXXXX-X. */
export function formatDominicanRnc9(digits9: string): string {
    if (digits9.length !== 9 || !/^\d{9}$/.test(digits9)) return digits9;
    return `${digits9.slice(0, 3)}-${digits9.slice(3, 8)}-${digits9.slice(8)}`;
}

/** Format exactly 10 digits as XXX-XXXXXX-X (3-6-1). */
export function formatCedula10(digits10: string): string {
    if (digits10.length !== 10 || !/^\d{10}$/.test(digits10)) return digits10;
    return `${digits10.slice(0, 3)}-${digits10.slice(3, 9)}-${digits10.slice(9)}`;
}

/**
 * Find sequences of exactly 11 digits when non-digits between them are ignored (spaces, hyphens, dots, commas).
 * Replaces each run with XXX-XXXXXXX-X. Does not match if there are more than 11 digits in the same run.
 */
function normalizeDominicanCedulaInText(s: string): string {
    // Between digits allow spaces, hyphens, dots, commas, slashes (common user input).
    return s.replace(/(?<!\d)(\d)(?:[-\s.,/]*\d){10}(?!\d)/g, (chunk) => {
        const digits = chunk.replace(/\D/g, '');
        if (digits.length !== 11) return chunk;
        return formatDominicanCedula11(digits);
    });
}

/**
 * Find sequences of exactly 9 digits when non-digits between them are ignored (spaces, hyphens, dots, commas).
 * Replaces each run with XXX-XXXXX-X. Does not match if there are more than 9 digits in the same run.
 */
function normalizeDominicanRncInText(s: string): string {
    return s.replace(/(?<!\d)(\d)(?:[-\s.,/]*\d){8}(?!\d)/g, (chunk) => {
        const digits = chunk.replace(/\D/g, '');
        if (digits.length !== 9) return chunk;
        return formatDominicanRnc9(digits);
    });
}

/** Legacy: contiguous 11-digit runs (no separators). */
function hyphenateBare11DigitRuns(s: string): string {
    return s.replace(/\b(\d{11})\b/g, (_m, d: string) => formatDominicanCedula11(d));
}

/** Contiguous 9-digit runs (no separators). */
function hyphenateBare9DigitRuns(s: string): string {
    return s.replace(/\b(\d{9})\b/g, (_m, d: string) => formatDominicanRnc9(d));
}

/** Ensure "No." is followed by a space before a number or formatted cédula. */
function fixNumeroAbbreviationSpacing(s: string): string {
    return s.replace(/\bNo\.(?=[0-9])/gi, 'No. ');
}

export function normalizeIdentificationPresentation(raw: string): string {
    if (raw === undefined || raw === null) return '';
    let s = collapseWhitespace(String(raw));
    if (!s) return s;

    s = s.replace(/\.{2,}/g, '.');

    // Ordinal / abbreviation variants → No.
    s = s.replace(/\b(No|Nno|Num)\b\.?\s*|\b(No|Nno|Num)(?=\d)|\bN[º°]\s*/gi, 'No. ');
    s = collapseWhitespace(s);

    const f = foldAscii(s);

    // Canonical fixed option labels (case + accents)
    if (f === 'de la cedula de identidad y electoral') return 'de la Cédula de Identidad y Electoral';
    if (f === 'la cedula de identidad y electoral') return 'la Cédula de Identidad y Electoral';
    if (f === 'del pasaporte') return 'del Pasaporte';
    if (f === 'el pasaporte') return 'el Pasaporte';
    if (f === 'pasaporte') return 'Pasaporte';
    if (f === 'cedula') return 'Cédula';

    // Normalize phrase mid-string (free-text id blocks)
    s = s.replace(/\bde\s+la\s+c[eé]dula\s+de\s+identidad\s+y\s+electoral\b/gi, 'de la Cédula de Identidad y Electoral');
    s = s.replace(/\bla\s+c[eé]dula\s+de\s+identidad\s+y\s+electoral\b/gi, 'la Cédula de Identidad y Electoral');
    s = s.replace(/\bdel\s+pasaporte\b/gi, 'del Pasaporte');
    s = s.replace(/\bel\s+pasaporte\b/gi, 'el Pasaporte');

    // Dominican cédula: 11 digits → XXX-XXXXXXX-X (handles 00123456789, 001-2345678-9, 001 234 5678 9, etc.)
    s = normalizeDominicanCedulaInText(s);
    s = hyphenateBare11DigitRuns(s);

    // Dominican RNC: 9 digits → XXX-XXXXX-X
    s = normalizeDominicanRncInText(s);
    s = hyphenateBare9DigitRuns(s);

    s = fixNumeroAbbreviationSpacing(s);
    s = collapseWhitespace(s);

    return s;
}
