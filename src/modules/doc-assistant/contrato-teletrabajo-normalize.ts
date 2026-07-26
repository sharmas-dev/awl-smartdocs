/**
 * Contrato de Teletrabajo — storage-time fixes for schedule, addresses, costs, nationality, IDs.
 */

import { extractCedulaDigits } from './cedula-validation.js';
import { inferGenderFromName, normalizeNationalityGender } from './gender-choice-format.js';
import { normalizeWorkScheduleText } from './work-schedule-format.js';
import { isContratoTeletrabajoTemplate } from './template-name.js';

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

function isRepublicaDominicana(s: string): boolean {
    const f = foldAscii(s);
    return f === 'republica dominicana' || f === 'dominican republic' || f === 'rd';
}

function isDistritoNacional(s: string): boolean {
    return foldAscii(s) === 'distrito nacional' || foldAscii(s) === 'd.n.' || foldAscii(s) === 'dn';
}

/** Gender for nationality agreement: marital status first, then name. */
export function resolveTeletrabajoPersonGender(
    maritalStatus: unknown,
    fullName: unknown,
): 'Mujer' | 'Hombre' {
    const marital = foldAscii(String(maritalStatus ?? ''));
    if (/^(casada|soltera|divorciada|viuda)\b/.test(marital)) return 'Mujer';
    if (/^(casado|soltero|divorciado|viudo)\b/.test(marital)) return 'Hombre';
    const name = String(fullName ?? '').trim();
    if (name) return inferGenderFromName(name);
    return 'Hombre';
}

/**
 * Strip wrapper phrases and lunch clauses from workSchedule so HBS
 * "horario de {{workSchedule}}, con un descanso de {{lunchBreakDuration}} para el almuerzo"
 * does not duplicate lunch.
 */
export function normalizeTeletrabajoWorkScheduleField(raw: string): string {
    let s = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!s) return s;

    s = s.replace(/^[Ee]l\s+horario\s+de\s+trabajo\s+(será|sera|es|de)\s+/i, '');
    s = s.replace(/^horario\s+de\s+trabajo\s+(será|sera|es|de)\s+/i, '');
    s = s.replace(/^horario\s+de\s+/i, '');
    s = s.replace(/\s*,?\s*con\s+(una?\s+)?(hora|horas|\d+\s*horas?|treinta\s*\(?\d+\)?\s*minutos?|[^.]+)\s+(de\s+)?(almuerzo|comida)\.?$/i, '');
    s = s.replace(/\s*,?\s*incluyendo\s+(el\s+)?(almuerzo|comida).*$/i, '');
    s = s.replace(/\.+$/g, '').trim();
    // "de lunes a viernes…" after stripping "será de" → drop leading de before weekday
    s = s.replace(/^de\s+(?=lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i, '');
    s = normalizeWorkScheduleText(s);
    return s.replace(/\.+$/g, '').trim();
}

/** Compact cost1..cost4 into sequential non-empty slots. */
export function compactTeletrabajoCostSlots(out: Record<string, string | number>): boolean {
    const keys = ['cost1', 'cost2', 'cost3', 'cost4'] as const;
    const filled = keys.map((k) => String(out[k] ?? '').trim()).filter(Boolean);
    let changed = false;
    for (let i = 0; i < keys.length; i++) {
        const next = filled[i] ?? '';
        if (String(out[keys[i]] ?? '') !== next) {
            out[keys[i]] = next;
            changed = true;
        }
    }
    return changed;
}

/**
 * Dedupe street/city/country triples for Teletrabajo HBS joins.
 * Removes country from street/city when country field is set; drops repeated city tokens.
 */
export function normalizeTeletrabajoAddressTriple(
    out: Record<string, string | number>,
    streetKey: string,
    cityKey: string,
    countryKey: string,
): boolean {
    let street = String(out[streetKey] ?? '').trim();
    let city = String(out[cityKey] ?? '').trim();
    let country = String(out[countryKey] ?? '').trim();
    if (!street && !city && !country) return false;

    let changed = false;

    const stripCountryFrom = (value: string): string => {
        const parts = value
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            .filter((p) => !isRepublicaDominicana(p));
        return parts.join(', ');
    };

    const nextStreet = stripCountryFrom(street);
    const nextCity = stripCountryFrom(city);
    if (nextStreet !== street) {
        street = nextStreet;
        changed = true;
    }
    if (nextCity !== city) {
        city = nextCity;
        changed = true;
    }

    // City field may be "Santo Domingo, Distrito Nacional, Santo Domingo"
    const cityParts = city
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    const dedupedCity: string[] = [];
    const seen = new Set<string>();
    for (const part of cityParts) {
        const f = foldAscii(part);
        if (seen.has(f)) continue;
        seen.add(f);
        dedupedCity.push(part);
    }
    // If city empty but street ends with municipality + DN, lift place tails into city
    if (!dedupedCity.length && street) {
        const streetParts = street.split(',').map((p) => p.trim()).filter(Boolean);
        while (streetParts.length > 1) {
            const last = streetParts[streetParts.length - 1]!;
            if (isDistritoNacional(last) || /^santo\s+domingo/i.test(last) || /^santiago/i.test(last)) {
                dedupedCity.unshift(streetParts.pop()!);
                continue;
            }
            break;
        }
        if (dedupedCity.length) {
            street = streetParts.join(', ');
            changed = true;
        }
    }
    const cityJoined = dedupedCity.join(', ');
    if (cityJoined !== city) {
        city = cityJoined;
        changed = true;
    }

    // Drop municipality / DN tails from street when already in city
    if (city && street) {
        const streetParts = street
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        const cityFolds = new Set(city.split(',').map((p) => foldAscii(p.trim())));
        const keptStreet = streetParts.filter((p) => {
            const f = foldAscii(p);
            if (cityFolds.has(f) && (isDistritoNacional(p) || /^santo\s+domingo/i.test(p) || /^santiago/i.test(p))) {
                return false;
            }
            return true;
        });
        const next = keptStreet.join(', ');
        if (next !== street) {
            street = next;
            changed = true;
        }
    }

    if (!country && (street || city)) {
        // leave country empty — LLM/schema should fill; don't invent
    } else if (country && isRepublicaDominicana(country)) {
        country = 'República Dominicana';
    }

    if (String(out[streetKey] ?? '') !== street) {
        out[streetKey] = street;
        changed = true;
    }
    if (String(out[cityKey] ?? '') !== city) {
        out[cityKey] = city;
        changed = true;
    }
    if (country && String(out[countryKey] ?? '') !== country) {
        out[countryKey] = country;
        changed = true;
    }

    return changed;
}

const TELETRABAJO_ADDRESS_TRIPLES: Array<[string, string, string]> = [
    ['employerFullAddressStreet', 'employerFullAddressCity', 'employerFullAddressCountry'],
    ['employerRepAddressStreet', 'employerRepAddressCity', 'employerRepAddressCountry'],
    ['employeeAddressStreet', 'employeeAddressCity', 'employeeAddressCountry'],
    ['workplaceAddress', 'workplaceCity', 'workplaceCountry'],
];

export function normalizeTeletrabajoNationalityFields(out: Record<string, string | number>): boolean {
    let changed = false;

    const employerGender = resolveTeletrabajoPersonGender(out.employerMaritalStatus, out.employerLegalName);
    if (typeof out.employerNationality === 'string' && out.employerNationality.trim()) {
        const norm = normalizeNationalityGender(out.employerNationality, employerGender);
        if (norm !== out.employerNationality) {
            out.employerNationality = norm;
            changed = true;
        }
    }

    const employeeGender = resolveTeletrabajoPersonGender(out.employeeMaritalStatus, out.employeeFullName);
    if (typeof out.employeeNationality === 'string' && out.employeeNationality.trim()) {
        const norm = normalizeNationalityGender(out.employeeNationality, employeeGender);
        if (norm !== out.employeeNationality) {
            out.employeeNationality = norm;
            changed = true;
        }
    }

    if (typeof out.employerRepNationality === 'string' && out.employerRepNationality.trim()) {
        const g = inferGenderFromName(String(out.employerRepFullName ?? ''));
        const norm = normalizeNationalityGender(out.employerRepNationality, g);
        if (norm !== out.employerRepNationality) {
            out.employerRepNationality = norm;
            changed = true;
        }
    }

    return changed;
}

/** Same cédula digits on employer and employee (persona física). */
export function detectTeletrabajoDuplicatePartyCedulas(
    variables: Record<string, string | number>,
): { key: string; message: string } | null {
    const employerType = String(variables.employerIdType ?? '').trim();
    const employeeType = String(variables.employeeIdType ?? '').trim();
    const employerId = String(variables.employerIdNumber ?? '').trim();
    const employeeId = String(variables.employeeIdNumber ?? '').trim();
    if (!employerId || !employeeId) return null;

    // Only when both look like cédulas (11 digits)
    const empDigits = extractCedulaDigits(employerId);
    const workerDigits = extractCedulaDigits(employeeId);
    if (empDigits.length !== 11 || workerDigits.length !== 11) return null;
    if (empDigits !== workerDigits) return null;

    // Skip if company branch (employer id should be pruned, but be safe)
    const branch = String(variables.employerIsCompany ?? '').trim();
    if (/^empresa$/i.test(branch)) return null;

    return {
        key: 'employerIdNumber',
        message:
            'La cédula del empleador y la del trabajador son iguales. Cada parte debe tener su propio número de documento. Indica la cédula correcta del empleador (o confirma si realmente es la misma persona).',
    };
}

export function applyContratoTeletrabajoNormalizations(out: Record<string, string | number>): boolean {
    let changed = false;

    if (typeof out.workSchedule === 'string' && out.workSchedule.trim()) {
        const next = normalizeTeletrabajoWorkScheduleField(out.workSchedule);
        if (next !== out.workSchedule) {
            out.workSchedule = next;
            changed = true;
        }
    }

    if (typeof out.lunchBreakDuration === 'string' && out.lunchBreakDuration.trim()) {
        const lunch = out.lunchBreakDuration.trim().replace(/\.+$/g, '');
        if (lunch !== out.lunchBreakDuration) {
            out.lunchBreakDuration = lunch;
            changed = true;
        }
    }

    for (const [street, city, country] of TELETRABAJO_ADDRESS_TRIPLES) {
        if (normalizeTeletrabajoAddressTriple(out, street, city, country)) changed = true;
    }

    if (compactTeletrabajoCostSlots(out)) changed = true;
    if (normalizeTeletrabajoNationalityFields(out)) changed = true;

    return changed;
}

export function shouldApplyContratoTeletrabajoNormalizations(templateName: string): boolean {
    return isContratoTeletrabajoTemplate(templateName);
}
