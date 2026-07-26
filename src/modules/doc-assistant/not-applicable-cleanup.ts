/**
 * Globally suppress "N/A" / "NA" / "no aplica"-style answers from reaching the
 * deliverable.
 *
 * Strategy:
 *   1. STORAGE-TIME — when a user submits an answer that is *exactly* a
 *      not-applicable phrase (whole-value match, never a substring), we blank
 *      the field out in `normalizeFieldValuesForStorage`. This way the AI's
 *      conversational state sees the empty value and the template's variable
 *      interpolation expands to `""`.
 *   2. RENDER-TIME — Handlebars templates wrap optional values in fixed
 *      enumerations such as `<strong>a)</strong> {{benefit1}}; <strong>b)</strong> {{benefit2}}; …`,
 *      so a blank value would leave behind orphan markers like
 *      `<strong>b)</strong> ; <strong>c)</strong> …`. We post-process the
 *      rendered HTML to remove those orphans so the deliverable reads cleanly.
 *
 * The detection deliberately matches *only* whole-value strings so legitimate
 * sentences that happen to contain "N/A" inside a longer paragraph (rare but
 * possible) are never corrupted.
 */

const NOT_APPLICABLE_FORMS: readonly string[] = [
    'n/a',
    'n/a.',
    'n.a.',
    'n.a',
    'na',
    'na.',
    'n / a',
    'no aplica',
    'no aplica.',
    'no aplicable',
    'no aplicable.',
    'no disponible',
    'not applicable',
    'not applicable.',
    'none',
    'no',
    '-',
    '--',
    '---',
    '----',
    'ninguno',
    'ninguna',
    'nada',
    'dejar vacio',
    '0',
    'cero',
];

const NOT_APPLICABLE_SET: ReadonlySet<string> = new Set(NOT_APPLICABLE_FORMS);

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** Whole-value check: returns true ONLY if the entire trimmed value is N/A-like. */
export function isNotApplicableValue(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    let valStr = '';
    if (typeof value === 'number') {
        valStr = String(value);
    } else if (typeof value === 'string') {
        valStr = value;
    } else {
        return false;
    }
    const folded = fold(valStr);
    if (!folded) return false;
    if (NOT_APPLICABLE_SET.has(folded)) return true;

    // Matches any phrase starting with "no aplica", "no se aplica", "no aplicable", "no aplica ningun..."
    if (/^(?:no\s+aplica|no\s+se\s+aplica|no\s+aplicable|ningun[oa]\s+periodo|confirmo\s+que\s+no\s+aplica|no\s+aplica\s+ningun)/i.test(folded)) {
        return true;
    }

    return false;
}

/**
 * Mutates `out` to clear any field whose value is a whole-value N/A phrase.
 * Returns true if at least one field was blanked.
 *
 * Choice fields (Sí/No/etc.) and required dropdowns are left alone — their
 * canonical values are matched exactly by the schema; a literal "N/A" there
 * would already fail validation upstream.
 */
export function blankNotApplicableValues(
    out: Record<string, string | number>,
    choiceKeys?: Set<string> | string[],
): boolean {
    let changed = false;
    const skipSet = choiceKeys ? new Set(choiceKeys) : new Set<string>();
    for (const key of Object.keys(out)) {
        if (skipSet.has(key)) continue;
        const v = out[key];
        if (isNotApplicableValue(v)) {
            out[key] = '';
            changed = true;
        }
    }
    return changed;
}

/**
 * Remove orphan enumerated markers that appear when an optional value rendered
 * to an empty string.
 *
 * Templates use patterns like:
 *
 *   los siguientes beneficios: <strong>a)</strong> {{benefit1}}; <strong>b)</strong> {{benefit2}}; <strong>c)</strong> {{benefit3}}; <strong>d)</strong> {{benefit4}}.
 *
 * If `benefit2` is blank we want to drop `<strong>b)</strong> ;` entirely
 * (keeping the surrounding items), and if the *last* item is blank we drop
 * `<strong>e)</strong>` while keeping the trailing period.
 *
 * Also collapses any visible "N/A" / "n/a" / "no aplica" text that may have
 * slipped past the storage-time blanking (defense in depth) so the deliverable
 * is guaranteed to never show those tokens.
 */
const EMPTY_ENUM_BEFORE_SEMI = /<strong>\s*[a-z]\)\s*<\/strong>\s*(?:&nbsp;|\s)*;\s*/gi;
const EMPTY_ENUM_BEFORE_PERIOD = /<strong>\s*[a-z]\)\s*<\/strong>\s*(?:&nbsp;|\s)*(?=\.)/gi;
const EMPTY_ENUM_BEFORE_CLOSE_TAG = /<strong>\s*[a-z]\)\s*<\/strong>\s*(?:&nbsp;|\s)*(?=<\/[a-z]+>)/gi;
/**
 * Empty letter marker followed by fixed template continuation (not item text),
 * e.g. Teletrabajo `d) para la prestación del servicio…`.
 */
const EMPTY_ENUM_BEFORE_TEMPLATE_CONTINUATION =
    /<strong>\s*[a-z]\)\s*<\/strong>\s*(?:&nbsp;|\s)*(?=(?:para\s+la\s+prestaci[oó]n|ser[aá]n\s+asumidos|en\s+caso\s+de))/gi;
const DOUBLE_SEMICOLON = /;\s*;\s*/g;
const DOUBLE_COMMA = /,\s*,\s*/g;
const EMPTY_INLINE_TAG = /<(strong|em|b|i|u)>\s*<\/\1>/gi;
/**
 * After removing the last enumeration's empty marker (`<strong>e)</strong> `)
 * we may be left with `; .` from the preceding "; <strong>e)</strong> ." —
 * collapse that orphan separator into the sentence-ending period.
 */
const SEMI_BEFORE_PERIOD = /;\s*(?=\.)/g;
/** Orphan semicolon left before template continuation after dropping empty cost letters. */
const SEMI_BEFORE_TEMPLATE_CONTINUATION =
    /;\s*(?=(?:para\s+la\s+prestaci[oó]n|ser[aá]n\s+asumidos|en\s+caso\s+de))/gi;
/**
 * Lookbehind keeps the preceding boundary character (whitespace, `>`, etc.)
 * intact while consuming the N/A token plus one trailing whitespace, so
 * scrubbing "N/A " never leaves a double space in the surrounding sentence.
 */
const VISIBLE_NA_TOKEN = /(?<=^|[\s>([{,;:])(?:N\/A|n\/a|N\.A\.|n\.a\.|N\/D|n\/d|No aplica|no aplica|No aplicable|no aplicable)(?=[\s.,;:)\]}<]|$)\s?/g;
/**
 * Collapse multiple consecutive spaces inside HTML text content (between `>`
 * and `<`) to a single space without touching attribute values inside tags.
 */
const DOUBLE_SPACE_IN_TEXT = /(>[^<]*?) {2,}([^<]*?<)/g;

/** After dropping empty slots, renumber remaining <strong>a)</strong>… sequentially. */
export function renumberStrongLetterEnumerations(html: string): string {
    if (!html) return html;
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let n = 0;
    return html.replace(/<strong>\s*[a-z]\)\s*<\/strong>/gi, () => {
        const letter = letters[n++] ?? 'z';
        return `<strong>${letter})</strong>`;
    });
}

export function stripOrphanEnumerationsFromHtml(html: string): string {
    if (!html) return html;
    let out = html;

    // Iterate to catch chained empties like "b) ; c) ; d)".
    for (let i = 0; i < 3; i++) {
        const before = out;
        out = out
            .replace(EMPTY_ENUM_BEFORE_SEMI, '')
            .replace(EMPTY_ENUM_BEFORE_PERIOD, '')
            .replace(EMPTY_ENUM_BEFORE_CLOSE_TAG, '')
            .replace(EMPTY_ENUM_BEFORE_TEMPLATE_CONTINUATION, '')
            .replace(DOUBLE_SEMICOLON, '; ')
            .replace(DOUBLE_COMMA, ', ')
            .replace(SEMI_BEFORE_PERIOD, '')
            .replace(SEMI_BEFORE_TEMPLATE_CONTINUATION, ' ')
            .replace(EMPTY_INLINE_TAG, '');
        if (out === before) break;
    }

    out = renumberStrongLetterEnumerations(out);

    /**
     * Belt-and-braces: scrub any visible N/A tokens that survived storage-time
     * normalization (e.g. when present as part of a longer manually-edited
     * string in a template).
     */
    out = out.replace(VISIBLE_NA_TOKEN, '');

    /** Collapse any double-spaces left behind in visible text. */
    for (let i = 0; i < 2; i++) {
        const before = out;
        out = out.replace(DOUBLE_SPACE_IN_TEXT, '$1 $2');
        if (out === before) break;
    }

    return out;
}
