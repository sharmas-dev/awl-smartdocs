/** Helpers for update_variable: parse "change to X" and prefer party legal-name fields. */

export const PENDING_UPDATE_VARIABLE_KEY = '__pendingUpdateVariable';

export type PendingUpdateVariable = {
    groupId: string;
    key: string;
    label: string;
};

export function looksLikeStandaloneReplacementValue(text: string): boolean {
    const t = text.trim();
    if (!t || t.length < 2 || t.length > 80) return false;
    if (parseNewValueFromChangePhrase(t)) return false;
    const f = t
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
    if (/\bnombre\b/.test(f) && /\b(vendedor|comprador|seller|buyer)\b/.test(f)) return false;
    if (/\bdirecci|\bnacionalidad|\bcedula|\bc[eé]dula|\bgenero|\bg[eé]nero/.test(f)) return false;
    return /[\p{L}]/u.test(t);
}

export function parseNewValueFromChangePhrase(text: string): string | undefined {
    const t = text.trim();
    if (!t) return undefined;
    const m = t.match(
        /^(?:i\s+want\s+to\s+change(?:\s+it)?\s+to|change(?:\s+it)?\s+to|cambiar(?:lo)?\s+a|quiero\s+cambiar(?:lo)?\s+a|update(?:\s+it)?\s+to)\s+(.+)$/i,
    );
    const captured = m?.[1]?.trim();
    if (!captured || captured.length < 1 || captured.length > 80) return undefined;
    return captured.replace(/\s+/g, ' ');
}

export function serializePendingUpdateVariable(pending: PendingUpdateVariable): string {
    return JSON.stringify(pending);
}

export function parsePendingUpdateVariable(raw: unknown): PendingUpdateVariable | undefined {
    const t = String(raw ?? '').trim();
    if (!t) return undefined;
    try {
        const parsed = JSON.parse(t) as PendingUpdateVariable;
        if (
            typeof parsed?.groupId === 'string' &&
            typeof parsed?.key === 'string' &&
            typeof parsed?.label === 'string' &&
            parsed.groupId &&
            parsed.key
        ) {
            return parsed;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

/**
 * Prefer sellerLegalName / buyerLegalName when the user clearly names that party,
 * so "nombre del comprador" does not fuzzy-match the seller or a spouse field.
 */
export function matchCompraventaPartyLegalNameLabel(
    input: string,
    schema: { groups: Array<{ id: string; label: string; variables: Array<{ key: string; label: string }> }> },
): { groupId: string; groupLabel: string; key: string; label: string; score: number } | null {
    const f = input
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[{}]/g, '')
        .trim();
    if (!f) return null;
    if (/conyuge|spouse|representante|\brep\b/.test(f)) return null;

    const mentionsName = /\bnombre\b|\bname\b|legalname/.test(f);
    const mentionsSeller = /\bvendedor\b|\bseller\b/.test(f);
    const mentionsBuyer = /\bcomprador\b|\bbuyer\b/.test(f);
    if (!mentionsName || (mentionsSeller === mentionsBuyer)) return null;

    const wantKey = mentionsSeller ? 'sellerLegalName' : 'buyerLegalName';
    for (const group of schema.groups) {
        for (const variable of group.variables) {
            if (variable.key === wantKey) {
                return {
                    groupId: group.id,
                    groupLabel: group.label,
                    key: variable.key,
                    label: variable.label,
                    score: 1,
                };
            }
        }
    }
    return null;
}
