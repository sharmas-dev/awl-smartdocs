/**
 * Collapse stray duplicate periods that appear right after a Spanish abbreviation
 * when a template adds its own sentence-ending period.
 *
 * The most common offender is the time abbreviation:
 *
 *   workSchedule = "8 a.m. a 5 p.m."
 *   template ... `<strong>Horario:</strong> {{workSchedule}}.</p>`
 *   rendered  ... "Horario: 8 a.m. a 5 p.m..</p>"   ← double dot
 *
 * The fix runs after Handlebars templating but before HTML serialization. It
 * targets only patterns of the form `<letter>.<letter>.<extra dot>` (a.m..,
 * p.m.., S.A.., etc.) so it does not affect ordinary punctuation, ellipsis
 * standalone (`...`), or pdfmake/HTML control characters.
 *
 * Examples (all single-line input → output):
 *   "8 a.m. a 5 p.m.."          → "8 a.m. a 5 p.m."
 *   "Reunión a las 9 a.m.."     → "Reunión a las 9 a.m."
 *   "...firma S.A.."            → "...firma S.A."
 *   "8 a.m. a 5 p.m., híbrido." → unchanged (no abbreviation+double-dot)
 *   "8 a.m. a 5 p.m. ..."       → unchanged (ellipsis is separated by space)
 *   "p.m..."                    → "p.m." (collapses any extra trailing dots)
 */

/**
 * Pattern explanation:
 *   (\.[a-záéíóúñ]\.)   capture an inner abbreviation period segment like ".m."
 *                       or ".A." (one letter sandwiched between two periods).
 *                       Case-insensitive via the `i` flag.
 *   \.+                 one or more EXTRA periods immediately after the abbrev.
 *
 * The capture intentionally requires the abbreviation period to be preceded by
 * another `.` — that way standalone words ending in a single period
 * (e.g. "etc..", "Sr..", "Dr..") are NOT affected, only multi-letter
 * abbreviations that already have their own dotted structure (a.m./p.m./S.A.)
 * which are the ones routinely doubled by sentence-ending periods.
 */
const ABBREV_TRAILING_DOT_RE = /(\.[a-záéíóúñ]\.)\.+/gi;

export function collapseAbbreviationDoubleDots(input: string): string {
    if (!input) return input;
    return input.replace(ABBREV_TRAILING_DOT_RE, '$1');
}

/**
 * Collapse stray duplicate sentence-ending periods (e.g. "alquiler.." → "alquiler.")
 * while preserving legitimate ellipses (`...` exactly) and abbreviations.
 *
 * This complements `collapseAbbreviationDoubleDots`: the abbreviation collapser
 * handles patterns like `.X..` (where `X` is a single letter, e.g. `p.m..`),
 * and this generic collapser handles plain `..` after any non-dot character
 * (e.g. `alquiler..`, `responsabilidad..`, `Dominicana..`).
 *
 * Behaviour matrix:
 *   "alquiler.."      → "alquiler."        (collapse two-dot tail)
 *   "Dominicana...."  → "Dominicana...."   (preserve 4+ dot runs untouched)
 *   "algo..."         → "algo..."          (preserve canonical ellipsis)
 *   "p.m.."           → "p.m."             (still collapsed; both regexes work)
 *   "ej.."            → "ej."              (collapse simple two-dot tail)
 *   "8 a.m. ..."      → "8 a.m. ..."       (ellipsis after space preserved)
 *
 * The lookbehind `(?<!\.)` and lookahead `(?!\.)` ensure we only touch
 * exactly two consecutive periods, never three or more (so ellipses survive).
 */
const GENERIC_DOUBLE_DOT_RE = /(?<!\.)\.\.(?!\.)/g;

export function collapseGenericDoubleDots(input: string): string {
    if (!input) return input;
    return input.replace(GENERIC_DOUBLE_DOT_RE, '.');
}
