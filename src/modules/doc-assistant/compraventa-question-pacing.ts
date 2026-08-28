/**
 * Contrato de Compraventa Vehículo — seller/buyer question pacing (one wave per turn).
 */

import {
    isCompraventaTypeLabelAutoFilled,
    resolveCompraventaPartyChoice,
    type CompraventaPartyPrefix,
} from './compraventa-party-branch.js';

const FOLLOW_UP_CLOSER = 'Seguimos cuando quieras.';

function partyKey(prefix: CompraventaPartyPrefix, suffix: string): string {
    return `${prefix}${suffix}`;
}

export type CompraventaEmpresaWave = {
    waveIndex: number;
    keys: string[];
};

export type CompraventaPersonaWave = {
    waveIndex: number;
    keys: string[];
};

function buildEmpresaWavePlan(
    prefix: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
): string[][] {
    const waves: string[][] = [['Jurisdiction'], ['CompanyOrigin']];
    const origin = String(vars[partyKey(prefix, 'CompanyOrigin')] ?? '').trim();
    if (origin === 'Extranjera') {
        waves.push(['HasDominicanRnc']);
    }
    const include = String(vars[partyKey(prefix, 'IncludeRncInContract')] ?? '').trim();
    if (include === 'Sí') {
        waves.push(['Rnc']);
    }
    waves.push(
        ['RepTitle', 'RepFullName', 'RepNationality'],
        ['RepIdType', 'RepIdNumber'],
        ['RepFullAddress'],
    );
    return waves;
}

function buildPersonaWavePlan(
    prefix: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
): string[][] {
    const waves: string[][] = [];
    if (!isCompraventaTypeLabelAutoFilled(prefix, vars)) {
        waves.push(['Gender']);
    }
    waves.push(['Nationality'], ['MaritalStatus']);
    if (String(vars[partyKey(prefix, 'MaritalStatus')] ?? '').trim() === 'casado(a)') {
        waves.push(['HasCommunityProperty']);
    }
    waves.push(['IdType', 'IdNumber'], ['FullAddress']);
    if (String(vars[partyKey(prefix, 'HasCommunityProperty')] ?? '').trim() === 'Sí') {
        waves.push(
            ['SpouseFullName', 'SpouseNationality'],
            ['SpouseIdType', 'SpouseIdNumber'],
            ['SpouseAddress'],
        );
    }
    return waves;
}

function pickWaveFromPlan(
    prefix: CompraventaPartyPrefix,
    plan: string[][],
    missingKeys: Iterable<string>,
): CompraventaEmpresaWave | null {
    const missing = new Set(missingKeys);
    for (let waveIndex = 0; waveIndex < plan.length; waveIndex++) {
        const suffixes = plan[waveIndex];
        const waveKeys = suffixes.map((suffix) => partyKey(prefix, suffix));
        const pending = waveKeys.filter((key) => missing.has(key));
        if (pending.length > 0) {
            return { waveIndex, keys: pending };
        }
    }
    return null;
}

/** @deprecated Use buildEmpresaWavePlan — kept for tests referencing static waves */
export const COMPRAVENTA_EMPRESA_WAVE_SUFFIXES: readonly (readonly string[])[] = [
    ['Jurisdiction'],
    ['CompanyOrigin'],
    ['HasDominicanRnc'],
    ['Rnc'],
    ['RepTitle', 'RepFullName', 'RepNationality'],
    ['RepIdType', 'RepIdNumber'],
    ['RepFullAddress'],
] as const;

function pickLegalNameWaveIfMissing(
    prefix: CompraventaPartyPrefix,
    missingKeys: Iterable<string>,
): { waveIndex: number; keys: string[] } | null {
    const nameKey = partyKey(prefix, 'LegalName');
    if (new Set(missingKeys).has(nameKey)) {
        return { waveIndex: 0, keys: [nameKey] };
    }
    return null;
}

export function pickCompraventaEmpresaWave(
    prefix: CompraventaPartyPrefix,
    missingKeys: Iterable<string>,
    vars: Record<string, string | number> = {},
): CompraventaEmpresaWave | null {
    return (
        pickLegalNameWaveIfMissing(prefix, missingKeys) ??
        pickWaveFromPlan(prefix, buildEmpresaWavePlan(prefix, vars), missingKeys)
    );
}

export function pickCompraventaPersonaWave(
    prefix: CompraventaPartyPrefix,
    missingKeys: Iterable<string>,
    vars: Record<string, string | number>,
): CompraventaPersonaWave | null {
    return (
        pickLegalNameWaveIfMissing(prefix, missingKeys) ??
        pickWaveFromPlan(prefix, buildPersonaWavePlan(prefix, vars), missingKeys)
    );
}

export function sliceCompraventaPendingVariables<
    T extends { key: string; label: string; type: string; required: boolean; options?: string[] },
>(
    groupId: string,
    variables: T[],
    missingKeys: Iterable<string>,
    vars: Record<string, string | number>,
): T[] {
    if (groupId !== 'seller' && groupId !== 'buyer') {
        return variables;
    }

    const prefix = groupId as CompraventaPartyPrefix;
    const choice = resolveCompraventaPartyChoice(prefix, vars);
    if (!choice) {
        return variables;
    }

    const missing = new Set(missingKeys);
    const wave =
        choice === 'Empresa'
            ? pickCompraventaEmpresaWave(prefix, missing, vars)
            : pickCompraventaPersonaWave(prefix, missing, vars);

    if (!wave) {
        return variables;
    }

    const waveKeySet = new Set(wave.keys);
    return variables.filter((variable) => waveKeySet.has(variable.key));
}

export function inferCompraventaEmpresaWaveFromPendingKeys(
    prefix: CompraventaPartyPrefix,
    pendingKeys: string[],
    vars: Record<string, string | number> = {},
): CompraventaEmpresaWave | null {
    if (pendingKeys.length === 0) {
        return null;
    }
    const legalNameKey = partyKey(prefix, 'LegalName');
    if (pendingKeys.includes(legalNameKey)) {
        return { waveIndex: 0, keys: [legalNameKey] };
    }
    const plan = buildEmpresaWavePlan(prefix, vars);
    const firstKey = pendingKeys[0];
    const suffix = firstKey.startsWith(prefix) ? firstKey.slice(prefix.length) : '';
    for (let waveIndex = 0; waveIndex < plan.length; waveIndex++) {
        if (plan[waveIndex].includes(suffix)) {
            return { waveIndex, keys: pendingKeys };
        }
    }
    return null;
}

export function inferCompraventaPersonaWaveFromPendingKeys(
    prefix: CompraventaPartyPrefix,
    pendingKeys: string[],
    vars: Record<string, string | number> = {},
): CompraventaPersonaWave | null {
    if (pendingKeys.length === 0) {
        return null;
    }
    const legalNameKey = partyKey(prefix, 'LegalName');
    if (pendingKeys.includes(legalNameKey)) {
        return { waveIndex: 0, keys: [legalNameKey] };
    }
    const plan = buildPersonaWavePlan(prefix, vars);
    const firstKey = pendingKeys[0];
    const suffix = firstKey.startsWith(prefix) ? firstKey.slice(prefix.length) : '';
    for (let waveIndex = 0; waveIndex < plan.length; waveIndex++) {
        if (plan[waveIndex].includes(suffix)) {
            return { waveIndex, keys: pendingKeys };
        }
    }
    return null;
}

export function buildCompraventaEmpresaFollowUpMessage(
    groupId: string,
    wave: CompraventaEmpresaWave | null,
): string | null {
    if (groupId !== 'seller' && groupId !== 'buyer') {
        return null;
    }
    if (!wave || wave.keys.length === 0) {
        return null;
    }

    const partyLabel = groupId === 'seller' ? 'vendedor' : 'comprador';

    if (wave.keys.some((k) => k === 'sellerLegalName' || k === 'buyerLegalName')) {
        return (
            `Gracias. Recibido. Por favor indícame el nombre completo del ${partyLabel} (nombre y apellidos, o razón social).\n\n` +
            FOLLOW_UP_CLOSER
        );
    }

    let body: string;
    switch (wave.waveIndex) {
        case 0:
            body =
                `Gracias. Recibido. Ahora, sigamos con el resto de los datos que necesitamos para el ${partyLabel}. Por favor indícame el país donde se constituyó la sociedad.`;
            break;
        case 1:
            body =
                'Gracias. Recibido. ¿La sociedad es de capital dominicano (constituida en República Dominicana) o es una sociedad extranjera?';
            break;
        case 2:
            body = 'Gracias. Recibido. ¿La sociedad extranjera tiene RNC dominicano?';
            break;
        case 3:
            body = 'Gracias. Recibido. Por favor indícame el RNC de la sociedad.';
            break;
        case 4:
            body =
                'Gracias. Recibido. Por favor indícame el cargo de su representante legal (opcional: Gerente, Presidente o Secretario), su nombre completo y su nacionalidad.';
            break;
        case 5:
            body =
                'Gracias. Recibido. Por favor indícame si el representante se identifica con cédula o pasaporte y el número de documento.';
            break;
        case 6:
            body = 'Gracias. Recibido. Por favor indícame la dirección del representante legal.';
            break;
        default:
            return null;
    }

    return `${body}\n\n${FOLLOW_UP_CLOSER}`;
}

export function buildCompraventaPersonaFollowUpMessage(
    groupId: string,
    wave: CompraventaPersonaWave | null,
): string | null {
    if (groupId !== 'seller' && groupId !== 'buyer') {
        return null;
    }
    if (!wave || wave.keys.length === 0) {
        return null;
    }

    const partyLabel = groupId === 'seller' ? 'vendedor' : 'comprador';

    if (wave.keys.some((k) => k === 'sellerLegalName' || k === 'buyerLegalName')) {
        return (
            `Gracias. Recibido. Por favor indícame el nombre completo del ${partyLabel} (nombre y apellidos).\n\n` +
            FOLLOW_UP_CLOSER
        );
    }

    let body: string;
    switch (wave.waveIndex) {
        case 0:
            body = `Gracias. Recibido. Indícame el género del ${partyLabel}: hombre o mujer.`;
            break;
        case 1:
            body = `Gracias. Recibido. Por favor indícame la nacionalidad del ${partyLabel}.`;
            break;
        case 2:
            body = `Gracias. Recibido. Por favor indícame el estado civil del ${partyLabel}.`;
            break;
        case 3:
            body =
                'Gracias. Recibido. ¿Está casado bajo comunidad de bienes? (Responda Sí o No.)';
            break;
        case 4:
            body =
                'Gracias. Recibido. Por favor indícame si se identifica con cédula o pasaporte y el número de documento.';
            break;
        case 5:
            body = `Gracias. Recibido. Por favor indícame la dirección completa del ${partyLabel} (calle y número, sector, ciudad, provincia y país).`;
            break;
        case 6:
            body =
                'Gracias. Recibido. Por favor indícame el nombre completo y la nacionalidad del cónyuge.';
            break;
        case 7:
            body =
                'Gracias. Recibido. Por favor indícame el tipo y número de documento de identidad del cónyuge.';
            break;
        case 8:
            body = 'Gracias. Recibido. Por favor indícame la dirección del cónyuge.';
            break;
        default:
            return null;
    }

    return `${body}\n\n${FOLLOW_UP_CLOSER}`;
}

export function buildCompraventaVehicleGroupIntroMessage(groupId: string): string | null {
    if (groupId !== 'vehicle') {
        return null;
    }
    return (
        'Ok, ahora estamos listos para pedir la información relacionada con el vehículo. Por favor indícame el número de chasis, el número de matrícula, la fecha de emisión de la matrícula, la marca, el modelo, el motor o número de serie, la placa y el color.\n\n' +
        FOLLOW_UP_CLOSER
    );
}

export function buildCompraventaFollowUpMessage(
    groupId: string,
    prefix: CompraventaPartyPrefix,
    vars: Record<string, string | number>,
    pendingKeys: string[],
): string | null {
    const choice = resolveCompraventaPartyChoice(prefix, vars);
    if (choice === 'Empresa') {
        const wave = inferCompraventaEmpresaWaveFromPendingKeys(prefix, pendingKeys, vars);
        return buildCompraventaEmpresaFollowUpMessage(groupId, wave);
    }
    if (choice === 'Persona física') {
        const wave = inferCompraventaPersonaWaveFromPendingKeys(prefix, pendingKeys, vars);
        return buildCompraventaPersonaFollowUpMessage(groupId, wave);
    }
    return null;
}
