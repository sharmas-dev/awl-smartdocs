import { parseStoredCalendarDateToYMD } from './natural-date-normalize.js';
import { integerToSpanishWords } from './integer-word-conversion.js';
import { RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF } from './recibo-descargo-domestica-template-map.js';

const MONTH_LOWER = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
];

function dayLettersSpanish(d: number): string {
    if (d === 1) return 'primero';
    return integerToSpanishWords(d, 'plain');
}

function applyFive(
    out: Record<string, string | number>,
    ymd: { d: number; m: number; y: number },
    keys: { dl: string; dn: string; ml: string; yl: string; yn: string },
): boolean {
    const { d, m, y } = ymd;
    const before = JSON.stringify({
        dl: out[keys.dl],
        dn: out[keys.dn],
        ml: out[keys.ml],
        yl: out[keys.yl],
        yn: out[keys.yn],
    });
    out[keys.dl] = dayLettersSpanish(d);
    out[keys.dn] = String(d);
    out[keys.ml] = MONTH_LOWER[m - 1] ?? '';
    out[keys.yl] = integerToSpanishWords(y, 'plain');
    out[keys.yn] = String(y);
    const after = JSON.stringify({
        dl: out[keys.dl],
        dn: out[keys.dn],
        ml: out[keys.ml],
        yl: out[keys.yl],
        yn: out[keys.yn],
    });
    return before !== after;
}

function expandIfCanonical(
    out: Record<string, string | number>,
    canonicalKey: string,
    keys: { dl: string; dn: string; ml: string; yl: string; yn: string },
): boolean {
    const raw = out[canonicalKey];
    if (typeof raw !== 'string' || !raw.trim()) {
        return false;
    }
    const ymd = parseStoredCalendarDateToYMD(raw);
    if (!ymd) {
        return false;
    }
    return applyFive(out, ymd, keys);
}

/** Recibo de Descargo Laboral — single date fields → template fragment variables */
export function expandReciboDescargoLaboralCanonicalDates(out: Record<string, string | number>): boolean {
    let changed = false;
    if (expandIfCanonical(out, 'employmentStartDate', {
        dl: 'startDayLetters',
        dn: 'startDayNumbers',
        ml: 'startMonthLetters',
        yl: 'startYearLetters',
        yn: 'startYearNumbers',
    })) {
        changed = true;
    }
    if (expandIfCanonical(out, 'employmentEndDate', {
        dl: 'endDayLetters',
        dn: 'endDayNumbers',
        ml: 'endMonthLetters',
        yl: 'endYearLetters',
        yn: 'endYearNumbers',
    })) {
        changed = true;
    }
    if (expandIfCanonical(out, 'documentSigningDate', {
        dl: 'signingDayLetters',
        dn: 'signingDayNumbers',
        ml: 'signingMonthLetters',
        yl: 'signingYearLetters',
        yn: 'signingYearNumbers',
    })) {
        changed = true;
    }
    return changed;
}

/** Mes/año del último salario — cualquier día del mes sirve; solo se usan mes y año en el PDF */
function expandLastSalaryMonthYear(out: Record<string, string | number>): boolean {
    const raw = out.lastSalaryPeriodDate;
    if (typeof raw !== 'string' || !raw.trim()) {
        return false;
    }
    const ymd = parseStoredCalendarDateToYMD(raw);
    if (!ymd) {
        return false;
    }
    const { m, y } = ymd;
    const ml = MONTH_LOWER[m - 1] ?? '';
    const yl = integerToSpanishWords(y, 'plain');
    const yn = String(y);
    let changed = false;
    if (out.salaryMonthLetters !== ml) {
        out.salaryMonthLetters = ml;
        changed = true;
    }
    if (out.salaryYearLetters !== yl) {
        out.salaryYearLetters = yl;
        changed = true;
    }
    if (out.salaryYearNumbers !== yn) {
        out.salaryYearNumbers = yn;
        changed = true;
    }
    return changed;
}

function expandVacationYearOnly(out: Record<string, string | number>): boolean {
    const raw = out.vacationCoverageThroughDate;
    if (typeof raw !== 'string' || !raw.trim()) {
        return false;
    }
    const ymd = parseStoredCalendarDateToYMD(raw);
    if (!ymd) {
        return false;
    }
    const y = ymd.y;
    const yl = integerToSpanishWords(y, 'plain');
    const yn = String(y);
    let changed = false;
    if (out.vacationYearLetters !== yl) {
        out.vacationYearLetters = yl;
        changed = true;
    }
    if (out.vacationYearNumbers !== yn) {
        out.vacationYearNumbers = yn;
        changed = true;
    }
    return changed;
}

type FiveFragmentKeys = { dl: string; dn: string; ml: string; yl: string; yn: string };

const RECIBO_DOMESTICA_DATE_SPECS: Array<{ canonical: string; fragments: FiveFragmentKeys }> =
    Object.entries(RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF).map(([canonical, f]) => ({
        canonical,
        fragments: {
            dl: f.dayLetters,
            dn: f.dayNumbers,
            ml: f.monthLetters,
            yl: f.yearLetters,
            yn: f.yearNumbers,
        },
    }));

function hydrateCanonicalFromFragments(
    out: Record<string, string | number>,
    canonicalKey: string,
    keys: FiveFragmentKeys,
): boolean {
    if (String(out[canonicalKey] ?? '').trim()) {
        return false;
    }
    const d = String(out[keys.dn] ?? '').trim();
    const ml = String(out[keys.ml] ?? '').trim();
    const y = String(out[keys.yn] ?? '').trim();
    if (!d || !ml || !y) {
        return false;
    }
    out[canonicalKey] = `${d} de ${ml} de ${y}`;
    return true;
}

/** Recibo de Descargo Trabajadora Doméstica — canonical dates and/or fragments → all PDF date keys */
export function ensureReciboDescargoDomesticaPdfDates(out: Record<string, string | number>): boolean {
    let changed = false;
    for (const { canonical, fragments } of RECIBO_DOMESTICA_DATE_SPECS) {
        if (hydrateCanonicalFromFragments(out, canonical, fragments)) {
            changed = true;
        }
    }
    if (expandReciboDescargoDomesticaCanonicalDates(out)) {
        changed = true;
    }
    return changed;
}

/** Recibo de Descargo Trabajadora Doméstica */
export function expandReciboDescargoDomesticaCanonicalDates(out: Record<string, string | number>): boolean {
    let changed = false;
    for (const { canonical, fragments } of RECIBO_DOMESTICA_DATE_SPECS) {
        if (expandIfCanonical(out, canonical, fragments)) {
            changed = true;
        }
    }
    if (expandLastSalaryMonthYear(out)) {
        changed = true;
    }
    if (expandVacationYearOnly(out)) {
        changed = true;
    }
    return changed;
}

/** Contrato de Trabajadora Doméstica — optional documentSigningDate → signing fragment keys */
export function expandContratoDomesticaCanonicalDates(out: Record<string, string | number>): boolean {
    return expandIfCanonical(out, 'documentSigningDate', {
        dl: 'signingDayLetters',
        dn: 'signingDayNumbers',
        ml: 'signingMonthLetters',
        yl: 'signingYearLetters',
        yn: 'signingYearNumbers',
    });
}

/** Contrato de Compraventa Vehículo — one signing date → template fragment variables */
export function expandCompraventaVehiculoCanonicalDates(out: Record<string, string | number>): boolean {
    return expandIfCanonical(out, 'documentSigningDate', {
        dl: 'signingDateLetters',
        dn: 'signingDateNumbers',
        ml: 'signingMonthLetters',
        yl: 'signingYearLetters',
        yn: 'signingYearNumbers',
    });
}
