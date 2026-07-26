/** Canonical digits-only storage for período de prueba; PDF prints «N días calendario». */

export function isProbationDaysKey(key: string): boolean {
    return key.toLowerCase() === 'probationperioddays';
}

/** Keep leading integer only so template does not duplicate «días calendario» (ej. «90 días calendario» → «90»). */
export function normalizeProbationDaysInput(raw: string): string {
    const t = raw.trim();
    if (!t) return raw;
    const m = t.match(/^(\d+)/);
    return m ? m[1]! : raw;
}
