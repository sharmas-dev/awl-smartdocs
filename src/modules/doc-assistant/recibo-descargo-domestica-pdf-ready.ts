/**
 * PDF readiness for Recibo de Descargo Trabajadora Doméstica:
 * canonical dates must expand into non-empty HBS fragment keys before preview/PDF.
 */

import { ensureReciboDescargoDomesticaPdfDates } from './recibo-descargo-date-expand.js';
import { parseStoredCalendarDateToYMD } from './natural-date-normalize.js';
import {
    RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF,
    RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF,
} from './recibo-descargo-domestica-template-map.js';
import { backfillReciboDomesticaDatesFromSessionText } from './recibo-domestica-session-backfill.js';
import { isReciboDescargoTrabajadoraDomesticaTemplate } from './template-name.js';

export { isReciboDescargoTrabajadoraDomesticaTemplate };

export type ReciboDomesticaPdfDateIssue = {
    groupId: string;
    key: string;
    label: string;
    reason: 'missing_canonical' | 'unparseable_canonical' | 'missing_pdf_fragments';
};

const CANONICAL_TO_GROUP: Record<string, { groupId: string; label: string }> = {
    employmentStartDate: {
        groupId: 'employmentDates',
        label: 'Fecha en que comenzó el trabajo en el hogar',
    },
    employmentEndDate: {
        groupId: 'employmentDates',
        label: 'Fecha en que terminó el trabajo',
    },
    lastSalaryPeriodDate: {
        groupId: 'paymentInfo',
        label: 'Periodo al que corresponde el último salario',
    },
    contractTerminationDate: {
        groupId: 'terminationInfo',
        label: 'Fecha efectiva de terminación del contrato',
    },
    vacationCoverageThroughDate: {
        groupId: 'vacationInfo',
        label: 'Hasta qué fecha o año cubren las vacaciones ya tomadas',
    },
    documentSigningDate: {
        groupId: 'signingInfo',
        label: 'Fecha de firma del documento',
    },
};

function fragmentKeysFilled(
    out: Record<string, string | number>,
    keys: string[],
): boolean {
    return keys.every((k) => String(out[k] ?? '').trim() !== '');
}

/**
 * Expand dates and verify all PDF fragment placeholders are populated.
 * Mutates a copy of `vars` for expansion checks.
 */
export function verifyReciboDomesticaPdfReady(
    vars: Record<string, string | number>,
): { ok: true; expanded: Record<string, string | number> } | { ok: false; issues: ReciboDomesticaPdfDateIssue[]; expanded: Record<string, string | number> } {
    const expanded = { ...vars };
    backfillReciboDomesticaDatesFromSessionText(expanded);
    ensureReciboDescargoDomesticaPdfDates(expanded);

    const issues: ReciboDomesticaPdfDateIssue[] = [];

    for (const [canonical, fragments] of Object.entries(RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF)) {
        const meta = CANONICAL_TO_GROUP[canonical] ?? { groupId: 'employmentDates', label: canonical };
        const canonicalVal = String(expanded[canonical] ?? '').trim();
        const pdfKeys = [
            fragments.dayLetters,
            fragments.dayNumbers,
            fragments.monthLetters,
            fragments.yearLetters,
            fragments.yearNumbers,
        ];

        if (!canonicalVal) {
            issues.push({
                groupId: meta.groupId,
                key: canonical,
                label: meta.label,
                reason: 'missing_canonical',
            });
            continue;
        }

        if (!parseStoredCalendarDateToYMD(canonicalVal) && !fragmentKeysFilled(expanded, pdfKeys)) {
            issues.push({
                groupId: meta.groupId,
                key: canonical,
                label: meta.label,
                reason: 'unparseable_canonical',
            });
            continue;
        }

        if (!fragmentKeysFilled(expanded, pdfKeys)) {
            issues.push({
                groupId: meta.groupId,
                key: canonical,
                label: meta.label,
                reason: 'missing_pdf_fragments',
            });
        }
    }

    for (const [canonical, pdfKeys] of Object.entries(RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF)) {
        const meta = CANONICAL_TO_GROUP[canonical] ?? { groupId: 'paymentInfo', label: canonical };
        const canonicalVal = String(expanded[canonical] ?? '').trim();

        if (!canonicalVal) {
            issues.push({
                groupId: meta.groupId,
                key: canonical,
                label: meta.label,
                reason: 'missing_canonical',
            });
            continue;
        }

        if (!parseStoredCalendarDateToYMD(canonicalVal) && !fragmentKeysFilled(expanded, pdfKeys)) {
            issues.push({
                groupId: meta.groupId,
                key: canonical,
                label: meta.label,
                reason: 'unparseable_canonical',
            });
            continue;
        }

        if (!fragmentKeysFilled(expanded, pdfKeys)) {
            issues.push({
                groupId: meta.groupId,
                key: canonical,
                label: meta.label,
                reason: 'missing_pdf_fragments',
            });
        }
    }

    if (issues.length > 0) {
        return { ok: false, issues, expanded };
    }
    return { ok: true, expanded };
}
