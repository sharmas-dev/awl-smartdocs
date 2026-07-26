/**
 * Canonical gender values for Propuesta / Notificación salutations (Masculino | Femenino).
 */

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

const FEMININE_GIVEN_NAMES = new Set(
    [
        'maria',
        'maría',
        'ana',
        'julia',
        'julieta',
        'daniela',
        'patricia',
        'carmen',
        'rosa',
        'lucia',
        'lucía',
        'laura',
        'claudia',
        'andrea',
        'sandra',
        'monica',
        'mónica',
        'teresa',
        'gloria',
        'margarita',
        'beatriz',
        'elena',
        'isabel',
        'paula',
        'natalia',
        'veronica',
        'verónica',
        'silvia',
        'adriana',
        'raquel',
        'miriam',
        'lourdes',
        'yolanda',
        'frayni',
    ].map((n) => foldAscii(n)),
);

const MASCULINE_A_EXCLUSIONS = new Set(
    [
        'jose',
        'josé',
        'jesus',
        'jesús',
        'josue',
        'josué',
        'nikita',
        'garcia',
        'garcía',
        'sharma',
        'bautista',
        'mejia',
        'mejía',
        'pena',
        'peña',
        'sosa',
        'mota',
        'mendoza',
        'rivera',
        'acosta',
        'tejeda',
        'guerra',
        'silva',
        'vega',
        'plaza',
        'peralta',
        'sena',
        'moya',
        'reyna',
        'ledezma',
        'ortega',
        'avila',
        'ávila',
        'tapia',
        'morla',
        'beltre',
        'beltré',
    ].map((n) => foldAscii(n)),
);

/** Infer gender for a single (non-joint) name part. */
export function inferGenderFromSingleName(fullName: string): 'Mujer' | 'Hombre' {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Hombre';
    const first = foldAscii(parts[0] ?? '');
    if (FEMININE_GIVEN_NAMES.has(first)) return 'Mujer';
    if (first.endsWith('a') && first.length > 2 && !MASCULINE_A_EXCLUSIONS.has(first)) {
        return 'Mujer';
    }
    return 'Hombre';
}

/**
 * General name-based gender inference (Mujer | Hombre).
 * Supports joint names (e.g. joined by ' y ' or ' e ').
 * Mixed groups default to 'Hombre' (masculine plural fallback in Spanish).
 * Only returns 'Mujer' if ALL individual names are inferred as female.
 */
export function inferGenderFromName(fullName: string): 'Mujer' | 'Hombre' {
    const trimmed = fullName.trim();
    if (!trimmed) return 'Hombre';

    const parts = trimmed.split(/\s+(?:y|e)\s+/i).filter(Boolean);
    if (parts.length <= 1) {
        return inferGenderFromSingleName(trimmed);
    }

    const allFemale = parts.every((p) => inferGenderFromSingleName(p) === 'Mujer');
    return allFemale ? 'Mujer' : 'Hombre';
}

/** Map conversational Spanish / English to exact dropdown strings expected by templates. */
export function normalizeGenderChoice(raw: string): string {
    const t = raw.trim();
    if (!t) return raw;
    if (t === 'Masculino' || t === 'Femenino') return t;

    const f = foldAscii(t);
    if (
        f === 'masculino' ||
        f === 'hombre' ||
        f === 'varon' ||
        f === 'macho' ||
        f === 'male' ||
        f === 'm'
    ) {
        return 'Masculino';
    }
    if (
        f === 'femenino' ||
        f === 'mujer' ||
        f === 'female' ||
        f === 'f'
    ) {
        return 'Femenino';
    }

    return raw;
}

/** Keys used with Handlebars #eq for Señor / Señora salutations. */
export function isGenderSalutationKey(key: string): boolean {
    const k = key.toLowerCase();
    return k === 'employeegender' || k === 'tenantgender';
}

/** Align nationality strings to gendered endings (dominicano/a). */
export function normalizeNationalityGender(nationality: string, gender: 'Mujer' | 'Hombre'): string {
    let clean = nationality.trim();
    if (!clean) return clean;

    let lowerClean = clean.toLowerCase();

    // Check if the input contains parenthesis choices like dominicano(a), dominicana/o
    if (lowerClean.includes('(a)') || lowerClean.includes('/a') || lowerClean.includes('(o)') || lowerClean.includes('/o')) {
        clean = clean
            .replace(/\(a\)/gi, '')
            .replace(/\/a/gi, '')
            .replace(/\(o\)/gi, '')
            .replace(/\/o/gi, '');
        lowerClean = clean.toLowerCase();
    }

    // General ending rule for standard Spanish nationalities ending in o/a
    if (gender === 'Mujer') {
        if (lowerClean === 'dominicano') clean = clean.slice(0, -1) + 'a';
        else if (lowerClean === 'venezolano') clean = clean.slice(0, -1) + 'a';
        else if (lowerClean === 'colombiano') clean = clean.slice(0, -1) + 'a';
        else if (lowerClean === 'espanol') clean = clean + 'a';
        else if (lowerClean === 'español') clean = clean + 'a';
        else if (lowerClean === 'italiano') clean = clean.slice(0, -1) + 'a';
        else if (lowerClean === 'mexicano') clean = clean.slice(0, -1) + 'a';
        else if (lowerClean === 'argentino') clean = clean.slice(0, -1) + 'a';
        else if (lowerClean.endsWith('o') && lowerClean !== 'perú' && lowerClean !== 'eeuu') {
            clean = clean.slice(0, -1) + 'a';
        }
    } else {
        if (lowerClean === 'dominicana') clean = clean.slice(0, -1) + 'o';
        else if (lowerClean === 'venezolana') clean = clean.slice(0, -1) + 'o';
        else if (lowerClean === 'colombiana') clean = clean.slice(0, -1) + 'o';
        else if (lowerClean === 'espanola' || lowerClean === 'española') clean = clean.slice(0, -1);
        else if (lowerClean === 'italiana') clean = clean.slice(0, -1) + 'o';
        else if (lowerClean === 'mexicana') clean = clean.slice(0, -1) + 'o';
        else if (lowerClean === 'argentina') clean = clean.slice(0, -1) + 'o';
        else if (lowerClean.endsWith('a') && !lowerClean.endsWith('ista') && !lowerClean.endsWith('esa') && lowerClean !== 'bélgica') {
            const neutralNationalityA = new Set(['belga', 'croata', 'vietnamita', 'persa', 'somalí']);
            if (!neutralNationalityA.has(lowerClean)) {
                clean = clean.slice(0, -1) + 'o';
            }
        }
    }

    return clean;
}

/**
 * Phonetic Conjunction Rules:
 * Spanish generally uses the conjunction y ("and").
 * When the following name begins with an "i" or "hi" sound, the conjunction must change to e.
 * This does not apply before diphthongs like ia, ie, io, iu (e.g. "Pedro y Ian", "y Hieronimo").
 * This function standardizes whitespace-surrounded 'y' or 'e' to the correct conjunction.
 */
export function normalizeNameConjunction(fullName: string): string {
    const trimmed = fullName.trim();
    if (!trimmed) return fullName;

    const parts = trimmed.split(/(\s+(?:y|e)\s+)/i);
    if (parts.length <= 1) return fullName;

    let result = parts[0]!;
    for (let i = 1; i < parts.length; i += 2) {
        const conjText = parts[i]!;
        const nextPart = parts[i + 1];
        if (nextPart === undefined) {
            result += conjText;
            break;
        }

        const nextPartTrimmed = nextPart.trim();
        // i or hi followed by a consonant (non-vowel)
        const startsWithISound = /^(?:i|hi)[^aeiouáéíóúü]/i.test(nextPartTrimmed);

        const rawConj = conjText.trim();
        const resolvedConj = startsWithISound ? 'e' : 'y';
        const finalConj = rawConj === rawConj.toUpperCase() ? resolvedConj.toUpperCase() : resolvedConj.toLowerCase();

        const spacingMatch = conjText.match(/^(\s*).+?(\s*)$/);
        const leadingSpace = spacingMatch?.[1] ?? ' ';
        const trailingSpace = spacingMatch?.[2] ?? ' ';

        result += leadingSpace + finalConj + trailingSpace + nextPart;
    }
    return result;
}

export function isPersonNameLikeKey(key: string): boolean {
    const k = key.toLowerCase();
    return k.endsWith('fullname') || k.endsWith('legalname') || k.includes('spousefullname') || k.includes('repfullname');
}

export function findAssociatedNameKey(maritalKey: string, allKeys: string[]): string | null {
    const prefix = maritalKey.replace(/MaritalStatus$/, '');
    // Try to find a key that is precisely `${prefix}FullName` or `${prefix}LegalName`
    const candidate1 = `${prefix}FullName`;
    const candidate2 = `${prefix}LegalName`;
    if (allKeys.includes(candidate1)) return candidate1;
    if (allKeys.includes(candidate2)) return candidate2;

    // Fallback search: starts with prefix, and ends with FullName, LegalName, or contains Name
    for (const k of allKeys) {
        if (k.startsWith(prefix)) {
            const kl = k.toLowerCase();
            if (kl.endsWith('fullname') || kl.endsWith('legalname')) {
                return k;
            }
        }
    }
    for (const k of allKeys) {
        if (k.startsWith(prefix)) {
            const kl = k.toLowerCase();
            if (kl.endsWith('name')) {
                return k;
            }
        }
    }
    return null;
}

export function resolveGenderForMaritalKey(maritalKey: string, vars: Record<string, string | number>): 'Mujer' | 'Hombre' {
    const prefix = maritalKey.replace(/MaritalStatus$/, '');
    
    // 1. Check gender field
    const genderKey = `${prefix}Gender`;
    if (vars[genderKey]) {
        const val = String(vars[genderKey]).toLowerCase().trim();
        if (val === 'femenino' || val === 'mujer' || val === 'female') return 'Mujer';
        if (val === 'masculino' || val === 'hombre' || val === 'male') return 'Hombre';
    }

    // 2. Check type label field (e.g. sellerTypeLabel, buyerTypeLabel)
    const typeLabelKey = `${prefix}TypeLabel`;
    if (vars[typeLabelKey]) {
        const val = String(vars[typeLabelKey]).toLowerCase().trim();
        if (val === 'la señora' || val.includes('señora')) return 'Mujer';
        if (val === 'el señor' || val.includes('señor')) return 'Hombre';
    }

    // 3. Fallback: infer gender from associated name field
    const nameKey = findAssociatedNameKey(maritalKey, Object.keys(vars));
    if (nameKey && vars[nameKey]) {
        const nameVal = String(vars[nameKey]).trim();
        if (nameVal) {
            return inferGenderFromName(nameVal);
        }
    }

    // 4. Default fallback to Masculino
    return 'Hombre';
}

export function normalizeMaritalStatus(val: string, gender: 'Mujer' | 'Hombre'): string {
    const trimmed = val.trim();
    const lower = trimmed.toLowerCase();
    let normalized = trimmed;

    if (lower === 'casado(a)' || lower === 'casado' || lower === 'casada') {
        normalized = gender === 'Mujer' ? 'casada' : 'casado';
    } else if (lower === 'soltero(a)' || lower === 'soltero' || lower === 'soltera') {
        normalized = gender === 'Mujer' ? 'soltera' : 'soltero';
    } else {
        return val;
    }

    // Preserve uppercase/casing
    if (trimmed === trimmed.toUpperCase()) {
        return normalized.toUpperCase();
    }
    if (trimmed.length > 0 && trimmed.charAt(0) === trimmed.charAt(0).toUpperCase()) {
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    return normalized;
}


