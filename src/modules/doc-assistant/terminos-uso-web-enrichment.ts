/**
 * Server-side coherence rules for "Términos de Uso Página Web".
 *
 * Rule 4 (notification method): the notification clause must be consistent with
 * whether the site actually has user accounts. If the site does NOT require
 * registration (`hasRegistration === "No"`), the notification method can never
 * reference "el correo electrónico proporcionado por el Usuario durante el
 * registro" — there is no registration step, so there is no such email on file.
 * In that case we fall back to a registration-agnostic channel.
 *
 * Sí/No flags: HBS branches (incl. §2.4 item d) and Art. 3/5.4) require exact
 * schema literals "Sí" | "No". Non-canonical values (e.g. "yes", "Si" missed by
 * older dual-#eq paths) left conditional text empty → orphan cleanup dropped d).
 */

const NO_REGISTRATION_FALLBACK = 'mediante publicación en el Sitio Web';

/** Schema Sí/No keys that gate HBS blocks for this template. */
const TERMINOS_SI_NO_KEYS = [
    'hasRegistration',
    'hasUserContent',
    'hasSpecificServices',
    'hasOptionalContactForms',
] as const;

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Map free-text / typos onto schema literals Sí | No.
 * Accent-insensitive ("Si" → Sí). Returns null if intent is unclear.
 */
export function normalizeTerminosUsoWebSiNo(raw: unknown): 'Sí' | 'No' | null {
    const f = fold(String(raw ?? ''));
    if (!f) return null;
    if (f === 'si' || f === 's' || f === 'yes' || f === 'y' || f === 'true' || f === '1') {
        return 'Sí';
    }
    if (f === 'no' || f === 'n' || f === 'false' || f === '0') {
        return 'No';
    }
    // Short affirmative / negative Spanish answers
    if (/^(si|sip|claro|correcto|afirmativo)\b/.test(f) && !/\bno\b/.test(f)) {
        return 'Sí';
    }
    if (/^(no|nop|negativo)\b/.test(f) && !/\bsi\b/.test(f)) {
        return 'No';
    }
    return null;
}

/** Coerce Terminos Sí/No flags to exact schema literals. */
export function normalizeTerminosUsoWebSiNoFlags(
    out: Record<string, string | number>,
): boolean {
    let changed = false;
    for (const key of TERMINOS_SI_NO_KEYS) {
        if (out[key] === undefined || out[key] === null) continue;
        const next = normalizeTerminosUsoWebSiNo(out[key]);
        if (next && String(out[key]) !== next) {
            out[key] = next;
            changed = true;
        }
    }
    return changed;
}

/** True when the phrase ties notifications to the registration email. */
function referencesRegistrationEmail(value: string): boolean {
    const f = fold(value);
    if (!f) return false;
    const mentionsEmail = f.includes('correo') || f.includes('email') || f.includes('e-mail');
    const mentionsRegistration = f.includes('registro') || f.includes('registrar') || f.includes('cuenta');
    return mentionsEmail && mentionsRegistration;
}

/**
 * Mutates `out` so the stored notificationMethod is coherent with hasRegistration.
 * Returns true if a value was changed.
 */
export function enforceTerminosUsoWebNotificationCoherence(
    out: Record<string, string | number>,
): boolean {
    // Prefer canonical flag if present after normalizeTerminosUsoWebSiNoFlags.
    const hasRegistration = fold(String(out.hasRegistration ?? ''));
    if (hasRegistration !== 'no') return false;

    const current = String(out.notificationMethod ?? '');
    if (current && referencesRegistrationEmail(current)) {
        out.notificationMethod = NO_REGISTRATION_FALLBACK;
        return true;
    }
    return false;
}

/** Leading phrases that duplicate the HBS prefix "El Sitio Web ofrece …". */
const SERVICE_DESCRIPTION_PREFIX =
    /^(el\s+sitio\s+web\s+ofrece|el\s+sitio\s+ofrece|sitio\s+web\s+ofrece|ofrece)\s+/i;

const SERVICE_FUNCTIONALITIES_PREFIX =
    /^(pueden\s+los\s+usuarios|pueden|poder|para)\s+/i;

/** Match "sitio web ofrece" with flexible whitespace (incl. &nbsp; / Unicode spaces). */
const SITIO_WEB_OFRECE_TOKEN = '(?:el[\\s\\u00a0\\u202f]+)?sitio[\\s\\u00a0\\u202f]+web[\\s\\u00a0\\u202f]+ofrece';

/**
 * Normalize HTML / Unicode spaces that break simple `\\s` matching after entity encoding.
 */
function normalizeHtmlSpaces(html: string): string {
    return html
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/&#x0*a0;/gi, ' ')
        .replace(/[\u00a0\u202f\u2007\u2060\ufeff]/g, ' ');
}

/**
 * Collapses a doubled template prefix that survived into rendered HTML, e.g.
 * "El Sitio Web ofrece el sitio web ofrece información…" → "El Sitio Web ofrece información…".
 * Matching is case-insensitive and tolerant of &nbsp; / Unicode spaces.
 */
export function scrubTerminosUsoWebDoubleOfreceHtml(html: string): string {
    if (!html) return html;
    let out = normalizeHtmlSpaces(html);
    // /i covers all casings; repeat until stable for triple+ prefixes.
    const doubled = new RegExp(
        `((?:${SITIO_WEB_OFRECE_TOKEN}))(?:[\\s\\u00a0\\u202f]+(?:${SITIO_WEB_OFRECE_TOKEN}))+([\\s\\u00a0\\u202f]+)`,
        'gi',
    );
    for (let i = 0; i < 5; i++) {
        const next = out.replace(doubled, 'El Sitio Web ofrece$2');
        if (next === out) break;
        out = next;
    }
    // Belt-and-braces: collapse any remaining adjacent duplicate token.
    const adjacent = new RegExp(
        `(${SITIO_WEB_OFRECE_TOKEN})([\\s\\u00a0\\u202f]+)(?=${SITIO_WEB_OFRECE_TOKEN})`,
        'gi',
    );
    for (let i = 0; i < 5; i++) {
        const next = out.replace(adjacent, '');
        if (next === out) break;
        out = next;
    }
    // Canonicalize the surviving template prefix casing.
    out = out.replace(
        new RegExp(`(${SITIO_WEB_OFRECE_TOKEN})`, 'i'),
        'El Sitio Web ofrece',
    );
    return out;
}

function stripLeadingPhraseLoop(raw: string, pattern: RegExp): string {
    let val = normalizeHtmlSpaces(raw).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 5; i++) {
        // Use replace (not test) so shared /i patterns never trip lastIndex.
        const stripped = val.replace(pattern, '').trim();
        if (stripped === val) break;
        let next = stripped;
        if (next) {
            next = next.charAt(0).toLowerCase() + next.slice(1);
        }
        if (next === val) break;
        val = next;
    }
    return val;
}

/**
 * "permitiendo a los Usuarios {{serviceFunctionalities}}" expects prose, not a
 * semicolon-joined checklist. Convert "a; B; C" → "a, b y c".
 */
export function normalizeTerminosUsoWebFunctionalitiesProse(raw: string): string {
    const normalized = normalizeHtmlSpaces(raw).replace(/\s+/g, ' ').trim();
    if (!normalized || !normalized.includes(';')) return normalized;
    const parts = normalized
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.replace(/[.,;:]+$/g, '').trim())
        .filter(Boolean)
        .map((p, i) => {
            if (!p) return p;
            // Keep first fragment as-is (already mid-sentence); lowercase later items.
            if (i === 0) return p.charAt(0).toLowerCase() + p.slice(1);
            return p.charAt(0).toLowerCase() + p.slice(1);
        });
    if (parts.length === 0) return normalized;
    if (parts.length === 1) return parts[0]!;
    if (parts.length === 2) return `${parts[0]} y ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/**
 * Render-time fragment for `El Sitio Web ofrece {{…}}` — always strip a leading
 * "el sitio web ofrece" so Handlebars cannot emit a doubled prefix even when
 * storage-time enrichment was skipped.
 */
export function formatTerminosUsoWebServiceDescriptionFragment(raw: unknown): string {
    const val = raw === null || raw === undefined ? '' : String(raw);
    return stripLeadingPhraseLoop(val, SERVICE_DESCRIPTION_PREFIX);
}

/**
 * Render-time fragment for `permitiendo a los Usuarios {{…}}` — strip leading
 * verbs and rewrite semicolon checklists into Spanish prose.
 */
export function formatTerminosUsoWebServiceFunctionalitiesFragment(raw: unknown): string {
    const val = raw === null || raw === undefined ? '' : String(raw);
    const stripped = stripLeadingPhraseLoop(val, SERVICE_FUNCTIONALITIES_PREFIX);
    return normalizeTerminosUsoWebFunctionalitiesProse(stripped);
}

/**
 * Normalizes serviceDescription and serviceFunctionalities by stripping redundant leading verbs/phrases
 * (e.g. "El sitio web ofrece...", "pueden...", "poder...") to maintain clean and grammatical integration
 * in the final document:
 * "...ofrece {{serviceDescription}}, permitiendo a los Usuarios {{serviceFunctionalities}}."
 *
 * Prefix strip runs in a loop so already-doubled stored values still collapse to a fragment.
 * Semicolon lists in serviceFunctionalities are rewritten as Spanish prose.
 */
export function enforceTerminosUsoWebServicesCoherence(
    out: Record<string, string | number>,
): boolean {
    let changed = false;

    if (typeof out.serviceDescription === 'string') {
        const val = out.serviceDescription.trim();
        const newVal = formatTerminosUsoWebServiceDescriptionFragment(val);
        if (newVal !== val) {
            out.serviceDescription = newVal;
            changed = true;
        }
    }

    if (typeof out.serviceFunctionalities === 'string') {
        const val = out.serviceFunctionalities.trim();
        const newVal = formatTerminosUsoWebServiceFunctionalitiesFragment(val);
        if (newVal !== val) {
            out.serviceFunctionalities = newVal;
            changed = true;
        }
    }

    return changed;
}
