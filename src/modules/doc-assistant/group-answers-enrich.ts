import { mapAnswersToGroupVariables } from './answer-key-map.js';
import {
    isIdNumberVariableKey,
    isRncVariableKey,
    looksLikeDominicanCedulaAttempt,
    normalizeCedulaNumberInput,
    normalizeRncNumberInput,
    shouldApplyCedulaDigitValidation,
    shouldApplyRncDigitValidation,
} from './cedula-validation.js';
import { enrichDeclarantInfoAnswers, parseDeclarantInfoNarrative } from './declarant-info-parse.js';
import { enrichEmployerInfoAnswers, parseEmployerInfoNarrative } from './employer-info-parse.js';
import { enrichEmployerGroupAnswers, parseEmployerGroupNarrative } from './employer-group-parse.js';
import { enrichContratoTeletrabajoEmployerAnswers } from './contrato-teletrabajo-employer-parse.js';
import { parseTeletrabajoStartDateFromText } from './contrato-teletrabajo-dates.js';
import {
    enrichReciboDomesticaGroupDates,
    extractSpanishFullDatesFromText,
} from './recibo-domestica-date-parse.js';
import { isInvalidPersonNameValue } from './person-name-sanitize.js';
import { extractSiNoChoiceFromNarrative } from './recibo-descargo-pending-toggles.js';

type GroupVariable = {
    key: string;
    label: string;
    type?: string;
    options?: string[];
};

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

function normalizeChoiceValue(raw: string, options?: string[]): string {
    const trimmed = raw.trim();
    if (!options?.length) return trimmed;
    const f = fold(trimmed);
    for (const opt of options) {
        if (fold(opt) === f || f.includes(fold(opt)) || fold(opt).includes(f)) return opt;
    }
    return trimmed;
}

/** Map bare "No" / "Sí" (and close variants) to schema dropdown options. */
export function parseShortSiNoChoiceReply(text: string, options?: string[]): string | undefined {
    const t = text.trim();
    if (!t || t.length > 120) return undefined;
    const f = fold(t);
    const noOpt = options?.find((o) => fold(o) === 'no') ?? 'No';
    const siOpt = options?.find((o) => fold(o) === 'si' || fold(o) === 'sí') ?? 'Sí';

    if (
        f === 'no' ||
        f === 'not' ||
        f === 'n' ||
        /^no\b/.test(f) ||
        /^not\b/.test(f) ||
        /^(no deseo|no quiero|no desea|sin concepto|ninguno|ninguna)\b/.test(f)
    ) {
        return noOpt;
    }
    if (f === 'si' || f === 'sí' || f === 's' || f === 'yes' || /^si\b/.test(f) || /^sí\b/.test(f)) {
        return siOpt;
    }
    return undefined;
}

function applyShortSiNoChoiceReplies(
    groupId: string,
    variables: GroupVariable[],
    mapped: Record<string, string | number>,
    mappedFrom: Record<string, string>,
    userMessage: string,
): boolean {
    const msg = userMessage.trim();
    if (!msg) return false;

    const choiceVars = variables.filter((v) => (v.options?.length ?? 0) > 0);
    if (choiceVars.length === 0) return false;

    let parsed = false;

    if (groupId === 'breakdownToggle') {
        const v = choiceVars.find((c) => c.key === 'hasDetailedBreakdown');
        if (!v) return false;
        if (mapped[v.key] != null && String(mapped[v.key]).trim() !== '') return false;
        const reply = parseShortSiNoChoiceReply(msg, v.options);
        if (!reply) return false;
        mapped[v.key] = reply;
        mappedFrom[`[short:${v.key}]`] = v.key;
        return true;
    }

    if (groupId !== 'breakdownAmounts') return false;

    for (const key of ['hasAdditionalConcept1', 'hasAdditionalConcept2'] as const) {
        const v = choiceVars.find((c) => c.key === key);
        if (!v) continue;
        if (mapped[key] != null && String(mapped[key]).trim() !== '') continue;
        if (key === 'hasAdditionalConcept2') {
            const c1 = String(mapped.hasAdditionalConcept1 ?? '').trim().toLowerCase();
            if (c1 !== 'sí' && c1 !== 'si') continue;
        }
        const reply =
            parseShortSiNoChoiceReply(msg, v.options) ?? extractSiNoChoiceFromNarrative(msg, v.options);
        if (!reply) continue;
        mapped[key] = reply;
        mappedFrom[`[short:${key}]`] = key;
        parsed = true;
        break;
    }

    return parsed;
}

/** Try to pull a value for one schema field from free-form Spanish text. */
function extractValueForVariable(
    groupId: string,
    v: GroupVariable,
    text: string,
): string | undefined {
    const t = text.trim();
    if (!t) return undefined;
    const key = v.key;
    const labelFold = fold(v.label);

    if (groupId === 'declarantInfo') {
        const decl = parseDeclarantInfoNarrative(t);
        if (decl[key]) return decl[key];
    }

    if (groupId === 'employerInfo') {
        const employer = parseEmployerInfoNarrative(t);
        if (employer[key]) return employer[key];
    }

    if (
        groupId === 'employer' &&
        (key === 'employerFullName' ||
            key === 'employerIdType' ||
            key === 'employerIdNumber' ||
            key === 'employerFullAddress')
    ) {
        const employer = parseEmployerGroupNarrative(t);
        if (employer[key]) return employer[key];
    }

    if (/nationality|nacionalidad/i.test(key) || labelFold.includes('nacionalidad')) {
        const m =
            t.match(/nacionalidad\s+(?:es\s+)?([a-záéíóúñ]+)/i) ??
            t.match(/es\s+de\s+nacionalidad\s+([a-záéíóúñ]+)/i);
        if (m?.[1]) return m[1].trim();
    }

    if (/fullname|legalname/i.test(key) && !/company|empresa|employeridblock/i.test(key)) {
        const m =
            t.match(/(?:se\s+llama|llamad[oa]|nombre(?:\s+completo)?(?:\s+es)?)\s+([^,]+?)(?=,\s*(?:es\b|y\s+se\b|con\s+))/i) ??
            t.match(/(?:trabajador(?:a)?|vendedor|comprador|empleador(?:a)?)\s+(?:se\s+llama\s+)?([^,]+)/i);
        if (m?.[1]) {
            const candidate = m[1].trim().replace(/\s+/g, ' ');
            if (!isInvalidPersonNameValue(candidate)) return candidate;
        }
    }

    if (/idtype/i.test(key) || /tipo de documento/i.test(labelFold)) {
        if (/pasaport/i.test(t)) return v.options?.find((o) => /pasaport/i.test(o)) ?? 'del Pasaporte';
        if (/c[eé]dula|electoral/i.test(t)) {
            return v.options?.find((o) => /c[eé]dula|electoral/i.test(o)) ?? 'de la Cédula de Identidad y Electoral';
        }
        if (/empresa|persona\s+f[ií]sica|persona\s+jur[ií]dica/i.test(t) && v.options?.length) {
            const hit = v.options.find((o) => fold(t).includes(fold(o)) || fold(o).includes(fold(t)));
            if (hit) return hit;
        }
    }

    if (isRncVariableKey(key)) {
        const m =
            t.match(/(?:n[uú]mero|no\.?)\s*([\d][\d\s.\-/]{6,15}[\d])/i) ??
            t.match(/\b(\d{3}-\d{5}-\d)\b/) ??
            t.match(/\b(\d{9})\b/);
        if (m?.[1]) {
            const rnc = normalizeRncNumberInput(m[1]);
            if (rnc.ok) return rnc.formatted;
        }
    }

    if (/idnumber|idnum|cedula/i.test(key) && !/block/i.test(key)) {
        const idTypeFromText = /pasaport/i.test(t)
            ? 'del Pasaporte'
            : /rnc|registro\s+nacional/i.test(t)
              ? 'RNC'
              : /c[eé]dula|electoral/i.test(t)
                ? 'de la Cédula de Identidad y Electoral'
                : '';
        const m =
            t.match(/(?:n[uú]mero|no\.?)\s*([\d][\d\s.\-/]{8,20}[\d])/i) ??
            t.match(/\b(\d{3}-\d{7}-\d)\b/) ??
            t.match(/\b(\d{3}-\d{5}-\d)\b/) ??
            t.match(/\b(\d{11})\b/) ??
            t.match(/\b(\d{9})\b/);
        if (m?.[1]) {
            if (shouldApplyRncDigitValidation(key, idTypeFromText, m[1])) {
                const rnc = normalizeRncNumberInput(m[1]);
                if (rnc.ok) return rnc.formatted;
            } else if (shouldApplyCedulaDigitValidation(key, idTypeFromText, m[1])) {
                const cedula = normalizeCedulaNumberInput(m[1]);
                if (cedula.ok) return cedula.formatted;
            }
        }
    }

    if (/address|domicilio|direcci[oó]n/i.test(key)) {
        const m = t.match(/(?:domicilio|direcci[oó]n)(?:\s+completa)?(?:\s+es)?\s+(.+?)(?:\.|$)/i);
        if (m?.[1]) return m[1].trim();
    }

    if (/iscompany|selleriscompany|buyeriscompany/i.test(key) && v.options?.length) {
        if (/empresa/i.test(t)) return v.options.find((o) => /empresa/i.test(o)) ?? 'Empresa';
        if (/persona\s+f[ií]sica|f[ií]sica/i.test(t)) return v.options.find((o) => /f[ií]sica/i.test(o)) ?? 'Persona física';
    }

    if (v.type === 'date' || /date$/i.test(key)) {
        const dates = extractSpanishFullDatesFromText(t);
        if (dates.length === 1) return dates[0];
        if (dates.length > 1 && /start|inicio|comenz/i.test(key)) return dates[0];
        if (dates.length > 1 && /end|fin|termin/i.test(key)) return dates[dates.length - 1];
        if (dates.length > 1 && /signing|firma/i.test(key)) return dates[dates.length - 1];
    }

    return undefined;
}

/**
 * Map LLM keys + optional userMessage narrative to schema keys for any group.
 */
export function enrichGroupAnswers(
    groupId: string,
    variables: GroupVariable[],
    answers: Record<string, string | number>,
    userMessage?: string,
): {
    mapped: Record<string, string | number>;
    unrecognizedKeys: string[];
    mappedFrom: Record<string, string>;
    parsedFromNarrative: boolean;
} {
    if (groupId === 'declarantInfo') {
        const decl = enrichDeclarantInfoAnswers(variables, {
            ...answers,
            ...(userMessage?.trim() ? { userMessage: userMessage.trim() } : {}),
        });
        return decl;
    }

    if (groupId === 'employerInfo') {
        return enrichEmployerInfoAnswers(variables, answers, userMessage);
    }

    if (groupId === 'employer' && variables.some((v) => v.key === 'employerCompanyNationalOrForeign')) {
        return enrichContratoTeletrabajoEmployerAnswers(variables, answers, userMessage);
    }

    if (groupId === 'employer' && variables.some((v) => v.key === 'employerFullName')) {
        return enrichEmployerGroupAnswers(variables, answers, userMessage);
    }

    const first = mapAnswersToGroupVariables(variables, answers);
    let mapped: Record<string, string | number> = { ...first.mapped };
    const mappedFrom = { ...first.mappedFrom };
    let parsedFromNarrative = false;

    const msg = userMessage?.trim() ?? '';
    const narrativeParts = Object.entries(answers)
        .filter(([, v]) => typeof v === 'string' && String(v).trim().length > 20)
        .map(([, v]) => String(v));
    const combined = [msg, ...narrativeParts].filter(Boolean).join(' ');

    if (msg && applyShortSiNoChoiceReplies(groupId, variables, mapped, mappedFrom, msg)) {
        parsedFromNarrative = true;
    }

    /** Short replies like "0018527413" must still reach id-number extraction (was gated by combined.length > 15). */
    if (msg && looksLikeDominicanCedulaAttempt(msg)) {
        for (const v of variables) {
            if (!isIdNumberVariableKey(v.key) && !isRncVariableKey(v.key)) continue;
            if (mapped[v.key] != null && String(mapped[v.key]).trim() !== '') continue;
            const extracted = extractValueForVariable(groupId, v, msg);
            if (extracted) {
                mapped[v.key] = extracted;
                mappedFrom[`[narrative:${v.key}]`] = v.key;
                parsedFromNarrative = true;
            }
        }
    }

    if (groupId === 'positionAndDuties' && variables.some((v) => v.key === 'startDay')) {
        const startParsed = parseTeletrabajoStartDateFromText(combined);
        for (const [key, val] of Object.entries(startParsed)) {
            if (mapped[key] != null && String(mapped[key]).trim() !== '') continue;
            mapped[key] = val;
            mappedFrom[`[teletrabajo-start:${key}]`] = key;
            parsedFromNarrative = true;
        }
    }

    if (combined.length > 15) {
        for (const v of variables) {
            if (mapped[v.key] != null && String(mapped[v.key]).trim() !== '') continue;
            const extracted = extractValueForVariable(groupId, v, combined);
            if (extracted) {
                const val = v.type === 'choice' || (v.options?.length ?? 0) > 0
                    ? normalizeChoiceValue(extracted, v.options)
                    : extracted;
                mapped[v.key] = val;
                mappedFrom[`[narrative:${v.key}]`] = v.key;
                parsedFromNarrative = true;
            }
        }
    }

    if (
        combined.length > 10 &&
        [
            'employmentDates',
            'terminationInfo',
            'vacationInfo',
            'paymentInfo',
            'signingInfo',
        ].includes(groupId)
    ) {
        if (enrichReciboDomesticaGroupDates(groupId, mapped, combined)) {
            parsedFromNarrative = true;
        }
    }

    const stillUnrecognized = first.unrecognizedKeys.filter((k) => !(k in mapped));
    return {
        mapped,
        unrecognizedKeys: stillUnrecognized,
        mappedFrom,
        parsedFromNarrative,
    };
}
