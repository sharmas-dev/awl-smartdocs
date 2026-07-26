import { mapAnswersToGroupVariables } from './answer-key-map.js';
import { normalizeCedulaNumberInput } from './cedula-validation.js';

const DECLARANT_ID_TYPE_CEDULA = 'de la Cédula de Identidad y Electoral';
const DECLARANT_ID_TYPE_PASSPORT = 'del Pasaporte';

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

function normalizeDeclarantIdType(raw: string): string {
    const f = fold(raw);
    if (/pasaport/i.test(f)) return DECLARANT_ID_TYPE_PASSPORT;
    if (/cedula|electoral|identidad/i.test(f)) return DECLARANT_ID_TYPE_CEDULA;
    return raw.trim();
}

/** Extract declarantInfo fields from one Spanish user paragraph. */
export function parseDeclarantInfoNarrative(text: string): Record<string, string> {
    const t = text.trim();
    if (!t) return {};
    const out: Record<string, string> = {};

    const nameMatch =
        t.match(/(?:se\s+llama|llamad[oa])\s+([^,]+?)(?=,\s*(?:es\b|y\s+se\b)|,\s*es\s+de\s+nacionalidad)/i) ??
        t.match(/(?:trabajador(?:a)?|declarante)\s+se\s+llama\s+([^,]+)/i) ??
        t.match(/(?:trabajador(?:a)?|declarante)\s+es\s+([^,]+?)(?=,\s*(?:de\s+)?nacionalidad)/i);
    if (nameMatch?.[1]) {
        out.declarantFullName = nameMatch[1].trim().replace(/\s+/g, ' ');
    }

    const natMatch =
        t.match(/nacionalidad\s+(?:es\s+)?([a-záéíóúñ]+)/i) ??
        t.match(/es\s+de\s+nacionalidad\s+([a-záéíóúñ]+)/i);
    if (natMatch?.[1]) {
        out.declarantNationality = natMatch[1].trim();
    }

    if (/pasaport/i.test(t)) {
        out.declarantIdType = DECLARANT_ID_TYPE_PASSPORT;
    } else if (/c[eé]dula|electoral/i.test(t)) {
        out.declarantIdType = DECLARANT_ID_TYPE_CEDULA;
    }

    const idNumMatch =
        t.match(/(?:n[uú]mero|no\.?)\s*([\d]{3}[-\s]?[\d]{7}[-\s]?[\d])/i) ??
        t.match(/\b(\d{3}-\d{7}-\d)\b/) ??
        t.match(/\b(\d{11})\b/);
    if (idNumMatch?.[1]) {
        const raw = idNumMatch[1].trim();
        const tipo = out.declarantIdType ?? (/pasaport/i.test(t) && !/c[eé]dula|electoral/i.test(t) ? DECLARANT_ID_TYPE_PASSPORT : DECLARANT_ID_TYPE_CEDULA);
        if (tipo === DECLARANT_ID_TYPE_PASSPORT) {
            out.declarantIdNumber = raw;
        } else {
            const cedula = normalizeCedulaNumberInput(raw);
            if (cedula.ok) out.declarantIdNumber = cedula.formatted;
        }
    }

    const addrMatch =
        t.match(/(?:domicilio|direcci[oó]n)(?:\s+completa)?\s+(?:es\s+)?(.+)$/i) ??
        t.match(/(?:reside\s+en|vive\s+en|residencia\s+en)\s+(.+)$/i);
    if (addrMatch?.[1]) {
        out.declarantAddress = addrMatch[1].trim();
    }

    return out;
}

/**
 * Map + parse natural-language answers for declarantInfo (Recibo de Descargo).
 */
export function enrichDeclarantInfoAnswers(
    variables: Array<{ key: string; label: string; type?: string; options?: string[] }>,
    answers: Record<string, string | number>,
): {
    mapped: Record<string, string | number>;
    unrecognizedKeys: string[];
    mappedFrom: Record<string, string>;
    parsedFromNarrative: boolean;
} {
    const first = mapAnswersToGroupVariables(variables, answers);
    let mapped: Record<string, string | number> = { ...first.mapped };
    const mappedFrom = { ...first.mappedFrom };
    let parsedFromNarrative = false;

    const narrativeParts = Object.entries(answers)
        .filter(([, v]) => typeof v === 'string' && String(v).trim().length > 20)
        .map(([, v]) => String(v));
    const combined = narrativeParts.join(' ');
    if (combined.length > 20) {
        const parsed = parseDeclarantInfoNarrative(combined);
        for (const [k, v] of Object.entries(parsed)) {
            if (v && !mapped[k]) {
                mapped[k] = v;
                mappedFrom[`[narrative:${k}]`] = k;
                parsedFromNarrative = true;
            }
        }
    }

    if (typeof mapped.declarantIdType === 'string') {
        mapped.declarantIdType = normalizeDeclarantIdType(String(mapped.declarantIdType));
    }

    const stillUnrecognized = first.unrecognizedKeys.filter((k) => !(k in mapped));
    return {
        mapped,
        unrecognizedKeys: stillUnrecognized,
        mappedFrom,
        parsedFromNarrative,
    };
}
