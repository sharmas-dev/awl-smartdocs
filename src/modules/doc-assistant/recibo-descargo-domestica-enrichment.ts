import { fillDomesticReceiptEmployerLegalReferences } from './domestic-recibo-employer-refs.js';
import { parseEmployerInfoNarrative } from './employer-info-parse.js';
import { inferDominicanPlaceFromText } from './dominican-place-inference.js';
import { fillReciboDescargoNotaryFromSigningProvince } from './recibo-descargo-notary-from-signing.js';
import { isInvalidPersonNameValue, sanitizePersonNameIfValid } from './person-name-sanitize.js';
import { NOTARY_JURISDICTION_OFFERED_KEY } from './pdf-preview-session.js';

import { RECIBO_DESCARGO_TRABAJADORA_DOMESTICA } from './recibo-descargo-domestica-template-map.js';

const RECIBO_DOMESTICA = RECIBO_DESCARGO_TRABAJADORA_DOMESTICA;

import { inferGenderFromName } from './gender-choice-format.js';

/** Infer Mujer/Hombre from employer full name; default Hombre when unknown. */
export function inferDomesticEmployerGenderFromName(fullName: string): 'Mujer' | 'Hombre' {
    return inferGenderFromName(fullName);
}

export function inferWorkplaceDescriptionFromGender(gender: 'Mujer' | 'Hombre'): string {
    return gender === 'Mujer' ? 'de la señora' : 'del señor';
}

function collectAddressTexts(out: Record<string, string | number>): string[] {
    const texts: string[] = [];
    for (const key of [
        'employerInferredLocation',
        'declarantAddress',
        'employerFullAddress',
        'userMessage',
    ]) {
        const v = out[key];
        if (typeof v === 'string' && v.trim()) texts.push(v.trim());
    }
    for (const [key, v] of Object.entries(out)) {
        if (typeof v !== 'string' || v.length < 12) continue;
        if (/address|domicilio|direcci/i.test(key) || /santo\s+domingo|distrito\s+nacional/i.test(v)) {
            texts.push(v.trim());
        }
    }
    return texts;
}

const EMPLOYER_NARRATIVE_SOURCE_KEYS = new Set([
    'userMessage',
    'employerInfo',
    'employerInferredLocation',
]);

/**
 * Recibo doméstica: infer gender, workplace phrase, and PDF legal refs — do not ask in chat.
 * Only parse employer narrative from known employer-related fields (not all session strings).
 */
function applyEmployerNarrativeFromSessionVars(out: Record<string, string | number>): boolean {
    let changed = false;
    for (const [key, v] of Object.entries(out)) {
        if (!EMPLOYER_NARRATIVE_SOURCE_KEYS.has(key)) continue;
        if (typeof v !== 'string' || !/empleador\s*:/i.test(v)) continue;
        const parsed = parseEmployerInfoNarrative(v);
        for (const [parsedKey, val] of Object.entries(parsed)) {
            if (!val.trim()) continue;
            if (String(out[parsedKey] ?? '').trim()) continue;
            if (parsedKey === 'employerFullName') {
                const name = sanitizePersonNameIfValid(val);
                if (!name) continue;
                out.employerFullName = name;
            } else {
                out[parsedKey] = val;
            }
            changed = true;
        }
    }
    return changed;
}

const CEDULA_IN_WORKPLACE = /\b(?:c[eé]dula|pasaport|n[uú]mero)\b/i;

function workplaceDescriptionNeedsReset(
    workplace: string,
    employerName: string,
): boolean {
    if (!workplace.trim()) return false;
    const lowerWorkplace = workplace.toLowerCase();
    if (workplace.length > 48) return true;
    if (CEDULA_IN_WORKPLACE.test(workplace)) return true;
    if (/\d{3}-\d{7}-\d/.test(workplace)) return true;

    // Reset if it contains redundant terms like "casa", "residencia", or "hogar"
    if (/\b(?:casa|residencia|hogar)\b/i.test(workplace)) return true;

    // Reset if it duplicates parts of the employer's name (e.g. "Dominguez" in "casa de la familia Dominguez")
    if (employerName) {
        const nameParts = employerName.toLowerCase().split(/\s+/).filter(p => p.length > 2);
        for (const part of nameParts) {
            if (lowerWorkplace.includes(part)) {
                return true;
            }
        }
    }

    if (employerName && workplace.toLowerCase().includes(employerName.toLowerCase().slice(0, 12))) {
        return workplace.length > 24;
    }
    return false;
}

function sanitizeWorkplaceDescription(out: Record<string, string | number>): boolean {
    let workplace = String(out.workplaceDescription ?? '').trim();
    const employerName = String(out.employerFullName ?? '').trim();
    if (!workplace) {
        return false;
    }

    let cleaned = workplace;
    // Extract core intent if the user inputted something containing standard descriptors
    if (/\bfamilia\b/i.test(workplace)) {
        cleaned = 'de la familia de';
    } else if (/\b(?:senora|sra|señora)\b/i.test(workplace)) {
        cleaned = 'de la señora';
    } else if (/\b(?:senor|sr|señor)\b/i.test(workplace)) {
        cleaned = 'del señor';
    }

    let changed = false;
    if (cleaned !== workplace) {
        out.workplaceDescription = cleaned;
        workplace = cleaned;
        changed = true;
    }

    if (workplaceDescriptionNeedsReset(workplace, employerName)) {
        const genderRaw = String(out.domesticEmployerGender ?? '').trim().toLowerCase();
        const gender: 'Mujer' | 'Hombre' =
            genderRaw === 'mujer' ? 'Mujer' : genderRaw === 'hombre' ? 'Hombre' : inferDomesticEmployerGenderFromName(employerName);
        workplace = inferWorkplaceDescriptionFromGender(gender);
        out.workplaceDescription = workplace;
        if (!String(out.domesticEmployerGender ?? '').trim()) {
            out.domesticEmployerGender = gender;
        }
        changed = true;
    }

    // Normalize "de la familia" to "de la familia de" so it is grammatically correct before the name
    if (workplace.toLowerCase() === 'de la familia') {
        out.workplaceDescription = 'de la familia de';
        changed = true;
    }

    return changed;
}

function sanitizeReciboDomesticaPersonNames(out: Record<string, string | number>): boolean {
    let changed = false;
    for (const key of ['declarantFullName', 'employerFullName'] as const) {
        const raw = String(out[key] ?? '').trim();
        if (!raw) continue;
        if (isInvalidPersonNameValue(raw)) {
            delete out[key];
            changed = true;
            continue;
        }
        const clean = sanitizePersonNameIfValid(raw);
        if (clean && clean !== raw) {
            out[key] = clean;
            changed = true;
        }
    }
    return changed;
}

function dedupeRepeatedFullName(fullName: string): string {
    const trimmed = fullName.trim().replace(/\s+/g, ' ');
    const consecutiveDup = /^(.+?)\s+\1$/i.exec(trimmed);
    if (consecutiveDup?.[1]) {
        return consecutiveDup[1].trim();
    }
    const parts = trimmed.split(' ');
    const half = Math.floor(parts.length / 2);
    if (parts.length >= 4 && parts.length % 2 === 0) {
        const first = parts.slice(0, half).join(' ');
        const second = parts.slice(half).join(' ');
        if (first.toLowerCase() === second.toLowerCase()) {
            return first;
        }
    }
    return trimmed;
}

export function fillDomesticReciboEmployerAutoFields(out: Record<string, string | number>): boolean {
    let changed = sanitizeReciboDomesticaPersonNames(out);
    if (applyEmployerNarrativeFromSessionVars(out)) {
        changed = true;
    }
    const rawName = String(out.employerFullName ?? '').trim();
    if (rawName) {
        const deduped = dedupeRepeatedFullName(rawName);
        if (deduped !== rawName) {
            out.employerFullName = deduped;
            changed = true;
        }
    }
    const name = String(out.employerFullName ?? '').trim();
    if (name && !String(out.domesticEmployerGender ?? '').trim()) {
        out.domesticEmployerGender = inferDomesticEmployerGenderFromName(name);
        changed = true;
    }

    const genderRaw = String(out.domesticEmployerGender ?? '').trim().toLowerCase();
    const gender: 'Mujer' | 'Hombre' | null =
        genderRaw === 'mujer' ? 'Mujer' : genderRaw === 'hombre' ? 'Hombre' : null;

    if (gender && !String(out.workplaceDescription ?? '').trim()) {
        out.workplaceDescription = inferWorkplaceDescriptionFromGender(gender);
        changed = true;
    }

    if (sanitizeWorkplaceDescription(out)) {
        changed = true;
    }

    if (fillDomesticReceiptEmployerLegalReferences(out)) {
        changed = true;
    }
    return changed;
}

/**
 * Infer signing city/province and notary jurisdiction from addresses already captured.
 */
export function fillReciboDescargoDomesticaLocationAndNotary(out: Record<string, string | number>): boolean {
    let changed = false;

    for (const text of collectAddressTexts(out)) {
        const place = inferDominicanPlaceFromText(text);
        if (!place) continue;

        if (!String(out.employerInferredCity ?? '').trim() && text === String(out.employerInferredLocation ?? '')) {
            out.employerInferredCity = place.city;
            out.employerInferredProvince = place.province;
            changed = true;
        }

        if (!String(out.signingCity ?? '').trim()) {
            out.signingCity = place.city;
            changed = true;
        }
        if (!String(out.signingProvince ?? '').trim()) {
            out.signingProvince = place.province;
            changed = true;
        }
        break;
    }

    if (fillReciboDescargoNotaryFromSigningProvince(RECIBO_DOMESTICA, out)) {
        changed = true;
    }
    return changed;
}

export const NOTARY_JURISDICTION_ACK_SENT_KEY = 'notaryJurisdictionAckSent';

export function hasInferredReciboDomesticaNotaryJurisdiction(out: Record<string, string | number>): boolean {
    return Boolean(String(out.notaryJurisdiction ?? '').trim());
}

export function isDomesticReciboNotaryAckSent(vars: Record<string, string | number>): boolean {
    const s = String(vars[NOTARY_JURISDICTION_ACK_SENT_KEY] ?? '')
        .trim()
        .toLowerCase();
    return s === 'sí' || s === 'si' || s === 'yes' || s === '1';
}

/** True when jurisdiction can be derived from employer/declarant address text (not typed only at signing). */
export function wasNotaryJurisdictionInferredFromAddress(vars: Record<string, string | number>): boolean {
    for (const text of collectAddressTexts(vars)) {
        if (inferDominicanPlaceFromText(text)) {
            return true;
        }
    }
    return false;
}

export function isDomesticReciboNotaryAlreadyOffered(vars: Record<string, string | number>): boolean {
    return String(vars[NOTARY_JURISDICTION_OFFERED_KEY] ?? '')
        .trim()
        .toLowerCase() === 'true';
}

/**
 * Offer the notary-jurisdiction confirmation at most once.
 * After NOTARY_JURISDICTION_OFFERED_KEY is set, mid-flow turns must not re-inject the boilerplate.
 */
export function shouldOfferDomesticReciboNotaryConfirmation(vars: Record<string, string | number>): boolean {
    if (isDomesticReciboNotaryAckSent(vars)) {
        return false;
    }
    if (isDomesticReciboNotaryAlreadyOffered(vars)) {
        return false;
    }
    const copy = { ...vars };
    fillReciboDescargoDomesticaLocationAndNotary(copy);
    if (!hasInferredReciboDomesticaNotaryJurisdiction(copy)) {
        return false;
    }
    return wasNotaryJurisdictionInferredFromAddress(vars);
}

export function buildDomesticReciboEmployerAcknowledgment(
    vars: Record<string, string | number>,
): string | null {
    const name = String(vars.employerFullName ?? '').trim();
    if (!name) return null;
    const copy = { ...vars };
    fillDomesticReciboEmployerAutoFields(copy);
    const ref = String(copy.employerReference ?? 'el Empleador').trim();
    const workplace = String(copy.workplaceDescription ?? '').trim();
    const workplaceBit = workplace ? ` y «${workplace}» para el hogar` : '';
    return (
        `Gracias, ya tengo los datos de ${name}. Para el documento usaré «${ref}» como referencia estándar${workplaceBit}. ` +
        `Si prefieres otro tratamiento (por ejemplo «la señora ${name.split(/\s+/)[0] ?? name}»), dímelo; si no, seguimos.`
    );
}

/** Build notary jurisdiction confirmation copy only — does not mutate session flags. */
export function buildDomesticReciboNotaryAcknowledgment(
    vars: Record<string, string | number>,
): string | null {
    const copy = { ...vars };
    fillReciboDescargoDomesticaLocationAndNotary(copy);
    const partiesLocation = String(copy.signingCity ?? '').trim();
    const jurisdiction = String(
        copy.notaryJurisdiction ?? copy.signingProvince ?? copy.signingCity ?? '',
    ).trim();
    const where = partiesLocation || jurisdiction;
    if (!where) return null;
    const notaryLabel = partiesLocation && jurisdiction && partiesLocation !== jurisdiction
        ? jurisdiction
        : where;
    return (
        `Dado que las partes están en ${where}, he establecido la jurisdicción notarial en ${notaryLabel}. ` +
        `Si deseas utilizar un notario de otra jurisdicción, indícamelo; de lo contrario, podemos completar el trámite.`
    );
}
