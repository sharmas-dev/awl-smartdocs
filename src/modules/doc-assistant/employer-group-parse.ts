import { mapAnswersToGroupVariables } from './answer-key-map.js';
import { normalizeCedulaNumberInput } from './cedula-validation.js';
import { inferDominicanPlaceFromText } from './dominican-place-inference.js';
import { inferDomesticEmployerGenderFromName } from './recibo-descargo-domestica-enrichment.js';

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

function normalizeEmployerIdType(raw: string, options?: string[]): string {
    const f = fold(raw);
    if (/pasaport/i.test(f)) {
        return options?.find((o) => /pasaport/i.test(o)) ?? 'Pasaporte';
    }
    if (/cedula|electoral/i.test(f)) {
        return options?.find((o) => /c[eé]dula/i.test(o)) ?? 'Cédula';
    }
    return raw.trim();
}

/** Parse employer group (Contrato de Trabajadora Doméstica) from Spanish narrative. */
export function parseEmployerGroupNarrative(
    text: string,
    idTypeOptions?: string[],
): Record<string, string> {
    const t = text.trim();
    if (!t) return {};
    const out: Record<string, string> = {};

    const nameMatch =
        t.match(/nombre\s+completo\s+del\s+empleador\s*:\s*([^\n]+)/i) ??
        t.match(/empleador\s*:\s*([^,\n]+)/i) ??
        t.match(/(?:se\s+llama|llamad[oa])\s+([^,]+?)(?=,\s*(?:documento|tipo|n[uú]mero|direcci))/i);
    if (nameMatch?.[1]) {
        out.employerFullName = nameMatch[1].trim().replace(/\s+/g, ' ');
    }

    if (/pasaport/i.test(t)) {
        out.employerIdType = normalizeEmployerIdType('Pasaporte', idTypeOptions);
    } else if (/c[eé]dula|electoral/i.test(t)) {
        out.employerIdType = normalizeEmployerIdType('Cédula', idTypeOptions);
    }

    const idNumMatch =
        t.match(/n[uú]mero\s+del\s+documento\s*:\s*([\d][\d\s.\-/]{8,20}[\d])/i) ??
        t.match(/(?:n[uú]mero|no\.?)\s*([\d]{3}[-\s]?[\d]{7}[-\s]?[\d])/i) ??
        t.match(/\b(\d{3}-\d{7}-\d)\b/);
    if (idNumMatch?.[1]) {
        const raw = idNumMatch[1].trim();
        const tipo = out.employerIdType ?? 'Cédula';
        if (/pasaport/i.test(tipo)) {
            out.employerIdNumber = raw.replace(/\s/g, '');
        } else {
            const cedula = normalizeCedulaNumberInput(raw);
            if (cedula.ok) out.employerIdNumber = cedula.formatted;
        }
    }

    const addrMatch =
        t.match(/direcci[oó]n\s+completa\s*:\s*(.+?)(?:\n|$)/i) ??
        t.match(/(?:domicilio|direcci[oó]n)(?:\s+completa)?\s*:\s*(.+?)(?:\n|$)/i);
    if (addrMatch?.[1]) {
        out.employerFullAddress = addrMatch[1].trim();
    }

    const location = inferDominicanPlaceFromText(t);
    if (location) {
        out.employerInferredLocation = `${location.city}, ${location.province}`;
    }

    if (out.employerFullName) {
        out.domesticEmployerGender = inferDomesticEmployerGenderFromName(String(out.employerFullName));
    }

    return out;
}

export function enrichEmployerGroupAnswers(
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
    let mapped: Record<string, string | number> = { ...first.mapped };
    const mappedFrom = { ...first.mappedFrom };
    let parsedFromNarrative = false;

    const narrativeParts = Object.entries(answers)
        .filter(([, v]) => typeof v === 'string' && String(v).trim().length > 10)
        .map(([, v]) => String(v));
    const combined = [userMessage?.trim() ?? '', ...narrativeParts].filter(Boolean).join('\n');

    if (combined.length > 10) {
        const idOpts = variables.find((v) => v.key === 'employerIdType')?.options;
        const parsed = parseEmployerGroupNarrative(combined, idOpts);
        for (const [k, v] of Object.entries(parsed)) {
            if (v && !mapped[k]) {
                mapped[k] = v;
                mappedFrom[`[narrative:${k}]`] = k;
                parsedFromNarrative = true;
            }
        }
    }

    if (typeof mapped.employerIdType === 'string') {
        mapped.employerIdType = normalizeEmployerIdType(
            String(mapped.employerIdType),
            variables.find((v) => v.key === 'employerIdType')?.options,
        );
    }

    const stillUnrecognized = first.unrecognizedKeys.filter((k) => !(k in mapped));
    return {
        mapped,
        unrecognizedKeys: stillUnrecognized,
        mappedFrom,
        parsedFromNarrative,
    };
}
