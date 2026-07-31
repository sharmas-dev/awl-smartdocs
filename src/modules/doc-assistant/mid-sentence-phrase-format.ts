import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Grammar normalization for "phrase-style" text variables that the template
 * interpolates **mid-sentence** with surrounding punctuation it provides
 * itself.
 *
 * Example template line:
 *   "...en virtud de {{terminationCauseDetail}}."
 *
 * If the user types a sentence-cased phrase ending with a period, the
 * rendered output reads ungrammatical:
 *
 *   "...en virtud de Mal comportamiento, daños... del contrato de alquiler.."
 *
 * A correct value should be:
 *   "mal comportamiento, daños... del contrato de alquiler"
 *
 * That is:
 *   - first letter lowercased (the surrounding sentence already opened),
 *   - no trailing period / comma / semicolon (the template will add its own).
 *
 * This normalizer is deliberately limited to fields explicitly designed as
 * mid-sentence phrases in the schemas — it does NOT touch names, addresses,
 * or full-sentence fields, because those have legitimate capital starts.
 */

const HELPER_KEYWORDS: ReadonlySet<string> = new Set([
    'eq', 'ne', 'lt', 'gt', 'le', 'ge', 'and', 'or', 'not', 'each', 'if', 'unless',
    'with', 'as', 'this', 'first', 'last', 'index', 'key', 'eachSplit', 'letter', 'length'
]);

function isExcludedFromMidSentenceNormalization(key: string): boolean {
    const k = key.toLowerCase();
    return (
        k.includes('name') ||
        k.includes('address') ||
        k.includes('phone') ||
        k.includes('email') ||
        k.includes('date') ||
        k.includes('rnc') ||
        k.includes('rnl') ||
        k.includes('rm') ||
        k.includes('idnumber') ||
        k.includes('marital') ||
        k.includes('city') ||
        k.includes('province') ||
        k.includes('country') ||
        k.includes('nationality') ||
        k.includes('gender') ||
        k.includes('salutation') ||
        k.includes('hours') ||
        k.includes('amount') ||
        k.includes('currency') ||
        k.includes('percent') ||
        k.includes('number') ||
        k.includes('words') ||
        k.includes('registry') ||
        // Job titles and "; "-joined lists keep a capital start (standalone headings / <li> items).
        k.includes('title') ||
        k.includes('list')
    );
}

const ORIGINAL_MID_SENTENCE_PHRASE_KEYS: ReadonlySet<string> = new Set([
    'terminationcause',
    'terminationcausedetail',
    'inspectionresulttext',
    'depositactiontext',
    'depositreturnmethodtext',
    'attachmentreferencetext',
    'sendercapacity',
    'specificduties',
    'overtimepolicy',
    'paymentschedule',
    'paymentfrequency',
    'servicedescription',
    'servicefunctionalities',
    'contactmethod',
    'commerciallicensescope',
]);

let detectedMidSentenceKeys: Set<string> | null = null;

function getMidSentenceKeys(): Set<string> {
    if (detectedMidSentenceKeys) return detectedMidSentenceKeys;

    detectedMidSentenceKeys = new Set<string>();
    const hbsDir = join(process.cwd(), 'src/templates/hbs');
    if (!existsSync(hbsDir)) {
        return detectedMidSentenceKeys;
    }

    try {
        const files = readdirSync(hbsDir).filter((f) => f.endsWith('.hbs'));
        for (const file of files) {
            const content = readFileSync(join(hbsDir, file), 'utf8');

            const regex = /\{\{\{?([^{}]+)\}\}\}?/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                const rawExpr = match[1]!;
                const matchIndex = match.index;

                const tokens = rawExpr.split(/[\s()'".,;:#/!|]+/);
                const varCandidates = tokens
                    .map((t) => t.trim())
                    .filter((t) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(t) && !HELPER_KEYWORDS.has(t));

                if (varCandidates.length === 0) continue;

                const precedingRaw = content.slice(0, matchIndex);

                const precedingClean = precedingRaw
                    .replace(/<[^>]*>/g, '')
                    .replace(/\{\{[^}]*\}\}/g, '')
                    .trimEnd();

                const lastChar = precedingClean.slice(-1);

                const isMidSentence = /[a-zñáéíóúü,;\(]$/i.test(lastChar) && lastChar === lastChar.toLowerCase() && lastChar !== lastChar.toUpperCase();
                const isMidSentencePunct = /[,;\(]$/.test(lastChar);

                if (isMidSentence || isMidSentencePunct) {
                    for (const v of varCandidates) {
                        const normalizedKey = v.toLowerCase();
                        if (!isExcludedFromMidSentenceNormalization(normalizedKey)) {
                            detectedMidSentenceKeys.add(normalizedKey);
                        }
                    }
                }
            }
        }
    } catch {
        // Fallback to empty on error
    }

    return detectedMidSentenceKeys;
}

export function isMidSentencePhraseKey(key: string): boolean {
    const k = key.toLowerCase();
    if (isExcludedFromMidSentenceNormalization(k)) return false;
    if (ORIGINAL_MID_SENTENCE_PHRASE_KEYS.has(k)) return true;
    return getMidSentenceKeys().has(k);
}

/** Lowercase the very first alphabetic code point, keep the rest unchanged. */
function lowercaseFirstAlpha(s: string): string {
    if (!s) return s;
    /** Find first letter (skips opening quotes/parens/whitespace). */
    const m = s.match(/^([^\p{L}]*)(\p{L})(.*)$/su);
    if (!m) return s;
    const [, lead, first, rest] = m;
    return `${lead}${first!.toLowerCase()}${rest}`;
}

/**
 * Strip a trailing period / comma / semicolon / colon (and any whitespace
 * between) so the template's own punctuation is the only one shown.
 *
 * Multiple trailing periods (e.g. "alquiler..") collapse to none, so the
 * template's `.` produces a single sentence-end period.
 */
function stripTrailingSentencePunct(s: string): string {
    return s.replace(/[\s.,;:]+$/g, '').trimEnd();
}

/**
 * Detect a likely proper-noun first word (e.g. "Juan Pérez", "República
 * Dominicana") so we don't accidentally lowercase a person/place.
 *
 * Heuristic: first alphabetic word is Capitalized AND is followed by another
 * Capitalized word (suggesting a multi-word proper name), OR is an all-caps
 * acronym (≥2 letters).
 */
function startsWithProperNoun(s: string): boolean {
    const m = s.match(/^\s*([\p{Lu}][\p{L}'’-]*)(\s+([\p{Lu}][\p{L}'’-]*))?/u);
    if (!m) return false;
    const first = m[1]!;
    const second = m[3];
    if (first.length >= 2 && first === first.toUpperCase() && /[\p{Lu}]/u.test(first)) {
        return true;
    }
    if (second && /^\p{Lu}/u.test(second)) {
        return true;
    }
    return false;
}

/**
 * Final phrase-form normalization for a single value.
 *
 *   "Mal comportamiento, daños graves... contrato de alquiler."
 *     → "mal comportamiento, daños graves... contrato de alquiler"
 *
 *   "Devolver íntegramente."   → "devolver íntegramente"
 *   "Mediante transferencia."  → "mediante transferencia"
 *   "Juan Pérez como testigo." → "Juan Pérez como testigo"   (proper noun preserved)
 *   "RNC entregado."           → "RNC entregado"             (acronym preserved)
 */
export function normalizeMidSentencePhrase(raw: string): string {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) return raw;

    let s = stripTrailingSentencePunct(trimmed);
    if (!s) return raw;

    if (!startsWithProperNoun(s)) {
        s = lowercaseFirstAlpha(s);
    }

    return s;
}
