/**
 * Canonical template name resolution — handles NFC/NFD Unicode spellings of the same title.
 */

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

/** Stable key for comparing catalog titles, filenames, and session templateName. */
export function normalizeTemplateNameKey(input: string): string {
    return foldAscii(input).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isCompraventaVehiculoTemplate(templateName: string): boolean {
    return normalizeTemplateNameKey(templateName) === normalizeTemplateNameKey('Contrato de Compraventa Vehículo');
}

export function isReciboDescargoTrabajadoraDomesticaTemplate(templateName: string): boolean {
    return (
        normalizeTemplateNameKey(templateName) ===
        normalizeTemplateNameKey('Recibo de Descargo Trabajadora Doméstica')
    );
}

export function isReciboDescargoLaboralTemplate(templateName: string): boolean {
    return normalizeTemplateNameKey(templateName) === normalizeTemplateNameKey('Recibo de Descargo Laboral');
}

export function isContratoTeletrabajoTemplate(templateName: string): boolean {
    return normalizeTemplateNameKey(templateName) === normalizeTemplateNameKey('Contrato de Teletrabajo');
}

export function isDeclaracionJuradaDomicilioTemplate(templateName: string): boolean {
    return normalizeTemplateNameKey(templateName) === normalizeTemplateNameKey('Declaración Jurada de Domicilio');
}

export function isTerminosUsoPaginaWebTemplate(templateName: string): boolean {
    return normalizeTemplateNameKey(templateName) === normalizeTemplateNameKey('Términos de Uso Página Web');
}


/** Prefer NFC spelling when duplicate filenames differ only by Unicode normalization. */
export function dedupeTemplateNamesByKey(names: string[]): string[] {
    const byKey = new Map<string, string>();
    for (const name of names) {
        const key = normalizeTemplateNameKey(name);
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, name);
            continue;
        }
        const prevNfc = prev === prev.normalize('NFC');
        const nameNfc = name === name.normalize('NFC');
        if (!prevNfc && nameNfc) byKey.set(key, name);
    }
    return [...byKey.values()];
}

export function resolveTemplateFileName(input: string, available: string[]): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const exact = available.find((n) => n === trimmed);
    if (exact) return exact;
    const caseMatch = available.find((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (caseMatch) return caseMatch;
    const inputKey = normalizeTemplateNameKey(trimmed);
    const keyMatch = available.find((n) => normalizeTemplateNameKey(n) === inputKey);
    if (keyMatch) return keyMatch;
    return null;
}
