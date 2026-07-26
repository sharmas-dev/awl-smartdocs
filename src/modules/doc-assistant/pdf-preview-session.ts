/** Internal session keys — never shown in schema or chat. */
export const PDF_PREVIEW_FINGERPRINT_KEY = '__pdfPreviewFingerprint';
export const PDF_PREVIEW_ACTIVE_KEY = '__pdfPreviewActive';
export const NOTARY_JURISDICTION_OFFERED_KEY = 'notaryJurisdictionOffered';

export function computePdfPreviewFingerprint(vars: Record<string, string | number>): string {
    const entries = Object.keys(vars)
        .filter((k) => !k.startsWith('__') && k !== NOTARY_JURISDICTION_OFFERED_KEY)
        .sort()
        .map((k) => [k, String(vars[k] ?? '').trim()] as const);
    return JSON.stringify(entries);
}

export function isPdfPreviewDuplicate(
    vars: Record<string, string | number>,
    fingerprint: string,
): boolean {
    return (
        String(vars[PDF_PREVIEW_ACTIVE_KEY] ?? '').trim().toLowerCase() === 'true' &&
        String(vars[PDF_PREVIEW_FINGERPRINT_KEY] ?? '').trim() === fingerprint
    );
}
