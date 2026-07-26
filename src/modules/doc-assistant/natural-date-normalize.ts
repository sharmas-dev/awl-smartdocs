/**
 * Turn relative / informal date phrases into a single Spanish long-form date
 * (e.g. "16 de abril de 2026") using a fixed IANA timezone (default America/Santo_Domingo).
 *
 * After normalization, `formatSpanishLegalDateDual` expands calendar dates into the
 * legal-style dual form (words + digits in parentheses for day and year only), e.g.
 * "Doce (12) de Abril del Mil Novecientos Noventa (1990)".
 */

import { integerToSpanishWords } from './integer-word-conversion.js';

export interface NormalizeNaturalDateOptions {
    /** Instant used for "today" / relative offsets (default: new Date()) */
    reference?: Date;
    /** IANA timezone for calendar "today" (default from env or America/Santo_Domingo) */
    timeZone?: string;
}

function defaultTimeZone(): string {
    return process.env.DOC_ASSISTANT_DATE_TIMEZONE?.trim() || 'America/Santo_Domingo';
}

function getCalendarYMD(instant: Date, timeZone: string): { y: number; m: number; d: number } {
    const s = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant);
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
}

function addCalendarDays(instant: Date, timeZone: string, deltaDays: number): Date {
    const { y, m, d } = getCalendarYMD(instant, timeZone);
    return new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
}

function formatSpanishLong(instant: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('es-DO', {
        timeZone: timeZone,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(instant);
}

/** Lowercase, strip accents, collapse whitespace — for matching English/Spanish phrases */
function foldForMatch(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/\s+/g, ' ');
}

/**
 * If the string is a relative date phrase or a common numeric/ISO form, return Spanish long form.
 * Otherwise return the trimmed original string.
 */
export function normalizeNaturalDateInput(raw: string, options?: NormalizeNaturalDateOptions): string {
    if (raw === undefined || raw === null) return '';
    const trimmed = String(raw).trim();
    if (!trimmed) return trimmed;

    const timeZone = options?.timeZone ?? defaultTimeZone();
    const ref = options?.reference ?? new Date();
    const f = foldForMatch(trimmed);

    // --- Relative phrases (EN + ES) ---
    const todayRegex = /^(?:el\s+dia\s+de\s+|al\s+dia\s+de\s+|a\s+partir\s+de\s+|desde\s+|starting\s+|from\s+|as\s+of\s+)?(today|hoy)(?:\s+mismo|\s+dia)?$/;
    if (todayRegex.test(f)) {
        return formatSpanishLong(ref, timeZone);
    }
    const yesterdayRegex = /^(?:el\s+dia\s+de\s+|a\s+partir\s+de\s+|desde\s+|starting\s+|from\s+|as\s+of\s+)?(yesterday|ayer)(?:\s+mismo|\s+itself)?$/;
    if (yesterdayRegex.test(f)) {
        return formatSpanishLong(addCalendarDays(ref, timeZone, -1), timeZone);
    }
    if (f === 'tomorrow' || f === 'manana') {
        return formatSpanishLong(addCalendarDays(ref, timeZone, 1), timeZone);
    }
    if (f === 'day after tomorrow' || f === 'pasado manana') {
        return formatSpanishLong(addCalendarDays(ref, timeZone, 2), timeZone);
    }

    // "in 10 days", "10 days from now", "en 10 días", "dentro de 10 días", "10 días"
    let m: RegExpExecArray | null;
    const reInEn = /^(?:in\s+)?(\d{1,3})\s+days(?:\s+from\s+now)?$/;
    m = reInEn.exec(f);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 0 && n <= 3650) {
            return formatSpanishLong(addCalendarDays(ref, timeZone, n), timeZone);
        }
    }
    const reEsDias = /^(?:en\s+|dentro\s+de\s+)?(\d{1,3})\s+dias(?:\s+desde\s+hoy)?$/;
    m = reEsDias.exec(f);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 0 && n <= 3650) {
            return formatSpanishLong(addCalendarDays(ref, timeZone, n), timeZone);
        }
    }

    // "next week" → +7 calendar days (simple interpretation)
    if (f === 'next week' || f === 'la proxima semana' || f === 'proxima semana') {
        return formatSpanishLong(addCalendarDays(ref, timeZone, 7), timeZone);
    }

    // --- Structured numeric / ISO (normalize display to Spanish long) ---
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) {
        const y = parseInt(iso[1], 10);
        const mo = parseInt(iso[2], 10);
        const d = parseInt(iso[3], 10);
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            const inst = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
            if (!Number.isNaN(inst.getTime())) {
                return formatSpanishLong(inst, timeZone);
            }
        }
    }

    // D/M/Y or D-M-Y (Latin style, 4-digit year)
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
    if (dmy) {
        const d = parseInt(dmy[1], 10);
        const mo = parseInt(dmy[2], 10);
        const y = parseInt(dmy[3], 10);
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            const inst = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
            if (!Number.isNaN(inst.getTime())) {
                return formatSpanishLong(inst, timeZone);
            }
        }
    }

    return trimmed;
}

const MONTH_NAMES_LOWER = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
];

function foldMonthToken(s: string): string {
    return s
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}

function monthNumFromSpanishName(nameRaw: string): number | null {
    const f = foldMonthToken(nameRaw);
    const idx = MONTH_NAMES_LOWER.findIndex((m) => m === f);
    return idx >= 0 ? idx + 1 : null;
}

function monthTitleCase(m: number): string {
    const n = MONTH_NAMES_LOWER[m - 1];
    if (!n) return '';
    return n.charAt(0).toUpperCase() + n.slice(1);
}

function capitalizeWordSpanish(w: string): string {
    if (w === 'y') return 'y';
    const lower = w.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Title-case each token; keeps "y" lowercase between words (treinta y uno). */
function titleCaseSpanishPhrase(phrase: string): string {
    return phrase
        .trim()
        .split(/\s+/)
        .map(capitalizeWordSpanish)
        .join(' ');
}

/**
 * Recognizes output like `normalizeNaturalDateInput` / Intl es-DO:
 * "12 de abril de 1990"
 */
const SPANISH_LONG_CALENDAR_DATE =
    /^(\d{1,2})\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+)\s+de\s+(\d{4})\s*$/;

/**
 * Extract calendar day/month/year from a stored type "date" value: either dual legal
 * format from formatSpanishLegalDateDual, or "d de mes de aaaa" after normalizeNaturalDateInput.
 */
function stripDateWrapping(s: string): string {
    let t = String(s ?? '').trim();
    if (!t) return t;
    t = t.replace(/[.,;:]+$/g, '').trim();
    t = t.replace(/^el\s+/i, '').trim();
    t = t.replace(/^fecha\s*:?\s*/i, '').trim();
    return t;
}

export function parseStoredCalendarDateToYMD(stored: string): { d: number; m: number; y: number } | null {
    const s = stripDateWrapping(stored);
    if (!s) return null;

    const dualNewRe =
        /\((\d{1,2})\)\s+de\s+([a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+)\s+del\s+[^()]+\s+\((\d{4})\)/i;
    const dmNew = dualNewRe.exec(s);
    if (dmNew) {
        const d = parseInt(dmNew[1]!, 10);
        const mo = monthNumFromSpanishName(dmNew[2]!);
        const y = parseInt(dmNew[3]!, 10);
        if (mo && d >= 1 && d <= 31 && y >= 1000 && y <= 9999) {
            return { d, m: mo, y };
        }
    }

    const dualLegacyRe =
        /\((\d{1,2})\)\s+de\s+[^()]+\s+\((\d{1,2})\)\s+del\s+[^()]+\s+\((\d{4})\)/i;
    const dmLegacy = dualLegacyRe.exec(s);
    if (dmLegacy) {
        const d = parseInt(dmLegacy[1]!, 10);
        const mo = parseInt(dmLegacy[2]!, 10);
        const y = parseInt(dmLegacy[3]!, 10);
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1000 && y <= 9999) {
            return { d, m: mo, y };
        }
    }

    const monthYear = /^(?:mes\s+de\s+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]+)\s+de\s+(\d{4})\s*$/i.exec(s);
    if (monthYear?.[1] && monthYear[2]) {
        const monthNum = monthNumFromSpanishName(monthYear[1]);
        const yearNum = parseInt(monthYear[2], 10);
        if (monthNum && yearNum >= 1000 && yearNum <= 9999) {
            return { d: 1, m: monthNum, y: yearNum };
        }
    }

    const yearOnly = /^(?:hasta\s+el\s+)?a[nñ]o\s+(\d{4})\s*$/i.exec(s);
    if (yearOnly?.[1]) {
        const yearNum = parseInt(yearOnly[1], 10);
        if (yearNum >= 1000 && yearNum <= 9999) {
            return { d: 31, m: 12, y: yearNum };
        }
    }

    const normalizedLong = normalizeNaturalDateInput(s);
    const m = SPANISH_LONG_CALENDAR_DATE.exec(normalizedLong);
    if (!m) return null;

    const dayNum = parseInt(m[1]!, 10);
    const monthNum = monthNumFromSpanishName(m[2]!);
    const yearNum = parseInt(m[3]!, 10);
    if (!monthNum || dayNum < 1 || dayNum > 31 || yearNum < 1000 || yearNum > 9999) {
        return null;
    }
    return { d: dayNum, m: monthNum, y: yearNum };
}

/** Already expanded in the current dual shape — avoid wrapping twice */
function isAlreadyDualSpanishLegalDate(s: string): boolean {
    const t = s.trim();
    return (
        /^\S+(?:\s+\S+)*\s+\(\d{1,2}\)\s+de\s+[^(]+\s+del\s+/i.test(t) &&
        /\(\d{4}\)\s*$/.test(t)
    );
}

function buildSpanishLegalDateDualFromYMD(ymd: { d: number; m: number; y: number }): string | null {
    const { d: dayNum, m: monthNum, y: yearNum } = ymd;
    if (
        monthNum < 1 ||
        monthNum > 12 ||
        dayNum < 1 ||
        dayNum > 31 ||
        yearNum < 1000 ||
        yearNum > 9999
    ) {
        return null;
    }

    const dayWord =
        dayNum === 1 ? 'primero' : integerToSpanishWords(dayNum, 'plain');
    if (!dayWord) return null;

    const dayTitle = dayWord;
    const monthTitle = MONTH_NAMES_LOWER[monthNum - 1] ?? '';

    const yearWords = integerToSpanishWords(yearNum, 'plain');
    if (!yearWords) return null;
    const yearTitle = yearWords;

    return `${dayTitle} (${dayNum}) de ${monthTitle} del ${yearTitle} (${yearNum})`;
}

/**
 * Convert "d de mes de aaaa" → "Día (d) de Mes del Año en letras (aaaa)".
 * Returns null if `raw` is not a single Spanish calendar date in that shape.
 */
export function formatSpanishLegalDateDual(raw: string): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    if (isAlreadyDualSpanishLegalDate(s)) {
        const upgraded = parseStoredCalendarDateToYMD(s);
        if (upgraded) {
            return buildSpanishLegalDateDualFromYMD(upgraded);
        }
        return s;
    }

    const m = SPANISH_LONG_CALENDAR_DATE.exec(s);
    if (m) {
        const dayNum = parseInt(m[1]!, 10);
        const monthNum = monthNumFromSpanishName(m[2]!);
        const yearNum = parseInt(m[3]!, 10);
        if (monthNum && dayNum >= 1 && dayNum <= 31 && yearNum >= 1000 && yearNum <= 9999) {
            return buildSpanishLegalDateDualFromYMD({ d: dayNum, m: monthNum, y: yearNum });
        }
    }

    const ymd = parseStoredCalendarDateToYMD(s);
    if (ymd) {
        return buildSpanishLegalDateDualFromYMD(ymd);
    }

    return null;
}
