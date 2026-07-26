/**
 * Contrato de Representación Agente de Bienes Raíces (Corretaje Inmobiliario):
 * normalize transaction type, company branches, and duration display helpers.
 */

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

export function isCorretajeInmobiliarioTemplate(templateName: string): boolean {
    const k = fold(templateName).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (
        k === 'contrato de representacion agente de bienes raices' ||
        k === 'contrato de intermediacion y corretaje inmobiliario' ||
        k === 'contrato de corretaje'
    );
}

/** Map free-text / long answers onto schema literals Venta | Alquiler. */
export function normalizeCorretajeTransactionType(raw: unknown): 'Venta' | 'Alquiler' | null {
    const f = fold(String(raw ?? ''));
    if (!f) return null;
    if (f === 'venta' || f === 'alquiler') {
        return f === 'venta' ? 'Venta' : 'Alquiler';
    }
    const hasVenta = /\bventa\b|\bcompraventa\b|\bvender\b|\bcompra\b/.test(f);
    const hasAlquiler = /\balquiler\b|\barrend|\brenta\b|\brental\b/.test(f);
    if (hasVenta && !hasAlquiler) return 'Venta';
    if (hasAlquiler && !hasVenta) return 'Alquiler';
    // "Venta de un inmueble residencial" etc.
    if (hasVenta) return 'Venta';
    if (hasAlquiler) return 'Alquiler';
    return null;
}

function hasCompanySignal(text: string): boolean {
    const f = fold(text);
    if (!f) return false;
    return (
        /\b(s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?|srl|sa)\b/.test(f) ||
        /\b(empresa|inmobiliaria|compania|sociedad|razon social)\b/.test(f) ||
        /\brnc\b/.test(f)
    );
}

function nonEmpty(v: unknown): string {
    return String(v ?? '').trim();
}

/**
 * Force Empresa branch when company identifiers are present; migrate mis-filed
 * agentFullName → agentLegalName when needed.
 */
export function reconcileCorretajePartyCompanyBranches(
    out: Record<string, string | number>,
): boolean {
    let changed = false;

    const agentLegal = nonEmpty(out.agentLegalName);
    const agentFull = nonEmpty(out.agentFullName);
    const agentRnc = nonEmpty(out.agentRnc);
    const agentRep = nonEmpty(out.agentRepFullName);
    const agentIs = nonEmpty(out.agentIsCompany);
    const agentCompanyEvidence =
        Boolean(agentLegal) ||
        Boolean(agentRnc) ||
        Boolean(agentRep) ||
        hasCompanySignal(agentFull) ||
        hasCompanySignal(agentLegal) ||
        fold(agentIs) === 'empresa';

    if (agentCompanyEvidence && fold(agentIs) !== 'empresa') {
        out.agentIsCompany = 'Empresa';
        changed = true;
    }
    if (fold(String(out.agentIsCompany ?? '')) === 'empresa' && !agentLegal && agentFull) {
        out.agentLegalName = agentFull;
        changed = true;
    }

    const ownerLegal = nonEmpty(out.ownerLegalName);
    const ownerFull = nonEmpty(out.ownerFullName);
    const ownerRnc = nonEmpty(out.ownerRnc);
    const ownerRep = nonEmpty(out.ownerRepFullName);
    const ownerIs = nonEmpty(out.ownerIsCompany);
    const ownerCompanyEvidence =
        Boolean(ownerLegal) ||
        Boolean(ownerRnc) ||
        Boolean(ownerRep) ||
        hasCompanySignal(ownerFull) ||
        hasCompanySignal(ownerLegal) ||
        fold(ownerIs) === 'empresa';

    if (ownerCompanyEvidence && fold(ownerIs) !== 'empresa') {
        out.ownerIsCompany = 'Empresa';
        changed = true;
    }
    if (fold(String(out.ownerIsCompany ?? '')) === 'empresa' && !ownerLegal && ownerFull) {
        out.ownerLegalName = ownerFull;
        changed = true;
    }

    return changed;
}

function durationHasUnit(s: string): boolean {
    return /a[nñ]os?|meses?|d[ií]as?/i.test(s);
}

/**
 * HBS is fixed as: «{{contractDurationWords}} ({{contractDurationNumbers}}) año».
 * When a multi-unit phrase was stuffed into Numbers (e.g. "1 año, 6 meses…"),
 * move it to Words and keep a bare leading integer in Numbers so the PDF
 * does not read «(1 año, 6 meses y 15 días) año».
 */
export function normalizeCorretajeContractDuration(
    out: Record<string, string | number>,
): boolean {
    let words = nonEmpty(out.contractDurationWords);
    let nums = nonEmpty(out.contractDurationNumbers).replace(/^\(+|\)+$/g, '').trim();
    let changed = false;

    const leadingInt = (s: string): string | null => {
        const m = s.match(/(\d+)/);
        return m ? m[1] : null;
    };

    if (durationHasUnit(nums) && (!words || words.length <= nums.length || !durationHasUnit(words))) {
        out.contractDurationWords = nums;
        out.contractDurationNumbers = leadingInt(nums) ?? '1';
        changed = true;
    } else if (durationHasUnit(words) && durationHasUnit(nums)) {
        out.contractDurationNumbers = leadingInt(nums) ?? leadingInt(words) ?? '1';
        changed = true;
    } else if (durationHasUnit(words) && nums && !/^\d+([.,]\d+)?$/.test(nums)) {
        out.contractDurationNumbers = leadingInt(nums) ?? leadingInt(words) ?? '1';
        changed = true;
    }

    // Drop synthetic flag — HBS does not branch on it (template is the bible).
    if (out.contractDurationHasUnit !== undefined) {
        delete out.contractDurationHasUnit;
        changed = true;
    }
    return changed;
}

export function applyCorretajeInmobiliarioNormalizations(
    out: Record<string, string | number>,
): boolean {
    let changed = false;

    const tx = normalizeCorretajeTransactionType(out.transactionType);
    if (tx && String(out.transactionType ?? '') !== tx) {
        out.transactionType = tx;
        changed = true;
    }

    if (reconcileCorretajePartyCompanyBranches(out)) changed = true;
    if (normalizeCorretajeContractDuration(out)) changed = true;

    return changed;
}

/** Collapse duplicated «como como» in rendered HTML (Propietario denominated clause). */
export function sanitizeCorretajeRenderedHtml(html: string): string {
    return html.replace(/\bcomo\s+como\b/gi, 'como');
}

export function corretajeAgentSignerName(vars: Record<string, string | number>): string {
    if (fold(String(vars.agentIsCompany ?? '')) === 'empresa') {
        return nonEmpty(vars.agentRepFullName) || nonEmpty(vars.agentLegalName);
    }
    return nonEmpty(vars.agentFullName);
}

export function corretajeMissingCriticalFields(
    vars: Record<string, string | number>,
): string[] {
    const missing: string[] = [];
    const tx = normalizeCorretajeTransactionType(vars.transactionType) ?? String(vars.transactionType ?? '').trim();
    if (tx !== 'Venta' && tx !== 'Alquiler') {
        missing.push('transactionType (Venta o Alquiler)');
    }
    if (tx === 'Venta') {
        if (!nonEmpty(vars.commissionPercentNumber) && !nonEmpty(vars.commissionPercentWords)) {
            missing.push('commissionPercentNumber / commissionPercentWords');
        }
    }
    if (tx === 'Alquiler') {
        if (!nonEmpty(vars.commissionMonthsNumber) && !nonEmpty(vars.commissionMonthsWords)) {
            missing.push('commissionMonthsNumber / commissionMonthsWords');
        }
    }
    if (fold(String(vars.agentIsCompany ?? '')) === 'empresa') {
        if (!nonEmpty(vars.agentLegalName)) missing.push('agentLegalName');
        if (!nonEmpty(vars.agentRepFullName)) missing.push('agentRepFullName');
        if (!nonEmpty(vars.agentRnc)) missing.push('agentRnc');
    } else if (!nonEmpty(vars.agentFullName)) {
        missing.push('agentFullName');
    }
    return missing;
}
