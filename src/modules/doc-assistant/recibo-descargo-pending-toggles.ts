export const RECIBO_DESCARGO_LABORAL = 'Recibo de Descargo Laboral';
const SI_NO_OPTIONS = ['Sí', 'No'] as const;

type SchemaGroup = {
    id: string;
    condition?: { field: string; equals: string | boolean };
    variables: Array<{
        key: string;
        label: string;
        type: string;
        required: boolean;
        options?: string[];
        condition?: { field: string; equals: string | boolean };
    }>;
};

export type ReciboLaboralToggleResolveTrigger = 'reconcile' | 'generate_pdf' | 'submit';

export type ReciboLaboralToggleResolveContext = {
    trigger: ReciboLaboralToggleResolveTrigger;
    groups: SchemaGroup[];
    isGroupApplicable: (group: { condition?: { field: string; equals: string | boolean } }) => boolean;
    getGroupMissingFields: (group: SchemaGroup, variables: Record<string, string | number>) => Array<{ key: string; label: string }>;
};

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

/** Strip punctuation/markdown so "No.", "**No**", "not!" still map. */
function bareSiNoLetters(text: string): string {
    return fold(text.replace(/[*_`"']/g, '').trim());
}

/**
 * Pull Sí/No from a long narrative (e.g. breakdown amounts ending with "**No.**").
 * `parseShortSiNoChoiceReply` only accepts short strings (≤40 letters).
 */
export function extractSiNoChoiceFromNarrative(text: string, options?: string[]): string | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const plain = trimmed.replace(/\*\*/g, '').trim();
    const noOpt = options?.find((o) => fold(o) === 'no') ?? 'No';
    const siOpt = options?.find((o) => fold(o) === 'si' || fold(o) === 'sí') ?? 'Sí';

    if (/(?:^|[\s,;:])\s*(no|not)\s*\.?\s*$/i.test(plain)) {
        return noOpt;
    }
    if (/(?:^|[\s,;:])\s*(s[ií]|yes)\s*\.?\s*$/i.test(plain)) {
        return siOpt;
    }

    const fromShort = parseShortSiNoChoiceReply(trimmed, options);
    if (fromShort) return fromShort;

    const tail = plain.slice(Math.max(0, plain.length - 80)).trim();
    const fromTail = parseShortSiNoChoiceReply(tail, options);
    if (fromTail) return fromTail;

    const lastLine = plain.split(/\n+/).pop()?.trim() ?? '';
    if (lastLine && lastLine.length < plain.length) {
        const fromLine = parseShortSiNoChoiceReply(lastLine, options);
        if (fromLine) return fromLine;
    }

    const endFold = fold(plain.slice(Math.max(0, plain.length - 280)));
    if (
        /\b(no existen|sin)\s+conceptos?\s+adicionales?\b/.test(endFold) ||
        /\bningun\s+concepto\s+adicional\b/.test(endFold) ||
        /\b(no deseo|no quiero|sin concepto adicional|ningun concepto adicional)\b/.test(endFold)
    ) {
        return noOpt;
    }

    return undefined;
}

/** Map bare "No" / "Sí" (and close variants) to schema dropdown options. */
export function parseShortSiNoChoiceReply(text: string, options?: string[]): string | undefined {
    const letters = bareSiNoLetters(text);
    if (!letters || letters.length > 40) return undefined;
    const noOpt = options?.find((o) => fold(o) === 'no') ?? 'No';
    const siOpt = options?.find((o) => fold(o) === 'si' || fold(o) === 'sí') ?? 'Sí';

    if (
        letters === 'no' ||
        letters === 'not' ||
        letters === 'n' ||
        letters === 'nop' ||
        /^no\b/.test(letters) ||
        /^not\b/.test(letters) ||
        /^(no deseo|no quiero|no desea|sin concepto|ninguno|ninguna)\b/.test(letters)
    ) {
        return noOpt;
    }
    if (
        letters === 'si' ||
        letters === 'sí' ||
        letters === 's' ||
        letters === 'yes' ||
        /^si\b/.test(letters) ||
        /^sí\b/.test(letters)
    ) {
        return siOpt;
    }
    return undefined;
}

/** True when userMessage is only a Sí/No answer (not signing city/date narrative). */
export function isReciboLaboralShortSiNoUserMessage(userMessage: string): boolean {
    const msg = userMessage.trim();
    if (!msg || msg.length > 120) return false;
    if (/ciudad|provincia|fecha de firma|santo domingo|república dominicana|firmado|mayo|enero|febrero|marzo|abril|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i.test(fold(msg))) {
        return false;
    }
    return parseShortSiNoChoiceReply(msg, [...SI_NO_OPTIONS]) !== undefined;
}

function valueIsBlank(
    key: string,
    mapped: Record<string, string | number>,
    sessionVariables: Record<string, string | number>,
): boolean {
    const v = mapped[key] ?? sessionVariables[key];
    return v === undefined || v === null || String(v).trim() === '';
}

function collectSiNoFromAnswerValues(answers: Record<string, string | number>): string | undefined {
    for (const val of Object.values(answers)) {
        const reply = parseShortSiNoChoiceReply(String(val), [...SI_NO_OPTIONS]);
        if (reply) return reply;
    }
    return undefined;
}

/**
 * When the model calls submit_group_answers with the wrong groupId (e.g. signingInfo)
 * while hasAdditionalConcept1 is still pending, map a short "No"/"Sí" userMessage anyway.
 */
export function mergeReciboLaboralPendingSiNoAnswers(
    templateName: string,
    mapped: Record<string, string | number>,
    userMessage: string | undefined,
    sessionVariables: Record<string, string | number>,
    missingFieldKeys?: string[],
): Record<string, string | number> {
    if (templateName !== RECIBO_DESCARGO_LABORAL) return mapped;

    const out = { ...mapped };
    const msg = userMessage?.trim() ?? '';
    const pending = new Set(missingFieldKeys ?? []);

    const shouldApplyConcept1 =
        pending.size === 0 || pending.has('hasAdditionalConcept1') || valueIsBlank('hasAdditionalConcept1', out, sessionVariables);
    const shouldApplyConcept2 =
        pending.size === 0 || pending.has('hasAdditionalConcept2') || valueIsBlank('hasAdditionalConcept2', out, sessionVariables);

    const fromAnswers = collectSiNoFromAnswerValues(mapped);
    if (fromAnswers && shouldApplyConcept1 && valueIsBlank('hasAdditionalConcept1', out, sessionVariables)) {
        out.hasAdditionalConcept1 = fromAnswers;
    }

    for (const [rawKey, rawVal] of Object.entries(mapped)) {
        if (!/additionalconcept|conceptoadicional|hasadditional|desglose/i.test(rawKey)) continue;
        const reply = parseShortSiNoChoiceReply(String(rawVal), [...SI_NO_OPTIONS]);
        if (!reply) continue;
        if (/concept2|segundo/i.test(rawKey)) {
            if (shouldApplyConcept2 && valueIsBlank('hasAdditionalConcept2', out, sessionVariables)) {
                out.hasAdditionalConcept2 = reply;
            }
        } else if (shouldApplyConcept1 && valueIsBlank('hasAdditionalConcept1', out, sessionVariables)) {
            out.hasAdditionalConcept1 = reply;
        }
    }

    if (msg && shouldApplyConcept1) {
        const reply =
            (isReciboLaboralShortSiNoUserMessage(msg) ? parseShortSiNoChoiceReply(msg, [...SI_NO_OPTIONS]) : undefined) ??
            extractSiNoChoiceFromNarrative(msg, [...SI_NO_OPTIONS]) ??
            (msg.length <= 16 ? parseShortSiNoChoiceReply(msg, [...SI_NO_OPTIONS]) : undefined);
        if (reply && valueIsBlank('hasAdditionalConcept1', out, sessionVariables)) {
            out.hasAdditionalConcept1 = reply;
        } else if (reply && shouldApplyConcept2) {
            const c1 = String(out.hasAdditionalConcept1 ?? sessionVariables.hasAdditionalConcept1 ?? '')
                .trim()
                .toLowerCase();
            if ((c1 === 'sí' || c1 === 'si') && valueIsBlank('hasAdditionalConcept2', out, sessionVariables)) {
                out.hasAdditionalConcept2 = reply;
            }
        }
    }

    return out;
}

function yes(v: unknown): boolean {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'sí' || s === 'si' || s === 'yes';
}

function isBlank(v: unknown): boolean {
    return v === undefined || v === null || String(v).trim() === '';
}

function hasText(v: unknown): boolean {
    return !isBlank(v);
}

const PLACEHOLDER_ADDITIONAL_LABEL = /^(ninguno|ninguna|n\/a|na|no aplica|none)$/i;

/** Label/amount placeholders must not count as "user wants additional concepts". */
export function isReciboLaboralPlaceholderAdditionalLabel(value: unknown): boolean {
    const t = String(value ?? '').trim();
    if (!t) return true;
    return PLACEHOLDER_ADDITIONAL_LABEL.test(t);
}

export function isReciboLaboralPlaceholderAdditionalAmount(value: unknown): boolean {
    const t = String(value ?? '').trim();
    if (!t) return true;
    const digits = t.replace(/[^\d.]/g, '');
    if (!digits) return true;
    const n = Number.parseFloat(digits);
    return Number.isFinite(n) && n === 0;
}

/** True only when the user supplied a real extra line item (not toggle keys like hasAdditionalConcept2). */
export function hasReciboLaboralAdditionalConcept1Content(out: Record<string, string | number>): boolean {
    const label = String(out.additionalConcept1Label ?? '').trim();
    const amount = String(out.additionalConcept1Amount ?? '').trim();
    if (label && !isReciboLaboralPlaceholderAdditionalLabel(label)) return true;
    if (amount && !isReciboLaboralPlaceholderAdditionalAmount(amount)) return true;
    return false;
}

const ADDITIONAL_CONCEPT_FIELD_KEYS = [
    'additionalConcept1Label',
    'additionalConcept1Amount',
    'hasAdditionalConcept2',
    'additionalConcept2Label',
    'additionalConcept2Amount',
] as const;

/** Remove orphan additional-line fields when user declined extra concepts. */
export function clearReciboLaboralAdditionalConceptFieldsWhenDisabled(
    out: Record<string, string | number>,
): boolean {
    let changed = false;
    for (const key of ADDITIONAL_CONCEPT_FIELD_KEYS) {
        if (key in out) {
            delete out[key];
            changed = true;
        }
    }
    return changed;
}

/**
 * Server-side defaults for Recibo de Descargo Laboral additional-concept toggles.
 * Keeps chat stable when the model omits keys or uses the wrong groupId.
 */
export function resolveReciboLaboralAdditionalConceptToggles(
    out: Record<string, string | number>,
    ctx: ReciboLaboralToggleResolveContext,
): boolean {
    let changed = false;

    const hasSigningData =
        hasText(out.signingCity) ||
        hasText(out.signingProvince) ||
        hasText(out.documentSigningDate) ||
        hasText(out.signingDayLetters) ||
        hasText(out.signingDayNumbers) ||
        hasText(out.signingMonthLetters) ||
        hasText(out.signingYearLetters) ||
        hasText(out.signingYearNumbers);

    const hasBaseBreakdownAmounts =
        hasText(out.preavisoAmount) &&
        hasText(out.cesantiaAmount) &&
        hasText(out.navidadAmount) &&
        hasText(out.vacacionesAmount);

    const hasBreakdownEvidence =
        hasBaseBreakdownAmounts ||
        hasText(out.additionalConcept1Label) ||
        hasText(out.additionalConcept1Amount) ||
        hasText(out.additionalConcept2Label) ||
        hasText(out.additionalConcept2Amount) ||
        hasText(out.hasAdditionalConcept1) ||
        hasText(out.hasAdditionalConcept2);

    if (isBlank(out.hasDetailedBreakdown) && (hasBreakdownEvidence || hasSigningData)) {
        out.hasDetailedBreakdown = hasBreakdownEvidence ? 'Sí' : 'No';
        changed = true;
    }

    if (!yes(out.hasDetailedBreakdown)) {
        return changed;
    }

    const signingGroup = ctx.groups.find((g) => g.id === 'signingInfo');
    const signingGroupComplete =
        signingGroup != null &&
        ctx.isGroupApplicable(signingGroup) &&
        ctx.getGroupMissingFields(signingGroup, out).length === 0;

    if (isBlank(out.hasAdditionalConcept1)) {
        if (hasReciboLaboralAdditionalConcept1Content(out)) {
            out.hasAdditionalConcept1 = 'Sí';
            changed = true;
        } else {
            const allowCloseOnReconcile = hasSigningData || signingGroupComplete;
            const allowCloseOnGenerate = ctx.trigger === 'generate_pdf' && hasBaseBreakdownAmounts;
            const allowCloseOnFullBreakdown =
                hasBaseBreakdownAmounts &&
                (ctx.trigger === 'reconcile' || ctx.trigger === 'submit' || ctx.trigger === 'generate_pdf');
            if (
                allowCloseOnGenerate ||
                (allowCloseOnReconcile && hasBaseBreakdownAmounts) ||
                allowCloseOnFullBreakdown
            ) {
                out.hasAdditionalConcept1 = 'No';
                changed = true;
            }
        }
    }

    if (yes(out.hasAdditionalConcept1) && !hasReciboLaboralAdditionalConcept1Content(out) && hasBaseBreakdownAmounts) {
        const concept2No = String(out.hasAdditionalConcept2 ?? '').trim().toLowerCase() === 'no';
        const onlyPlaceholders =
            isBlank(out.additionalConcept1Label) ||
            isReciboLaboralPlaceholderAdditionalLabel(out.additionalConcept1Label);
        if (concept2No || (onlyPlaceholders && (signingGroupComplete || hasSigningData))) {
            out.hasAdditionalConcept1 = 'No';
            changed = true;
        }
    }

    if (!yes(out.hasAdditionalConcept1)) {
        if (clearReciboLaboralAdditionalConceptFieldsWhenDisabled(out)) {
            changed = true;
        }
    } else if (isBlank(out.hasAdditionalConcept2)) {
        out.hasAdditionalConcept2 = 'No';
        changed = true;
    }

    return changed;
}
