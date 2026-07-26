/**
 * Contrato de Compraventa Vehículo — signing date fragments for HBS:
 * "el día {{signingDateLetters}} ({{signingDateNumbers}}) del mes de {{signingMonthLetters}}
 *  del año {{signingYearLetters}} ({{signingYearNumbers}})"
 *
 * Letter fields must be words only; numeric fields hold digits. Dual-format strings like
 * "Treinta (30)" in signingDateLetters cause "(30) (30)" in the PDF.
 */

import { expandCompraventaVehiculoCanonicalDates } from './recibo-descargo-date-expand.js';
import { integerToSpanishWords, parseSpanishIntegerWords } from './integer-word-conversion.js';

function parsePositiveInt(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 0 ? value : null;
    }
    const s = String(value).trim();
    if (!s || !/^\+?\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

const WORDS_WITH_PARENS = /^(.+?)\s*\(\s*(\d+)\s*\)\s*$/;

function stripRedundantParenthetical(letters: string, numbers: string | number | undefined): string {
    const l = String(letters ?? '').trim();
    const n = String(numbers ?? '').trim();
    if (!l) return l;
    const m = WORDS_WITH_PARENS.exec(l);
    if (m && n && m[2] === n) {
        return m[1]!.trim();
    }
    return l;
}

/** When AWLi puts "30" in the letters field, convert to Spanish day words. */
function ensureLettersAreWordsNotDigits(
    lettersKey: string,
    numbersKey: string,
    out: Record<string, string | number>,
    kind: 'day' | 'year',
): boolean {
    const lettersRaw = String(out[lettersKey] ?? '').trim();
    const numbersRaw = String(out[numbersKey] ?? '').trim();
    if (!lettersRaw) return false;

    const lettersAsInt = parsePositiveInt(lettersRaw);
    const numbersAsInt = parsePositiveInt(numbersRaw);
    if (lettersAsInt === null) return false;

    if (numbersAsInt !== null && lettersAsInt !== numbersAsInt) {
        return false;
    }

    const words = integerToSpanishWords(lettersAsInt, kind === 'day' ? 'plain' : 'plain');
    if (!words) return false;

    if (out[lettersKey] !== words) {
        out[lettersKey] = words;
        return true;
    }
    return false;
}

function composeDocumentSigningDateFromFragments(out: Record<string, string | number>): string | undefined {
    const d =
        parsePositiveInt(out.signingDateNumbers) ??
        parseSpanishIntegerWords(String(out.signingDateLetters ?? ''));
    const monthRaw = String(out.signingMonthLetters ?? '').trim();
    const y =
        parsePositiveInt(out.signingYearNumbers) ??
        parseSpanishIntegerWords(String(out.signingYearLetters ?? ''));

    if (d === null || !monthRaw || y === null) {
        return undefined;
    }

    return `${d} de ${monthRaw.toLowerCase()} de ${y}`;
}

/**
 * Sanitize signing fragments and expand from documentSigningDate when possible.
 * Compraventa-only — call from normalizeFieldValuesForStorage after integer partners.
 */
export function normalizeCompraventaSigningDateFragments(out: Record<string, string | number>): boolean {
    let changed = false;

    const beforeLetters = String(out.signingDateLetters ?? '');
    const strippedDay = stripRedundantParenthetical(beforeLetters, out.signingDateNumbers);
    if (strippedDay !== beforeLetters) {
        out.signingDateLetters = strippedDay;
        changed = true;
    }

    const beforeYearLetters = String(out.signingYearLetters ?? '');
    const strippedYear = stripRedundantParenthetical(beforeYearLetters, out.signingYearNumbers);
    if (strippedYear !== beforeYearLetters) {
        out.signingYearLetters = strippedYear;
        changed = true;
    }

    if (ensureLettersAreWordsNotDigits('signingDateLetters', 'signingDateNumbers', out, 'day')) {
        changed = true;
    }
    if (ensureLettersAreWordsNotDigits('signingYearLetters', 'signingYearNumbers', out, 'year')) {
        changed = true;
    }

    const canonicalExisting = String(out.documentSigningDate ?? '').trim();
    if (!canonicalExisting) {
        const composed = composeDocumentSigningDateFromFragments(out);
        if (composed) {
            out.documentSigningDate = composed;
            changed = true;
        }
    }

    if (expandCompraventaVehiculoCanonicalDates(out)) {
        changed = true;
    }

    return changed;
}
