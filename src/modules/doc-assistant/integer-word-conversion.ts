/**
 * Bidirectional conversion between non-monetary integers and Spanish words.
 *
 * Many of our PDF templates pair an integer with its Spanish word form for the
 * same value, e.g. "el día quince (15) del mes de marzo del año dos mil veintiséis (2026)",
 * "duración de un (1) año", "plazo de cinco (5) días", "veinticinco (25) años de residencia".
 *
 * In schemas these show up as either:
 *   - **Two paired keys** — one *Letters/Words* string + one *Numbers* string
 *     (e.g. signingDayLetters ↔ signingDayNumbers,
 *     contractDurationWords ↔ contractDurationNumbers,
 *     agreementTermYearsLetters ↔ agreementTermYearsNumbers).
 *   - **One combined key** that holds the rendered "<word> (<digit>)" string
 *     directly (e.g. weeklyHours = "cuarenta (40)", numberOfOriginals = "tres (3)").
 *
 * To avoid asking the user the same value twice (once en letras y otra vez en
 * cifras), the server accepts whichever form the user typed and derives the
 * missing partner / completes the combined string at storage time.
 *
 * NOTE: This module is independent from `peso-amount-conversion.ts` — that one
 * deals with monetary values that always carry the "pesos dominicanos con
 * NN/100" Dominican legal phrasing. Integer fields here never carry that
 * suffix.
 */

const UNITS: readonly string[] = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TEENS: readonly string[] = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TWENTIES: readonly string[] = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS_PREFIX: readonly string[] = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS_NAMES: readonly string[] = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function under100Words(n: number): string {
    if (n < 10) return UNITS[n]!;
    if (n < 20) return TEENS[n - 10]!;
    if (n < 30) return TWENTIES[n - 20]!;
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (ones === 0) return TENS_PREFIX[tens]!;
    return `${TENS_PREFIX[tens]} y ${UNITS[ones]}`;
}

function below1000Words(n: number): string {
    if (n === 0) return '';
    if (n < 100) return under100Words(n);
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    let head: string;
    if (hundreds === 1) {
        head = rest === 0 ? 'cien' : 'ciento';
    } else {
        head = HUNDREDS_NAMES[hundreds]!;
    }
    if (rest === 0) return head;
    return `${head} ${under100Words(rest)}`;
}

/**
 * Apocope of trailing "uno"/"veintiuno" before a masculine noun
 * (un año, un mes, veintiún días, treinta y un años…).
 *
 * Used only when the integer is followed by a masculine noun in the rendered
 * template — e.g. count fields like *contractDurationWords* (followed by año/mes)
 * or combined fields like *numberOfArbitrators* (followed by árbitros).
 */
function apocopateUnoMasculine(words: string): string {
    return words
        .replace(/(^|\s)veintiuno$/, '$1veintiún')
        .replace(/(^|\s)uno$/, '$1un');
}

function intToSpanishWordsBase(n: number): string {
    if (n === 0) return 'cero';
    if (n < 1000) return below1000Words(n);
    if (n < 1_000_000) {
        const thousands = Math.floor(n / 1000);
        const rest = n % 1000;
        const tWords = thousands === 1 ? 'mil' : `${apocopateUnoMasculine(below1000Words(thousands))} mil`;
        if (rest === 0) return tWords;
        return `${tWords} ${below1000Words(rest)}`;
    }
    if (n < 1_000_000_000_000) {
        const millions = Math.floor(n / 1_000_000);
        const rest = n % 1_000_000;
        const mWords = millions === 1 ? 'un millón' : `${apocopateUnoMasculine(below1000Words(millions))} millones`;
        if (rest === 0) return mWords;
        return `${mWords} ${intToSpanishWordsBase(rest)}`;
    }
    return '';
}

/**
 * Style used when the server has to **generate** a Spanish-word form from a
 * number provided by the user.
 *
 *   - 'plain'              — "uno", "veintiuno", "treinta y uno". Used for
 *                             standalone numerals (years 2001/2021, day-of-month
 *                             "el día veintiuno (21) del mes de…").
 *   - 'masculine-apocope'  — "un", "veintiún", "treinta y un". Used when the
 *                             number is immediately followed by a masculine noun
 *                             in the template ("un (1) año", "veintiún (21) días",
 *                             "treinta y un (31) ejemplares").
 *
 * If the user types the words themselves we keep their wording verbatim — we
 * only apply this style when WE produce the word form.
 */
export type IntegerWordStyle = 'plain' | 'masculine-apocope';

export function integerToSpanishWords(n: number, style: IntegerWordStyle = 'masculine-apocope'): string {
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return '';
    const base = intToSpanishWordsBase(n);
    if (!base) return '';
    return style === 'masculine-apocope' ? apocopateUnoMasculine(base) : base;
}

const NUMBER_TOKENS: Record<string, number> = {
    cero: 0,
    uno: 1, un: 1, una: 1,
    dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21,
    veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
    veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
    cien: 100, ciento: 100,
    doscientos: 200, doscientas: 200,
    trescientos: 300, trescientas: 300,
    cuatrocientos: 400, cuatrocientas: 400,
    quinientos: 500, quinientas: 500,
    seiscientos: 600, seiscientas: 600,
    setecientos: 700, setecientas: 700,
    ochocientos: 800, ochocientas: 800,
    novecientos: 900, novecientas: 900,
    mil: 1_000,
    millon: 1_000_000, millones: 1_000_000,
};

function stripDiacritics(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Common unit / filler words we silently drop while parsing — these often appear
 * next to a number in chat input ("cinco días", "un año", "30 días", "el día").
 * Listed unaccented because we strip diacritics before lookup.
 */
const UNIT_FILLER_WORDS: ReadonlySet<string> = new Set([
    'dia', 'dias', 'hora', 'horas', 'minuto', 'minutos',
    'semana', 'semanas', 'mes', 'meses', 'ano', 'anos',
    'el', 'la', 'los', 'las',
    'plazo', 'periodo', 'duracion',
    'aproximadamente', 'aprox', 'mas', 'menos', 'unos', 'unas',
]);

/**
 * Spanish integer in words → numeric value (best-effort).
 *
 * Returns null on empty input or unknown tokens. Accepts both accented and
 * unaccented spellings ("veintidós" / "veintidos"), apocopated forms ("un",
 * "veintiún"), feminine forms ("una", "veintiuna"), and tolerates trailing
 * unit words ("cinco días", "un año").
 *
 * If the input also contains a pure-digit token (e.g. "uno (1)" or "5 días"),
 * the digit is treated as the authoritative integer and returned directly.
 *
 * Examples:
 *   "veintiuno"           → 21
 *   "treinta"             → 30
 *   "dos mil veintiséis"  → 2026
 *   "un"                  → 1
 *   "cinco días"          → 5
 *   "uno (1)"             → 1
 */
export function parseSpanishIntegerWords(input: string): number | null {
    if (input === undefined || input === null) return null;
    const raw = String(input).trim();
    if (!raw) return null;

    let s = stripDiacritics(raw.toLowerCase())
        .replace(/[.,;:!?()]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return null;

    const tokens = s.split(/[\s\-]+/).filter((t) => t && t !== 'y');
    if (tokens.length === 0) return null;

    /**
     * If the user wrote a pure-digit alongside the words (e.g. "uno (1)" or
     * "5 días"), trust the digit — it's unambiguous and matches the schema's
     * Numbers side directly.
     */
    for (const tok of tokens) {
        if (/^\d+$/.test(tok)) {
            const n = parseInt(tok, 10);
            if (Number.isFinite(n) && n >= 0) return n;
        }
    }

    let total = 0;
    let acc = 0;
    let consumedAny = false;

    for (const tok of tokens) {
        if (UNIT_FILLER_WORDS.has(tok)) continue;
        const value = NUMBER_TOKENS[tok];
        if (value === undefined) return null;
        consumedAny = true;
        if (value === 1_000_000) {
            total += (acc === 0 ? 1 : acc) * 1_000_000;
            acc = 0;
        } else if (value === 1_000) {
            total += (acc === 0 ? 1 : acc) * 1_000;
            acc = 0;
        } else {
            acc += value;
        }
    }

    if (!consumedAny) return null;
    return total + acc;
}

/**
 * Pure digit string check — accepts "5", "30", "2026", but not "RD$5" or "5 días".
 * Tolerates leading/trailing whitespace and a single leading "+".
 */
function tryParseInteger(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') {
        return Number.isInteger(value) && value >= 0 ? value : null;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    let s = stripDiacritics(raw.toLowerCase())
        .replace(/[.,;:!?()]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = s.split(' ').filter((t) => t && !UNIT_FILLER_WORDS.has(t));
    if (tokens.length === 1 && /^\+?\d+$/.test(tokens[0])) {
        const n = parseInt(tokens[0], 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }
    if (/^\+?\d+$/.test(raw)) {
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
}

function isPresent(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string') return v.trim() !== '';
    return false;
}

/**
 * "Kind" controls the default Spanish-word style we generate when only the
 * numeric form was provided. Schema examples in the various contracts dictate
 * which style is idiomatic for each pair.
 *
 *   - 'count'  — apocopated masculine before a noun: "un año", "veintiún días",
 *                "treinta y un meses", "seis (6) meses". Used for durations,
 *                preavisos, plazos, ejemplares, edad, árbitros, etc.
 *   - 'day'    — plain numeric form: "el día veintiuno (21) del mes de…"
 *                (no apocope; standalone numeral in a date phrase).
 *   - 'year'   — plain form for the full year ("dos mil veintiséis").
 */
export type IntegerPairKind = 'count' | 'day' | 'year';

function styleForKind(kind: IntegerPairKind): IntegerWordStyle {
    return kind === 'count' ? 'masculine-apocope' : 'plain';
}

/** Pair of (word-form key, digit-form key) with the kind that picks a style. */
export interface IntegerPair {
    wordsKey: string;
    numericKey: string;
    kind: IntegerPairKind;
}

/**
 * All paired (Letters ↔ Numbers) integer fields across the schemas.
 *
 * Whenever you add a new schema with a *Letters/*Words + *Numbers pair for a
 * non-monetary integer, add it here so the server fills the missing side.
 */
const INTEGER_PAIRS: readonly IntegerPair[] = [
    /** Day of the signature / start / end / termination date — 1..31. */
    { wordsKey: 'signingDayLetters', numericKey: 'signingDayNumbers', kind: 'day' },
    /** Compraventa Vehículo uses *Date instead of *Day in the same role. */
    { wordsKey: 'signingDateLetters', numericKey: 'signingDateNumbers', kind: 'day' },
    { wordsKey: 'startDayLetters', numericKey: 'startDayNumbers', kind: 'day' },
    { wordsKey: 'endDayLetters', numericKey: 'endDayNumbers', kind: 'day' },
    { wordsKey: 'terminationDayLetters', numericKey: 'terminationDayNumbers', kind: 'day' },

    /** Year of the same set of dates — e.g. "dos mil veintiséis" / 2026. */
    { wordsKey: 'signingYearLetters', numericKey: 'signingYearNumbers', kind: 'year' },
    { wordsKey: 'startYearLetters', numericKey: 'startYearNumbers', kind: 'year' },
    { wordsKey: 'endYearLetters', numericKey: 'endYearNumbers', kind: 'year' },
    { wordsKey: 'terminationYearLetters', numericKey: 'terminationYearNumbers', kind: 'year' },
    { wordsKey: 'salaryYearLetters', numericKey: 'salaryYearNumbers', kind: 'year' },
    { wordsKey: 'vacationYearLetters', numericKey: 'vacationYearNumbers', kind: 'year' },

    /** Quantities that are followed by a masculine noun in the template. */
    { wordsKey: 'yearsOfResidenceLetters', numericKey: 'yearsOfResidenceNumbers', kind: 'count' },
    { wordsKey: 'agreementTermYearsLetters', numericKey: 'agreementTermYearsNumbers', kind: 'count' },
    { wordsKey: 'confidentialitySurvivalYearsLetters', numericKey: 'confidentialitySurvivalYearsNumbers', kind: 'count' },
    /** Acuerdo de Confidencialidad uses non-standard `noticePeriodInDays` for the words side. */
    { wordsKey: 'noticePeriodInDays', numericKey: 'noticePeriodInNumbers', kind: 'count' },
    { wordsKey: 'filingDeadlineDaysLetters', numericKey: 'filingDeadlineDaysNumbers', kind: 'count' },
    { wordsKey: 'contractDurationWords', numericKey: 'contractDurationNumbers', kind: 'count' },
    { wordsKey: 'terminationNoticeDaysWords', numericKey: 'terminationNoticeDaysNumbers', kind: 'count' },
    { wordsKey: 'protectionPeriodMonthsWords', numericKey: 'protectionPeriodMonthsNumbers', kind: 'count' },
    { wordsKey: 'confidentialityYearsWords', numericKey: 'confidentialityYearsNumbers', kind: 'count' },
    /**
     * Contrato de Trabajadora Doméstica — note the inverted naming
     * (NumberWords for words, Number for digits).
     */
    { wordsKey: 'contractDurationNumberWords', numericKey: 'contractDurationNumber', kind: 'count' },
    { wordsKey: 'minimumNoticeNumberWords', numericKey: 'minimumNoticeNumber', kind: 'count' },
];

const INTEGER_PAIR_BY_KEY: ReadonlyMap<string, IntegerPair> = (() => {
    const map = new Map<string, IntegerPair>();
    for (const p of INTEGER_PAIRS) {
        map.set(p.wordsKey.toLowerCase(), p);
        map.set(p.numericKey.toLowerCase(), p);
    }
    return map;
})();

export function findIntegerPairForKey(key: string): IntegerPair | undefined {
    return INTEGER_PAIR_BY_KEY.get(key.toLowerCase());
}

/**
 * Mutates `out` to fill any missing partner key in known integer pairs:
 *   - numeric provided, words missing  → derive Spanish words in the kind's style
 *   - words provided, numeric missing  → parse to int and store as decimal string
 *
 * When both keys are already non-empty, leaves them unchanged — the user (or a
 * prior turn) may have provided each side independently, and we should not
 * silently override either.
 *
 * Returns true when at least one key was added.
 */
export function fillMissingIntegerPartners(out: Record<string, string | number>): boolean {
    let changed = false;

    for (const pair of INTEGER_PAIRS) {
        const wordsVal = out[pair.wordsKey];
        const numericVal = out[pair.numericKey];
        const hasWords = isPresent(wordsVal);
        const hasNumeric = isPresent(numericVal);

        if (hasNumeric && !hasWords) {
            const n = tryParseInteger(numericVal);
            if (n !== null) {
                const words = integerToSpanishWords(n, styleForKind(pair.kind));
                if (words) {
                    out[pair.wordsKey] = words;
                    changed = true;
                }
            }
            continue;
        }

        if (hasWords && !hasNumeric) {
            const n = parseSpanishIntegerWords(String(wordsVal));
            if (n !== null) {
                out[pair.numericKey] = String(n);
                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Combined-form integer fields — single keys whose stored value renders as
 * "<word> (<digit>)" directly in the PDF (e.g. "cuarenta (40)", "tres (3)",
 * "un (1)").
 *
 * The user typically types just the number ("40") or just the word ("cuarenta")
 * or both ("cuarenta (40)"). We accept any of those and normalize to the
 * canonical "<word> (<digit>)" shape so the PDF shows both forms.
 */
const COMBINED_INTEGER_KEYS: ReadonlyMap<string, IntegerWordStyle> = new Map([
    /** Contrato de Trabajo / Teletrabajo */
    ['weeklyhours', 'plain'],
    ['notificationperiod', 'masculine-apocope'],
    ['numberoforiginals', 'masculine-apocope'],
    /** Contrato de Teletrabajo */
    ['noticeperiod', 'masculine-apocope'],
    /** Términos de Uso Página Web */
    ['minimumage', 'masculine-apocope'],
    ['negotiationperiod', 'masculine-apocope'],
    ['numberofarbitrators', 'masculine-apocope'],
]);

export function findCombinedIntegerStyleForKey(key: string): IntegerWordStyle | undefined {
    return COMBINED_INTEGER_KEYS.get(key.toLowerCase());
}

/**
 * Match patterns we accept for combined keys when the user types both forms:
 *   "cuarenta (40)"
 *   "cuarenta(40)"
 *   "cuarenta y cinco (45)"
 *   "veintiún (21)"
 *
 * Capture group 1 = word part (trimmed), group 2 = digit part.
 */
const COMBINED_PATTERN = /^([^()0-9]+?)\s*\(\s*(\d+)\s*\)\s*$/;

function stripUnitFillerWords(str: string): string {
    const tokens = str.split(/(\s+)/);
    const cleanTokens = tokens.map((tok) => {
        const normalized = stripDiacritics(tok.toLowerCase()).trim();
        if (UNIT_FILLER_WORDS.has(normalized)) {
            return '';
        }
        return tok;
    });
    return cleanTokens.join('').replace(/\s+/g, ' ').trim();
}

export function normalizeCombinedIntegerValue(value: string, style: IntegerWordStyle): string {
    const cleaned = stripUnitFillerWords(value);
    const trimmed = cleaned.trim();
    if (!trimmed) return value;

    const combined = trimmed.match(COMBINED_PATTERN);
    if (combined) {
        /**
         * Already in "<word> (<digit>)" shape — trust the user's wording but
         * collapse internal whitespace.
         */
        const word = combined[1]!.trim().replace(/\s+/g, ' ');
        const digit = combined[2]!;
        return `${word} (${digit})`;
    }

    /** Pure-digit input → derive the word form in the kind's style. */
    const asInt = tryParseInteger(trimmed);
    if (asInt !== null) {
        const words = integerToSpanishWords(asInt, style);
        return words ? `${words} (${asInt})` : value;
    }

    /** Pure-words input → parse to a number and append the digit. */
    const fromWords = parseSpanishIntegerWords(trimmed);
    if (fromWords !== null) {
        const parenthesizedRegex = new RegExp(`\\(\\s*${fromWords}\\s*\\)`);
        if (parenthesizedRegex.test(trimmed)) {
            return trimmed.replace(/\s+/g, ' ');
        }
        return `${trimmed.replace(/\s+/g, ' ')} (${fromWords})`;
    }

    return value;
}

/**
 * Mutates `out` by normalizing every known combined-integer key into the
 * canonical "<word> (<digit>)" shape. Unknown keys are left alone.
 *
 * Returns true when at least one key was rewritten.
 */
export function normalizeCombinedIntegerKeys(out: Record<string, string | number>): boolean {
    let changed = false;
    for (const key of Object.keys(out)) {
        const style = findCombinedIntegerStyleForKey(key);
        if (!style) continue;
        const raw = out[key];
        const str = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? raw : '';
        if (!str) continue;
        const normalized = normalizeCombinedIntegerValue(str, style);
        if (normalized !== str) {
            out[key] = normalized;
            changed = true;
        }
    }
    return changed;
}
