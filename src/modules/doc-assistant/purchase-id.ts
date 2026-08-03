/** 24-char MongoDB ObjectId hex (user_documents purchase row). */
const PURCHASE_OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Placeholder / docs-only ids — must never be sent as userDocumentId. */
const DOCUMENTATION_EXAMPLE_PURCHASE_IDS = new Set([
    '507f1f77bcf86cd799439011',
    '69efbe00530ab11d0df02a10',
]);

export function isPurchaseObjectId(id: string): boolean {
    return PURCHASE_OBJECT_ID.test(id.trim());
}

/**
 * Nitro Chat URL: ?prompt=Completa%20el%20documento%20<24hex>… (legacy: Fill out the document for <24hex>)
 * Also matches the same phrase in the first user message body.
 */
export function extractPurchaseIdFromText(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const forMatch = trimmed.match(/\bfor\s+([a-f0-9]{24})\b/i);
    if (forMatch?.[1] && isPurchaseObjectId(forMatch[1])) return forMatch[1].toLowerCase();
    const completaMatch = trimmed.match(/\bcompleta\s+el\s+documento\s+([a-f0-9]{24})\b/i);
    if (completaMatch?.[1] && isPurchaseObjectId(completaMatch[1])) {
        return completaMatch[1].toLowerCase();
    }
    const tokens = trimmed.match(/\b([a-f0-9]{24})\b/gi);
    if (!tokens?.length) return null;
    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (isPurchaseObjectId(lower) && !isDocumentationExamplePurchaseId(lower)) return lower;
    }
    return null;
}

/** Best-effort: purchase id embedded in Nitro Chat URL ?prompt=… or related metadata. */
export function purchaseIdFromChatMetadata(metadata?: Record<string, unknown>): string | null {
    if (!metadata) return null;
    const candidates: unknown[] = [
        metadata.prompt,
        metadata.initialPrompt,
        metadata.userPrompt,
        metadata.url,
        metadata.pageUrl,
        metadata.referrer,
    ];
    for (const c of candidates) {
        if (typeof c !== 'string') continue;
        const id = extractPurchaseIdFromText(decodeURIComponent(c));
        if (id) return id;
    }
    return null;
}

export function isDocumentationExamplePurchaseId(id: string): boolean {
    return DOCUMENTATION_EXAMPLE_PURCHASE_IDS.has(id.trim().toLowerCase());
}

export function messageForDocumentationExamplePurchaseId(mistakenId: string): {
    message: string;
    instruction: string;
} {
    return {
        message:
            `El userDocumentId "${mistakenId}" es solo un ejemplo de la documentación del servidor, no un id de compra real.`,
        instruction:
            'NO uses ids de ejemplos en las descripciones de herramientas (p. ej. 507f1f77bcf86cd799439011). Usa ÚNICAMENTE el id de 24 caracteres hex del enlace/URL del usuario ("Completa el documento <id>…" o el legacy "Fill out the document for <id>") o el campo userDocumentId de tu última respuesta exitosa de submit_group_answers. Reintenta la herramienta en el mismo turno con el id correcto. NO pidas al usuario que verifique o reenvíe el id si el flujo ya empezó.',
    };
}

/**
 * True when userMessage is only the Nitro purchase-link bootstrap phrase (not field answers).
 * Clear Chat + refresh often re-sends "Completa el documento <id>…" (or legacy English) as userMessage.
 */
export function isPurchaseBootstrapPromptOnly(userMessage: string, purchaseId: string): boolean {
    const t = userMessage.trim();
    if (!t) return false;
    const id = purchaseId.trim().toLowerCase();
    if (!isPurchaseObjectId(id)) return false;
    const extracted = extractPurchaseIdFromText(t);
    if (!extracted || extracted !== id) return false;
    // Canonical Spanish seed from ecommerce Continue Document.
    if (
        /^\s*completa\s+el\s+documento\s+[a-f0-9]{24}\s*(?:\.\s*responde\s+solo\s+en\s+espa[nñ]ol\.?)?\s*$/i.test(
            t,
        )
    ) {
        return true;
    }
    // Legacy English seed (old links / in-flight sessions).
    if (/^\s*fill\s+out\s+the\s+document\s+for\s+[a-f0-9]{24}\s*$/i.test(t)) return true;
    const withoutHex = t.replace(/\b[a-f0-9]{24}\b/gi, '').replace(/\s+/g, ' ').trim();
    // Allow short bootstrap variants; "Responde solo en español." pushes length past 48.
    return (
        withoutHex.length <= 64 &&
        /(?:fill|document|completa|completar|rellenar)/i.test(withoutHex)
    );
}

export function purchaseNotFoundInstruction(purchaseId: string, flowLikelyStarted: boolean): string {
    if (flowLikelyStarted) {
        return (
            `userDocumentId "${purchaseId}" no existe para este usuario en la base de datos — probablemente usaste un id incorrecto (p. ej. un ejemplo de documentación). ` +
            'Reintenta submit_group_answers con el id del primer mensaje/URL o userDocumentId de tu última respuesta exitosa. NO pidas al usuario que verifique o reenvíe el identificador.'
        );
    }
    return (
        `userDocumentId "${purchaseId}" no se encontró. Usa solo el id del enlace de compra del usuario. ` +
        'Si el usuario abrió desde el enlace correcto y el error persiste, indica que contacte soporte — no inventes ni reutilices ids de ejemplos.'
    );
}
