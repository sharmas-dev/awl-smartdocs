import {
    DOMESTIC_INDEFINITE_DURATION_PHRASE,
    normalizeDomesticIndefiniteDurationPhrase,
} from './domestic-salary-format.js';
import { parseStoredCalendarDateToYMD } from './natural-date-normalize.js';
import { fillDomesticReceiptEmployerLegalReferences } from './domestic-recibo-employer-refs.js';
import { inferDominicanPlaceFromText } from './dominican-place-inference.js';
import {
    inferDomesticEmployerGenderFromName,
} from './recibo-descargo-domestica-enrichment.js';

function foldChoice(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

function isDomesticIndefiniteDurationKind(kind: string): boolean {
    return foldChoice(kind) === foldChoice('Por tiempo indefinido');
}

/** PDF-only signing date fragments (chat uses documentSigningDate). */
export const DOMESTIC_CONTRACT_SIGNING_FRAGMENT_KEYS = [
    'signingDayLetters',
    'signingDayNumbers',
    'signingMonthLetters',
    'signingYearLetters',
    'signingYearNumbers',
] as const;

const DOMESTIC_CONTRACT_SIGNING_FRAGMENT_KEY_SET = new Set<string>(DOMESTIC_CONTRACT_SIGNING_FRAGMENT_KEYS);

export function isDomesticContractSigningFragmentKey(key: string): boolean {
    return DOMESTIC_CONTRACT_SIGNING_FRAGMENT_KEY_SET.has(key);
}

/** Canonical date or legacy PDF fragments satisfy signing date for progress/PDF. */
export function isDomesticContractSigningDateSatisfied(out: Record<string, string | number>): boolean {
    const canonical = String(out.documentSigningDate ?? '').trim();
    if (canonical && parseStoredCalendarDateToYMD(canonical)) {
        return true;
    }
    const day = String(out.signingDayNumbers ?? '').trim();
    const month = String(out.signingMonthLetters ?? '').trim();
    const year = String(out.signingYearNumbers ?? '').trim();
    return Boolean(day && month && year);
}

/** Legacy sessions may only have PDF fragments — compose one canonical date for chat/progress. */
export function backfillContratoDomesticaDocumentSigningDateFromFragments(
    out: Record<string, string | number>,
): boolean {
    if (String(out.documentSigningDate ?? '').trim()) {
        return false;
    }
    const day = String(out.signingDayNumbers ?? '').trim();
    const month = String(out.signingMonthLetters ?? '').trim();
    const year = String(out.signingYearNumbers ?? '').trim();
    if (!day || !month || !year) {
        return false;
    }
    out.documentSigningDate = `${day} de ${month.toLowerCase()} de ${year}`;
    return true;
}

/**
 * When vigencia is por tiempo indefinido, the HBS already prints
 * "La duración del Contrato es …" — only the tail phrase is needed (never ask in chat).
 */
export function fillDomesticContractIndefiniteDuration(out: Record<string, string | number>): boolean {
    const kind = String(out.contractDurationKind ?? '').trim();
    if (!isDomesticIndefiniteDurationKind(kind)) {
        return false;
    }

    const current = String(out.contractDurationIndefinite ?? '').trim();
    if (!current) {
        out.contractDurationIndefinite = DOMESTIC_INDEFINITE_DURATION_PHRASE;
        return true;
    }

    const normalized = normalizeDomesticIndefiniteDurationPhrase(current);
    if (normalized !== current) {
        out.contractDurationIndefinite = normalized;
        return true;
    }
    return false;
}

function stripLeadingArticle(s: string): string {
    const t = s.trim();
    const lower = t.toLowerCase();
    if (lower.startsWith('el ')) return t.slice(3).trim();
    if (lower.startsWith('la ')) return t.slice(3).trim();
    return t;
}

/** Infer employer gender + legal reference phrases for Contrato de Trabajadora Doméstica. */
export function fillDomesticContractEmployerAutoFields(out: Record<string, string | number>): boolean {
    let changed = false;
    const name = String(out.employerFullName ?? '').trim();
    if (name && !String(out.domesticEmployerGender ?? '').trim()) {
        out.domesticEmployerGender = inferDomesticEmployerGenderFromName(name);
        changed = true;
    }
    if (fillDomesticReceiptEmployerLegalReferences(out)) {
        changed = true;
    }
    return changed;
}

/** Infer notary jurisdiction from employer address when not yet set. */
export function fillDomesticContractNotaryFromEmployerAddress(out: Record<string, string | number>): boolean {
    if (String(out.notaryJurisdiction ?? '').trim()) {
        return false;
    }
    const addr = String(out.employerFullAddress ?? '').trim();
    if (!addr) return false;

    /** Address completeness may append ", Distrito Nacional, …" — prefer province/district jurisdiction for Santo Domingo. */
    const withoutTrailingCountry = addr.replace(/,\s*República Dominicana\s*$/i, '').trim();
    const withoutAutoDn = withoutTrailingCountry.replace(/,\s*Distrito Nacional\s*$/i, '').trim();
    if (
        /\bsanto\s+domingo\b/i.test(withoutAutoDn) &&
        !/\b(d\.?\s*n\.?|distrito\s+nacional)\b/i.test(withoutAutoDn)
    ) {
        out.notaryJurisdiction = 'Distrito Nacional';
        return true;
    }

    const place = inferDominicanPlaceFromText(addr);
    if (!place) return false;
    out.notaryJurisdiction = place.jurisdiction;
    return true;
}

/** Default notary jurisdiction from signing province when signing block is complete. */
export function fillDomesticContractNotaryFromSigningProvince(out: Record<string, string | number>): boolean {
    if (String(out.notaryJurisdiction ?? '').trim()) {
        return false;
    }
    const prov = String(out.signingProvince ?? '').trim();
    if (!prov) return false;
    if (!isDomesticContractSigningDateSatisfied(out)) {
        return false;
    }
    out.notaryJurisdiction = stripLeadingArticle(prov);
    return true;
}

/**
 * HBS section 6 lists extra benefits only when hasAdditionalBenefits === "Sí".
 * If otherBenefits has content but the gate is still "No" (common after a
 * post-preview update_variable that only touched otherBenefits), open the gate.
 *
 * Does not force "No" when otherBenefits is empty — during collection the user
 * may answer Sí before providing the list; clearing is handled on explicit update.
 */
export function syncDomesticAdditionalBenefitsGate(out: Record<string, string | number>): boolean {
    const benefits = String(out.otherBenefits ?? '').trim();
    if (!benefits) {
        return false;
    }
    const has = String(out.hasAdditionalBenefits ?? '').trim();
    if (foldChoice(has) === foldChoice('Sí')) {
        return false;
    }
    out.hasAdditionalBenefits = 'Sí';
    return true;
}

/** Patch for update_variable when editing the benefits pair so the HBS gate stays coherent. */
export function domesticAdditionalBenefitsUpdatePatch(
    key: string,
    newValue: string,
): Record<string, string> | null {
    if (key === 'otherBenefits') {
        const trimmed = newValue.trim();
        if (trimmed) {
            return { otherBenefits: newValue, hasAdditionalBenefits: 'Sí' };
        }
        return { otherBenefits: newValue, hasAdditionalBenefits: 'No' };
    }
    if (key === 'hasAdditionalBenefits') {
        if (foldChoice(newValue) === foldChoice('No')) {
            return { hasAdditionalBenefits: newValue, otherBenefits: '' };
        }
        if (foldChoice(newValue) === foldChoice('Sí')) {
            return { hasAdditionalBenefits: 'Sí' };
        }
    }
    return null;
}
