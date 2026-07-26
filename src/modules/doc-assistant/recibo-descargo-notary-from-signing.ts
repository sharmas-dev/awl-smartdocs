/**
 * Recibos de descargo: HBS uses `para el {{notaryJurisdiction}}` / `para el {{notaryProvince}}`.
 * When the user omits the notary field, default from signingProvince so they are not
 * asked to repeat the same province. Never overwrite an explicit notary value.
 */
function stripLeadingArticle(s: string): string {
    const t = s.trim();
    const lower = t.toLowerCase();
    if (lower.startsWith('el ')) return t.slice(3).trim();
    if (lower.startsWith('la ')) return t.slice(3).trim();
    return t;
}

export function fillReciboDescargoNotaryFromSigningProvince(
    templateName: string,
    out: Record<string, string | number>,
): boolean {
    let key: string | undefined;
    if (templateName === 'Recibo de Descargo Laboral') {
        key = 'notaryProvince';
    } else if (templateName === 'Recibo de Descargo Trabajadora Doméstica') {
        key = 'notaryJurisdiction';
    } else {
        return false;
    }

    const current = out[key];
    if (typeof current === 'string' && current.trim()) {
        return false;
    }

    const prov = out.signingProvince;
    if (typeof prov !== 'string' || !prov.trim()) {
        return false;
    }

    out[key] = stripLeadingArticle(prov);
    return true;
}
