import { mapAnswersToGroupVariables } from './answer-key-map.js';
import { inferDominicanPlaceFromText } from './dominican-place-inference.js';
import { normalizeCedulaNumberInput } from './cedula-validation.js';

const EMPLOYER_ID_TYPE_CEDULA = 'de la Cédula de Identidad y Electoral';
const EMPLOYER_ID_TYPE_PASSPORT = 'del Pasaporte';

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

function normalizeEmployerIdType(raw: string): string {
    const f = fold(raw);
    if (/pasaport/i.test(f)) return EMPLOYER_ID_TYPE_PASSPORT;
    if (/cedula|electoral|identidad/i.test(f)) return EMPLOYER_ID_TYPE_CEDULA;
    return raw.trim();
}

/** Extract employerInfo fields from one Spanish user paragraph (Recibo doméstica). */
export function parseEmployerInfoNarrative(text: string): Record<string, string> {
    const t = text.trim();
    if (!t) return {};
    const out: Record<string, string> = {};

    const beforeEmployer = t.match(/^(.+?)(?:\.\s*)?empleador\s*:/i);
    if (beforeEmployer?.[1] && beforeEmployer[1].trim().length > 8) {
        const addr = beforeEmployer[1].trim().replace(/\.\s*$/, '');
        out.employerInferredLocation = addr;
        const place = inferDominicanPlaceFromText(addr);
        if (place) {
            out.employerInferredCity = place.city;
            out.employerInferredProvince = place.province;
        }
    }

    const empMatch =
        t.match(/empleador\s*:\s*([^,]+)/i) ??
        t.match(/(?:el\s+)?empleador(?:\(a\))?\s+(?:es\s+)?([^,]+)/i);
    if (empMatch?.[1]) {
        out.employerFullName = empMatch[1].trim().replace(/\s+/g, ' ');
    }

    const natMatch =
        t.match(/(?:,\s*)([a-záéíóúñ]+)(?:\s*,\s*(?:pasaport|c[eé]dula))/i) ??
        t.match(/nacionalidad\s+(?:es\s+)?([a-záéíóúñ]+)/i);
    if (natMatch?.[1]) {
        const n = natMatch[1].trim();
        if (!/pasaport|c[eé]dula|empleador/i.test(n)) {
            out.employerNationality = n.toLowerCase();
        }
    }
    if (/\bdominicano?\b/i.test(t) && !out.employerNationality) {
        out.employerNationality = /\bdominicana\b/i.test(t) ? 'dominicana' : 'dominicano';
    }
    if (/\bdomincano\b/i.test(t) && !out.employerNationality) {
        out.employerNationality = 'dominicano';
    }

    if (/pasaport/i.test(t)) {
        out.employerIdType = EMPLOYER_ID_TYPE_PASSPORT;
    } else if (/c[eé]dula|electoral/i.test(t)) {
        out.employerIdType = EMPLOYER_ID_TYPE_CEDULA;
    }

    const idMatch =
        t.match(/pasaport(?:e)?\s*:?\s*([\d][\d\s.\-/]{4,20})/i) ??
        t.match(/(?:n[uú]mero|no\.?)\s*([\d][\d\s.\-/]{4,20})/i) ??
        t.match(/\b(\d{3}-\d{7}-\d)\b/) ??
        t.match(/\b(\d{9,11})\b/);
    if (idMatch?.[1]) {
        const raw = idMatch[1].trim();
        const tipo = out.employerIdType ?? (/pasaport/i.test(t) ? EMPLOYER_ID_TYPE_PASSPORT : EMPLOYER_ID_TYPE_CEDULA);
        if (tipo === EMPLOYER_ID_TYPE_PASSPORT) {
            out.employerIdNumber = raw;
        } else {
            const cedula = normalizeCedulaNumberInput(raw);
            out.employerIdNumber = cedula.ok ? cedula.formatted : raw;
        }
    }

    if (!out.employerInferredLocation) {
        const place = inferDominicanPlaceFromText(t);
        if (place) {
            out.employerInferredLocation = t;
            out.employerInferredCity = place.city;
            out.employerInferredProvince = place.province;
        }
    }

    return out;
}

export function enrichEmployerInfoAnswers(
    variables: Array<{ key: string; label: string; type?: string; options?: string[] }>,
    answers: Record<string, string | number>,
    userMessage?: string,
): {
    mapped: Record<string, string | number>;
    unrecognizedKeys: string[];
    mappedFrom: Record<string, string>;
    parsedFromNarrative: boolean;
} {
    const first = mapAnswersToGroupVariables(variables, answers);
    const mapped: Record<string, string | number> = { ...first.mapped };
    const mappedFrom = { ...first.mappedFrom };
    let parsedFromNarrative = false;

    const parts = [
        userMessage?.trim() ?? '',
        ...Object.values(answers)
            .filter((v) => typeof v === 'string' && String(v).trim().length > 15)
            .map((v) => String(v)),
    ].filter(Boolean);

    for (const part of parts) {
        const parsed = parseEmployerInfoNarrative(part);
        for (const [key, val] of Object.entries(parsed)) {
            if (!val.trim()) continue;
            if (mapped[key] != null && String(mapped[key]).trim() !== '') continue;
            mapped[key] = val;
            mappedFrom[`[narrative:${key}]`] = key;
            parsedFromNarrative = true;
        }
    }

    return {
        mapped,
        unrecognizedKeys: first.unrecognizedKeys.filter((k) => !(k in mapped)),
        mappedFrom,
        parsedFromNarrative,
    };
}
