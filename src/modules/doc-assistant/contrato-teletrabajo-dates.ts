/**
 * Contrato de Teletrabajo — date field expansion for contract start and signing.
 */

import { parseStoredCalendarDateToYMD } from './natural-date-normalize.js';
import { expandContratoDomesticaCanonicalDates } from './recibo-descargo-date-expand.js';

const SPANISH_MONTHS: Record<string, string> = {
    enero: 'enero',
    febrero: 'febrero',
    marzo: 'marzo',
    abril: 'abril',
    mayo: 'mayo',
    junio: 'junio',
    julio: 'julio',
    agosto: 'agosto',
    septiembre: 'septiembre',
    setiembre: 'septiembre',
    octubre: 'octubre',
    noviembre: 'noviembre',
    diciembre: 'diciembre',
};

const SPANISH_MONTHS_LIST = [
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

function monthNameFromNumber(m: number): string | undefined {
    return SPANISH_MONTHS_LIST[m - 1];
}

/** Expand a single Spanish calendar phrase into startDay/startMonth/startYear. */
export function expandTeletrabajoContractStartDate(out: Record<string, string | number>): boolean {
    if (
        String(out.startDay ?? '').trim() &&
        String(out.startMonth ?? '').trim() &&
        String(out.startYear ?? '').trim()
    ) {
        return false;
    }

    const candidates = [
        String(out.contractStartDate ?? ''),
        String(out.documentStartDate ?? ''),
        String(out.startDate ?? ''),
    ].filter((s) => s.trim());

    for (const raw of candidates) {
        const ymd = parseStoredCalendarDateToYMD(raw.trim());
        if (!ymd) continue;
        const month = monthNameFromNumber(ymd.m);
        if (!month) continue;
        out.startDay = String(ymd.d);
        out.startMonth = month;
        out.startYear = String(ymd.y);
        return true;
    }

    return false;
}

export function expandTeletrabajoSigningCanonicalDates(out: Record<string, string | number>): boolean {
    return expandContratoDomesticaCanonicalDates(out);
}

export function parseTeletrabajoStartDateFromText(text: string): Record<string, string> {
    const ymd = parseStoredCalendarDateToYMD(text.trim());
    if (!ymd) return {};
    const month = monthNameFromNumber(ymd.m);
    if (!month) return {};
    return {
        startDay: String(ymd.d),
        startMonth: month,
        startYear: String(ymd.y),
    };
}
