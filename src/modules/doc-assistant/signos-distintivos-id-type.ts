/**
 * Poder de Representación Signos Distintivos:
 * HBS uses «titular de {{principalIdType|proxyIdType}}» for persona física / apoderado.
 * Schema options must NOT start with «de»/«del» (that shape is for «titular {{idType}}»).
 * Safety net: map legacy «de la Cédula…» / «del Pasaporte» onto the article form.
 */

import { normalizeTemplateNameKey } from './template-name.js';

const TITULAR_DE_ID_TYPE_KEYS = ['principalIdType', 'proxyIdType'] as const;

export function isPoderSignosDistintivosTemplate(templateName: string): boolean {
    const k = normalizeTemplateNameKey(templateName);
    return (
        k === normalizeTemplateNameKey('Poder de Representación Signos Distintivos') ||
        k === normalizeTemplateNameKey('Poder para Registrar Signo Distintivo')
    );
}

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

/** Canonical values for keys that follow HBS «titular de …». */
export function normalizeSignosDistintivosTitularDeIdType(raw: unknown): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const f = fold(s);

    if (f.includes('pasaport')) {
        return 'el Pasaporte';
    }
    if (f.includes('cedula') || f.includes('identidad')) {
        return 'la Cédula de Identidad y Electoral';
    }

    // Strip a leading de/del if the LLM still submitted the other family of options.
    const stripped = s.replace(/^(de|del)\s+/i, '').trim();
    if (stripped && stripped !== s) {
        return normalizeSignosDistintivosTitularDeIdType(stripped);
    }
    return null;
}

export function applySignosDistintivosIdTypeNormalizations(
    out: Record<string, string | number>,
): boolean {
    let changed = false;
    for (const key of TITULAR_DE_ID_TYPE_KEYS) {
        const next = normalizeSignosDistintivosTitularDeIdType(out[key]);
        if (next && String(out[key] ?? '') !== next) {
            out[key] = next;
            changed = true;
        }
    }
    return changed;
}
