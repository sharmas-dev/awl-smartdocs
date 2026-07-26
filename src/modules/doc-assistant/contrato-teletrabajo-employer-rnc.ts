/**
 * Contrato de Teletrabajo — employer identification clause (RNC + Registro Mercantil).
 * Computes whether the opening paragraph must include the RNC/RM sentence and clears
 * stored RNC/RM when a foreign company has no Dominican RNC.
 */
export function applyContratoTeletrabajoEmployerRncIdentificationFlag(out: Record<string, string | number>): boolean {
    let changed = false;
    const isEmpresa = String(out.employerIsCompany ?? '').toLowerCase() === 'empresa';
    if (!isEmpresa) {
        if ('employerIncludeRncMercantileIdentificationInContract' in out) {
            delete out.employerIncludeRncMercantileIdentificationInContract;
            changed = true;
        }
        if ('employerCompanyNationalOrForeign' in out) {
            delete out.employerCompanyNationalOrForeign;
            changed = true;
        }
        if ('employerHasDominicanRnc' in out) {
            delete out.employerHasDominicanRnc;
            changed = true;
        }
        return changed;
    }

    const originRaw = typeof out.employerCompanyNationalOrForeign === 'string' ? out.employerCompanyNationalOrForeign.trim() : '';
    const hasRncStored = String(out.employerRnc ?? '').trim() !== '';

    /** Sessions created before this feature may lack nacional/extranjera; infer Nacional when RNC was already captured. */
    if (!originRaw && hasRncStored) {
        out.employerCompanyNationalOrForeign = 'Nacional';
        changed = true;
    }

    const origin = String(out.employerCompanyNationalOrForeign ?? '').trim();
    const hasDr = typeof out.employerHasDominicanRnc === 'string' ? out.employerHasDominicanRnc.trim() : '';

    if (origin === 'Nacional' && 'employerHasDominicanRnc' in out) {
        delete out.employerHasDominicanRnc;
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
        if (out.employerIncludeRncMercantileIdentificationInContract !== include) {
            out.employerIncludeRncMercantileIdentificationInContract = include;
            changed = true;
        }
        if (include === 'No') {
            if (String(out.employerRnc ?? '').trim() !== '') {
                out.employerRnc = '';
                changed = true;
            }
            if (String(out.employerMercantileRegistryNumber ?? '').trim() !== '') {
                out.employerMercantileRegistryNumber = '';
                changed = true;
            }
        }
    } else {
        if ('employerIncludeRncMercantileIdentificationInContract' in out) {
            delete out.employerIncludeRncMercantileIdentificationInContract;
            changed = true;
        }
    }

    return changed;
}
