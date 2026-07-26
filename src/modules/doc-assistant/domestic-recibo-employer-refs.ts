/**
 * Recibo de Descargo Trabajadora Doméstica: the HBS uses {{employerReference}},
 * {{payerReference}}, {{employerReferenceShort}} in legal boilerplate.
 * Users should not be asked for those phrases — derive them from one gender choice.
 */
export function fillDomesticReceiptEmployerLegalReferences(out: Record<string, string | number>): boolean {
    /** Legacy sessions saved employerReference / payerReference / employerReferenceShort without gender. */
    const genderMissing =
        typeof out.domesticEmployerGender !== 'string' || !String(out.domesticEmployerGender).trim();
    if (genderMissing) {
        const er = String(out.employerReference ?? '');
        if (/la Empleadora/i.test(er)) out.domesticEmployerGender = 'Mujer';
        else if (/\bel Empleador\b/i.test(er)) out.domesticEmployerGender = 'Hombre';
    }

    const raw = out.domesticEmployerGender;
    if (typeof raw !== 'string' || !raw.trim()) {
        return false;
    }
    const s = raw.trim().toLowerCase();
    let feminine: boolean | null = null;
    if (s === 'mujer') feminine = true;
    else if (s === 'hombre') feminine = false;
    if (feminine === null) {
        return false;
    }

    const employerReference = feminine ? 'la Empleadora' : 'el Empleador';
    const payerReference = feminine ? 'de la Empleadora' : 'del Empleador';
    const employerReferenceShort = feminine ? 'a la Empleadora' : 'al Empleador';

    let changed = false;
    if (out.employerReference !== employerReference) {
        out.employerReference = employerReference;
        changed = true;
    }
    if (out.payerReference !== payerReference) {
        out.payerReference = payerReference;
        changed = true;
    }
    if (out.employerReferenceShort !== employerReferenceShort) {
        out.employerReferenceShort = employerReferenceShort;
        changed = true;
    }
    return changed;
}
