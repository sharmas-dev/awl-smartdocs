/**
 * Contrato de Compraventa Vehículo — empresa vs persona física branch handling.
 */

import { normalizePartyCompanyChoice } from './party-company-choice-format.js';
import { parseGenderChoiceFromNameLikePhrase } from './person-name-sanitize.js';
import { inferGenderFromName } from './gender-choice-format.js';

export type CompraventaPartyPrefix = 'seller' | 'buyer';

export const COMPRAVENTA_SELLER_PERSON_KEYS = [
    'sellerGender',
    'sellerNationality',
    'sellerMaritalStatus',
    'sellerHasCommunityProperty',
    'sellerIdType',
    'sellerIdNumber',
    'sellerSpouseFullName',
    'sellerSpouseNationality',
    'sellerSpouseIdType',
    'sellerSpouseIdNumber',
    'sellerSpouseAddress',
] as const;

export const COMPRAVENTA_SELLER_COMPANY_KEYS = [
    'sellerJurisdiction',
    'sellerCompanyOrigin',
    'sellerHasDominicanRnc',
    'sellerIncludeRncInContract',
    'sellerRnc',
    'sellerRepTitle',
    'sellerRepFullName',
    'sellerRepNationality',
    'sellerRepIdType',
    'sellerRepIdNumber',
    'sellerRepFullAddress',
] as const;

export const COMPRAVENTA_BUYER_PERSON_KEYS = [
    'buyerGender',
    'buyerNationality',
    'buyerMaritalStatus',
    'buyerHasCommunityProperty',
    'buyerIdType',
    'buyerIdNumber',
    'buyerSpouseFullName',
    'buyerSpouseNationality',
    'buyerSpouseIdType',
    'buyerSpouseIdNumber',
    'buyerSpouseAddress',
] as const;

export const COMPRAVENTA_BUYER_COMPANY_KEYS = [
    'buyerJurisdiction',
    'buyerCompanyOrigin',
    'buyerHasDominicanRnc',
    'buyerIncludeRncInContract',
    'buyerRnc',
    'buyerRepTitle',
    'buyerRepFullName',
    'buyerRepNationality',
    'buyerRepIdType',
    'buyerRepIdNumber',
    'buyerRepFullAddress',
] as const;

const PARTY_CONFIG = {
    seller: {
        isCompanyKey: 'sellerIsCompany',
        typeLabelKey: 'sellerTypeLabel',
        genderKey: 'sellerGender',
        personKeys: COMPRAVENTA_SELLER_PERSON_KEYS,
        companyKeys: COMPRAVENTA_SELLER_COMPANY_KEYS,
        roleLabel: 'vendedor',
    },
    buyer: {
        isCompanyKey: 'buyerIsCompany',
        typeLabelKey: 'buyerTypeLabel',
        genderKey: 'buyerGender',
        personKeys: COMPRAVENTA_BUYER_PERSON_KEYS,
        companyKeys: COMPRAVENTA_BUYER_COMPANY_KEYS,
        roleLabel: 'comprador',
    },
} as const;

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

function partyKey(prefix: CompraventaPartyPrefix, suffix: string): string {
    return `${prefix}${suffix}`;
}

export function resolveCompraventaPartyBranch(
    isCompanyRaw: unknown,
): 'Empresa' | 'Persona física' | undefined {
    const normalized = normalizePartyCompanyChoice(String(isCompanyRaw ?? '').trim());
    if (normalized === 'Empresa' || normalized === 'Persona física') {
        return normalized;
    }
    return undefined;
}

/** @deprecated alias — use resolveCompraventaPartyBranch on *IsCompany key */
export function resolveCompraventaPartyChoice(
    prefix: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
): 'Empresa' | 'Persona física' | undefined {
    const cfg = PARTY_CONFIG[prefix];
    return (
        resolveCompraventaPartyBranch(vars[cfg.isCompanyKey]) ??
        inferCompraventaPartyIsCompany(prefix, vars)
    );
}

function narrativeSuggestsEmpresa(text: string): boolean {
    const f = foldAscii(text);
    if (!f) return false;
    if (f.includes('persona fisica') || f.includes('persona física')) return false;
    if (
        /\b(s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?)\b/i.test(text) ||
        /\bsociedad\b/i.test(text) ||
        /\bempresa\b/i.test(text) ||
        /\bcompania\b/i.test(text) ||
        /\bcompañ[ií]a\b/i.test(text) ||
        /\bpersona\s+jur[ií]dica\b/i.test(text) ||
        /\braz[oó]n\s+social\b/i.test(text)
    ) {
        return true;
    }
    return false;
}

export function inferCompraventaPartyIsCompany(
    prefix: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
): 'Empresa' | 'Persona física' | undefined {
    const cfg = PARTY_CONFIG[prefix];
    const existing = resolveCompraventaPartyBranch(vars[cfg.isCompanyKey]);
    if (existing) return existing;

    const typeLabel = String(vars[cfg.typeLabelKey] ?? '').trim();
    if (typeLabel === 'la sociedad') return 'Empresa';
    if (typeLabel === 'el señor' || typeLabel === 'la señora') return 'Persona física';

    if (String(vars[partyKey(prefix, 'Rnc')] ?? '').trim()) return 'Empresa';
    if (String(vars[partyKey(prefix, 'Jurisdiction')] ?? '').trim()) return 'Empresa';
    if (String(vars[partyKey(prefix, 'RepFullName')] ?? '').trim()) return 'Empresa';

    return undefined;
}

function inferPartyBranchFromVars(
    party: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
    narrative?: string,
): 'Empresa' | 'Persona física' | undefined {
    const fromFields = inferCompraventaPartyIsCompany(party, vars);
    if (fromFields) return fromFields;
    if (narrative?.trim() && narrativeSuggestsEmpresa(narrative)) return 'Empresa';
    return undefined;
}

function pruneIncompatibleKeys(
    out: Record<string, string | number>,
    keys: readonly string[],
): boolean {
    let changed = false;
    for (const key of keys) {
        if (key in out) {
            delete out[key];
            changed = true;
        }
    }
    return changed;
}

function pruneSpouseWhenNotCommunity(out: Record<string, string | number>, prefix: CompraventaPartyPrefix): boolean {
    const marital = String(out[partyKey(prefix, 'MaritalStatus')] ?? '').trim();
    const community = String(out[partyKey(prefix, 'HasCommunityProperty')] ?? '').trim();
    if (marital !== 'casado(a)' || community === 'Sí') return false;

    const spouseSuffixes = [
        'SpouseFullName',
        'SpouseNationality',
        'SpouseIdType',
        'SpouseIdNumber',
        'SpouseAddress',
    ];
    let changed = false;
    for (const suffix of spouseSuffixes) {
        const key = partyKey(prefix, suffix);
        if (key in out) {
            delete out[key];
            changed = true;
        }
    }
    if (community === 'No' && partyKey(prefix, 'HasCommunityProperty') in out) {
        /* keep HasCommunityProperty */
    }
    return changed;
}

export function applyCompraventaTypeLabelFromChoice(
    prefix: CompraventaPartyPrefix,
    out: Record<string, string | number>,
): boolean {
    const cfg = PARTY_CONFIG[prefix];
    const branch = resolveCompraventaPartyChoice(prefix, out);
    if (!branch) return false;

    let changed = false;
    if (branch === 'Empresa') {
        if (out[cfg.typeLabelKey] !== 'la sociedad') {
            out[cfg.typeLabelKey] = 'la sociedad';
            changed = true;
        }
        return changed;
    }

    let gender = String(out[cfg.genderKey] ?? '').trim();
    if (!gender) {
        const legalName = String(out[partyKey(prefix, 'LegalName')] ?? '').trim();
        if (legalName) {
            gender = inferGenderFromName(legalName);
        }
    }
    let label: string | undefined;
    if (gender === 'Hombre') label = 'el señor';
    else if (gender === 'Mujer') label = 'la señora';

    if (label && out[cfg.typeLabelKey] !== label) {
        out[cfg.typeLabelKey] = label;
        changed = true;
    }
    return changed;
}

export function isCompraventaTypeLabelAutoFilled(
    prefix: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
): boolean {
    const cfg = PARTY_CONFIG[prefix];
    const branch = resolveCompraventaPartyChoice(prefix, vars);
    const label = String(vars[cfg.typeLabelKey] ?? '').trim();
    if (branch === 'Empresa') return label === 'la sociedad';
    if (branch === 'Persona física') {
        const gender = String(vars[cfg.genderKey] ?? '').trim();
        if (gender === 'Hombre') return label === 'el señor';
        if (gender === 'Mujer') return label === 'la señora';
    }
    return false;
}

/**
 * Normalize *IsCompany choices, infer when empty, prune wrong-branch keys, sync type labels.
 */
export function applyCompraventaPartyBranchNormalization(
    out: Record<string, string | number>,
    options?: { narrative?: string; parties?: CompraventaPartyPrefix[] },
): boolean {
    let changed = false;
    const parties = options?.parties ?? (['seller', 'buyer'] as CompraventaPartyPrefix[]);

    for (const party of parties) {
        const cfg = PARTY_CONFIG[party];
        const raw = out[cfg.isCompanyKey];
        if (raw !== undefined && String(raw).trim() !== '') {
            const normalized = normalizePartyCompanyChoice(String(raw));
            if (normalized !== String(raw)) {
                out[cfg.isCompanyKey] = normalized;
                changed = true;
            }
        }

        const branch =
            resolveCompraventaPartyBranch(out[cfg.isCompanyKey]) ??
            inferPartyBranchFromVars(party, out, options?.narrative);

        if (!branch) continue;

        if (out[cfg.isCompanyKey] !== branch) {
            out[cfg.isCompanyKey] = branch;
            changed = true;
        }

        if (branch === 'Empresa') {
            if (pruneIncompatibleKeys(out, cfg.personKeys)) changed = true;
        } else {
            if (pruneIncompatibleKeys(out, cfg.companyKeys)) changed = true;
            if (pruneSpouseWhenNotCommunity(out, party)) changed = true;
        }

        if (applyCompraventaTypeLabelFromChoice(party, out)) changed = true;
        if (scrubGenderPhraseFromPartyLegalName(party, out)) changed = true;
    }

    return changed;
}

/** "es hombre" is a gender answer, not a legal name — clear it so the name is asked again. */
export function scrubGenderPhraseFromPartyLegalName(
    prefix: CompraventaPartyPrefix,
    out: Record<string, string | number>,
): boolean {
    const cfg = PARTY_CONFIG[prefix];
    const nameKey = partyKey(prefix, 'LegalName');
    const parsed = parseGenderChoiceFromNameLikePhrase(String(out[nameKey] ?? ''));
    if (!parsed) return false;
    if (!String(out[cfg.genderKey] ?? '').trim()) {
        out[cfg.genderKey] = parsed;
    }
    out[nameKey] = '';
    return true;
}

export function inferCompraventaPartyFromGroupSubmit(
    groupId: string,
    mapped: Record<string, string | number>,
    userMessage?: string,
): boolean {
    if (groupId !== 'seller' && groupId !== 'buyer') return false;
    return applyCompraventaPartyBranchNormalization(mapped, {
        narrative: userMessage,
        parties: [groupId],
    });
}

type PendingVariable = { key: string };

export function filterCompraventaPendingVariables<T extends PendingVariable>(
    groupId: string,
    variables: T[],
    sessionVars: Record<string, string | number>,
): T[] {
    if (groupId !== 'seller' && groupId !== 'buyer') return variables;

    const prefix = groupId as CompraventaPartyPrefix;
    const branch = resolveCompraventaPartyChoice(prefix, sessionVars);
    if (!branch) return variables;

    const cfg = PARTY_CONFIG[prefix];
    const exclude =
        branch === 'Empresa'
            ? new Set<string>(cfg.personKeys)
            : new Set<string>(cfg.companyKeys);

    return variables.filter((v) => !exclude.has(v.key));
}

export function buildCompraventaPartyGroupHint(
    groupId: string,
    sessionVars: Record<string, string | number>,
): string {
    if (groupId !== 'seller' && groupId !== 'buyer') return '';

    const prefix = groupId as CompraventaPartyPrefix;
    const cfg = PARTY_CONFIG[prefix];
    const branch = resolveCompraventaPartyChoice(prefix, sessionVars);

    if (!branch) {
        return (
            ` Contrato de Compraventa Vehículo ${cfg.roleLabel}: primero confirma si es Empresa o Persona física ` +
            `(${cfg.isCompanyKey}) y guarda el valor exacto del schema. ` +
            `Solo pregunta campos que aparezcan en pendingGroup.group.variables.`
        );
    }

    if (branch === 'Empresa') {
        return (
            ` Contrato de Compraventa Vehículo ${cfg.roleLabel}: la parte es Empresa. ` +
            `FORBIDDEN to ask ${prefix}Nationality, ${prefix}MaritalStatus, ${prefix}IdType, ${prefix}IdNumber, ${prefix}Spouse*, or ${prefix}Gender — ` +
            `estado civil y cédula del ${cfg.roleLabel} como persona física no aplican. ` +
            `Solo empresa (jurisdicción, origen, RNC si corresponde) y representante legal. ` +
            `Do NOT ask ${cfg.typeLabelKey} (server sets la sociedad). ` +
            `Pregunta únicamente variables en pendingGroup.group.variables.`
        );
    }

    return (
        ` Contrato de Compraventa Vehículo ${cfg.roleLabel}: la parte es Persona física. ` +
        `FORBIDDEN to ask ${prefix}Jurisdiction, ${prefix}Rnc, ${prefix}Rep*, ${prefix}CompanyOrigin, or ${prefix}HasDominicanRnc. ` +
        `Sí corresponde nacionalidad, estado civil, documento (y cónyuge solo si casado(a) con comunidad de bienes Sí). ` +
        `Do NOT ask ${cfg.typeLabelKey} when ${cfg.genderKey} is set (server sets el señor / la señora). ` +
        `Pregunta únicamente variables en pendingGroup.group.variables.`
    );
}
