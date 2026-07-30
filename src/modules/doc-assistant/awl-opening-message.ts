/**
 * Deterministic AWL opening chat copy — enforced on bootstrap (awliPhase=opening).
 * The assistant must output openingChatMessage verbatim (see submit_group_answers).
 */

import { isContratoTeletrabajoTemplate, normalizeTemplateNameKey } from './template-name.js';

export { isContratoTeletrabajoTemplate };

export const AWL_PLATFORM_PARAGRAPH =
    'Desde AWL, como plataforma de soluciones legales integrales, estamos convencidos de que el acceso a servicios legales de calidad, a precio justo y de manera ágil, es una prioridad. Por esto, estoy aquí para apoyarte.';

const PRIMER_PASO_PREFIX =
    'Como primer paso, te estaré solicitando la información que necesitamos para personalizar tu documento.';

const OPENING_CLOSER = 'Estaré al tanto para continuar con el siguiente paso.';

export type OpeningPendingField = { key: string; label: string };

export function isReciboDescargoTemplate(templateName: string): boolean {
    const k = normalizeTemplateNameKey(templateName);
    return (
        k === normalizeTemplateNameKey('Recibo de Descargo Laboral') ||
        k === normalizeTemplateNameKey('Recibo de Descargo Trabajadora Doméstica')
    );
}

/** True when the purchase session has no saved answers yet — first branded AWL opener applies. */
export function shouldUseAwliOpeningPhase(input: {
    completedGroups: string[];
    savedAnswerKeys: string[];
    sessionVariableCount: number;
}): boolean {
    return (
        input.completedGroups.length === 0 &&
        input.savedAnswerKeys.length === 0 &&
        input.sessionVariableCount === 0
    );
}

function defaultAwlIntro(templateName: string): string {
    return `¡Hola!,\n\nSoy AWLi, tu asistente legal para completar tu documento legal ${templateName}.\n\n${AWL_PLATFORM_PARAGRAPH}`;
}

/** First-question paragraph after the branded intro (max 4 schema fields). */
export function buildOpeningFirstQuestions(
    templateName: string,
    groupId: string,
    pendingFields: OpeningPendingField[],
): string {
    const key = normalizeTemplateNameKey(templateName);
    const pendingKeys = pendingFields.map((f) => f.key);

    if (isReciboDescargoTemplate(templateName) && groupId === 'declarantInfo') {
        const rol =
            key === normalizeTemplateNameKey('Recibo de Descargo Trabajadora Doméstica')
                ? 'de la trabajadora doméstica'
                : 'del trabajador';
        return `${PRIMER_PASO_PREFIX} Para empezar, favor indícame el nombre legal completo ${rol}, su nacionalidad, su tipo de documento de identidad (cédula o pasaporte) y el número correspondiente.`;
    }

    if (isContratoTeletrabajoTemplate(templateName) && groupId === 'employer') {
        return `${PRIMER_PASO_PREFIX} Para identificar a la parte empleadora en el contrato, indícame si es Empresa o Persona física, su nombre legal o razón social, y su dirección o ubicación física completa (calle, ciudad y país).`;
    }

    if (
        (key === normalizeTemplateNameKey('Contrato de Trabajadora Doméstica') ||
            key === normalizeTemplateNameKey('Propuesta de Trabajo')) &&
        (groupId === 'employer' || groupId === 'company')
    ) {
        if (groupId === 'company') {
            return `${PRIMER_PASO_PREFIX} Para empezar, favor indícame la razón social de la empresa, su RNC, su Registro Mercantil y su Registro Nacional del Locador.`;
        }
        return `${PRIMER_PASO_PREFIX} Para identificar a la parte empleadora, favor indícame el nombre completo del empleador, si se identifica con Cédula o Pasaporte, el número de dicho documento y su dirección completa.`;
    }

    if (key === normalizeTemplateNameKey('Contrato de Trabajo') && groupId === 'employer') {
        return `${PRIMER_PASO_PREFIX} Para empezar, ¿el empleador en este contrato es Empresa o Persona física? También indícame su nombre legal completo, su jurisdicción de constitución y su RNC.`;
    }

    if (key === normalizeTemplateNameKey('Contrato de Compraventa Vehículo') && groupId === 'seller') {
        return `${PRIMER_PASO_PREFIX} Para empezar con el vendedor, indícame si es empresa o persona física, su nombre legal completo y su dirección completa.`;
    }

    if (key === normalizeTemplateNameKey('Declaración Jurada de Domicilio') && groupId === 'declarant') {
        return `${PRIMER_PASO_PREFIX} Para empezar, favor indícame el nombre legal completo del declarante, su nacionalidad, su tipo de documento de identidad (cédula o pasaporte) y el número correspondiente.`;
    }

    if (
        key === normalizeTemplateNameKey('Notificación de Terminación Contrato de Alquiler') &&
        groupId === 'sender'
    ) {
        return `${PRIMER_PASO_PREFIX} Para empezar, favor indícame el nombre completo del arrendador, su nacionalidad, su tipo de documento de identidad (cédula o pasaporte) y el número correspondiente.`;
    }

    if (groupId === 'declarantInfo' && pendingKeys.includes('declarantFullName')) {
        return `${PRIMER_PASO_PREFIX} Para empezar, favor indícame el nombre legal completo del declarante, su nacionalidad, su tipo de documento de identidad (cédula o pasaporte) y el número correspondiente.`;
    }

    if (groupId === 'employer' && pendingKeys.includes('employerFullName')) {
        return `${PRIMER_PASO_PREFIX} Para identificar a la parte empleadora, favor indícame el nombre completo del empleador, si se identifica con Cédula o Pasaporte, el número de dicho documento y su dirección completa.`;
    }

    if (
        groupId === 'employer' &&
        pendingKeys.includes('employerLegalName') &&
        !isContratoTeletrabajoTemplate(templateName)
    ) {
        return `${PRIMER_PASO_PREFIX} Para empezar, ¿el empleador en este contrato es Empresa o Persona física? También indícame su nombre legal completo, su jurisdicción de constitución y su RNC.`;
    }

    const slice = pendingFields.slice(0, 4);
    if (slice.length === 0) {
        return `${PRIMER_PASO_PREFIX} Para empezar, comparte los datos que te solicitaré a continuación.`;
    }
    const phrases = slice.map((f) => phraseForPendingField(f));
    const joined =
        phrases.length === 1
            ? phrases[0]
            : `${phrases.slice(0, -1).join(', ')} y ${phrases[phrases.length - 1]}`;
    return `${PRIMER_PASO_PREFIX} Para empezar, favor indícame ${joined}.`;
}

function phraseForPendingField(field: OpeningPendingField): string {
    const k = field.key.toLowerCase();
    if (/fullname|legalname/i.test(k)) return 'el nombre legal completo';
    if (/nationality|nacionalidad/i.test(k)) return 'la nacionalidad';
    if (/idtype/i.test(k)) return 'el tipo de documento de identidad (cédula o pasaporte)';
    if (/idnumber|idnum/i.test(k)) return 'el número de documento';
    if (/address/i.test(k)) return 'la dirección completa';
    if (/iscompany/i.test(k)) return 'si la parte es empresa o persona física';
    if (/rnc$/i.test(k) && !/hasdominicanrnc$|includernc/i.test(k)) return 'el RNC';
    const label = field.label.replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase();
    if (label.length > 0 && label.length < 120) return label;
    return field.key;
}

/**
 * Full first-turn chat message for awliPhase=opening, or null when not applicable.
 */
export function buildOpeningChatMessage(
    templateName: string,
    groupId: string,
    pendingFields: OpeningPendingField[],
): string | null {
    if (pendingFields.length === 0) return null;

    const questions = buildOpeningFirstQuestions(templateName, groupId, pendingFields);
    const intro = defaultAwlIntro(templateName);

    return `${intro}\n\n${questions}\n\n${OPENING_CLOSER}`;
}
