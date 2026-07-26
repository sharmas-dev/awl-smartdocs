/**
 * Contrato de Teletrabajo — employer and group question pacing (one wave per turn).
 */

import {
    inferTeletrabajoEmployerBranch,
    resolveTeletrabajoEmployerBranch,
} from './contrato-teletrabajo-employer-branch.js';

const FOLLOW_UP_CLOSER = 'Seguimos cuando quieras.';

export type TeletrabajoEmployerWave = {
    waveIndex: number;
    keys: string[];
};

const OPENING_EMPLOYER_KEYS = [
    'employerIsCompany',
    'employerLegalName',
    'employerFullAddressStreet',
] as const;

function buildEmpresaWavePlan(vars: Record<string, string | number>): string[][] {
    const waves: string[][] = [
        ['employerIsCompany', 'employerLegalName', 'employerFullAddressStreet'],
        ['employerFullAddressCity', 'employerFullAddressCountry'],
        ['employerCompanyNationalOrForeign'],
    ];

    const origin = String(vars.employerCompanyNationalOrForeign ?? '').trim();
    if (origin === 'Extranjera') {
        waves.push(['employerHasDominicanRnc']);
    }

    const include = String(vars.employerIncludeRncMercantileIdentificationInContract ?? '').trim();
    const hasDr = String(vars.employerHasDominicanRnc ?? '').trim();
    const skipRnc = origin === 'Extranjera' && hasDr === 'No';
    if (!skipRnc && (origin === 'Nacional' || include === 'Sí' || hasDr === 'Sí')) {
        waves.push(['employerRnc', 'employerMercantileRegistryNumber']);
    }

    if (!String(vars.employerJurisdiction ?? '').trim()) {
        waves.push(['employerJurisdiction']);
    }

    waves.push(
        ['employerRepTitle', 'employerRepFullName', 'employerRepNationality'],
        ['employerRepIdType', 'employerRepIdNumber'],
        ['employerRepAddressStreet', 'employerRepAddressCity', 'employerRepAddressCountry'],
    );

    return waves;
}

function buildPersonaWavePlan(): string[][] {
    return [
        ['employerIsCompany', 'employerLegalName', 'employerFullAddressStreet'],
        ['employerFullAddressCity', 'employerFullAddressCountry'],
        ['employerNationality', 'employerMaritalStatus'],
        ['employerOccupation'],
        ['employerIdType', 'employerIdNumber'],
    ];
}

function pickWaveFromPlan(
    plan: string[][],
    missingKeys: Iterable<string>,
): TeletrabajoEmployerWave | null {
    const missing = new Set(missingKeys);
    for (let waveIndex = 0; waveIndex < plan.length; waveIndex++) {
        const waveKeys = plan[waveIndex];
        const pending = waveKeys.filter((key) => missing.has(key));
        if (pending.length > 0) {
            return { waveIndex, keys: pending };
        }
    }
    return null;
}

export function pickTeletrabajoEmpresaWave(
    missingKeys: Iterable<string>,
    vars: Record<string, string | number> = {},
): TeletrabajoEmployerWave | null {
    return pickWaveFromPlan(buildEmpresaWavePlan(vars), missingKeys);
}

export function pickTeletrabajoPersonaWave(
    missingKeys: Iterable<string>,
): TeletrabajoEmployerWave | null {
    return pickWaveFromPlan(buildPersonaWavePlan(), missingKeys);
}

export function sliceTeletrabajoOpeningEmployerKeys(
    pendingKeys: string[],
): string[] {
    const opening = new Set<string>(OPENING_EMPLOYER_KEYS);
    const filtered = pendingKeys.filter((k) => opening.has(k));
    return filtered.length > 0 ? filtered : pendingKeys.slice(0, 3);
}

export function sliceTeletrabajoPendingVariables<
    T extends { key: string; label: string; type: string; required: boolean; options?: string[] },
>(
    groupId: string,
    variables: T[],
    missingKeys: Iterable<string>,
    vars: Record<string, string | number>,
    options?: { openingEmployerOnly?: boolean },
): T[] {
    if (groupId === 'employer') {
        const branch =
            resolveTeletrabajoEmployerBranch(vars.employerIsCompany) ??
            inferTeletrabajoEmployerBranch(vars);

        if (options?.openingEmployerOnly) {
            const keySet = new Set(sliceTeletrabajoOpeningEmployerKeys([...missingKeys]));
            return variables.filter((v) => keySet.has(v.key));
        }

        if (!branch) {
            const keySet = new Set(sliceTeletrabajoOpeningEmployerKeys([...missingKeys]));
            return variables.filter((v) => keySet.has(v.key));
        }

        const missing = new Set(missingKeys);
        const wave =
            branch === 'Empresa'
                ? pickTeletrabajoEmpresaWave(missing, vars)
                : pickTeletrabajoPersonaWave(missing);

        if (!wave) return variables;
        const waveKeySet = new Set(wave.keys);
        return variables.filter((v) => waveKeySet.has(v.key));
    }

    if (groupId === 'schedule') {
        const missing = new Set(missingKeys);
        if (missing.has('workSchedule') && missing.has('lunchBreakDuration')) {
            return variables.filter((v) => v.key === 'workSchedule');
        }
        if (missing.has('lunchBreakDuration') && !missing.has('workSchedule')) {
            return variables.filter((v) => v.key === 'lunchBreakDuration');
        }
    }

    if (groupId === 'salary') {
        const missing = new Set(missingKeys);
        if (missing.has('salaryInWords') && missing.has('salaryAmountWithCurrency')) {
            return variables.filter((v) => v.key === 'salaryAmountWithCurrency');
        }
    }

    return variables;
}

function inferWaveFromPendingKeys(
    plan: string[][],
    pendingKeys: string[],
): TeletrabajoEmployerWave | null {
    if (pendingKeys.length === 0) return null;
    const firstKey = pendingKeys[0];
    for (let waveIndex = 0; waveIndex < plan.length; waveIndex++) {
        if (plan[waveIndex].includes(firstKey)) {
            return { waveIndex, keys: pendingKeys };
        }
    }
    return null;
}

export function buildTeletrabajoEmpresaFollowUpMessage(
    wave: TeletrabajoEmployerWave | null,
    vars: Record<string, string | number>,
): string | null {
    if (!wave || wave.keys.length === 0) return null;

    let body: string;

    if (wave.keys.includes('employerIsCompany') || wave.keys.includes('employerLegalName') || wave.keys.includes('employerFullAddressStreet')) {
        body =
            'Gracias. Recibido. Para la parte empleadora, indícame si es Empresa o Persona física, su nombre legal o razón social y la calle o vía de su domicilio.';
    } else if (wave.keys.includes('employerFullAddressCity') || wave.keys.includes('employerFullAddressCountry')) {
        body =
            'Gracias. Recibido. Por favor indícame la ciudad y el país del domicilio social del empleador.';
    } else if (wave.keys.includes('employerCompanyNationalOrForeign')) {
        body =
            'Gracias. Recibido. ¿La empresa es nacional (constituida bajo las leyes de República Dominicana) o extranjera?';
    } else if (wave.keys.includes('employerHasDominicanRnc')) {
        body =
            'Gracias. Recibido. ¿La empresa extranjera cuenta con un RNC en República Dominicana? (Sí o No.)';
    } else if (wave.keys.includes('employerRnc') || wave.keys.includes('employerMercantileRegistryNumber')) {
        body =
            'Gracias. Recibido. Por favor indícame el RNC y el número de Registro Mercantil de la empresa.';
    } else if (wave.keys.includes('employerJurisdiction')) {
        body =
            'Gracias. Recibido. Por favor indícame la jurisdicción legal de la empresa (por ejemplo, República Dominicana o Colombia).';
    } else if (wave.keys.includes('employerRepTitle') || wave.keys.includes('employerRepFullName') || wave.keys.includes('employerRepNationality')) {
        body =
            'Gracias. Recibido. Por favor indícame el cargo del representante, su nombre completo y su nacionalidad.';
    } else if (wave.keys.includes('employerRepIdType') || wave.keys.includes('employerRepIdNumber')) {
        body =
            'Gracias. Recibido. Por favor indícame si el representante se identifica con cédula o pasaporte y el número de documento.';
    } else if (wave.keys.includes('employerRepAddressStreet') || wave.keys.includes('employerRepAddressCity') || wave.keys.includes('employerRepAddressCountry')) {
        body =
            'Gracias. Recibido. Por favor indícame la calle, ciudad y país del domicilio del representante legal.';
    } else {
        // Fallback to static waveIndex for test/backward compatibility
        switch (wave.waveIndex) {
            case 0:
                body =
                    'Gracias. Recibido. Para la parte empleadora, indícame si es Empresa o Persona física, su nombre legal o razón social y la calle o vía de su domicilio.';
                break;
            case 1:
                body =
                    'Gracias. Recibido. Por favor indícame la ciudad y el país del domicilio social del empleador.';
                break;
            case 2:
                body =
                    'Gracias. Recibido. ¿La empresa es nacional (constituida bajo las leyes de República Dominicana) o extranjera?';
                break;
            case 3:
                body =
                    'Gracias. Recibido. ¿La empresa extranjera cuenta con un RNC en República Dominicana? (Sí o No.)';
                break;
            case 4:
                body =
                    'Gracias. Recibido. Por favor indícame el RNC y el número de Registro Mercantil de la empresa.';
                break;
            case 5:
                body =
                    'Gracias. Recibido. Por favor indícame la jurisdicción legal de la empresa (por ejemplo, República Dominicana o Colombia).';
                break;
            case 6:
                body =
                    'Gracias. Recibido. Por favor indícame el cargo del representante, su nombre completo y su nacionalidad.';
                break;
            case 7:
                body =
                    'Gracias. Recibido. Por favor indícame si el representante se identifica con cédula o pasaporte y el número de documento.';
                break;
            case 8:
                body =
                    'Gracias. Recibido. Por favor indícame la calle, ciudad y país del domicilio del representante legal.';
                break;
            default:
                return null;
        }
    }

    if (
        wave.keys.includes('employerJurisdiction') &&
        String(vars.employerCompanyNationalOrForeign ?? '').trim() === 'Nacional' &&
        String(vars.employerJurisdiction ?? '').trim()
    ) {
        return null;
    }

    return `${body}\n\n${FOLLOW_UP_CLOSER}`;
}

export function buildTeletrabajoPersonaFollowUpMessage(wave: TeletrabajoEmployerWave | null): string | null {
    if (!wave || wave.keys.length === 0) return null;

    let body: string;
    
    if (wave.keys.includes('employerIsCompany') || wave.keys.includes('employerLegalName') || wave.keys.includes('employerFullAddressStreet')) {
        body =
            'Gracias. Recibido. Para la parte empleadora persona física, indícame su nombre legal completo y la calle o vía de su domicilio.';
    } else if (wave.keys.includes('employerFullAddressCity') || wave.keys.includes('employerFullAddressCountry')) {
        body = 'Gracias. Recibido. Por favor indícame la ciudad y el país de su domicilio.';
    } else if (wave.keys.includes('employerNationality') || wave.keys.includes('employerMaritalStatus')) {
        body =
            'Gracias. Recibido. Por favor indícame la nacionalidad y el estado civil del empleador persona física.';
    } else if (wave.keys.includes('employerOccupation')) {
        body = 'Gracias. Recibido. Por favor indícame la ocupación del empleador.';
    } else if (wave.keys.includes('employerIdType') || wave.keys.includes('employerIdNumber')) {
        body =
            'Gracias. Recibido. Por favor indícame si se identifica con cédula o pasaporte y el número de documento.';
    } else {
        // Fallback to static waveIndex for test/backward compatibility
        switch (wave.waveIndex) {
            case 0:
                body =
                    'Gracias. Recibido. Para la parte empleadora persona física, indícame su nombre legal completo y la calle o vía de su domicilio.';
                break;
            case 1:
                body = 'Gracias. Recibido. Por favor indícame la ciudad y el país de su domicilio.';
                break;
            case 2:
                body =
                    'Gracias. Recibido. Por favor indícame la nacionalidad y el estado civil del empleador persona física.';
                break;
            case 3:
                body = 'Gracias. Recibido. Por favor indícame la ocupación del empleador.';
                break;
            case 4:
                body =
                    'Gracias. Recibido. Por favor indícame si se identifica con cédula o pasaporte y el número de documento.';
                break;
            default:
                return null;
        }
    }

    return `${body}\n\n${FOLLOW_UP_CLOSER}`;
}

export function buildTeletrabajoScheduleFollowUpMessage(pendingKeys: string[]): string | null {
    if (pendingKeys.includes('workSchedule')) {
        return (
            'Gracias. Recibido. Por favor indícame el horario de trabajo del empleado (días y hora de inicio y fin, por ejemplo de lunes a viernes de 8:00 a.m. a 5:00 p.m.).\n\n' +
            FOLLOW_UP_CLOSER
        );
    }
    if (pendingKeys.includes('lunchBreakDuration')) {
        return (
            'Gracias. Recibido. ¿Cuánto tiempo de descanso tendrá para el almuerzo? (por ejemplo, una (1) hora).\n\n' +
            FOLLOW_UP_CLOSER
        );
    }
    return null;
}

export function buildTeletrabajoFollowUpMessage(
    groupId: string,
    vars: Record<string, string | number>,
    pendingKeys: string[],
): string | null {
    if (groupId === 'employer') {
        const branch =
            resolveTeletrabajoEmployerBranch(vars.employerIsCompany) ??
            inferTeletrabajoEmployerBranch(vars);
        if (branch === 'Empresa') {
            const plan = buildEmpresaWavePlan(vars);
            const wave = inferWaveFromPendingKeys(plan, pendingKeys);
            return buildTeletrabajoEmpresaFollowUpMessage(wave, vars);
        }
        if (branch === 'Persona física') {
            const wave = inferWaveFromPendingKeys(buildPersonaWavePlan(), pendingKeys);
            return buildTeletrabajoPersonaFollowUpMessage(wave);
        }
        return null;
    }
    if (groupId === 'schedule') {
        return buildTeletrabajoScheduleFollowUpMessage(pendingKeys);
    }
    return null;
}
