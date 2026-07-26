/**
 * Contrato de Compraventa Vehículo — RNC clause only for Dominican companies (or foreign with DR RNC).
 */

import type { CompraventaPartyPrefix } from './compraventa-party-branch.js';
import { resolveCompraventaPartyChoice } from './compraventa-party-branch.js';

function partyKey(prefix: CompraventaPartyPrefix, suffix: string): string {
    return `${prefix}${suffix}`;
}

function foldJurisdiction(raw: string): string {
    return raw
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

/** Infer Nacional when jurisdiction clearly refers to the Dominican Republic. */
export function inferCompraventaCompanyOriginFromJurisdiction(jurisdiction: string): 'Nacional' | 'Extranjera' | undefined {
    const j = foldJurisdiction(jurisdiction);
    if (!j) return undefined;
    if (
        j.includes('republica dominicana') ||
        j === 'rd' ||
        j.includes('dominicana') ||
        j.includes('santo domingo') && !j.includes('chile')
    ) {
        return 'Nacional';
    }
    if (j.length >= 3) return 'Extranjera';
    return undefined;
}

export function applyCompraventaCompanyRncFlags(out: Record<string, string | number>): boolean {
    let changed = false;

    for (const prefix of ['seller', 'buyer'] as const) {
        if (resolveCompraventaPartyChoice(prefix, out) !== 'Empresa') {
            for (const suffix of [
                'CompanyOrigin',
                'HasDominicanRnc',
                'IncludeRncInContract',
            ] as const) {
                const key = partyKey(prefix, suffix);
                if (key in out) {
                    delete out[key];
                    changed = true;
                }
            }
            continue;
        }

        const jurisdictionKey = partyKey(prefix, 'Jurisdiction');
        const originKey = partyKey(prefix, 'CompanyOrigin');
        const hasDrKey = partyKey(prefix, 'HasDominicanRnc');
        const includeKey = partyKey(prefix, 'IncludeRncInContract');
        const rncKey = partyKey(prefix, 'Rnc');

        let origin = String(out[originKey] ?? '').trim();
        const jurisdiction = String(out[jurisdictionKey] ?? '').trim();
        const hasRncStored = String(out[rncKey] ?? '').trim() !== '';

        if (!origin && jurisdiction) {
            const inferred = inferCompraventaCompanyOriginFromJurisdiction(jurisdiction);
            if (inferred) {
                out[originKey] = inferred;
                origin = inferred;
                changed = true;
            }
        }

        if (!origin && hasRncStored) {
            out[originKey] = 'Nacional';
            origin = 'Nacional';
            changed = true;
        }

        const hasDr = String(out[hasDrKey] ?? '').trim();

        if (origin === 'Nacional' && hasDrKey in out) {
            delete out[hasDrKey];
            changed = true;
        }

        let include: 'Sí' | 'No' | undefined;
        if (origin === 'Nacional') {
            include = 'Sí';
        } else if (origin === 'Extranjera') {
            if (hasDr === 'Sí') include = 'Sí';
            else if (hasDr === 'No') include = 'No';
        }

        if (include !== undefined) {
            if (out[includeKey] !== include) {
                out[includeKey] = include;
                changed = true;
            }
            if (include === 'No') {
                if (String(out[rncKey] ?? '').trim() !== '') {
                    out[rncKey] = '';
                    changed = true;
                }
            }
        } else if (includeKey in out) {
            delete out[includeKey];
            changed = true;
        }
    }

    return changed;
}
