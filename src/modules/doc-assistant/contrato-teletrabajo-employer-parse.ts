/**
 * Contrato de Teletrabajo — parse employer group from Spanish narrative replies.
 */

import { mapAnswersToGroupVariables } from './answer-key-map.js';
import { inferDominicanPlaceFromText } from './dominican-place-inference.js';
import { normalizePartyCompanyChoice } from './party-company-choice-format.js';

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

const COUNTRY_OPTIONS = [
    'República Dominicana',
    'Estados Unidos',
    'Colombia',
    'México',
    'España',
] as const;

function matchCountryFromText(text: string, options?: string[]): string | undefined {
    const f = fold(text);
    const list = options?.length ? options : [...COUNTRY_OPTIONS];
    for (const c of list) {
        if (f.includes(fold(c))) return c;
    }
    if (/\brepública\s+dominicana\b|\brep\.?\s*dom\.?\b|\brd\b/i.test(text)) {
        return list.find((o) => fold(o).includes('republica dominicana')) ?? 'República Dominicana';
    }
    if (/\bcolombia\b/i.test(text)) return list.find((o) => fold(o) === 'colombia') ?? 'Colombia';
    return undefined;
}

function splitEmployerAddress(
    raw: string,
    countryOptions?: string[],
): { street?: string; city?: string; country?: string } {
    const t = raw.trim().replace(/\s+/g, ' ');
    if (!t) return {};

    const country = matchCountryFromText(t, countryOptions);
    let rest = t;
    if (country) {
        const re = new RegExp(`[,\\s]*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        rest = rest.replace(re, '').trim();
    }

    const place = inferDominicanPlaceFromText(t);
    let city = place?.city;
    if (city && rest) {
        const cityRe = new RegExp(`[,\\s]*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
        if (cityRe.test(rest)) {
            rest = rest.replace(cityRe, '').trim();
        }
    }

    const distrito = /distrito\s+nacional/i.test(t);
    if (distrito && !city) {
        city = 'Santo Domingo';
    }

    const street = rest.replace(/[,.\s]+$/, '').trim();
    return {
        street: street.length > 2 ? street : undefined,
        city,
        country: country ?? (place ? 'República Dominicana' : undefined),
    };
}

/** Parse employerInfo fields from one Spanish user paragraph. */
export function parseContratoTeletrabajoEmployerNarrative(text: string): Record<string, string> {
    const t = text.trim();
    if (!t) return {};
    const out: Record<string, string> = {};
    const f = fold(t);

    if (/\bpersona\s+f[ií]sica\b/i.test(t) && !/\bempresa\b/i.test(t)) {
        out.employerIsCompany = 'Persona física';
    } else if (
        /\bempresa\b/i.test(t) ||
        /\bs\.?\s*r\.?\s*l\.?\b/i.test(t) ||
        /\braz[oó]n\s+social\b/i.test(t) ||
        /\bsociedad\b/i.test(t)
    ) {
        out.employerIsCompany = 'Empresa';
    }

    const nameMatch =
        t.match(/nombre\s+legal(?:\s+o\s+raz[oó]n\s+social)?\s*:\s*([^\n]+)/i) ??
        t.match(/raz[oó]n\s+social\s*:\s*([^\n]+)/i) ??
        t.match(/(?:^|\n)\s*empresa\s*:\s*([^\n]+)/i);
    if (nameMatch?.[1]) {
        out.employerLegalName = nameMatch[1].trim().replace(/\s+/g, ' ');
    } else if (out.employerIsCompany === 'Empresa') {
        const afterTipo = t.match(/empresa\s*[,:\s]+([^,\n]+?)(?=,\s*(?:direcci|domicilio|avenida|av\.|calle)|\n|$)/i);
        if (afterTipo?.[1] && !/^(nacional|extranjera)$/i.test(afterTipo[1].trim())) {
            out.employerLegalName = afterTipo[1].trim();
        }
    }

    const addrMatch =
        t.match(/direcci[oó]n(?:\s+o\s+ubicaci[oó]n\s+f[ií]sica\s+completa)?\s*:\s*(.+?)(?:\n|$)/i) ??
        t.match(/(?:domicilio|ubicaci[oó]n)(?:\s+f[ií]sica)?(?:\s+completa)?\s*:\s*(.+?)(?:\n|$)/i);
    if (addrMatch?.[1]) {
        const parts = splitEmployerAddress(addrMatch[1].trim());
        if (parts.street) out.employerFullAddressStreet = parts.street;
        if (parts.city) out.employerFullAddressCity = parts.city;
        if (parts.country) out.employerFullAddressCountry = parts.country;
    } else {
        const addrLine =
            t.match(/(?:avenida|av\.|calle|torre|piso|km\.?|carretera)[^.\n]+(?:república\s+dominicana|distrito\s+nacional|santo\s+domingo|colombia)[^.\n]*/i)?.[0] ??
            t.match(/,\s*((?:avenida|av\.|calle).+)$/i)?.[1];
        if (addrLine) {
            const parts = splitEmployerAddress(addrLine.trim());
            if (parts.street) out.employerFullAddressStreet = parts.street;
            if (parts.city) out.employerFullAddressCity = parts.city;
            if (parts.country) out.employerFullAddressCountry = parts.country;
        }
    }

    if (
        /\bnacional\b/i.test(t) &&
        (/\bconstituida\b.*\brep[uú]blica\s+dominicana\b/i.test(t) ||
            /\bleyes\s+de\s+la\s+rep[uú]blica\s+dominicana\b/i.test(t) ||
            /\bno\s+aplica\b.*\bextranjer/i.test(t) ||
            /\bempresa\s+es\s+nacional\b/i.test(t))
    ) {
        out.employerCompanyNationalOrForeign = 'Nacional';
    } else if (/\bextranjer[ao]\b/i.test(t) || /\bcolombian[ao]\b/i.test(t)) {
        out.employerCompanyNationalOrForeign = 'Extranjera';
    }

    if (out.employerCompanyNationalOrForeign === 'Nacional') {
        out.employerJurisdiction = 'República Dominicana';
    }

    const jurisdictionMatch = t.match(/jurisdicci[oó]n\s*(?:legal)?\s*:\s*([^\n,]+)/i);
    if (jurisdictionMatch?.[1]) {
        out.employerJurisdiction = jurisdictionMatch[1].trim();
    }

    return out;
}

export function enrichContratoTeletrabajoEmployerAnswers(
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
            .filter((v) => typeof v === 'string' && String(v).trim().length > 8)
            .map((v) => String(v)),
    ].filter(Boolean);

    for (const part of parts) {
        const parsed = parseContratoTeletrabajoEmployerNarrative(part);
        for (const [key, val] of Object.entries(parsed)) {
            if (!val.trim()) continue;
            const v = variables.find((x) => x.key === key);
            if (v?.options?.length) {
                const normalized = normalizePartyCompanyChoice(val);
                const hit = v.options.find((o) => fold(o) === fold(normalized) || fold(o) === fold(val));
                mapped[key] = hit ?? normalized;
            } else {
                mapped[key] = val;
            }
            mappedFrom[`[teletrabajo-narrative:${key}]`] = key;
            parsedFromNarrative = true;
        }
    }

    if (mapped.employerIsCompany != null) {
        mapped.employerIsCompany = normalizePartyCompanyChoice(String(mapped.employerIsCompany));
    }

    const stillUnrecognized = first.unrecognizedKeys.filter((k) => !(k in mapped));
    return {
        mapped,
        unrecognizedKeys: stillUnrecognized,
        mappedFrom,
        parsedFromNarrative,
    };
}
