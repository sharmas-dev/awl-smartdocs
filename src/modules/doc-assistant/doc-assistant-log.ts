import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
    RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF,
    RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF,
} from './recibo-descargo-domestica-template-map.js';
import { isReciboDescargoTrabajadoraDomesticaTemplate } from './template-name.js';

const __logDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOG_DIR =
    process.env.NODE_ENV === 'production'
        ? join('/tmp', 'doc-assistant-logs')
        : join(__logDir, '..', '..', '..', 'logs');

export const DOC_ASSISTANT_LOG_DIR =
    process.env.DOC_ASSISTANT_LOG_DIR?.trim() || process.env.LOG_DIR?.trim() || DEFAULT_LOG_DIR;

export const DOC_ASSISTANT_LOG_FILE = join(DOC_ASSISTANT_LOG_DIR, 'doc-assistant.log');

/** Grep logs with: `grep RECIBO_DOMESTICA_VERIFY doc-assistant.log` */
export const RECIBO_DOMESTICA_VERIFY_TAG = 'RECIBO_DOMESTICA_VERIFY';

const PDF_FRAGMENT_KEYS = [
    ...Object.values(RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF).flatMap((f) => [
        f.dayLetters,
        f.dayNumbers,
        f.monthLetters,
        f.yearLetters,
        f.yearNumbers,
    ]),
    ...Object.values(RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF).flat(),
];

const CANONICAL_DATE_KEYS = [
    'employmentStartDate',
    'employmentEndDate',
    'contractTerminationDate',
    'lastSalaryPeriodDate',
    'vacationCoverageThroughDate',
    'documentSigningDate',
];

export type ReciboDomesticaPdfVerifySnapshot = {
    canonicalDates: Record<string, string>;
    pdfFragments: Record<string, string>;
    emptyPdfFragments: string[];
    pdfFragmentsReady: boolean;
};

export function summarizeReciboDomesticaPdfState(
    vars: Record<string, string | number>,
): ReciboDomesticaPdfVerifySnapshot {
    const canonicalDates: Record<string, string> = {};
    for (const key of CANONICAL_DATE_KEYS) {
        const v = String(vars[key] ?? '').trim();
        if (v) canonicalDates[key] = v;
    }

    const pdfFragments: Record<string, string> = {};
    const emptyPdfFragments: string[] = [];
    for (const key of PDF_FRAGMENT_KEYS) {
        const v = String(vars[key] ?? '').trim();
        if (v) {
            pdfFragments[key] = v;
        } else {
            emptyPdfFragments.push(key);
        }
    }

    return {
        canonicalDates,
        pdfFragments,
        emptyPdfFragments,
        pdfFragmentsReady: emptyPdfFragments.length === 0,
    };
}

/**
 * Append one JSON line to doc-assistant.log (never throws).
 * Also mirrors to stderr when DOC_ASSISTANT_LOG_CONSOLE=1.
 */
export function docAssistantLog(
    source: string,
    event: string,
    data?: Record<string, unknown>,
): void {
    try {
        if (!existsSync(DOC_ASSISTANT_LOG_DIR)) {
            mkdirSync(DOC_ASSISTANT_LOG_DIR, { recursive: true });
        }
        const ts = new Date().toISOString();
        const payload = data ? ` ${JSON.stringify(data)}` : '';
        const line = `[${ts}] [${source}] ${event}${payload}\n`;
        appendFileSync(DOC_ASSISTANT_LOG_FILE, line);
        if (process.env.DOC_ASSISTANT_LOG_CONSOLE === '1') {
            process.stderr.write(line);
        }
    } catch {
        // Logging must never block document flows.
    }
}

/** Recibo de Descargo Trabajadora Doméstica — structured verify log (easy to grep). */
export function reciboDomesticaVerifyLog(
    event: string,
    data: Record<string, unknown> & { templateName?: string },
    vars?: Record<string, string | number>,
): void {
    const payload: Record<string, unknown> = { tag: RECIBO_DOMESTICA_VERIFY_TAG, ...data };
    if (vars && isReciboDescargoTrabajadoraDomesticaTemplate(String(data.templateName ?? ''))) {
        payload.pdfState = summarizeReciboDomesticaPdfState(vars);
    } else if (vars) {
        payload.pdfState = summarizeReciboDomesticaPdfState(vars);
    }
    docAssistantLog('recibo-domestica', event, payload);
}
