/**
 * Contrato de Teletrabajo — empresa vs persona física branch handling.
 */

import { normalizePartyCompanyChoice } from './party-company-choice-format.js';

export const TELETRABAJO_EMPLOYER_PERSON_KEYS = [
    'employerNationality',
    'employerMaritalStatus',
    'employerOccupation',
    'employerIdType',
    'employerIdNumber',
] as const;

export const TELETRABAJO_EMPLOYER_COMPANY_KEYS = [
    'employerCompanyNationalOrForeign',
    'employerHasDominicanRnc',
    'employerIncludeRncMercantileIdentificationInContract',
    'employerRnc',
    'employerMercantileRegistryNumber',
    'employerJurisdiction',
    'employerRepTitle',
    'employerRepFullName',
    'employerRepNationality',
    'employerRepIdType',
    'employerRepIdNumber',
    'employerRepAddressStreet',
    'employerRepAddressCity',
    'employerRepAddressCountry',
] as const;

const COST_DETAIL_KEYS = ['cost1', 'cost2', 'cost3', 'cost4', 'monthlyAmountInWords', 'monthlyAmountWithCurrency'] as const;

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

export function resolveTeletrabajoEmployerBranch(
    isCompanyRaw: unknown,
): 'Empresa' | 'Persona física' | undefined {
    const normalized = normalizePartyCompanyChoice(String(isCompanyRaw ?? '').trim());
    if (normalized === 'Empresa' || normalized === 'Persona física') {
        return normalized;
    }
    return undefined;
}

export function inferTeletrabajoEmployerBranch(
    vars: Record<string, string | number>,
): 'Empresa' | 'Persona física' | undefined {
    const existing = resolveTeletrabajoEmployerBranch(vars.employerIsCompany);
    if (existing) return existing;

    if (String(vars.employerRnc ?? '').trim()) return 'Empresa';
    if (String(vars.employerRepFullName ?? '').trim()) return 'Empresa';
    if (String(vars.employerCompanyNationalOrForeign ?? '').trim()) return 'Empresa';
    if (String(vars.employerNationality ?? '').trim() && !String(vars.employerRepFullName ?? '').trim()) {
        return 'Persona física';
    }

    const narrative = String(vars._employerUserMessage ?? vars.employer ?? '').trim();
    if (/\bempresa\b/i.test(narrative) || /\bs\.?\s*r\.?\s*l\.?\b/i.test(narrative)) {
        return 'Empresa';
    }
    return undefined;
}

function pruneIncompatibleKeys(out: Record<string, string | number>, keys: readonly string[]): boolean {
    let changed = false;
    for (const key of keys) {
        if (key in out) {
            delete out[key];
            changed = true;
        }
    }
    return changed;
}

export function applyContratoTeletrabajoEmployerBranchNormalization(
    out: Record<string, string | number>,
): boolean {
    let changed = false;
    const branch =
        resolveTeletrabajoEmployerBranch(out.employerIsCompany) ?? inferTeletrabajoEmployerBranch(out);

    if (branch && out.employerIsCompany !== branch) {
        out.employerIsCompany = branch;
        changed = true;
    }

    if (!branch) return changed;

    if (branch === 'Empresa') {
        if (pruneIncompatibleKeys(out, TELETRABAJO_EMPLOYER_PERSON_KEYS)) changed = true;
    } else {
        if (pruneIncompatibleKeys(out, TELETRABAJO_EMPLOYER_COMPANY_KEYS)) changed = true;
    }

    return changed;
}

export function filterTeletrabajoPendingVariables<T extends { key: string }>(
    groupId: string,
    variables: T[],
    sessionVars: Record<string, string | number>,
): T[] {
    if (groupId !== 'employer') return variables;

    const branch =
        resolveTeletrabajoEmployerBranch(sessionVars.employerIsCompany) ??
        inferTeletrabajoEmployerBranch(sessionVars);
    if (!branch) return variables;

    const exclude =
        branch === 'Empresa'
            ? new Set<string>(TELETRABAJO_EMPLOYER_PERSON_KEYS)
            : new Set<string>(TELETRABAJO_EMPLOYER_COMPANY_KEYS);

    return variables.filter((v) => !exclude.has(v.key));
}

export function filterTeletrabajoCostsPendingVariables<T extends { key: string }>(
    groupId: string,
    variables: T[],
    sessionVars: Record<string, string | number>,
): T[] {
    if (groupId !== 'costs') return variables;
    const coverage = String(sessionVars.hasCostCoverage ?? '').trim();
    if (coverage !== 'No') return variables;
    const exclude = new Set<string>(COST_DETAIL_KEYS);
    return variables.filter((v) => !exclude.has(v.key));
}

export function buildContratoTeletrabajoEmployerGroupHint(
    sessionVars: Record<string, string | number>,
): string {
    const branch =
        resolveTeletrabajoEmployerBranch(sessionVars.employerIsCompany) ??
        inferTeletrabajoEmployerBranch(sessionVars);

    if (!branch) {
        return (
            ' Contrato de Teletrabajo employer: primero confirma si la parte empleadora es Empresa o Persona física (valores exactos del schema). ' +
            'Pregunta solo variables en pendingGroup.group.variables.'
        );
    }

    const origin = String(sessionVars.employerCompanyNationalOrForeign ?? '').trim();
    const includeRnc = String(sessionVars.employerIncludeRncMercantileIdentificationInContract ?? '').trim();
    const hasDr = String(sessionVars.employerHasDominicanRnc ?? '').trim();

    if (branch === 'Empresa') {
        let hint =
            ' Contrato de Teletrabajo employer (Empresa): FORBIDDEN to ask employerNationality, employerMaritalStatus, employerOccupation, employerIdType, employerIdNumber — son de persona física. ';
        if (origin === 'Nacional') {
            hint +=
                'La empresa es Nacional: NO preguntes si es extranjera ni si tiene RNC en RD por ser extranjera; pide RNC y Registro Mercantil si aún faltan. ';
        }
        if (origin === 'Extranjera' && hasDr === 'No') {
            hint +=
                'Empresa extranjera sin RNC en RD: NO pidas RNC ni Registro Mercantil (la cláusula se omite en el PDF). ';
        }
        if (includeRnc === 'No') {
            hint += 'employerIncludeRncMercantileIdentificationInContract es No: NO pidas RNC ni Registro Mercantil. ';
        }
        return hint + 'Solo variables en pendingGroup.group.variables.';
    }

    return (
        ' Contrato de Teletrabajo employer (Persona física): NO pidas employerCompanyNationalOrForeign, RNC, Registro Mercantil ni datos del representante legal. ' +
        'Solo variables en pendingGroup.group.variables.'
    );
}

export function buildContratoTeletrabajoCostsGroupHint(sessionVars: Record<string, string | number>): string {
    const coverage = String(sessionVars.hasCostCoverage ?? '').trim();
    if (coverage === 'No') {
        return ' Contrato de Teletrabajo costs: hasCostCoverage es No — NO vuelvas a preguntar costos adicionales detallados ni montos mensuales; solo costResponsible si falta. Dado que indicaron que no habrá costos adicionales específicos, pregúntale al usuario quién asumirá los costos generales del teletrabajo (EL EMPLEADOR o EL TRABAJADOR), por ejemplo: "Aunque no se detallen montos específicos, ¿quién asumirá los costos generales del teletrabajo?".';
    }
    return '';
}

/** Auto-fill notary / signing helpers for Teletrabajo PDF. */
export function fillContratoTeletrabajoDerivedFields(out: Record<string, string | number>): boolean {
    let changed = false;

    const branch = resolveTeletrabajoEmployerBranch(out.employerIsCompany);
    const rep = String(out.employerRepFullName ?? '').trim();
    const legal = String(out.employerLegalName ?? '').trim();
    const target =
        branch === 'Empresa' && rep ? rep : legal;
    if (target && String(out.employerOrRepFullName ?? '').trim() !== target) {
        out.employerOrRepFullName = target;
        changed = true;
    }

    const province = String(out.signingProvince ?? '').trim();
    if (province && !String(out.notaryJurisdiction ?? '').trim()) {
        out.notaryJurisdiction = province;
        changed = true;
    }

    return changed;
}
