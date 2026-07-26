/**
 * Single source of truth: schema keys (chat / JSON) → Handlebars keys (PDF).
 * Recibo de Descargo Trabajadora Doméstica only.
 */

export const RECIBO_DESCARGO_TRABAJADORA_DOMESTICA = 'Recibo de Descargo Trabajadora Doméstica';

/** Full day/month/year fragments in the .hbs (five keys per canonical date). */
export type ReciboDomesticaFivePdfFragments = {
    dayLetters: string;
    dayNumbers: string;
    monthLetters: string;
    yearLetters: string;
    yearNumbers: string;
};

/** Schema `type: "date"` → PDF fragment variable names in the .hbs template. */
export const RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF: Record<string, ReciboDomesticaFivePdfFragments> = {
    employmentStartDate: {
        dayLetters: 'startDayLetters',
        dayNumbers: 'startDayNumbers',
        monthLetters: 'startMonthLetters',
        yearLetters: 'startYearLetters',
        yearNumbers: 'startYearNumbers',
    },
    employmentEndDate: {
        dayLetters: 'endDayLetters',
        dayNumbers: 'endDayNumbers',
        monthLetters: 'endMonthLetters',
        yearLetters: 'endYearLetters',
        yearNumbers: 'endYearNumbers',
    },
    contractTerminationDate: {
        dayLetters: 'terminationDayLetters',
        dayNumbers: 'terminationDayNumbers',
        monthLetters: 'terminationMonthLetters',
        yearLetters: 'terminationYearLetters',
        yearNumbers: 'terminationYearNumbers',
    },
    documentSigningDate: {
        dayLetters: 'signingDayLetters',
        dayNumbers: 'signingDayNumbers',
        monthLetters: 'signingMonthLetters',
        yearLetters: 'signingYearLetters',
        yearNumbers: 'signingYearNumbers',
    },
};

/** Schema date → partial PDF keys (month/year or year only). */
export const RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF: Record<string, string[]> = {
    lastSalaryPeriodDate: ['salaryMonthLetters', 'salaryYearLetters', 'salaryYearNumbers'],
    vacationCoverageThroughDate: ['vacationYearLetters', 'vacationYearNumbers'],
};

/** Schema inputs that only exist for inference; PDF uses different names. */
export const RECIBO_DOMESTICA_DERIVES_PDF_FROM_SCHEMA: Record<string, string[]> = {
    domesticEmployerGender: ['employerReference', 'payerReference', 'employerReferenceShort'],
};

/** Every {{placeholder}} in Recibo de Descargo Trabajadora Doméstica.hbs (unique). */
export const RECIBO_DOMESTICA_HBS_PLACEHOLDERS: readonly string[] = [
    'declarantFullName',
    'declarantNationality',
    'declarantIdType',
    'declarantIdNumber',
    'declarantAddress',
    'workplaceDescription',
    'employerFullName',
    'employerNationality',
    'employerIdType',
    'employerIdNumber',
    'employerReference',
    'startDayLetters',
    'startDayNumbers',
    'startMonthLetters',
    'startYearLetters',
    'startYearNumbers',
    'endDayLetters',
    'endDayNumbers',
    'endMonthLetters',
    'endYearLetters',
    'endYearNumbers',
    'payerReference',
    'navidadAmountInWords',
    'navidadAmountInNumbers',
    'salaryAmountInWords',
    'salaryAmountInNumbers',
    'salaryMonthLetters',
    'salaryYearLetters',
    'salaryYearNumbers',
    'terminationReason',
    'terminationDayLetters',
    'terminationDayNumbers',
    'terminationMonthLetters',
    'terminationYearLetters',
    'terminationYearNumbers',
    'vacationYearLetters',
    'vacationYearNumbers',
    'employerReferenceShort',
    'signingCity',
    'signingProvince',
    'signingDayLetters',
    'signingDayNumbers',
    'signingMonthLetters',
    'signingYearLetters',
    'signingYearNumbers',
    'notaryJurisdiction',
] as const;

/** User-facing keys from templates/schemas/Recibo de Descargo Trabajadora Doméstica.json */
export const RECIBO_DOMESTICA_SCHEMA_USER_KEYS: readonly string[] = [
    'declarantFullName',
    'declarantNationality',
    'declarantIdType',
    'declarantIdNumber',
    'declarantAddress',
    'employerFullName',
    'domesticEmployerGender',
    'employerNationality',
    'employerIdType',
    'employerIdNumber',
    'workplaceDescription',
    'employmentStartDate',
    'employmentEndDate',
    'navidadAmountInWords',
    'navidadAmountInNumbers',
    'salaryAmountInWords',
    'salaryAmountInNumbers',
    'lastSalaryPeriodDate',
    'terminationReason',
    'contractTerminationDate',
    'vacationCoverageThroughDate',
    'signingCity',
    'signingProvince',
    'documentSigningDate',
    'notaryJurisdiction',
] as const;

export function reciboDomesticaPdfKeysForSchemaDate(canonicalKey: string): string[] {
    const five = RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF[canonicalKey];
    if (five) {
        return [five.dayLetters, five.dayNumbers, five.monthLetters, five.yearLetters, five.yearNumbers];
    }
    return RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF[canonicalKey] ?? [];
}

export function reciboDomesticaAllDerivedPdfKeys(): Set<string> {
    const keys = new Set<string>();
    for (const five of Object.values(RECIBO_DOMESTICA_DATE_SCHEMA_TO_PDF)) {
        keys.add(five.dayLetters);
        keys.add(five.dayNumbers);
        keys.add(five.monthLetters);
        keys.add(five.yearLetters);
        keys.add(five.yearNumbers);
    }
    for (const partial of Object.values(RECIBO_DOMESTICA_PARTIAL_DATE_SCHEMA_TO_PDF)) {
        for (const k of partial) keys.add(k);
    }
    for (const derived of Object.values(RECIBO_DOMESTICA_DERIVES_PDF_FROM_SCHEMA)) {
        for (const k of derived) keys.add(k);
    }
    return keys;
}

/** PDF placeholders not filled directly from a schema key with the same name. */
export function reciboDomesticaHbsKeysMissingFromSchema(): string[] {
    const schemaSet = new Set<string>(RECIBO_DOMESTICA_SCHEMA_USER_KEYS);
    const derived = reciboDomesticaAllDerivedPdfKeys();
    return RECIBO_DOMESTICA_HBS_PLACEHOLDERS.filter((k) => !schemaSet.has(k) && !derived.has(k));
}
