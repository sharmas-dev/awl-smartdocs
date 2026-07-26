/**
 * Extract canonical date fields from Spanish user narrative for
 * Recibo de Descargo Trabajadora Doméstica groups (server-side; LLM may omit keys).
 */

import { parseStoredCalendarDateToYMD } from './natural-date-normalize.js';

const SPANISH_FULL_DATE =
    /(\d{1,2})\s+de\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]+)\s+de\s+(\d{4})/gi;

const SPANISH_MONTH_YEAR =
    /(?:mes\s+de\s+)?([a-záéíóúñA-ZÁÉÍÓÚÑ]+)\s+de\s+(\d{4})/gi;

const YEAR_ONLY =
    /(?:hasta\s+el\s+)?a[nñ]o\s+(\d{4})/gi;

const VACATION_CONTEXT = /vacaci[oó]n|vacaciones|disfrut/i;

const PENDING_VACATION_CONTEXT =
    /pendiente|por\s+liquidar|adeud|sin\s+pagar|falta\s+por|no\s+liquid|no\s+se\s+(le\s+)?ha(?:n)?\s+pagado|per[ií]odo\s+pendiente|liquidar\s+es/i;

export function extractSpanishFullDatesFromText(text: string): string[] {
    const out: string[] = [];
    const re = new RegExp(SPANISH_FULL_DATE.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        out.push(`${m[1]} de ${m[2]} de ${m[3]}`);
    }
    return out;
}

/** Month+year phrases → first day of month for canonical storage. */
export function extractSpanishMonthYearFromText(text: string): string | null {
    const re = new RegExp(SPANISH_MONTH_YEAR.source, 'gi');
    const m = re.exec(text);
    if (!m?.[1] || !m[2]) return null;
    return `1 de ${m[1]} de ${m[2]}`;
}

export function extractYearOnlyFromText(text: string): string | null {
    const re = new RegExp(YEAR_ONLY.source, 'gi');
    const m = re.exec(text);
    if (!m?.[1]) return null;
    return `31 de diciembre de ${m[1]}`;
}

export function spanishDateMonthYearKey(raw: unknown): string | null {
    const ymd = parseStoredCalendarDateToYMD(String(raw ?? '').trim());
    if (!ymd) return null;
    return `${ymd.y}-${String(ymd.m).padStart(2, '0')}`;
}

/** True when user discloses unpaid / pending vacation balance alongside vacation talk. */
export function detectPendingVacationDisclosure(text: string): boolean {
    const t = text.trim();
    if (!t || !VACATION_CONTEXT.test(t)) return false;
    return PENDING_VACATION_CONTEXT.test(t);
}

/**
 * Pull last-salary month/year only from salary-context windows — never the first
 * calendar date in a mixed employment narrative (that was the Mar-2019 bug).
 */
export function extractLastSalaryPeriodFromText(text: string): string | null {
    const t = text.trim();
    if (!t) return null;

    // Restrict parsing to the clause that mentions último salario / salario del mes, etc.
    const salaryWindowMatch = t.match(
        /(?:[uú]ltimo\s+salario|salario\s+(?:del\s+)?mes|per[ií]odo\s+(?:del\s+)?salario|corresponde\s+al\s+(?:mes|per[ií]odo)|salario\s+de)[^.]{0,160}/i,
    );
    if (salaryWindowMatch?.[0]) {
        const window = salaryWindowMatch[0];
        const monthYear = extractSpanishMonthYearFromText(window);
        if (monthYear) return monthYear;
        const full = extractSpanishFullDatesFromText(window);
        if (full.length >= 1) return full[full.length - 1]!;
        // Salary mentioned but only an amount — caller may default from employmentEndDate.
        return null;
    }

    // Bare "mes de abril de 2026" without other full dates — safe.
    const monthYear = extractSpanishMonthYearFromText(t);
    if (monthYear && extractSpanishFullDatesFromText(t).length === 0) {
        return monthYear;
    }
    return null;
}

/**
 * If lastSalaryPeriodDate wrongly equals employment start (and end differs),
 * replace with employment end. If period missing but salary amount + end exist, fill from end.
 */
export function reconcileReciboDomesticaLastSalaryPeriod(
    out: Record<string, string | number>,
): boolean {
    const startKey = spanishDateMonthYearKey(out.employmentStartDate);
    const endKey = spanishDateMonthYearKey(out.employmentEndDate);
    const endRaw = String(out.employmentEndDate ?? '').trim();
    const salaryRaw = String(out.lastSalaryPeriodDate ?? '').trim();
    const salaryKey = spanishDateMonthYearKey(salaryRaw);
    const hasSalaryAmount = Boolean(
        String(out.salaryAmountInNumbers ?? '').trim() ||
            String(out.salaryAmountInWords ?? '').trim(),
    );

    if (salaryKey && startKey && endKey && endRaw && salaryKey === startKey && salaryKey !== endKey) {
        out.lastSalaryPeriodDate = endRaw;
        return true;
    }

    if (!salaryRaw && endRaw && hasSalaryAmount) {
        out.lastSalaryPeriodDate = endRaw;
        return true;
    }

    return false;
}

/** When termination date omitted, reuse employment end (same calendar idea in this recibo). */
export function fillReciboDomesticaTerminationDateFromEmploymentEnd(
    out: Record<string, string | number>,
): boolean {
    if (String(out.contractTerminationDate ?? '').trim()) return false;
    const end = String(out.employmentEndDate ?? '').trim();
    if (!end) return false;
    out.contractTerminationDate = end;
    return true;
}

export function enrichReciboDomesticaGroupDates(
    groupId: string,
    mapped: Record<string, string | number>,
    combinedText: string,
): boolean {
    const text = combinedText.trim();
    if (!text) return false;
    let changed = false;

    if (groupId === 'employmentDates') {
        const dates = extractSpanishFullDatesFromText(text);
        if (!String(mapped.employmentStartDate ?? '').trim() && dates[0]) {
            mapped.employmentStartDate = dates[0];
            changed = true;
        }
        if (!String(mapped.employmentEndDate ?? '').trim() && dates[1]) {
            mapped.employmentEndDate = dates[1];
            changed = true;
        }
    }

    if (groupId === 'terminationInfo') {
        const dates = extractSpanishFullDatesFromText(text);
        if (!String(mapped.contractTerminationDate ?? '').trim()) {
            // Prefer last date in the message (effective termination), not an earlier start date.
            const pick = dates.length > 0 ? dates[dates.length - 1] : undefined;
            if (pick) {
                mapped.contractTerminationDate = pick;
                changed = true;
            }
        }
    }

    if (groupId === 'vacationInfo') {
        if (detectPendingVacationDisclosure(text)) {
            // Do not auto-map a "taken through" year when the user also disclosed a pending balance.
            return changed;
        }
        if (!String(mapped.vacationCoverageThroughDate ?? '').trim()) {
            const yearDate = extractYearOnlyFromText(text);
            const full =
                VACATION_CONTEXT.test(text) ? extractSpanishFullDatesFromText(text)[0] : undefined;
            const pick = yearDate ?? full;
            if (pick) {
                mapped.vacationCoverageThroughDate = pick;
                changed = true;
            }
        }
    }

    if (groupId === 'paymentInfo') {
        if (!String(mapped.lastSalaryPeriodDate ?? '').trim()) {
            const pick = extractLastSalaryPeriodFromText(text);
            if (pick) {
                const startKey = spanishDateMonthYearKey(mapped.employmentStartDate);
                const endKey = spanishDateMonthYearKey(mapped.employmentEndDate);
                const pickKey = spanishDateMonthYearKey(pick);
                const endRaw = String(mapped.employmentEndDate ?? '').trim();
                if (pickKey && startKey && endKey && pickKey === startKey && pickKey !== endKey && endRaw) {
                    mapped.lastSalaryPeriodDate = endRaw;
                } else {
                    mapped.lastSalaryPeriodDate = pick;
                }
                changed = true;
            } else {
                const endRaw = String(mapped.employmentEndDate ?? '').trim();
                const hasSalaryAmount = Boolean(
                    String(mapped.salaryAmountInNumbers ?? '').trim() ||
                        String(mapped.salaryAmountInWords ?? '').trim(),
                );
                if (endRaw && hasSalaryAmount) {
                    mapped.lastSalaryPeriodDate = endRaw;
                    changed = true;
                }
            }
        }
    }

    if (groupId === 'signingInfo') {
        const dates = extractSpanishFullDatesFromText(text);
        if (!String(mapped.documentSigningDate ?? '').trim() && dates[0]) {
            mapped.documentSigningDate = dates[0];
            changed = true;
        }
    }

    return changed;
}
