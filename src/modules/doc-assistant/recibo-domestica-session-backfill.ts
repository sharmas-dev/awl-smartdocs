/**
 * Recover canonical Recibo doméstica date fields from text already stored in the session
 * (userMessage blobs, long answer strings, per-group message keys) when the LLM omitted keys.
 */

import {
    enrichReciboDomesticaGroupDates,
    extractSpanishFullDatesFromText,
    fillReciboDomesticaTerminationDateFromEmploymentEnd,
    reconcileReciboDomesticaLastSalaryPeriod,
} from './recibo-domestica-date-parse.js';

const GROUP_MESSAGE_KEY_PREFIX = '__userMsg_';

export function groupUserMessageStorageKey(groupId: string): string {
    return `${GROUP_MESSAGE_KEY_PREFIX}${groupId}`;
}

function collectNarrativeChunks(out: Record<string, string | number>): string[] {
    const chunks: string[] = [];
    for (const [key, value] of Object.entries(out)) {
        if (key.startsWith('__')) continue;
        if (typeof value !== 'string') continue;
        const t = value.trim();
        if (t.length < 12) continue;
        if (/^\d{3}-\d{7}-\d$/.test(t)) continue;
        chunks.push(t);
    }
    return chunks;
}

/**
 * Scan session variables and fill missing canonical date keys from embedded Spanish text.
 */
export function backfillReciboDomesticaDatesFromSessionText(out: Record<string, string | number>): boolean {
    let changed = false;

    for (const [key, value] of Object.entries(out)) {
        if (!key.startsWith(GROUP_MESSAGE_KEY_PREFIX)) continue;
        if (typeof value !== 'string') continue;
        const groupId = key.slice(GROUP_MESSAGE_KEY_PREFIX.length);
        if (enrichReciboDomesticaGroupDates(groupId, out, value)) {
            changed = true;
        }
    }

    const chunks = collectNarrativeChunks(out);
    if (chunks.length === 0) return changed;

    const combined = chunks.join('\n');
    const tryGroup = (groupId: string) => {
        if (enrichReciboDomesticaGroupDates(groupId, out, combined)) {
            changed = true;
        }
    };

    if (!String(out.employmentStartDate ?? '').trim() || !String(out.employmentEndDate ?? '').trim()) {
        tryGroup('employmentDates');
    }
    if (!String(out.contractTerminationDate ?? '').trim()) {
        tryGroup('terminationInfo');
    }
    if (!String(out.lastSalaryPeriodDate ?? '').trim()) {
        tryGroup('paymentInfo');
    }

    const allDates = extractSpanishFullDatesFromText(combined);
    if (!String(out.employmentStartDate ?? '').trim() && allDates[0]) {
        out.employmentStartDate = allDates[0];
        changed = true;
    }
    if (!String(out.employmentEndDate ?? '').trim() && allDates.length >= 2) {
        out.employmentEndDate = allDates[1] ?? allDates[allDates.length - 1]!;
        changed = true;
    }
    if (!String(out.contractTerminationDate ?? '').trim()) {
        const termPick = allDates.length >= 2 ? allDates[allDates.length - 1] : allDates[0];
        if (termPick) {
            out.contractTerminationDate = termPick;
            changed = true;
        }
    }
    // Prefer employment end over any bare first month-year in the combined narrative
    // (blind extractSpanishMonthYearFromText used to copy the employment START month).
    if (fillReciboDomesticaTerminationDateFromEmploymentEnd(out)) {
        changed = true;
    }
    if (reconcileReciboDomesticaLastSalaryPeriod(out)) {
        changed = true;
    }
    return changed;
}

/** True when rendered HTML still has empty PDF date parentheses. */
export function htmlHasEmptyReciboDomesticaDatePlaceholders(html: string): boolean {
    return /\(\s*\)\s+de\s+del\s+año\s+\(\s*\)/i.test(html);
}
