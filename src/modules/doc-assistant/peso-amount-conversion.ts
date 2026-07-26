/**
 * Bidirectional conversion between Dominican peso amounts in **numbers** and in **Spanish words**.
 *
 * Templates pair these as two schema keys (e.g. salaryInWords + salaryAmountWithCurrency).
 * To avoid asking the user the same amount twice, the server auto-derives the missing
 * partner key from whichever form was submitted, in canonical Dominican legal style:
 *
 *   25000          → "veinticinco mil pesos dominicanos con 00/100"
 *   25000.5        → "veinticinco mil pesos dominicanos con 50/100"
 *   1000000        → "un millón de pesos dominicanos con 00/100"
 *   "veinticinco mil pesos dominicanos con 00/100" → 25000
 *
 * Numeric partner key formatting follows the schema's documented form
 * (RD$ prefixed for *amountWithCurrency keys, plain for *AmountInNumbers keys).
 */

import { parsePesoAmountToNumber } from './currency-amount-format.js';

const UNITS: readonly string[] = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TEENS: readonly string[] = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const TWENTIES: readonly string[] = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS_PREFIX: readonly string[] = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS_NAMES: readonly string[] = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function under100Words(n: number): string {
    if (n < 10) return UNITS[n];
    if (n < 20) return TEENS[n - 10];
    if (n < 30) return TWENTIES[n - 20];
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (ones === 0) return TENS_PREFIX[tens];
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
        head = HUNDREDS_NAMES[hundreds];
    }
    if (rest === 0) return head;
    return `${head} ${under100Words(rest)}`;
}

/** Apocope of trailing "uno"/"veintiuno" before a noun (peso/mil/millón). */
function apocopateUno(words: string): string {
    return words
        .replace(/(^|\s)veintiuno$/, '$1veintiún')
        .replace(/(^|\s)uno$/, '$1un');
}

function intToSpanishWords(n: number): string {
    if (n === 0) return 'cero';
    if (n < 1000) return below1000Words(n);
    if (n < 1_000_000) {
        const thousands = Math.floor(n / 1000);
        const rest = n % 1000;
        const tWords = thousands === 1 ? 'mil' : `${apocopateUno(below1000Words(thousands))} mil`;
        if (rest === 0) return tWords;
        return `${tWords} ${below1000Words(rest)}`;
    }
    if (n < 1_000_000_000_000) {
        const millions = Math.floor(n / 1_000_000);
        const rest = n % 1_000_000;
        const mWords = millions === 1 ? 'un millón' : `${apocopateUno(below1000Words(millions))} millones`;
        if (rest === 0) return mWords;
        return `${mWords} ${intToSpanishWords(rest)}`;
    }
    return '';
}

/**
 * Numeric peso value → canonical Dominican legal phrase.
 *
 * Examples:
 *   25000     → "veinticinco mil pesos dominicanos con 00/100"
 *   25000.50  → "veinticinco mil pesos dominicanos con 50/100"
 *   1         → "un peso dominicano con 00/100"
 *   1_000_000 → "un millón de pesos dominicanos con 00/100"
 */
export function numberToDominicanPesoWords(amount: number): string {
    if (!Number.isFinite(amount) || amount < 0) return '';

    const integerPart = Math.floor(amount + 1e-9);
    const cents = Math.max(0, Math.min(99, Math.round((amount - integerPart) * 100)));
    const centsStr = String(cents).padStart(2, '0');

    if (integerPart === 0) {
        return `cero pesos dominicanos con ${centsStr}/100`;
    }

    const base = intToSpanishWords(integerPart);
    if (!base) return '';

    const head = apocopateUno(base);
    const noun = integerPart === 1 ? 'peso dominicano' : 'pesos dominicanos';
    /** "un millón de pesos" / "dos millones de pesos" — only when nothing follows the millón segment. */
    const linker = /\bmill(?:ón|ones)$/.test(head) ? `de ${noun}` : noun;
    return `${head} ${linker} con ${centsStr}/100`;
}

/** Lowercase, ASCII-folded Spanish number-word lookup (accepts both "veintidós" and "veintidos"). */
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
 * Spanish peso amount in words → numeric value (best-effort).
 *
 * Returns null when the input is empty, contains no recognizable number words,
 * or contains an unknown token after currency stripping.
 *
 * Accepts the canonical Dominican legal phrase as well as common variants:
 *   "veinticinco mil pesos dominicanos con 50/100"  → 25000.50
 *   "Veinticinco Mil Pesos Dominicanos"             → 25000
 *   "veinticinco mil"                                → 25000
 *   "un millón de pesos dominicanos con 00/100"     → 1000000
 */
export function parseSpanishPesoWordsToNumber(input: string): number | null {
    if (!input) return null;
    let s = stripDiacritics(String(input).toLowerCase());
    if (!s.trim()) return null;

    let cents = 0;
    const centsMatch = s.match(/\bcon\s+(\d{1,2})\s*\/\s*100\b/);
    if (centsMatch) {
        cents = Math.min(99, Math.max(0, parseInt(centsMatch[1]!, 10)));
        s = s.replace(centsMatch[0], ' ');
    }

    s = s
        .replace(/\b(de\s+pesos?|pesos?|dominicanos?|dominicano|dominicanas?|m\/?n)\b/g, ' ')
        .replace(/[.,;:!?()]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return cents > 0 ? cents / 100 : null;

    const tokens = s.split(/[\s\-]+/).filter((t) => t && t !== 'y');
    if (tokens.length === 0) return cents > 0 ? cents / 100 : null;

    let total = 0;
    let acc = 0;
    let consumedAny = false;

    for (const tok of tokens) {
        const value = NUMBER_TOKENS[tok];
        if (value === undefined) {
            return null;
        }
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
    total += acc;
    return total + cents / 100;
}

/**
 * Pairings of (words key, numeric key) that should auto-derive each other on storage.
 * Numeric format follows the schema's documented form:
 *   - 'with-rd-prefix'  → "RD$25,000.00" (keys ending in *amountWithCurrency)
 *   - 'plain'           → "25,000.00"    (Recibo Trabajadora Doméstica *AmountInNumbers, "sin RD$")
 */
export interface AmountPair {
    wordsKey: string;
    numericKey: string;
    numericFormat: 'with-rd-prefix' | 'plain';
    /** When true, always emit two decimal places (e.g. RD$50,000.00) to match "con 00/100" in the words form. */
    forceTwoDecimalDisplay?: boolean;
}

/**
 * Every template that defines a matching *InWords + *WithCurrency (or *InNumbers) pair in
 * `src/templates/schemas/*.json` must have an entry here — otherwise ask-once / auto-fill will not run.
 *
 * Covered templates (by pair):
 * - salaryInWords ↔ salaryAmountWithCurrency — Contrato de Trabajo, Teletrabajo, Trabajadora Doméstica
 * - totalAmountInWords ↔ totalAmountWithCurrency — Recibo de Descargo Laboral, Compraventa Vehículo
 * - monthlyAmountInWords ↔ monthlyAmountWithCurrency — Teletrabajo (cobertura de costos)
 * - referenceAmountInWords ↔ referenceAmountWithCurrency — Contrato de Representación Agente de Bienes Raíces
 * - salaryAmountInWords ↔ salaryAmountInNumbers — Recibo de Descargo Trabajadora Doméstica
 * - navidadAmountInWords ↔ navidadAmountInNumbers — Recibo de Descargo Trabajadora Doméstica
 *
 * Single-field amounts (no partner in schema) are intentionally omitted — e.g. Propuesta salaryMonthlyAmount,
 * Recibo breakdown lines, penaltyAmountWithCurrency.
 */
const AMOUNT_PAIRS: readonly AmountPair[] = [
    { wordsKey: 'salaryInWords', numericKey: 'salaryAmountWithCurrency', numericFormat: 'with-rd-prefix' },
    {
        wordsKey: 'totalAmountInWords',
        numericKey: 'totalAmountWithCurrency',
        numericFormat: 'with-rd-prefix',
        forceTwoDecimalDisplay: true,
    },
    { wordsKey: 'monthlyAmountInWords', numericKey: 'monthlyAmountWithCurrency', numericFormat: 'with-rd-prefix' },
    { wordsKey: 'referenceAmountInWords', numericKey: 'referenceAmountWithCurrency', numericFormat: 'with-rd-prefix' },
    { wordsKey: 'salaryAmountInWords', numericKey: 'salaryAmountInNumbers', numericFormat: 'plain' },
    { wordsKey: 'navidadAmountInWords', numericKey: 'navidadAmountInNumbers', numericFormat: 'plain' },
];

const PAIR_BY_KEY: ReadonlyMap<string, AmountPair> = (() => {
    const map = new Map<string, AmountPair>();
    for (const p of AMOUNT_PAIRS) {
        map.set(p.wordsKey.toLowerCase(), p);
        map.set(p.numericKey.toLowerCase(), p);
    }
    return map;
})();

export function findAmountPairForKey(key: string): AmountPair | undefined {
    return PAIR_BY_KEY.get(key.toLowerCase());
}

/**
 * Default: match `formatDominicanPesoAmount` for non-Recibo-total pairs (whole pesos without .00).
 * `forceTwoDecimalDisplay` (total amount pair) always uses two decimals for legal alignment with
 * "con 00/100" in words.
 */
function formatNumericPartner(amount: number, withRdPrefix: boolean, forceTwoDecimalDisplay = false): string {
    const body = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return withRdPrefix ? `RD$${body}` : body;
}

function isPresent(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string') return v.trim() !== '';
    return false;
}

/**
 * Mutates `out` to fill any missing partner key in known pairs:
 *   - numeric provided, words missing  → derive canonical "<words> pesos dominicanos con NN/100"
 *   - words provided, numeric missing  → derive "RD$25,000.00" or "25,000.00" per pair config,
 *                                         AND canonicalize the words form (so "veinticinco mil"
 *                                         with no "pesos" becomes the full Dominican legal phrase
 *                                         that the PDF expects)
 * Returns true when at least one key was added or rewritten.
 *
 * When both keys are already non-empty, leaves them unchanged — the caller may have
 * provided each independently and we should not silently override either side.
 */
export function fillMissingAmountPartners(out: Record<string, string | number>): boolean {
    let changed = false;

    for (const pair of AMOUNT_PAIRS) {
        const wordsVal = out[pair.wordsKey];
        const numericVal = out[pair.numericKey];
        const hasWords = isPresent(wordsVal);
        const hasNumeric = isPresent(numericVal);

        if (hasNumeric && !hasWords) {
            const n = parsePesoAmountToNumber(numericVal as string | number);
            if (n !== null) {
                out[pair.wordsKey] = numberToDominicanPesoWords(n);
                changed = true;
            }
            continue;
        }

        if (hasWords && !hasNumeric) {
            const n = parseSpanishPesoWordsToNumber(String(wordsVal));
            if (n !== null) {
                out[pair.numericKey] = formatNumericPartner(
                    n,
                    pair.numericFormat === 'with-rd-prefix',
                    pair.forceTwoDecimalDisplay === true,
                );
                const canonicalWords = numberToDominicanPesoWords(n);
                if (canonicalWords && canonicalWords !== wordsVal) {
                    out[pair.wordsKey] = canonicalWords;
                }
                changed = true;
            }
        }
    }

    return changed;
}
