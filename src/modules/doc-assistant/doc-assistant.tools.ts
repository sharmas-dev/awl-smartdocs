import { ToolDecorator as Tool, Widget, ExecutionContext, Injectable, UseGuards, z } from '@nitrostack/core';
import { DocAssistantService, TemplateSchema } from './doc-assistant.service.js';
import { MongoService, isValidObjectId, type UserDocumentRecord } from './mongo.service.js';
import { JwtGuard } from './guards/jwt.guard.js';
import {
    ALL_COMPLETE_CHAT_MESSAGE,
    PREVIEW_READY_CHAT_MESSAGE,
    POST_DOWNLOAD_CHAT_MESSAGE,
    buildConfirmDownloadChatMessage,
} from './pdf-preview-message.js';
import { validateReciboDescargoLaboralBreakdownSum } from './recibo-breakdown-coherence.js';
import { buildOpeningChatMessage, shouldUseAwliOpeningPhase } from './awl-opening-message.js';
import {
    buildDomesticReciboEmployerAcknowledgment,
    buildDomesticReciboNotaryAcknowledgment,
    shouldOfferDomesticReciboNotaryConfirmation,
    NOTARY_JURISDICTION_ACK_SENT_KEY,
} from './recibo-descargo-domestica-enrichment.js';
import { detectPendingVacationDisclosure } from './recibo-domestica-date-parse.js';
import {
    applyCorretajeInmobiliarioNormalizations,
    corretajeMissingCriticalFields,
    isCorretajeInmobiliarioTemplate,
    normalizeCorretajeTransactionType,
} from './corretaje-inmobiliario-normalize.js';
import { isPoderSignosDistintivosTemplate } from './signos-distintivos-id-type.js';
import {
    isPropuestaDeTrabajoTemplate,
    propuestaAdditionalBenefitsUpdatePatch,
} from './propuesta-de-trabajo-normalize.js';
import {
    computePdfPreviewFingerprint,
    isPdfPreviewDuplicate,
    NOTARY_JURISDICTION_OFFERED_KEY,
    PDF_PREVIEW_ACTIVE_KEY,
    PDF_PREVIEW_FINGERPRINT_KEY,
} from './pdf-preview-session.js';

import {
    buildDomesticAllCompletePreviewFailedInstruction,
    buildDomesticAllCompleteWithAutoPreview,
    isPdfPreviewWidgetReady,
    shouldDeferDomesticPreviewSessionFlags,
} from './domestic-auto-preview-on-complete.js';
import { buildCompraventaPartyGroupHint } from './compraventa-party-branch.js';
import {
    formatCompraventaAddressMissingPrompt,
    missingCompraventaAddressComponents,
} from './compraventa-address-complete.js';
import {
    buildCompraventaFollowUpMessage,
    buildCompraventaVehicleGroupIntroMessage,
} from './compraventa-question-pacing.js';

const COMPRAVENTA_ADDRESS_KEYS = new Set([
    'sellerFullAddress',
    'buyerFullAddress',
    'sellerRepFullAddress',
    'buyerRepFullAddress',
    'sellerSpouseAddress',
    'buyerSpouseAddress',
]);
import { isDomesticContractTemplate } from './domestic-salary-format.js';
import { domesticAdditionalBenefitsUpdatePatch } from './domestic-contract-enrichment.js';
import {
    buildContratoTeletrabajoConflictInstruction,
    detectContratoTeletrabajoConflicts,
} from './contrato-teletrabajo-conflicts.js';
import {
    buildContratoTeletrabajoCostsGroupHint,
    buildContratoTeletrabajoEmployerGroupHint,
} from './contrato-teletrabajo-employer-branch.js';
import { buildTeletrabajoFollowUpMessage } from './contrato-teletrabajo-question-pacing.js';
import {
    isContratoTeletrabajoTemplate,
    isReciboDescargoLaboralTemplate,
    isReciboDescargoTrabajadoraDomesticaTemplate,
    isTerminosUsoPaginaWebTemplate,
} from './template-name.js';
import {
    groupUserMessageStorageKey,
    htmlHasEmptyReciboDomesticaDatePlaceholders,
} from './recibo-domestica-session-backfill.js';

import { getInvalidCedulaFieldsInVariables } from './cedula-validation.js';
import { detectTeletrabajoDuplicatePartyCedulas } from './contrato-teletrabajo-normalize.js';

const RECIBO_DESCARGO_TRABAJADORA_DOMESTICA = 'Recibo de Descargo Trabajadora Doméstica';

/** Shared groupHint: must follow prompt RULE 5q (LLM infers province/country; never hardcode/hallucinate). */
const SIGNING_PLACE_LLM_INFER_HINT =
    'RULE 5q (ABSOLUTE — signing place): Ask ONLY signingCity (+ date). YOU must resolve signingProvince and signingCountry from the city and INCLUDE both in the same submit_group_answers answers object. NEVER ask province/country by default. NEVER hallucinate, guess, invent, or default to República Dominicana. NEVER copy the city name into signingProvince unless they are genuinely the same legal unit (FORBIDDEN: Santo Domingo / Santo Domingo — after RULE 5o use Santo Domingo de Guzmán + Distrito Nacional + República Dominicana when that is the capital). If unsure, ask the user ONLY for the missing field(s) — do not submit until resolved. Server does NOT hardcode province/country. Full text: system prompt RULE 5q.';

/** Contrato de Teletrabajo — LLM must submit clean values (server also normalizes, but correct tool payload is required). */
const TELETRABAJO_SUBMIT_QUALITY_HINT =
    ' CONTRATO DE TELETRABAJO (STRICT tool payload): ' +
    '(1) CÉDULAS: employerIdNumber and employeeIdNumber MUST be different 11-digit cédulas — NEVER copy the worker’s ID onto the employer (or vice versa). If only one was given, ask for the other party’s document. ' +
    '(2) NACIONALIDAD: gender-agree adjectives — male/casado → dominicano; female/casada → dominicana (same for employeeNationality / employerRepNationality). ' +
    '(3) DIRECCIONES (street/city/country triples): put calle/edificio ONLY in *Street/*Address; city once (municipality [+ Distrito Nacional if needed]); country ONLY in *Country. NEVER put República Dominicana inside street/city; NEVER repeat Santo Domingo in street and city. Place names: "Santiago de los Caballeros", "Santo Domingo de Guzmán" (lowercase de/de los). ' +
    '(4) HORARIO: workSchedule = days + start/end times ONLY (e.g. "lunes a viernes, de 8 a.m. a 5 p.m."). FORBIDDEN to put lunch/almuerzo inside workSchedule or wrap as "El horario de trabajo será…". lunchBreakDuration is a SEPARATE key (e.g. "1 hora" / "una (1) hora"). ' +
    '(5) COSTOS: fill cost1, cost2, … only for costs that exist, in order, with no empty gaps (do not leave cost2 blank and put text in cost4). Omit unused slots or leave them empty — never invent filler.';

/** Recibo de Descargo Trabajadora Doméstica — LLM-facing rules (tool descriptions / groupHints). */
const RECIBO_DOMESTICA_SUBMIT_QUALITY_HINT =
    ' RECIBO DE DESCARGO TRABAJADORA DOMÉSTICA (STRICT tool payload): ' +
    '(1) ÚLTIMO SALARIO PERÍODO: lastSalaryPeriodDate = month/year of the last pay (usually the final month worked / near employmentEndDate). NEVER copy employmentStartDate into lastSalaryPeriodDate. If user only gives the amount, ask «¿de qué mes y año es el último salario?» or omit the key so the server can use employmentEndDate — do not invent March of the hire year. ' +
    '(2) TERMINACIÓN: if employmentEndDate is already known, submit the same value as contractTerminationDate and ask ONLY terminationReason — do NOT re-ask the termination date unless the user said it differs from the end date. ' +
    '(3) VACACIONES: vacationCoverageThroughDate = year through which vacations were ALREADY taken/paid. If the user discloses a pending/unpaid vacation balance, do NOT silently submit a year that makes TERCERO claim «no se adeuda» — ask how to proceed first. ' +
    '(4) NOTARÍA: the notary-jurisdiction confirmation paragraph is shown at most ONCE — never repeat it after every answer.';

/** Contrato de Representación Agente de Bienes Raíces — LLM-facing rules. */
const CORRETAJE_SUBMIT_QUALITY_HINT =
    ' CONTRATO DE REPRESENTACIÓN AGENTE DE BIENES RAÍCES / CORRETAJE (STRICT): ' +
    '(1) transactionType MUST be exactly "Venta" or "Alquiler" — map «Venta de un inmueble…» → Venta; never leave a long phrase. ' +
    '(2) If the agent is a company (SRL/SA/RNC/representante), submit agentIsCompany="Empresa" with agentLegalName, agentRnc, agentRepFullName, etc. NEVER use the persona-física keys for a company. ' +
    '(3) Commission: Venta → commissionPercentWords + commissionPercentNumber; Alquiler → commissionMonthsWords + commissionMonthsNumber. ' +
    '(4) Duration: HBS is «words (numbers) año» — put years-in-letters in contractDurationWords and a bare digit in contractDurationNumbers; never put a multi-unit phrase into Numbers.';

/** Poder Signos Distintivos — HBS has «titular de {{idType}}» for principal/proxy; options must not start with de/del. */
const SIGNOS_DISTINTIVOS_SUBMIT_QUALITY_HINT =
    ' PODER SIGNOS DISTINTIVOS (STRICT): ' +
    'principalIdType / proxyIdType MUST be exactly "la Cédula de Identidad y Electoral" or "el Pasaporte" — NEVER "de la Cédula…" / "del Pasaporte" (HBS already has «titular de»). ' +
    'principalRepIdType (Empresa branch) still uses "de la Cédula…" / "del Pasaporte" because that clause is «titular {{type}}» without an extra de.';

/** Términos de Uso Página Web — Sí/No flags must be exact schema literals. */
const TERMINOS_USO_WEB_SUBMIT_QUALITY_HINT =
    ' TÉRMINOS DE USO PÁGINA WEB (STRICT): ' +
    'hasRegistration, hasUserContent, hasSpecificServices, hasOptionalContactForms MUST be exactly "Sí" or "No" (with accent on Sí). ' +
    'Never submit "Si", "yes", "true", or free phrases — wrong values empty §2.4 item d) / Art. 3 / §5.4 branches.';

/** Propuesta de Trabajo — HBS §6 «de cada mes»; §7 extras need hasAdditionalBenefits=Sí. */
const PROPUESTA_TRABAJO_SUBMIT_QUALITY_HINT =
    ' PROPUESTA DE TRABAJO (STRICT): ' +
    '(1) payrollDays = payment days ONLY (e.g. "15 y 30" or "15 y último"). FORBIDDEN to include "de cada mes" / "del mes" — HBS already appends «de cada mes». ' +
    '(2) BENEFICIOS §7: custom extras render ONLY when hasAdditionalBenefits="Sí" AND additionalBenefitsList is non-empty. ' +
    'When the user lists custom benefits, submit BOTH keys in the same answers object: hasAdditionalBenefits="Sí" and additionalBenefitsList as one "; "-joined string. ' +
    'Never leave hasAdditionalBenefits as No/empty/Si(without accent)/yes if a list was provided — server also opens the gate, but correct tool payload is required.';

/** Recibo de Descargo Laboral — LLM-facing rules (tool descriptions / groupHints are the effective contract). */
const RECIBO_LABORAL_SUBMIT_QUALITY_HINT =
    ' RECIBO DE DESCARGO LABORAL (STRICT tool payload): ' +
    '(1) DESGLOSE vs TOTAL: NEVER change totalAmountWithCurrency / totalAmountInWords to force-match the line sum. If Preaviso+Auxilio de Cesantía+Navidad+Vacaciones (+ adicionales) ≠ total, ASK the user which to correct — do not silently overwrite. Server rejects submit/generate_pdf on mismatch. ' +
    '(2) LABELS: always use schema wording — Preaviso, Auxilio de Cesantía (never bare "Cesantía"), Navidad (regalía pascual), Vacaciones. ' +
    '(3) NO RE-ASK: if preavisoAmount/cesantiaAmount/navidadAmount/vacacionesAmount are already in answers or userMessage, map them once — NEVER re-ask those four amounts. ' +
    '(4) NACIONALIDAD: declarantNationality must agree with declarant gender (Juan/hombre → dominicano; María/mujer → dominicana). ' +
    '(5) DIRECCIÓN: if user already wrote "Santo Domingo, Distrito Nacional", do NOT rewrite to "Santo Domingo de Guzmán"; only clarify per RULE 5o when the municipality is ambiguous.';

function domesticReciboNotaryConfirmationMessage(
    vars: Record<string, string | number>,
): string | null {
    if (!shouldOfferDomesticReciboNotaryConfirmation(vars)) {
        return null;
    }
    return buildDomesticReciboNotaryAcknowledgment(vars);
}
import { Buffer } from 'node:buffer';
import { join } from 'path';
import { docAssistantLog, reciboDomesticaVerifyLog } from './doc-assistant-log.js';

/** Long HTML in tool JSON can hang MCP/chat clients; widget can load from previewHtmlUrl instead. */
const MAX_WIDGET_INLINE_HTML_BYTES = 400_000;

function widgetHtmlPayload(html: string, previewHtmlUrl: string | undefined): { htmlContent: string; previewHtmlUrl?: string } {
    if (!previewHtmlUrl) {
        return { htmlContent: html };
    }
    if (Buffer.byteLength(html, 'utf8') <= MAX_WIDGET_INLINE_HTML_BYTES) {
        return { htmlContent: html, previewHtmlUrl };
    }
    return { htmlContent: '', previewHtmlUrl };
}

function toolLog(tool: string, event: string, data?: Record<string, unknown>) {
    docAssistantLog(tool, event, data);
}

const AnalyzeTemplateSchema = z.object({
    templateName: z.string().describe('Name of the .hbs template (without .hbs extension)'),
});

const SaveTemplateSchemaSchema = z.object({
    templateName: z.string().describe('Name of the template'),
    schema: z.any().describe('The full template schema object with groups and variables'),
});

/**
 * LLMs often emit `null`, booleans, or nested objects for tool `answers`. Zod would reject
 * those before the handler runs ("Tool execution failed"). Coerce to the session shape here.
 */
function coerceSubmitGroupAnswers(raw: unknown): Record<string, string | number> | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v === null || v === undefined) continue;
        if (typeof v === 'number') {
            if (!Number.isFinite(v)) continue;
            out[k] = v;
            continue;
        }
        if (typeof v === 'string') {
            out[k] = v;
            continue;
        }
        if (typeof v === 'boolean') {
            out[k] = v ? 'Sí' : 'No';
            continue;
        }
        if (Array.isArray(v)) {
            const parts = v
                .map((item) =>
                    item === null || item === undefined
                        ? ''
                        : typeof item === 'string' || typeof item === 'number'
                          ? String(item)
                          : JSON.stringify(item),
                )
                .filter((s) => s.length > 0);
            if (parts.length > 0) out[k] = parts.join(', ');
            continue;
        }
        if (typeof v === 'object') {
            try {
                out[k] = JSON.stringify(v);
            } catch {
                out[k] = '[valor no serializable]';
            }
            continue;
        }
        out[k] = String(v);
    }
    return out;
}

const SubmitGroupSchema = z.object({
    /** Every call: MongoDB _id of the user_documents (purchase) row (24-char hex). Identifies catalog document and session. */
    userDocumentId: z.string().optional().describe(
        'Required on every call. Purchase row _id from the post-checkout link. First call: pass only this field. Later: same id + groupId + answers.',
    ),
    groupId: z.string().optional().describe('Omit on the first call. When saving answers, set to the current group id from the tool response.'),
    answers: z.preprocess(coerceSubmitGroupAnswers, z.record(z.union([z.string(), z.number()])).optional()).describe(
        'Variable key → value. Omit on the first call; required when groupId is set. Values may be string or number; other JSON types are coerced server-side.',
    ),
    userMessage: z.string().optional().describe(
        'Optional: the user’s last chat message verbatim. The server parses dates and other fields from this text when schema keys are missing.',
    ),
    inferredGeographicData: z.record(z.object({
        province: z.string().describe('The province name inferred or provided by the user'),
        country: z.string().describe('The country name inferred or provided by the user'),
    })).optional().describe(
        'Map of address variable key -> inferred/user-provided geographic data. Use this parameter to supply the province and country name for any address fields (e.g., declarantFullAddress, workplaceAddress). The LLM should search/infer these. If the LLM is unable to find/infer them, it must ask the user for the province and country and then pass them here.',
    ),
});

const optionalPurchaseRowId = z
    .string()
    .optional()
    .describe(
        'Same user_documents row _id (24-char hex) as in submit_group_answers. Pass on every call after a purchase link so the server uses that purchase’s session — especially if the user could have more than one purchase of the same document.',
    );

const GeneratePdfSchema = z.object({
    templateName: z.string().describe('Template name to generate PDF for'),
    userDocumentId: optionalPurchaseRowId,
});

const ConfirmDocumentSchema = z.object({
    templateName: z.string().describe('Template name to confirm and upload for download'),
    userDocumentId: optionalPurchaseRowId,
});

const UpdateVariableSchema = z.object({
    templateName: z.string().describe('Template name'),
    userDocumentId: optionalPurchaseRowId,
    variableLabel: z.string().describe('The human-readable label of the variable to update, e.g. "Ciudad de firma", "Nombre legal", etc. Fuzzy matched against the schema.'),
    newValue: z.union([z.string(), z.number()]).optional().describe('The new value for the variable. Omit on the first call to look up current value and ask the user for the new value.'),
});

function getUserIdFromContext(ctx: ExecutionContext): string {
    const tokenPayload = (ctx.auth?.tokenPayload ?? {}) as Record<string, unknown>;
    if (typeof tokenPayload.user_id === 'string') return tokenPayload.user_id;
    if (typeof tokenPayload.userId === 'string') return tokenPayload.userId;
    const sub = typeof ctx.auth?.subject === 'string' ? ctx.auth.subject.trim() : '';
    if (sub && isValidObjectId(sub)) return sub;
    return 'anonymous';
}

function safeErrorMessage(err: unknown): string {
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        if ('message' in err && typeof (err as Record<string, unknown>).message === 'string') {
            return (err as Record<string, unknown>).message as string;
        }
        try { return JSON.stringify(err); } catch { /* fall through */ }
    }
    return String(err ?? 'Unknown error');
}

function similarity(a: string, b: string): number {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    if (al === bl) return 1;
    const longer = al.length >= bl.length ? al : bl;
    const shorter = al.length >= bl.length ? bl : al;
    if (longer.length === 0) return 1;
    const costs: number[] = [];
    for (let i = 0; i <= longer.length; i++) {
        let lastVal = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i === 0) { costs[j] = j; continue; }
            if (j > 0) {
                let newVal = costs[j - 1];
                if (longer[i - 1] !== shorter[j - 1])
                    newVal = Math.min(newVal, lastVal, costs[j]) + 1;
                costs[j - 1] = lastVal;
                lastVal = newVal;
            }
        }
        if (i > 0) costs[shorter.length] = lastVal;
    }
    return (longer.length - costs[shorter.length]) / longer.length;
}



function fuzzyMatchVariableLabel(
    input: string,
    schema: { groups: Array<{ id: string; label: string; variables: Array<{ key: string; label: string }> }> }
): { groupId: string; groupLabel: string; key: string; label: string; score: number } | null {
    const inputLower = input.toLowerCase().replace(/[{}]/g, '').trim();
    let best: { groupId: string; groupLabel: string; key: string; label: string; score: number } | null = null;
    for (const group of schema.groups) {
        for (const variable of group.variables) {
            const varLower = variable.label.toLowerCase();
            // exact match first
            if (varLower === inputLower) {
                return { groupId: group.id, groupLabel: group.label, key: variable.key, label: variable.label, score: 1 };
            }
            // also try matching against the key name
            const keyLower = variable.key.toLowerCase();
            const score = Math.max(similarity(inputLower, varLower), similarity(inputLower, keyLower));
            if (!best || score > best.score) {
                best = { groupId: group.id, groupLabel: group.label, key: variable.key, label: variable.label, score };
            }
        }
    }
    return best && best.score >= 0.4 ? best : null;
}

function normalizeTemplateAliasKey(input: string): string {
    return input
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

const TEMPLATE_ALIASES: Record<string, string> = {
    [normalizeTemplateAliasKey('Contrato de Corretaje')]: 'Contrato de Representación Agente de Bienes Raíces',
    [normalizeTemplateAliasKey('Contrato de Representación Agente de Bienes Raíces')]: 'Contrato de Representación Agente de Bienes Raíces',
    [normalizeTemplateAliasKey('Contrato de Representacion Agente de Bienes Raices')]: 'Contrato de Representación Agente de Bienes Raíces',
    [normalizeTemplateAliasKey('Contrato de Intermediación y Corretaje Inmobiliario')]: 'Contrato de Representación Agente de Bienes Raíces',
};

function fuzzyMatchTemplate(input: string, validNames: string[]): string | null {
    const exact = validNames.find(n => n === input);
    if (exact) return exact;
    const caseMatch = validNames.find(n => n.toLowerCase() === input.toLowerCase());
    if (caseMatch) return caseMatch;
    const alias = TEMPLATE_ALIASES[normalizeTemplateAliasKey(input)];
    if (alias && validNames.includes(alias)) return alias;
    let best: string | null = null, bestScore = 0;
    for (const name of validNames) {
        const score = similarity(input, name);
        if (score > bestScore) { bestScore = score; best = name; }
    }
    return bestScore >= 0.6 ? best : null;
}

/** Purchase-row `_id` is 24 hex chars — models sometimes pass it as templateName and fuzzy match fails. */
function messageForTemplateNameThatIsPurchaseObjectId(mistakenValue: string): string {
    const id = mistakenValue.trim();
    return (
        `Este valor ("${id}") es el **ID de compra** (user_documents / userDocumentId de 24 caracteres), no el nombre de la plantilla. ` +
        `**Primera llamada correcta:** submit_group_answers con **solo** { "userDocumentId": "${id}" } (sin groupId, sin answers, sin templateName). ` +
        `Esa herramienta resuelve el documento y devuelve templateName. **No** uses analyze_template, generate_pdf, confirm_document ni update_variable con este ID como templateName.`
    );
}

/**
 * Never append listTemplates() to user-visible tool messages — models turn it into a bullet catalog.
 * Purchase flow: document is already fixed by user_documents + documents.title → fuzzy HBS match in submit_group_answers.
 */
function invalidTemplateNameForToolMessage(mistaken: string): string {
    return (
        `La plantilla "${mistaken}" no está disponible en el servidor en este momento. ` +
        `Por favor verifica que el documento exista en src/templates/hbs y src/templates/schemas, o actualiza el título del catálogo para que coincida con una plantilla cargada.`
    );
}

@Injectable({ deps: [DocAssistantService, MongoService] })
export class DocAssistantTools {
    constructor(
        private readonly docService: DocAssistantService,
        private readonly mongoService: MongoService,
    ) {}

    @Tool({
        name: 'submit_group_answers',
        description: `Saves user answers and returns the next group of questions. YOU MUST CALL THIS TOOL — do not skip it.

FIRST CALL — pass ONLY userDocumentId (24-char hex user_documents row _id). No groupId or answers. This always starts a **fresh** server session (page refresh, Clear Chat, or reopening the purchase link) and returns **openingChatMessage** when the document has no saved answers yet.

The user may write: "Fill out the document for 507f1f77bcf86cd799439011" (English or Spanish) — the long hex string is **always** this userDocumentId, **not** a template name. **Never** pass that hex string as templateName to generate_pdf, analyze_template, confirm_document, or update_variable; those tools will fail. **Only** submit_group_answers accepts it, as userDocumentId.

EVERY LATER CALL — pass the SAME userDocumentId + groupId (from the tool response) + answers { key: value }. Do NOT pass templateName (the tool resolves the session from the purchase id).

The tool response still includes templateName for your other tools (e.g. generate_pdf, update_variable, confirm_document).

Variables with **type "choice"** have a fixed list of allowed strings in **options** — this is for ALL documents. In chat, never describe this as a dropdown; ask naturally in Spanish and save the exact option text.

⚠️⚠️⚠️ CRITICAL RULES — READ CAREFULLY:

1. userDocumentId is required on EVERY call. Never omit it.

2. You MUST actually call this tool. Do NOT just say "I will submit" without calling it. Answers are NOT saved unless you call this tool.

3. When calling this tool, the text content of that message MUST be completely empty. **FORBIDDEN**: English filler, process narration, or thinking-aloud (including announcing that you are "starting" the fill-out / document process, or "saving" answers). Do not write English in chat. Once the tool returns, you must write the full Spanish text (opening script + questions, next group, error explanation, or completion prompt) so that the final user-visible response is never empty.

4. After the tool returns, present the next group questions (or the AWL opening on first success) IN THE SAME ASSISTANT TURN. Do not wait for the user to say "next".

5. The correct flow is: user sends message or answers → you call this tool with completely empty text content → tool returns → you write your Spanish message for the user. Same turn, non-empty user-visible text after every tool result.

6. NEVER announce a tool call without actually making it. If you say "I will submit" you MUST call the tool in that same response.

ACCEPT NORMAL TEXT — NEVER ask for JSON:
- Parse the user's natural language and map to schema variable keys.
- Pass userMessage (the user's last chat message verbatim) when groupId + answers are set — the server extracts dates and other fields from Spanish narrative even if you omit some keys.
- For date groups (employmentDates, terminationInfo, vacationInfo, paymentInfo, signingInfo), include canonical keys when you can AND pass userMessage so nothing is lost.
- Example: "empresa" → party1IsCompany: "empresa".
- Correct obvious Spanish typos and missing accents in free-text answers before saving (names, addresses, cities, companies); never alter fixed choice strings, raw ID/RNC/account numbers, or amounts except for clear accidental typos — see RULE 5g in the system prompt.
- For schema variables with type "date", you may pass relative phrases (e.g. "today", "hoy", "10 days from now"); the server converts them to a Spanish calendar date before storing. (Términos de Uso Página Web — *updateDate* is stored as a plain textual Spanish date like "31 de marzo de 2026", not the dual legal form; just capture the date the user gives.)
- For free-text "list" fields where the user enumerates an open-ended number of items (e.g. Términos de Uso Página Web *servicesList*; Propuesta de Trabajo *functionsList*; benefit lists joined per RULE 5k), ask the user to list the items freely and submit them in ONE key joined with "; " (semicolon + space). Do NOT ask rigidly for "item 1, item 2, item 3"; the server renders only as many enumerated entries (a, b, c, …) as the user actually provided.

█ RULE 5q — SIGNING PLACE: PROVINCE & COUNTRY (ABSOLUTE; LLM ONLY; NO SERVER HARDCODE) █
Whenever the group includes signingCity / signingProvince / signingCountry (or signingProvincestate), follow system prompt **RULE 5q** with zero exceptions:
1. Ask ONLY for the **city** (+ signing date when applicable). Do **NOT** ask province/country by default.
2. YOU resolve province and country from the city and **submit all three** in the same submit_group_answers call. Omitting known province/country is a failure.
3. **NEVER hallucinate.** If unsure → ask the user **only** for the missing province and/or country; never invent, guess, copy city→province, or default to "República Dominicana".
4. FORBIDDEN: signingCity="Santo Domingo" + signingProvince="Santo Domingo". After RULE 5o: capital → "Santo Domingo de Guzmán" + "Distrito Nacional" + "República Dominicana".
5. Multi-country cities (Madrid, Santiago, etc.): confirm country before submitting.
6. Server does **not** hardcode signing province/country — your tool call (or the user’s clarification) is the only source.

█ CONTRATO DE TELETRABAJO — SUBMIT QUALITY (TOOL-LEVEL; MANDATORY WHEN templateName IS THIS DOCUMENT) █
Your answers object must be clean before you call this tool (do not rely on the server to fix bad payloads):
- **Distinct cédulas:** Never submit the same value for employerIdNumber and employeeIdNumber. Ask again if missing/duplicated.
- **Nationality gender:** dominicano/dominicana must agree with the person’s sex (casado→dominicano; casada→dominicana).
- **Address triples:** street = calle/edificio only; city = municipality once; country = país once in *Country. No República Dominicana inside street/city; no duplicated city tokens. Orthography: "de" / "de los" lowercase in place names.
- **Schedule:** workSchedule = days+hours only; lunch ONLY in lunchBreakDuration. Forbidden: full sentence "El horario de trabajo será…" or lunch inside workSchedule.
- **Costs:** sequential cost1…cost4 with no empty gaps (never a)+empty b/c)+cost4).

█ RECIBO DE DESCARGO LABORAL — SUBMIT QUALITY (TOOL-LEVEL; MANDATORY WHEN templateName IS THIS DOCUMENT) █
- **Never silently rewrite the total** to match the desglose. If line items ≠ totalAmountWithCurrency, ASK which figure to correct (RULE 5i). Server rejects submit_group_answers and generate_pdf on mismatch — do not invent a “fixed” total.
- **Exact schema labels in chat:** Preaviso, Auxilio de Cesantía, Navidad (regalía pascual), Vacaciones — never bare “Cesantía” alone.
- **RULE 5f:** Ask the four base amounts once. If already present in answers or userMessage, map keys and do NOT re-ask.
- **Nationality gender:** declarantNationality agrees with the worker’s name/gender (dominicano / dominicana).
- **Address:** do not force “Santo Domingo de Guzmán” when the user already gave Distrito Nacional; clarify only when ambiguous (RULE 5o).

█ RECIBO DE DESCARGO TRABAJADORA DOMÉSTICA — SUBMIT QUALITY (TOOL-LEVEL; MANDATORY WHEN templateName IS THIS DOCUMENT) █
- **lastSalaryPeriodDate:** month/year of the último salario (near employment end) — NEVER the employment start month/year.
- **contractTerminationDate:** reuse employmentEndDate when already known; ask terminationReason only (unless dates differ).
- **Pending vacation:** if user mentions a pending/unpaid vacation period, ask before saving — do not claim «no se adeuda» in TERCERO without confirmation.
- **Notary boilerplate:** show the jurisdicción notarial confirmation at most once; never repeat it after every turn.

█ CONTRATO DE REPRESENTACIÓN AGENTE DE BIENES RAÍCES — SUBMIT QUALITY (TOOL-LEVEL; MANDATORY WHEN templateName IS THIS DOCUMENT) █
- **transactionType:** only **"Venta"** or **"Alquiler"** (exact). Map «Venta de un inmueble residencial» → Venta.
- **Agent company:** agentIsCompany="Empresa" + legal name, RNC, rep — never blank persona-física clause for an SRL.
- **Commission:** % of sale price for Venta; months of rent for Alquiler — never the other formula.
- **Duration:** HBS always ends with «año». Put letter form in contractDurationWords and a bare year digit in contractDurationNumbers — never stuff «1 año, 6 meses…» into the numbers key.

█ PODER DE REPRESENTACIÓN SIGNOS DISTINTIVOS — SUBMIT QUALITY (TOOL-LEVEL; MANDATORY WHEN templateName IS THIS DOCUMENT) █
- **principalIdType / proxyIdType:** exactly **"la Cédula de Identidad y Electoral"** or **"el Pasaporte"** (HBS already says «titular de»). NEVER submit "de la Cédula…" / "del Pasaporte" for those keys (produces «titular de de…»).
- **principalRepIdType** (Empresa): still **"de la Cédula de Identidad y Electoral"** / **"del Pasaporte"** — that clause has no leading «de» in HBS.

█ TÉRMINOS DE USO PÁGINA WEB — SUBMIT QUALITY (TOOL-LEVEL; MANDATORY WHEN templateName IS THIS DOCUMENT) █
- **Sí/No flags:** hasRegistration, hasUserContent, hasSpecificServices, hasOptionalContactForms = exactly **"Sí"** or **"No"** only (accent on Sí). Map user «si/yes» → Sí; never leave "Si"/"yes"/empty phrases.

When { allComplete: true } and previewGenerated is true (Contrato de Trabajadora Doméstica only): the server has already prepared the preview — reply with assistantChatMessage / ONLY ${ALL_COMPLETE_CHAT_MESSAGE}, then IMMEDIATELY call generate_pdf with the same templateName and userDocumentId in the SAME assistant turn (do NOT wait for user confirmation). The widget attaches to generate_pdf, not this tool.

When { allComplete: true } without previewGenerated and without requireNotaryConfirmationBeforePreview, reply in Spanish (tú) with EXACTLY this text and nothing else:\n\n${ALL_COMPLETE_CHAT_MESSAGE}\n\nThen wait for the user to confirm before calling generate_pdf (other templates).

If requireNotaryConfirmationBeforePreview is true, use notaryJurisdictionChatMessage instead — do NOT send ${ALL_COMPLETE_CHAT_MESSAGE} yet and do NOT call generate_pdf.

CONDITIONAL FIELDS:
Some variables have a "condition" (e.g. condition.field="ownerIsCompany", condition.equals="Empresa").
Only ask those variables when the condition is met based on answers already given in the SAME group.
You MUST include ALL conditional fields that apply. For example, if the user picks "Empresa", ask ALL company fields (rep name, rep nationality, rep ID, rep address, etc.) IN THE SAME SUBMISSION.
Do NOT leave conditional fields empty — generate_pdf will reject missing required fields.

POST-PDF VARIABLE UPDATE (after PDF has already been generated):
If the user says "I want to change X", "update X to Y", "X is wrong, it should be Y", or similar:
1. Identify which group that variable belongs to (e.g. party1LegalName → groupId "party1").
2. Call this tool with userDocumentId (same purchase id as the whole flow) + that groupId + ONLY the changed field(s) in answers. Other fields are preserved.
3. After the tool returns allComplete: true, immediately call generate_pdf to regenerate with the updated variable.
4. Do NOT re-ask all questions — only update the specific field the user mentioned.

Present each group as a FLOWING PARAGRAPH in Spanish — NEVER use bullet points, numbered lists, or label: format. NEVER reveal section letters (A, B, C), group IDs, or "sección X de Y" to the user. Combine field names into natural sentences separated by commas. Where the schema defines fixed choices, weave them **conversationally** — NEVER say "dropdown", "Opciones:", or UI-style menus. Skip variables whose condition is not met.

MULTI-TURN QUESTIONING (max 4 fields per message):
You may ask a group's questions across multiple conversational turns, with at most 4 fields per turn. Collect all answers from the user first, then call this tool ONCE with all the answers for the group. Do NOT call this tool after each partial turn — wait until you have all answers for the group.`,
        inputSchema: SubmitGroupSchema,
    })
    @UseGuards(JwtGuard)
    async submitGroupAnswers(args: z.infer<typeof SubmitGroupSchema>, ctx: ExecutionContext) {
      try {
        const { groupId, answers, userDocumentId, userMessage } = args;
        const userId = getUserIdFromContext(ctx);
        let verifiedPurchase: UserDocumentRecord | null = null;
        const groupIdTrimmed = groupId?.trim() ?? '';
        const isFirstCall = groupIdTrimmed.length === 0;
        const purchaseId = userDocumentId?.trim() ?? '';

        if (!purchaseId) {
            return {
                success: false,
                message:
                    'Falta userDocumentId. Primero llama submit_group_answers con el id de compra (24 caracteres hex) y sin groupId ni answers.',
            };
        }
        if (!isValidObjectId(purchaseId)) {
            return {
                success: false,
                message:
                    'userDocumentId no es válido. Debe ser un ObjectId hex de 24 caracteres del enlace de compra.',
            };
        }
        if (groupIdTrimmed.length > 0 && answers === undefined) {
            return {
                success: false,
                message:
                    'Cuando envías groupId, también debes enviar answers (usa {} si no hay pares clave/valor en esa llamada).',
            };
        }

        toolLog('submit_group_answers', 'CALLED', {
            userDocumentId: purchaseId,
            groupId: groupId ?? '(none — first call)',
            answerKeys: answers ? Object.keys(answers) : [],
            userId,
        });

        /** New rows may be NOT_STARTED until the assistant moves them to IN_PROGRESS. */
        const purchaseStatusAllowed = (s: string) =>
            s === 'NOT_STARTED' || s === 'OPEN' || s === 'IN_PROGRESS';

        if (userId === 'anonymous') {
            return { success: false, message: 'Se requiere iniciar sesión para usar este documento.' };
        }

        verifiedPurchase = await this.mongoService.findUserDocumentByIdForUser(purchaseId, userId);
        if (!verifiedPurchase) {
            toolLog('submit_group_answers', 'USER_DOCUMENT NOT FOUND', { userDocumentId: purchaseId, userId });
            return {
                success: false,
                message: 'No se encontró la compra indicada o no coincide con tu usuario. Verifica el enlace.',
            };
        }
        if (!purchaseStatusAllowed(verifiedPurchase.status)) {
            toolLog('submit_group_answers', 'PURCHASE NOT ACTIVE', { purchaseStatus: verifiedPurchase.status });
            return {
                success: false,
                message: `Este documento ya ha sido completado o su acceso ha expirado (estado: ${verifiedPurchase.status}).`,
            };
        }

        const catalogDocumentId = verifiedPurchase.document_id.toString();
        const doc = await this.mongoService.findDocumentById(catalogDocumentId);
        if (!doc) {
            toolLog('submit_group_answers', 'DOCUMENT NOT FOUND', { catalogDocumentId });
            return { success: false, message: `No se encontró el documento en el catálogo. Por favor verifica el enlace.` };
        }
        if (doc.isDeleted || doc.status !== 'ACTIVE') {
            toolLog('submit_group_answers', 'DOCUMENT INACTIVE', {
                catalogDocumentId,
                status: doc.status,
                isDeleted: doc.isDeleted,
            });
            return { success: false, message: `El documento "${doc.title}" no está disponible actualmente.` };
        }

        const validNames = this.docService.listTemplates();
        const matchedFromCatalog = fuzzyMatchTemplate(doc.title, validNames);
        if (!matchedFromCatalog) {
            toolLog('submit_group_answers', 'REJECTED — invalid template name', { title: doc.title, validNames });
            ctx.logger.warn('Invalid template name (no fuzzy match ≥60%)', { title: doc.title, validNames });
            return {
                success: false,
                message:
                    `El título del documento en el catálogo ("${doc.title}") no coincide con ninguna plantilla .hbs desplegada (fuzzy ≥60%). ` +
                    `Requiere alineación en base de datos o despliegue de plantilla. ` +
                    `**No muestres al usuario la lista de plantillas del servidor.**`,
            };
        }
        let templateName = matchedFromCatalog;
        if (matchedFromCatalog !== doc.title) {
            toolLog('submit_group_answers', 'FUZZY MATCH', { input: doc.title, matched: matchedFromCatalog });
            ctx.logger.info('Fuzzy-matched template name', { input: doc.title, matched: matchedFromCatalog });
        }

        const existingSession = await this.docService.session.getSessionByPurchaseId(purchaseId, userId);

        toolLog('submit_group_answers', 'PURCHASE VERIFIED', {
            catalogDocumentId,
            title: doc.title,
            purchaseId: verifiedPurchase._id.toString(),
            userId,
            flow: 'user_document_id',
        });

        if (isFirstCall) {
            const purchaseRowId = verifiedPurchase._id.toString();
            if (existingSession) {
                const priorTemplate = existingSession.templateName || templateName;
                const hasAnswers = Object.keys(existingSession.variables).length > 0;
                if (!hasAnswers || existingSession.templateName !== templateName) {
                    toolLog('submit_group_answers', 'BOOTSTRAP_RESET_EXISTING_SESSION', {
                        purchaseId,
                        templateName,
                        priorTemplate,
                        previousVarCount: Object.keys(existingSession.variables).length,
                        completedGroups: existingSession.completedGroups,
                    });
                    await this.docService.clearSessionByPurchaseId(purchaseId, userId, priorTemplate);
                    toolLog('submit_group_answers', 'STARTING NEW SESSION (fresh bootstrap)', {
                        templateName,
                        userId,
                        documentId: catalogDocumentId,
                        userDocumentId: purchaseRowId,
                    });
                    ctx.logger.info('Starting new session (fresh bootstrap)', { templateName, userId });
                    await this.docService.session.start(templateName, userId, catalogDocumentId, purchaseRowId);
                    toolLog('submit_group_answers', 'SESSION STARTED OK', { templateName });
                } else {
                    toolLog('submit_group_answers', 'BOOTSTRAP_RESUME_EXISTING_SESSION', {
                        purchaseId,
                        templateName,
                        varCount: Object.keys(existingSession.variables).length,
                        completedGroups: existingSession.completedGroups,
                    });
                }
            } else {
                toolLog('submit_group_answers', 'STARTING NEW SESSION (fresh bootstrap)', {
                    templateName,
                    userId,
                    documentId: catalogDocumentId,
                    userDocumentId: purchaseRowId,
                });
                ctx.logger.info('Starting new session (fresh bootstrap)', { templateName, userId });
                await this.docService.session.start(templateName, userId, catalogDocumentId, purchaseRowId);
                toolLog('submit_group_answers', 'SESSION STARTED OK', { templateName });
            }
        } else {
            if (!existingSession) {
                return {
                    success: false,
                    message: 'No hay una sesión activa para esta compra. Primero llama submit_group_answers solo con userDocumentId (sin groupId ni answers).',
                };
            }
            templateName = existingSession.templateName;
            let narrativeForEnrich = userMessage?.trim() || undefined;
            if (!narrativeForEnrich && answers) {
                const schema = this.docService.getTemplateSchema(templateName);
                if (!('error' in schema)) {
                    const group = schema.groups.find((g) => g.id === groupIdTrimmed);
                    if (group) {
                        const groupKeys = new Set(group.variables.map((v) => v.key));
                        const parts = Object.entries(answers)
                            .filter(
                                ([k, v]) =>
                                    groupKeys.has(k) &&
                                    typeof v === 'string' &&
                                    String(v).trim().length > 8,
                            )
                            .map(([, v]) => String(v).trim());
                        if (parts.length > 0) {
                            narrativeForEnrich = parts.join(' ');
                        }
                    }
                }
            }
            const finalAnswers = { ...(answers ?? {}) };
            if (args.inferredGeographicData) {
                const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
                for (const [key, geo] of Object.entries(args.inferredGeographicData)) {
                    const rawVal = String(finalAnswers[key] ?? '').trim();
                    if (rawVal) {
                        const prov = String(geo.province || '').trim();
                        const country = String(geo.country || '').trim();
                        let appended = rawVal;
                        const foldedVal = fold(rawVal);
                        if (prov && !foldedVal.includes(fold(prov))) {
                            appended += `, ${prov}`;
                        }
                        if (country && !foldedVal.includes(fold(country))) {
                            appended += `, ${country}`;
                        }
                        finalAnswers[key] = appended;
                    }
                }
            }
            const enriched = this.docService.mapAnswersToGroupSchema(
                templateName,
                groupIdTrimmed,
                finalAnswers,
                narrativeForEnrich,
            );
            if (userMessage?.trim() && groupIdTrimmed) {
                enriched.mapped[groupUserMessageStorageKey(groupIdTrimmed)] = userMessage.trim();
            }
            const mergedForValidation = { ...(existingSession?.variables ?? {}), ...enriched.mapped };
            const validationErrors = getInvalidCedulaFieldsInVariables(mergedForValidation);
            if (validationErrors.length > 0) {
                return {
                    success: false,
                    message: validationErrors[0].message,
                };
            }
            if (isContratoTeletrabajoTemplate(templateName)) {
                const duplicateIds = detectTeletrabajoDuplicatePartyCedulas(mergedForValidation);
                if (duplicateIds) {
                    return {
                        success: false,
                        message: duplicateIds.message,
                        instruction:
                            'Ask the user in Spanish (tú) for the correct distinct cédula for the employer vs the worker. Do not save until they differ (unless the user explicitly confirms the same person).',
                    };
                }
                const sessionBefore = await this.docService.getSessionVariablesByPurchaseId(purchaseId, userId);
                const conflict = detectContratoTeletrabajoConflicts(sessionBefore, enriched.mapped);
                if (conflict) {
                    return {
                        success: false,
                        valueConflict: true,
                        templateName,
                        userDocumentId: purchaseId,
                        conflictKey: conflict.key,
                        instruction: buildContratoTeletrabajoConflictInstruction(conflict),
                    };
                }
            }
            if (isReciboDescargoLaboralTemplate(templateName)) {
                const breakdownSum = validateReciboDescargoLaboralBreakdownSum(
                    templateName,
                    mergedForValidation as Record<string, string | number>,
                );
                if (!breakdownSum.ok) {
                    return {
                        success: false,
                        message: breakdownSum.messageEs,
                        instruction:
                            `Reply IN SPANISH explaining the amounts do not add up:\n\n${breakdownSum.messageEs}\n\n` +
                            'Ask which figures to correct (total vs Preaviso / Auxilio de Cesantía / Navidad / Vacaciones / adicionales). ' +
                            'NEVER silently change totalAmountWithCurrency to force a match. Then resubmit via submit_group_answers.',
                    };
                }
            }
            if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
                const vacationAck = String(
                    (answers as Record<string, string | number> | undefined)?.vacationPendingAcknowledged ??
                        mergedForValidation.vacationPendingAcknowledged ??
                        '',
                )
                    .trim()
                    .toLowerCase();
                const vacationAcked =
                    vacationAck === 'sí' || vacationAck === 'si' || vacationAck === 'yes' || vacationAck === '1';
                const pendingText = [narrativeForEnrich, userMessage, JSON.stringify(answers ?? {})]
                    .filter(Boolean)
                    .join('\n');
                if (
                    !vacationAcked &&
                    detectPendingVacationDisclosure(pendingText) &&
                    (groupIdTrimmed === 'vacationInfo' ||
                        String(mergedForValidation.vacationCoverageThroughDate ?? '').trim() !== '')
                ) {
                    return {
                        success: false,
                        message:
                            'El usuario indicó un período de vacaciones pendiente/sin liquidar. Este recibo solo registra el año hasta el cual las vacaciones ya fueron tomadas y declara que no se adeuda nada más por ese concepto.',
                        instruction:
                            'Reply IN SPANISH (tú): explain that this document’s vacation clause only acknowledges vacations already taken through a year and states nothing further is owed. ' +
                            'Ask whether (a) they still want to record only the year already taken (knowing the PDF will say no se adeuda), or (b) they need to resolve the pending balance outside this recibo first. ' +
                            'If they confirm (a), resubmit vacationInfo with vacationCoverageThroughDate plus vacationPendingAcknowledged: "Sí". Do NOT silently drop the pending disclosure.',
                    };
                }
            }
            if (isCorretajeInmobiliarioTemplate(templateName)) {
                const normalizedPreview = { ...mergedForValidation } as Record<string, string | number>;
                applyCorretajeInmobiliarioNormalizations(normalizedPreview);
                for (const key of [
                    'transactionType',
                    'agentIsCompany',
                    'agentLegalName',
                    'ownerIsCompany',
                    'ownerLegalName',
                    'contractDurationWords',
                    'contractDurationNumbers',
                ] as const) {
                    if (normalizedPreview[key] !== undefined && normalizedPreview[key] !== mergedForValidation[key]) {
                        enriched.mapped[key] = normalizedPreview[key];
                    }
                }
                // Also map long transaction phrases from this submit's answers/userMessage.
                const txFromNarrative = normalizeCorretajeTransactionType(
                    String(answers?.transactionType ?? '') || narrativeForEnrich || userMessage || '',
                );
                if (txFromNarrative && groupIdTrimmed === 'transaction') {
                    enriched.mapped.transactionType = txFromNarrative;
                }
            }
            toolLog('submit_group_answers', 'SAVING GROUP ANSWERS', {
                templateName,
                groupId: groupIdTrimmed,
                answerCount: Object.keys(answers ?? {}).length,
                mappedKeys: Object.keys(enriched.mapped),
                parsedFromNarrative: enriched.parsedFromNarrative,
                mappedFrom: enriched.mappedFrom,
                hasUserMessage: Boolean(userMessage?.trim()),
                narrativeForEnrichLength: narrativeForEnrich?.length ?? 0,
            });
            if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
                reciboDomesticaVerifyLog(
                    'SUBMIT_BEFORE_STORE',
                    { purchaseId, userId, groupId: groupIdTrimmed, templateName },
                    enriched.mapped,
                );
            }
            ctx.logger.info('Saving group', { templateName, groupId: groupIdTrimmed, count: Object.keys(enriched.mapped).length });
            await this.docService.storeGroupVariablesByPurchaseId(
                purchaseId,
                userId,
                groupIdTrimmed,
                enriched.mapped,
                narrativeForEnrich,
            );
            if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
                const afterStore = await this.docService.getSessionVariablesByPurchaseId(purchaseId, userId);
                reciboDomesticaVerifyLog(
                    'SUBMIT_AFTER_STORE',
                    { purchaseId, userId, groupId: groupIdTrimmed, templateName },
                    afterStore,
                );
            }
            if (
                templateName === RECIBO_DESCARGO_TRABAJADORA_DOMESTICA &&
                groupIdTrimmed === 'signingInfo' &&
                answers &&
                Object.keys(answers).length > 0
            ) {
                const afterSigning = await this.docService.getSessionVariablesByPurchaseId(purchaseId, userId);
                const offered =
                    String(afterSigning[NOTARY_JURISDICTION_OFFERED_KEY] ?? '').trim().toLowerCase() === 'true';
                const acked = String(afterSigning[NOTARY_JURISDICTION_ACK_SENT_KEY] ?? '').trim().toLowerCase();
                if (
                    offered &&
                    acked !== 'sí' &&
                    acked !== 'si' &&
                    acked !== 'yes' &&
                    acked !== '1'
                ) {
                    await this.docService.patchSessionVariablesByPurchaseId(purchaseId, userId, {
                        [NOTARY_JURISDICTION_ACK_SENT_KEY]: 'Sí',
                    });
                }
            }
        }

        const completedGroups = await this.docService.getCompletedGroupsByPurchaseId(purchaseId, userId);
        toolLog('submit_group_answers', 'COMPLETED GROUPS SO FAR', { completedGroups });

        const next = await this.docService.getNextGroupByPurchaseId(templateName, userId, purchaseId);
        if ('error' in next) {
            toolLog('submit_group_answers', 'ERROR from getNextGroup', { error: (next as { error: string }).error });
            return { success: false, message: (next as { error: string }).error };
        }

        if (
            isFirstCall &&
            verifiedPurchase &&
            !('allComplete' in next) &&
            userId !== 'anonymous' &&
            isValidObjectId(userId)
        ) {
            const { matched, modified } = await this.mongoService.updateUserDocumentStatusByPurchaseId(
                verifiedPurchase._id.toString(),
                userId,
                'IN_PROGRESS',
            );
            toolLog('submit_group_answers', 'USER_DOCUMENT_STATUS_IN_PROGRESS', { purchaseId: verifiedPurchase._id.toString(), matched, modified });
        }

        if ('allComplete' in next) {
            toolLog('submit_group_answers', 'ALL COMPLETE', { totalCollected: next.totalCollected });
            if (templateName === RECIBO_DESCARGO_TRABAJADORA_DOMESTICA) {
                const sessionVarsComplete = await this.docService.getSessionVariablesByPurchaseId(purchaseId, userId);
                const notaryOffered =
                    String(sessionVarsComplete[NOTARY_JURISDICTION_OFFERED_KEY] ?? '').trim().toLowerCase() === 'true';
                const notaryAcked = String(sessionVarsComplete[NOTARY_JURISDICTION_ACK_SENT_KEY] ?? '')
                    .trim()
                    .toLowerCase();
                const notaryConfirmed =
                    notaryAcked === 'sí' || notaryAcked === 'si' || notaryAcked === 'yes' || notaryAcked === '1';

                if (
                    !notaryConfirmed &&
                    !isFirstCall &&
                    groupIdTrimmed.length === 0 &&
                    notaryOffered
                ) {
                    await this.docService.patchSessionVariablesByPurchaseId(purchaseId, userId, {
                        [NOTARY_JURISDICTION_ACK_SENT_KEY]: 'Sí',
                    });
                } else {
                    const notaryJurisdictionChatMessage =
                        domesticReciboNotaryConfirmationMessage(sessionVarsComplete);
                    if (notaryJurisdictionChatMessage) {
                        await this.docService.patchSessionVariablesByPurchaseId(purchaseId, userId, {
                            [NOTARY_JURISDICTION_OFFERED_KEY]: 'true',
                        });
                        const resNotary = {
                            success: true,
                            allComplete: true,
                            requireNotaryConfirmationBeforePreview: true,
                            notaryJurisdictionChatMessage,
                            totalCollected: next.totalCollected,
                            templateName,
                            userDocumentId: purchaseId,
                            instruction:
                                `Your assistant message "content" for this turn MUST be non-empty Spanish text. ALL GROUPS ARE DONE but NOTARY CONFIRMATION IS REQUIRED BEFORE PREVIEW. ` +
                                `Reply IN SPANISH with ONLY the following text (no paraphrase, no prefix, no suffix, no preview invitation yet):\n\n${notaryJurisdictionChatMessage}\n\n` +
                                `FORBIDDEN in this turn: asking for notary jurisdiction; ${ALL_COMPLETE_CHAT_MESSAGE}; generate_pdf. ` +
                                `After the user confirms (e.g. continuar, está bien) or gives another jurisdiction, call submit_group_answers with ONLY userDocumentId="${purchaseId}" (no groupId) — you will then receive the preview invitation text. Do NOT call generate_pdf until after that.`,
                        };
                        toolLog('submit_group_answers', 'RETURNED_RESULT', {
                            success: true,
                            allComplete: true,
                            requireNotaryConfirmationBeforePreview: true,
                            templateName,
                            userDocumentId: purchaseId,
                        });
                        ctx.logger.info('submit_group_answers returned notary confirmation required', {
                            success: true,
                            allComplete: true,
                            requireNotaryConfirmationBeforePreview: true,
                            templateName,
                            userDocumentId: purchaseId,
                        });
                        return resNotary;
                    }
                }
            }

            toolLog('submit_group_answers', 'AUTO PREVIEW — allComplete', {
                purchaseId,
                templateName,
            });
            const preview = await this.runPdfPreviewForSession(
                templateName,
                userId,
                purchaseId,
                ctx,
                'submit_group_answers',
            );
            if (isPdfPreviewWidgetReady(preview)) {
                const resAuto = buildDomesticAllCompleteWithAutoPreview(
                    {
                        totalCollected: next.totalCollected,
                        templateName,
                        userDocumentId: purchaseId,
                    },
                    preview,
                );
                toolLog('submit_group_answers', 'RETURNED_RESULT', {
                    success: true,
                    allComplete: true,
                    autoPreview: true,
                    templateName,
                    userDocumentId: purchaseId,
                });
                ctx.logger.info('submit_group_answers returned auto preview success', {
                    success: true,
                    allComplete: true,
                    autoPreview: true,
                    templateName,
                    userDocumentId: purchaseId,
                });
                return resAuto;
            }
            toolLog('submit_group_answers', 'AUTO PREVIEW FAILED — fallback to manual generate_pdf', {
                message: preview.message,
            });
            const resFailed = {
                success: true,
                allComplete: true,
                totalCollected: next.totalCollected,
                templateName,
                userDocumentId: purchaseId,
                instruction: buildDomesticAllCompletePreviewFailedInstruction(preview, purchaseId),
            };
            toolLog('submit_group_answers', 'RETURNED_RESULT', {
                success: true,
                allComplete: true,
                autoPreviewFailed: true,
                templateName,
                userDocumentId: purchaseId,
            });
            ctx.logger.warn('submit_group_answers returned auto preview failed', {
                success: true,
                allComplete: true,
                autoPreviewFailed: true,
                templateName,
                userDocumentId: purchaseId,
            });
            return resFailed;
        }

        toolLog('submit_group_answers', 'RETURNING NEXT GROUP', { groupId: next.group.id, groupLabel: next.group.label, groupIndex: next.groupIndex, totalGroups: next.totalGroups, variableCount: next.group.variables.length });
        const sessionVars = await this.docService.getSessionVariablesByPurchaseId(purchaseId, userId);
        const sessionVariableCount = Object.keys(sessionVars).filter(
            (k) => String(sessionVars[k] ?? '').trim() !== '',
        ).length;
        const isOpening = shouldUseAwliOpeningPhase({
            completedGroups,
            savedAnswerKeys: [],
            sessionVariableCount,
        });
        const awliPhase: 'opening' | 'middle' | 'last_group' = isOpening
            ? 'opening'
            : next.groupIndex === next.totalGroups
                ? 'last_group'
                : 'middle';
        const pendingFields = next.group.variables.map((v) => ({ key: v.key, label: v.label }));
        const openingChatMessage =
            isOpening ? buildOpeningChatMessage(templateName, next.group.id, pendingFields) : null;
        const phaseHint =
            openingChatMessage
                ? `awliPhase=opening — Reply with ONLY openingChatMessage from this tool (verbatim). Forbidden: "Qué gusto saludarte", "asistente virtual", "te ayudaré a completar este formulario", or any wording not in openingChatMessage.`
                : awliPhase === 'last_group'
                    ? 'awliPhase=last_group — After "Gracias. Recibido." use: "Finalmente, me confirmas por favor lo siguiente" then the questions in one flowing paragraph.'
                    : 'awliPhase=middle — After "Gracias. Recibido." use: "Ahora, sigamos con el resto de los datos que necesitamos. Por favor indícame" then the questions in one flowing paragraph.';
        const uiHint =
            'Your assistant message "content" for this turn MUST be non-empty Spanish text (the chat UI cannot show blank messages). ';
        const openingInstruction = openingChatMessage
            ? `COPY VERBATIM — Your assistant message "content" MUST be EXACTLY the following Spanish text (no paraphrase, no prefix, no suffix):\n\n${openingChatMessage}\n\n`
            : '';
        let notaryJurisdictionChatMessage: string | null = null;
        if (templateName === RECIBO_DESCARGO_TRABAJADORA_DOMESTICA) {
            notaryJurisdictionChatMessage = domesticReciboNotaryConfirmationMessage(sessionVars);
            if (notaryJurisdictionChatMessage) {
                await this.docService.patchSessionVariablesByPurchaseId(purchaseId, userId, {
                    [NOTARY_JURISDICTION_OFFERED_KEY]: 'true',
                });
            }
        }
        const notaryInstruction = notaryJurisdictionChatMessage
            ? `COPY VERBATIM — Your assistant message "content" MUST include EXACTLY the following Spanish notary confirmation (no paraphrase) BEFORE any other question in this turn:\n\n${notaryJurisdictionChatMessage}\n\nFORBIDDEN: asking "jurisdicción del notario" or notaryJurisdiction when this message is shown.\n\n`
            : '';
        let groupHint = '';
        if (templateName === RECIBO_DESCARGO_TRABAJADORA_DOMESTICA && groupIdTrimmed === 'employerInfo') {
            const employerAck = buildDomesticReciboEmployerAcknowledgment(sessionVars);
            if (employerAck) {
                groupHint +=
                    ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} employerInfo: FORBIDDEN to ask employerReference, payerReference, employerReferenceShort, or four grammatical variants ("de la señora", "el Empleador", etc.). domesticEmployerGender and workplaceDescription are inferred server-side. Your reply MUST include this acknowledgment (adapt name/refs only): "${employerAck}"`;
            }
        }
        if (
            templateName === RECIBO_DESCARGO_TRABAJADORA_DOMESTICA &&
            (groupIdTrimmed === 'declarantInfo' || groupIdTrimmed === 'employerInfo') &&
            notaryJurisdictionChatMessage
        ) {
            groupHint +=
                ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA}: after saving address/employer data, the notary confirmation is mandatory (see notaryJurisdictionChatMessage). Do NOT ask for notary jurisdiction separately.`;
        }
        if (templateName === RECIBO_DESCARGO_TRABAJADORA_DOMESTICA) {
            groupHint += RECIBO_DOMESTICA_SUBMIT_QUALITY_HINT;
            if (next.group.id === 'paymentInfo') {
                groupHint +=
                    ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} paymentInfo: ask navidad amount, último salario amount, and lastSalaryPeriodDate (month/year of that last pay — usually the final month worked). NEVER set lastSalaryPeriodDate to the employment START month. If only the amount is given, ask the month/year or omit lastSalaryPeriodDate so the server can use employmentEndDate.`;
            }
            if (next.group.id === 'terminationInfo') {
                const endKnown = String(sessionVars.employmentEndDate ?? '').trim();
                if (endKnown) {
                    groupHint +=
                        ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} terminationInfo: employmentEndDate is already «${endKnown}». Ask ONLY terminationReason. Submit contractTerminationDate="${endKnown}" (same date) unless the user says the effective termination differs. NEVER re-ask the termination date. NEVER ask terminationDayLetters/Numbers/Month/Year — server derives them.`;
                } else {
                    groupHint +=
                        ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} terminationInfo: ask terminationReason and ONE contractTerminationDate (full date). NEVER ask terminationDayLetters, terminationDayNumbers, terminationMonthLetters, terminationYearLetters, or terminationYearNumbers — server derives them.`;
                }
            }
            if (next.group.id === 'vacationInfo') {
                groupHint +=
                    ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} vacationInfo: ask ONE vacationCoverageThroughDate — until which year the worker's vacations were already taken/paid. If the user discloses pending/unpaid vacation, STOP and ask how to proceed before submit (template TERCERO says nothing further is owed). NEVER ask vacationYearLetters or vacationYearNumbers — server derives them.`;
            }
            if (next.group.id === 'signingInfo') {
                if (notaryJurisdictionChatMessage) {
                    groupHint +=
                        ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} signingInfo: notary jurisdiction confirmation is shown in this turn ONLY (first time). Include notaryJurisdictionChatMessage once; ask ONLY pending signing fields (typically documentSigningDate). NEVER ask notaryJurisdiction. NEVER repeat the notary paragraph on later turns.`;
                } else {
                    groupHint +=
                        ` ${RECIBO_DESCARGO_TRABAJADORA_DOMESTICA} signingInfo: ask signingCity and documentSigningDate (one full date). ${SIGNING_PLACE_LLM_INFER_HINT} Do NOT ask notaryJurisdiction unless the notary acts in a different province than signing. Do NOT repeat any prior notary confirmation paragraph.`;
                }
            }
        }
        if (isReciboDescargoLaboralTemplate(templateName)) {
            groupHint += RECIBO_LABORAL_SUBMIT_QUALITY_HINT;
            if (next.group.id === 'declarantInfo') {
                groupHint +=
                    ' declarantInfo: nationality must match gender (dominicano/dominicana). Address: if user already said Santo Domingo + Distrito Nacional, keep that wording — do not silently rename to Santo Domingo de Guzmán.';
            }
            if (next.group.id === 'breakdownToggle') {
                groupHint +=
                    ' breakdownToggle: ask ONLY hasDetailedBreakdown (Sí/No). FORBIDDEN to list or ask Preaviso / Auxilio de Cesantía / Navidad / Vacaciones amounts in this group.';
            }
            if (next.group.id === 'breakdownAmounts') {
                groupHint +=
                    ' breakdownAmounts: use exact labels Preaviso, Auxilio de Cesantía, Navidad (regalía pascual), Vacaciones. Ask the four amounts ONCE (RULE 5f). If already in answers/userMessage, map keys — NEVER re-ask. Sum MUST equal totalAmountWithCurrency; on mismatch ASK the user — NEVER overwrite the total.';
            }
            if (next.group.id === 'signingInfo') {
                groupHint +=
                    ` signingInfo: ask signing city and signing date as ONE calendar date including day+month+year (documentSigningDate). ${SIGNING_PLACE_LLM_INFER_HINT} Do NOT ask the year again in a separate routine follow-up; server fills year fragments for the PDF. One short clarification only if the user omitted the year entirely.`;
            }
        }
        if (isCorretajeInmobiliarioTemplate(templateName)) {
            groupHint += CORRETAJE_SUBMIT_QUALITY_HINT;
            if (next.group.id === 'transaction') {
                groupHint +=
                    ' transaction: submit transactionType as exactly "Venta" or "Alquiler" only.';
            }
            if (next.group.id === 'agent') {
                groupHint +=
                    ' agent: if company/SRL/RNC/representante → agentIsCompany="Empresa" + agentLegalName, agentRnc, agentRep*. Never leave persona-física name blank for a company.';
            }
            if (next.group.id === 'commission') {
                const tx =
                    normalizeCorretajeTransactionType(sessionVars.transactionType) ??
                    String(sessionVars.transactionType ?? '');
                groupHint +=
                    tx === 'Alquiler'
                        ? ' commission: Alquiler → commissionMonthsWords + commissionMonthsNumber only.'
                        : ' commission: Venta → commissionPercentWords + commissionPercentNumber (e.g. cinco / 5). NEVER use months-of-rent formula for a sale.';
            }
            if (next.group.id === 'duration') {
                groupHint +=
                    ' duration: HBS is words (numbers) año — use letter years + bare digit (e.g. un / 1). Never put "1 año, 6 meses…" into contractDurationNumbers.';
            }
        }
        if (isPoderSignosDistintivosTemplate(templateName)) {
            groupHint += SIGNOS_DISTINTIVOS_SUBMIT_QUALITY_HINT;
            if (next.group.id === 'principal' || next.group.id === 'proxy') {
                groupHint +=
                    ' IdType for persona física / apoderado: "la Cédula de Identidad y Electoral" or "el Pasaporte" only.';
            }
        }
        if (isTerminosUsoPaginaWebTemplate(templateName)) {
            groupHint += TERMINOS_USO_WEB_SUBMIT_QUALITY_HINT;
            if (next.group.id === 'siteFeatures') {
                groupHint +=
                    ' siteFeatures: submit hasRegistration / hasUserContent as exactly "Sí" or "No" — required for §2.4 d) and §5.4.';
            }
        }
        if (isPropuestaDeTrabajoTemplate(templateName)) {
            groupHint += PROPUESTA_TRABAJO_SUBMIT_QUALITY_HINT;
            if (next.group.id === 'compensation') {
                groupHint +=
                    ' compensation: payrollDays days only ("15 y 30") — never "de cada mes". ' +
                    'If user gives custom benefits → hasAdditionalBenefits="Sí" + additionalBenefitsList ("; "-joined).';
            }
        }
        if (isDomesticContractTemplate(templateName) && next.group.id === 'duration') {
            groupHint +=
                ' Contrato de Trabajadora Doméstica duration: FORBIDDEN to ask contractDurationIndefinite, "redacción de la vigencia", or "frase completa" when contractDurationKind is Por tiempo indefinido — server auto-fills por tiempo indefinido. Ask only contractDurationKind, plazo fijo duration (number + unit) if applicable, and minimum notice (one number/words + unit).';
        }
        if (isDomesticContractTemplate(templateName) && next.group.id === 'signing') {
            groupHint +=
                ` Contrato de Trabajadora Doméstica signing: ask signingCity and ONE documentSigningDate (día, mes y año de firma en que se va a firmar este contrato, e.g. 15 de marzo de 2026). ${SIGNING_PLACE_LLM_INFER_HINT} FORBIDDEN to ask signingMonthLetters, signingYearLetters, signingYearNumbers, signingDayLetters, signingDayNumbers, or "mes/año en letras o números" separately — server derives PDF fragments.`;
        }
        if (templateName === 'Contrato de Compraventa Vehículo' && next.group.id === 'signing') {
            groupHint +=
                ` Contrato de Compraventa Vehículo signing: ask signingCity and ONE documentSigningDate (full calendar date, e.g. 30 de junio de 2026). ${SIGNING_PLACE_LLM_INFER_HINT} FORBIDDEN to submit signingDateLetters/signingDateNumbers/signingYearLetters/signingYearNumbers separately or use dual form "Treinta (30)" in letter fields — server fills día en letras, día en números, mes y año for the PDF.`;
        }
        if (
            templateName === 'Contrato de Compraventa Vehículo' &&
            (next.group.id === 'seller' || next.group.id === 'buyer')
        ) {
            const compraventaHint = buildCompraventaPartyGroupHint(next.group.id, sessionVars);
            if (compraventaHint) {
                groupHint += compraventaHint;
            }
        }
        let teletrabajoFollowUpChatMessage: string | null = null;
        if (!openingChatMessage && isContratoTeletrabajoTemplate(templateName)) {
            groupHint += TELETRABAJO_SUBMIT_QUALITY_HINT;
            const pendingKeys = next.group.variables.map((v) => v.key);
            teletrabajoFollowUpChatMessage = buildTeletrabajoFollowUpMessage(
                next.group.id,
                sessionVars,
                pendingKeys,
            );
            const employerHint = buildContratoTeletrabajoEmployerGroupHint(sessionVars);
            const costsHint = buildContratoTeletrabajoCostsGroupHint(sessionVars);
            if (employerHint) groupHint += employerHint;
            if (costsHint) groupHint += costsHint;
            if (next.group.id === 'employer' || next.group.id === 'employee') {
                groupHint +=
                    ' IDs: never copy cédula between employer and employee. Nationality must match gender (dominicano/dominicana). Address: street/city/country each once — no RD inside street/city.';
            }
            if (next.group.id === 'workplace') {
                groupHint +=
                    ' Workplace triple: workplaceAddress=calle/sector only; workplaceCity=city once; workplaceCountry=país once. NEVER embed República Dominicana in address/city.';
            }
            if (next.group.id === 'schedule') {
                groupHint +=
                    ' Contrato de Teletrabajo schedule (STRICT): workSchedule = ONLY days + start/end (e.g. "lunes a viernes, de 8 a.m. a 5 p.m."). FORBIDDEN lunch/almuerzo inside workSchedule or "El horario de trabajo será…". lunchBreakDuration SEPARATE (e.g. "1 hora"). Do not mix with salary.';
            }
            if (next.group.id === 'costs') {
                groupHint +=
                    ' Costs (STRICT): submit cost1, cost2, … in order with no empty gaps; leave unused costN empty. Never put the second cost in cost4 while cost2/cost3 are blank.';
            }
            if (next.group.id === 'signing') {
                groupHint +=
                    ` Contrato de Teletrabajo signing: pregunta signingCity y UNA fecha completa de firma (documentSigningDate). No uses signingCity para la fecha. ${SIGNING_PLACE_LLM_INFER_HINT}`;
            }
        }
        let compraventaFollowUpChatMessage: string | null = null;
        if (!openingChatMessage && templateName === 'Contrato de Compraventa Vehículo') {
            if (next.group.id === 'seller' || next.group.id === 'buyer') {
                const prefix = next.group.id as 'seller' | 'buyer';
                const pendingKeys = next.group.variables.map((v) => v.key);
                for (const key of pendingKeys) {
                    if (!COMPRAVENTA_ADDRESS_KEYS.has(key)) continue;
                    const val = String(sessionVars[key] ?? '').trim();
                    if (!val) continue;
                    const missingParts = missingCompraventaAddressComponents(val);
                    const addressMsg = formatCompraventaAddressMissingPrompt(missingParts);
                    if (addressMsg) {
                        compraventaFollowUpChatMessage = addressMsg;
                        break;
                    }
                }
                if (!compraventaFollowUpChatMessage) {
                    compraventaFollowUpChatMessage = buildCompraventaFollowUpMessage(
                        next.group.id,
                        prefix,
                        sessionVars,
                        pendingKeys,
                    );
                }
            } else if (next.group.id === 'vehicle') {
                compraventaFollowUpChatMessage = buildCompraventaVehicleGroupIntroMessage('vehicle');
            }
        }
        const compraventaFollowUpInstruction = compraventaFollowUpChatMessage
            ? `COPY VERBATIM — Your assistant message "content" MUST be EXACTLY the following Spanish text (no paraphrase, no prefix, no suffix):\n\n${compraventaFollowUpChatMessage}\n\n`
            : '';
        const teletrabajoFollowUpInstruction = teletrabajoFollowUpChatMessage
            ? `COPY VERBATIM — Your assistant message "content" MUST be EXACTLY the following Spanish text (no paraphrase, no prefix, no suffix):\n\n${teletrabajoFollowUpChatMessage}\n\n`
            : '';
        const resultPayload = {
            success: true,
            allComplete: false,
            templateName,
            userDocumentId: purchaseId,
            awliPhase,
            ...(openingChatMessage ? { openingChatMessage } : {}),
            ...(teletrabajoFollowUpChatMessage ? { teletrabajoFollowUpChatMessage } : {}),
            ...(compraventaFollowUpChatMessage ? { compraventaFollowUpChatMessage } : {}),
            ...(notaryJurisdictionChatMessage ? { notaryJurisdictionChatMessage } : {}),
            ...next,
            instruction: openingChatMessage
                ? `${uiHint}${openingInstruction}THE SESSION IS NOT YET COMPLETE. You MUST now output the required Spanish message to the user for this turn. Do NOT leave the response blank or stop responding. After you output your message, wait for the user's reply, and only then call submit_group_answers with userDocumentId="${purchaseId}" + groupId="${next.group.id}" + answers. Do NOT call generate_pdf yet.`
                : teletrabajoFollowUpChatMessage
                  ? `${uiHint}${teletrabajoFollowUpInstruction}${groupHint} THE SESSION IS NOT YET COMPLETE. You MUST now output the required Spanish message to the user for this turn. Do NOT leave the response blank or stop responding. After you output your message, wait for the user's reply, and only then call submit_group_answers with userDocumentId="${purchaseId}" + groupId="${next.group.id}" + answers. Do NOT call generate_pdf yet.`
                  : compraventaFollowUpChatMessage
                  ? `${uiHint}${compraventaFollowUpInstruction}${groupHint} THE SESSION IS NOT YET COMPLETE. You MUST now output the required Spanish message to the user for this turn. Do NOT leave the response blank or stop responding. After you output your message, wait for the user's reply, and only then call submit_group_answers with userDocumentId="${purchaseId}" + groupId="${next.group.id}" + answers. Do NOT call generate_pdf yet.`
                  : notaryJurisdictionChatMessage
                    ? `${uiHint}${notaryInstruction}THE SESSION IS NOT YET COMPLETE. You MUST now output the required Spanish message to the user for this turn. Do NOT leave the response blank or stop responding. ${groupHint} Present any remaining pending fields IN SPANISH after the notary confirmation paragraph (one flowing paragraph). NEVER ask notaryJurisdiction. Do NOT call generate_pdf yet. Pass userDocumentId="${purchaseId}" on every call.`
                    : `${uiHint}THE SESSION IS NOT YET COMPLETE. You MUST now output the next Spanish message to the user asking the questions. Do NOT leave the response blank or stop responding. On every later call pass userDocumentId (same purchase id) + groupId + answers — never omit userDocumentId. ${phaseHint}${groupHint} Present questions IN SPANISH as a FLOWING PARAGRAPH (no bullets, no numbered lists). NEVER reveal section letters, group IDs, or "sección X de Y". Max 4 fields per message; split a large group across turns — after each user reply within the same group, start with "Gracias. Recibido." then continue with more fields; only use the "Ahora, sigamos…" / "Finalmente…" bridges when moving to a NEW schema group (this response is group ${next.groupIndex} of ${next.totalGroups}). End with an inviting close (gender-neutral — never **Estaré atento**; prefer **Estaré al tanto**, **Seguimos cuando quieras**, etc.). Do NOT call generate_pdf yet. Use templateName="${templateName}" only for generate_pdf, update_variable, and confirm_document — not for this tool.`,
        };

        toolLog('submit_group_answers', 'RETURNED_RESULT', {
            success: true,
            allComplete: false,
            templateName,
            userDocumentId: purchaseId,
            awliPhase,
            groupId: next.group?.id,
            groupIndex: next.groupIndex,
            totalGroups: next.totalGroups,
            hasOpening: Boolean(openingChatMessage),
            hasNotary: Boolean(notaryJurisdictionChatMessage),
            instructionLength: resultPayload.instruction.length,
        });
        ctx.logger.info('submit_group_answers returned next group', {
            success: true,
            allComplete: false,
            templateName,
            userDocumentId: purchaseId,
            awliPhase,
            groupId: next.group?.id,
            groupIndex: next.groupIndex,
            totalGroups: next.totalGroups,
            hasOpening: Boolean(openingChatMessage),
            hasNotary: Boolean(notaryJurisdictionChatMessage),
        });

        return resultPayload;
      } catch (err) {
        const msg = safeErrorMessage(err);
        toolLog('submit_group_answers', 'UNHANDLED ERROR', { error: msg });
        ctx.logger.error('submit_group_answers failed', { error: msg });
        if (/bad auth|authentication failed|auth failed/i.test(msg)) {
            return {
                success: false,
                message:
                    'No pude cargar la información del documento porque la conexión del servidor con la base de datos no está autenticando correctamente. ' +
                    'Esto es una configuración técnica del servidor; por favor verifica MONGO_URI, MONGO_AUTH_SOURCE y MONGO_DB_NAME.',
            };
        }
        return { success: false, message: `Session error: ${msg}. Please try again.` };
      }
    }

    /**
     * Shared PDF preview pipeline (guards + fill + ephemeral HTML upload).
     * Used by generate_pdf and by Contrato de Trabajadora Doméstica auto-preview on allComplete.
     */
    private async runPdfPreviewForSession(
        templateName: string,
        userId: string,
        purchaseOpt: string | undefined,
        ctx: ExecutionContext,
        logTag: string,
    ): Promise<Record<string, unknown>> {
        const usePurchase = Boolean(purchaseOpt && isValidObjectId(purchaseOpt));

        if (usePurchase && purchaseOpt) {
            await this.docService.syncNormalizedSessionVariablesByPurchaseId(purchaseOpt, userId);
        }
        const nextGroup =
            usePurchase && purchaseOpt
                ? await this.docService.getNextGroupByPurchaseId(templateName, userId, purchaseOpt)
                : await this.docService.getNextGroup(templateName, userId);
        if ('error' in nextGroup) {
            toolLog(logTag, 'GUARD 1 ERROR', { error: (nextGroup as { error: string }).error });
            return { success: false, pdfPath: '', htmlContent: '', templateName, message: (nextGroup as { error: string }).error };
        }
        if (!('allComplete' in nextGroup)) {
            toolLog(logTag, 'GUARD 1 FAILED — incomplete groups', {
                pendingGroupId: nextGroup.group.id,
                groupIndex: nextGroup.groupIndex,
            });
            ctx.logger.warn(`${logTag}: incomplete groups`, { groupId: nextGroup.group.id, groupIndex: nextGroup.groupIndex });
            const pendingLabels = nextGroup.group.variables.map((v) => v.label).join(', ');
            const isLikelyFreshOrResetSession = nextGroup.groupIndex === 1;
            const pendingMessage = isLikelyFreshOrResetSession
                ? `Todavía no hay respuestas guardadas para este documento en la sesión actual. ` +
                  `Para continuar, vuelve al chat y responde las preguntas iniciales de "${nextGroup.group.label}" (${pendingLabels}).`
                : `Para poder generar el borrador, todavía falta completar esta información: ${pendingLabels}.`;
            return {
                success: true,
                needsMoreAnswers: true,
                pdfPath: '',
                htmlContent: '',
                templateName,
                message: pendingMessage,
                pendingGroup: nextGroup,
                instruction:
                    `Do NOT apologize as a technical error. Do NOT call confirm_document. ` +
                    `Your next chat message MUST ask the user IN SPANISH for the pending information from "${nextGroup.group.label}" as a flowing paragraph: ${pendingLabels}. ` +
                    `Then call submit_group_answers with userDocumentId="${purchaseOpt ?? ''}", groupId="${nextGroup.group.id}", and the user's answers. ` +
                    `Only call generate_pdf after submit_group_answers returns allComplete: true.`,
            };
        }
        toolLog(logTag, 'GUARD 1 PASSED — all groups complete');

        let variables = usePurchase
            ? await this.docService.getSessionVariablesByPurchaseId(purchaseOpt!, userId)
            : await this.docService.getSessionVariables(templateName, userId);
        if (Object.keys(variables).length === 0) {
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName,
                message: 'No variables found. Complete all groups via submit_group_answers first.',
                instruction:
                    `Start the purchase flow by calling submit_group_answers with only the userDocumentId from the purchase link.`,
            };
        }
        if (isCorretajeInmobiliarioTemplate(templateName)) {
            const normalized = { ...variables };
            applyCorretajeInmobiliarioNormalizations(normalized);
            variables = normalized;
            const missingCritical = corretajeMissingCriticalFields(variables);
            if (missingCritical.length > 0) {
                return {
                    success: false,
                    pdfPath: '',
                    htmlContent: '',
                    templateName,
                    message: `Faltan datos críticos del corretaje: ${missingCritical.join('; ')}.`,
                    instruction:
                        'Ask the user IN SPANISH for the missing corretaje fields (transactionType Venta/Alquiler; company agent legal name/RNC/rep; matching commission %). ' +
                        'Submit via submit_group_answers with the correct groupId, then call generate_pdf again.',
                };
            }
        }

        const fieldCheck = this.docService.verifyRequiredFields(templateName, variables);
        if (!fieldCheck.ok) {
            const byGroup = new Map<string, { groupId: string; fields: Array<{ key: string; label: string }> }>();
            for (const f of fieldCheck.missingFields) {
                if (!byGroup.has(f.groupId)) byGroup.set(f.groupId, { groupId: f.groupId, fields: [] });
                byGroup.get(f.groupId)!.fields.push({ key: f.key, label: f.label });
            }
            const groupSummaries = [...byGroup.values()].map(
                (g) => `groupId="${g.groupId}": ${g.fields.map((f) => f.label).join(', ')}`,
            );
            const TERMINATION_KEYS = new Set(['preavisoAmount', 'cesantiaAmount', 'navidadAmount', 'vacacionesAmount']);
            const isTerminationAmountsRequest =
                templateName === 'Recibo de Descargo Laboral' &&
                fieldCheck.missingFields.some((f) => TERMINATION_KEYS.has(f.key));
            const terminationAmountsMessage =
                `Ahora, sigamos con el resto de los datos que necesitamos. Por favor indícame el monto por concepto de Preaviso (si aplica), el monto por Auxilio de Cesantía (si aplica), el monto por Navidad (regalía pascual) (si aplica) y el monto por Vacaciones (si aplica). ¡Adelante!\n\n` +
                `Si no tienes los datos favor dirigirte a la calculadora del ministerio del trabajo a través del siguiente enlace [calculo.mt.gob.do](https://calculo.mt.gob.do/). Mientras buscas los montos aquí te espero, tómate tu tiempo.`;
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName,
                message: `Cannot generate PDF — ${fieldCheck.missingFields.length} required field(s) still empty.`,
                missingByGroup: [...byGroup.values()],
                instruction: isTerminationAmountsRequest
                    ? `Reply IN SPANISH with ONLY this text (no other text, no lists):\n\n${terminationAmountsMessage}\n\nThen call submit_group_answers with userDocumentId + groupId for the missing termination amounts, then call generate_pdf again.`
                    : `Ask the user for these missing fields as a FLOWING PARAGRAPH (never as a list): ${groupSummaries.join(' | ')}. Then call submit_group_answers with userDocumentId + groupId + answers. After ALL missing fields are collected, call generate_pdf again.`,
            };
        }

        const breakdownSum = validateReciboDescargoLaboralBreakdownSum(templateName, variables as Record<string, string | number>);
        if (!breakdownSum.ok) {
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName,
                message: 'Breakdown line items do not sum to the declared total.',
                instruction: `Reply IN SPANISH explaining the amounts do not add up:\n\n${breakdownSum.messageEs}\n\nThen fix via submit_group_answers and call generate_pdf again.`,
            };
        }

        let varsForPdf =
            usePurchase && purchaseOpt
                ? await this.docService.syncNormalizedSessionVariablesByPurchaseId(purchaseOpt, userId)
                : this.docService.getNormalizedVariablesForStorage(templateName, variables);

        if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
            const pdfDateCheck = this.docService.verifyReciboDomesticaPdfDateFragments(templateName, varsForPdf);
            varsForPdf = pdfDateCheck.expanded;
            if (!pdfDateCheck.ok) {
                const byGroup = new Map<string, { groupId: string; fields: Array<{ key: string; label: string }> }>();
                for (const issue of pdfDateCheck.issues) {
                    if (!byGroup.has(issue.groupId)) {
                        byGroup.set(issue.groupId, { groupId: issue.groupId, fields: [] });
                    }
                    byGroup.get(issue.groupId)!.fields.push({ key: issue.key, label: issue.label });
                }
                const groupSummaries = [...byGroup.values()].map(
                    (g) => `groupId="${g.groupId}": ${g.fields.map((f) => f.label).join(', ')}`,
                );
                return {
                    success: false,
                    pdfDatesNotReady: true,
                    pdfPath: '',
                    htmlContent: '',
                    templateName,
                    missingByGroup: [...byGroup.values()],
                    message: 'Las fechas del documento no se pudieron convertir al formato del PDF.',
                    instruction: `Ask the user for these date fields in Spanish: ${groupSummaries.join(' | ')}.`,
                };
            }
        }

        const previewFingerprint = computePdfPreviewFingerprint(varsForPdf);
        /**
         * Términos de Uso: never serve a cached duplicate preview. Enrichment /
         * HBS helper fixes (e.g. stripping doubled "El Sitio Web ofrece") must
         * always re-render into a fresh PDF even when session vars are unchanged.
         */
        const isDuplicate =
            !isTerminosUsoPaginaWebTemplate(templateName) &&
            isPdfPreviewDuplicate(varsForPdf, previewFingerprint);
        if (isDuplicate) {
            const pdfPath = join(this.docService.getOutputDir(), templateName + '.pdf');
            let existingPreviewUrl =
                usePurchase && purchaseOpt
                    ? await this.docService.getEphemeralPreviewUrlForSession(templateName, userId, purchaseOpt)
                    : await this.docService.getEphemeralPreviewUrlForSession(templateName, userId);
            let staleBrokenPreview = false;
            if (existingPreviewUrl && isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
                try {
                    const res = await fetch(existingPreviewUrl);
                    if (res.ok) {
                        const priorHtml = await res.text();
                        staleBrokenPreview = htmlHasEmptyReciboDomesticaDatePlaceholders(priorHtml);
                    }
                } catch {
                    staleBrokenPreview = true;
                }
            }
            if (!staleBrokenPreview && existingPreviewUrl) {
                if (isDomesticContractTemplate(templateName)) {
                    let hydratedHtml =
                        (await this.docService.getEphemeralPreviewHtmlForSession(
                            templateName,
                            userId,
                            usePurchase ? purchaseOpt : undefined,
                        )) ?? '';
                    if (!hydratedHtml) {
                        try {
                            const res = await fetch(existingPreviewUrl);
                            if (res.ok) hydratedHtml = await res.text();
                        } catch {
                            /* fall through */
                        }
                    }
                    if (hydratedHtml.trim()) {
                        const htmlPayload = widgetHtmlPayload(hydratedHtml, existingPreviewUrl);
                        return {
                            success: true,
                            duplicatePreviewBlocked: true,
                            pdfPath,
                            templateName,
                            userDocumentId: purchaseOpt,
                            ...htmlPayload,
                            message: 'PDF preview generated.',
                            instruction:
                                logTag === 'generate_pdf'
                                    ? `Reply IN SPANISH with ONLY:\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\nDo NOT call generate_pdf again for the same data.`
                                    : '',
                        };
                    }
                }
                const htmlPayload = widgetHtmlPayload('', existingPreviewUrl);
                return {
                    success: false,
                    duplicatePreviewBlocked: true,
                    pdfPath,
                    templateName,
                    userDocumentId: purchaseOpt,
                    ...htmlPayload,
                    message: 'El borrador en PDF ya está visible arriba con los mismos datos.',
                    instruction: `Do NOT call generate_pdf again. Reply with ONLY:\n\n${PREVIEW_READY_CHAT_MESSAGE}`,
                };
            }
            if (usePurchase && purchaseOpt) {
                await this.docService.patchSessionVariablesByPurchaseId(purchaseOpt, userId, {
                    [PDF_PREVIEW_ACTIVE_KEY]: 'false',
                });
            }
        }

        const result = await this.docService.fillAndExportPdf(templateName, varsForPdf, true);
        if (!result.success) {
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName,
                message: result.error || 'Failed to generate PDF',
            };
        }

        const deferPreviewSessionFlags = shouldDeferDomesticPreviewSessionFlags(logTag, templateName);
        if (usePurchase && purchaseOpt && !deferPreviewSessionFlags) {
            await this.docService.syncNormalizedSessionVariablesByPurchaseId(purchaseOpt, userId);
            await this.docService.patchSessionVariablesByPurchaseId(purchaseOpt, userId, {
                [PDF_PREVIEW_FINGERPRINT_KEY]: previewFingerprint,
                [PDF_PREVIEW_ACTIVE_KEY]: 'true',
            });
        }

        const previewUpload = await this.docService.uploadEphemeralPreviewHtml(
            templateName,
            userId,
            result.htmlContent,
            usePurchase ? purchaseOpt : undefined,
        );
        const htmlPayload = widgetHtmlPayload(result.htmlContent, previewUpload?.previewHtmlUrl);
        return {
            success: true,
            pdfPath: result.pdfPath,
            templateName,
            userDocumentId: purchaseOpt,
            ...htmlPayload,
            message: 'PDF preview generated.',
            instruction:
                logTag === 'submit_group_answers'
                    ? ''
                    : usePurchase
                      ? `Reply IN SPANISH with ONLY:\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\nNEVER call generate_pdf again for the same data.`
                      : `Reply IN SPANISH with ONLY:\n\n${PREVIEW_READY_CHAT_MESSAGE}`,
        };
    }

    @Tool({
        name: 'generate_pdf',
        description: `Generates a PDF PREVIEW from all saved variables. Does NOT upload to S3 or produce a download link.

After a purchase link flow, pass userDocumentId (same 24-char id as submit_group_answers) together with templateName so variables come from that purchase. If omitted, the server uses a legacy template-only session and may mix up users with multiple purchases of the same template.

⚠️ PREREQUISITE — DO NOT CALL THIS TOOL UNLESS:
  (a) submit_group_answers has returned { allComplete: true }, AND
  (b) The user has confirmed they want to generate the PDF — EXCEPT Contrato de Trabajadora Doméstica when submit_group_answers returned { previewGenerated: true }: call generate_pdf immediately in the SAME assistant turn without waiting for user confirmation.
If you have NOT received allComplete: true from submit_group_answers, do NOT call this tool.
Calling it prematurely will fail with an error.

After this tool succeeds, you MUST reply in Spanish with ONLY the standard PDF-preview follow-up text (see tool return instruction — multiple paragraphs, no HTML, no document body).
NEVER paste, quote, or summarize the document HTML or body in the chat; the preview appears only in the UI widget.

If the user wants changes → use update_variable.
If the user confirms download → call confirm_document.
NEVER call confirm_document without the user explicitly confirming.

This tool runs TWO guards before generating:

GUARD 1 — Group completeness: if any group is still pending it returns { success: false, pendingGroup }. Collect answers via submit_group_answers, then call generate_pdf again.

GUARD 2 — Required fields: if any required variable is empty it returns { success: false, missingByGroup }. Ask the user ONLY for the listed missing fields, submit them via submit_group_answers with userDocumentId + the correct groupId + answers, then call generate_pdf again.

Call generate_pdf at most ONCE per preview round (same session data). If the tool returns duplicatePreviewBlocked, do NOT retry — tell the user the preview above is current.

Never show "PDF generated" or show the widget if success is false.`,
        inputSchema: GeneratePdfSchema,
    })
    @UseGuards(JwtGuard)
    @Widget('pdf-preview')
    async generatePdf(args: z.infer<typeof GeneratePdfSchema>, ctx: ExecutionContext) {
      try {
        const userId = getUserIdFromContext(ctx);
        toolLog('generate_pdf', 'CALLED', { templateName: args.templateName, userId });

        const tn = args.templateName?.trim() ?? '';
        if (tn && isValidObjectId(tn)) {
            toolLog('generate_pdf', 'REJECTED — templateName is purchase ObjectId', { templateName: tn });
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName: args.templateName,
                message: messageForTemplateNameThatIsPurchaseObjectId(tn),
            };
        }

        // ── Guard 0: valid template name (fuzzy ≥60%) ────────────────────────
        const validNames = this.docService.listTemplates();
        const matched = fuzzyMatchTemplate(args.templateName, validNames);
        if (!matched) {
            toolLog('generate_pdf', 'GUARD 0 FAILED — invalid template', { templateName: args.templateName, validNames });
            return {
                success: false, pdfPath: '', htmlContent: '', templateName: args.templateName,
                message: invalidTemplateNameForToolMessage(args.templateName),
            };
        }
        const templateName = matched;
        toolLog('generate_pdf', 'GUARD 0 PASSED', { templateName });

        let purchaseOpt = args.userDocumentId?.trim();
        let usePurchase = Boolean(purchaseOpt && isValidObjectId(purchaseOpt));
        if (!usePurchase) {
            const fillingSession = await this.docService.getFillingSession(templateName, userId);
            const inferredId = fillingSession?.userDocumentId?.trim();
            if (inferredId && isValidObjectId(inferredId)) {
                purchaseOpt = inferredId;
                usePurchase = true;
                toolLog('generate_pdf', 'INFERRED userDocumentId from filling session', { purchaseOpt });
            }
        }

        const preview = await this.runPdfPreviewForSession(templateName, userId, purchaseOpt, ctx, 'generate_pdf');
        if (preview.success === true && preview.instruction === '') {
            const purchaseForInstruction = purchaseOpt ?? '';
            preview.instruction = usePurchase
                ? `Reply IN SPANISH with ONLY the following text (no other text, no HTML, no document excerpts):\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\nThe preview is shown in the widget — never paste DOCTYPE, tags, or contract text. Do NOT repeat the longer "all complete" paragraph here — that was already sent when allComplete became true. NEVER call generate_pdf again for the same data (duplicate widget). If the user wants changes, use update_variable with the same userDocumentId="${purchaseForInstruction}" plus templateName. When the user confirms they want the final PDF (in chat or via the widget confirm button), call confirm_document immediately with templateName="${templateName}" and userDocumentId="${purchaseForInstruction}", then reply with ONLY downloadChatMessage from the tool (chat link only — no widget download UI), per system prompt STEP 5.`
                : `Reply IN SPANISH with ONLY the following text (no other text, no HTML, no document excerpts):\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\nThe preview is shown in the widget — never paste DOCTYPE, tags, or contract text. NEVER call generate_pdf again unless update_variable changed data. When the user confirms download after preview, call confirm_document with templateName="${templateName}" immediately and reply with ONLY downloadChatMessage (chat link only), per STEP 5.`;
        } else if (preview.duplicatePreviewBlocked === true) {
            preview.instruction =
                `Do NOT call generate_pdf again — that creates a duplicate preview widget. ` +
                `Reply IN SPANISH with ONLY:\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\n` +
                `If the user wants changes, use update_variable; if they want the final download, call confirm_document.`;
        } else if (preview.needsMoreAnswers === true) {
            preview.instruction =
                `Do NOT apologize as a technical error. Do NOT call confirm_document. ` +
                `Ask the user IN SPANISH for the pending information, then submit_group_answers and generate_pdf again.`;
        }
        toolLog('generate_pdf', 'RETURNED_RESULT', {
            success: preview.success,
            duplicatePreviewBlocked: preview.duplicatePreviewBlocked,
            needsMoreAnswers: preview.needsMoreAnswers,
            templateName,
            userDocumentId: purchaseOpt,
            hasHtml: typeof preview.htmlContent === 'string' && preview.htmlContent.length > 0,
            hasUrl: typeof preview.previewHtmlUrl === 'string' && preview.previewHtmlUrl.length > 0,
        });
        ctx.logger.info('generate_pdf completed', {
            success: preview.success as boolean,
            duplicatePreviewBlocked: preview.duplicatePreviewBlocked as boolean,
            needsMoreAnswers: preview.needsMoreAnswers as boolean,
            templateName,
            userDocumentId: purchaseOpt,
        });
        return preview as {
            success: boolean;
            pdfPath: string;
            htmlContent: string;
            templateName: string;
            message?: string;
            instruction?: string;
        };
      } catch (err) {
        const msg = safeErrorMessage(err);
        toolLog('generate_pdf', 'UNHANDLED ERROR', { error: msg });
        return { success: false, pdfPath: '', htmlContent: '', templateName: args.templateName, message: msg };
      }
    }

    @Tool({
        name: 'update_variable',
        description: `Two-step tool to change a specific variable after PDF has been generated.

Pass userDocumentId (same as submit_group_answers) whenever the user came from a purchase link so the correct session is updated.

WHEN TO CALL:
- User says "I want to change {{Ciudad de firma}}"
- User says "update Nombre legal"
- User says "El valor de Ciudad de firma está incorrecto"
- User says "Quiero cambiar {{Nombre legal}}"
- Any request to modify a specific field after PDF has been generated

TWO-STEP FLOW — CRITICAL RULES:
STEP 1 — Lookup (omit newValue):
  - Call with templateName + variableLabel only (no newValue).
  - The tool returns the matched variable label and its CURRENT value from the session.
  - You MUST then ask the user in Spanish using **tú**: «El valor actual de "[label]" es "[currentValue]". ¿En qué quieres cambiarlo?» (never usted).
  - Do NOT guess or assume the new value.

STEP 2 — Update + Regenerate (provide newValue):
  - Once the user provides the new value, call again with templateName + variableLabel + newValue.
  - Apply correct Spanish spelling/accents for free-text values when saving (RULE 5g); do not change numeric IDs or forced choice literals.
  - The tool updates the session and regenerates the PDF automatically.
  - Show the new PDF preview to the user.

█ CONTRATO DE TRABAJADORA DOMÉSTICA — OTROS BENEFICIOS (section 6) █
- Extra benefits render ONLY when hasAdditionalBenefits="Sí" AND otherBenefits is non-empty (semicolon-separated list).
- When the user wants to ADD or CHANGE additional benefits (TSS, día de descanso, almuerzo, etc.), update variableLabel matching **Descripción de los beneficios adicionales** / otherBenefits with the full "; "-joined list. The server opens the Sí gate automatically — still prefer stating the benefits clearly; NEVER claim the PDF was updated without completing this STEP 2 call.
- When the user wants to REMOVE all extra benefits, update hasAdditionalBenefits to **No** (or clear otherBenefits); the server clears the linked field.
- NEVER claim success if you only chatted and did not finish STEP 2. After STEP 2, the widget preview must change; if section 6 is unchanged, call again with the correct otherBenefits value.

█ PROPUESTA DE TRABAJO — BENEFICIOS (section 7) █
- §7 always shows TSS / Vacaciones / Código. Custom extras render ONLY when hasAdditionalBenefits="Sí" AND additionalBenefitsList is non-empty.
- To ADD or CHANGE customs: update **Beneficios adicionales ofrecidos** / additionalBenefitsList with the full "; "-joined list. The server sets hasAdditionalBenefits=Sí automatically.
- To REMOVE customs: set hasAdditionalBenefits to **No** (server clears additionalBenefitsList).

█ CONTRATO DE TELETRABAJO — when updating via this tool, keep the same quality rules as submit_group_answers: distinct cédulas; gendered nationality; street/city/country without duplication; workSchedule without lunch; sequential costs.

█ RECIBO DE DESCARGO LABORAL — when updating amounts via this tool: never silently rewrite the total to match the desglose; if they disagree, ask the user. Keep schema labels (Auxilio de Cesantía). Nationality must stay gender-agreed.

variableLabel: pass it exactly as the user typed (e.g. "Ciudad de firma"). It is fuzzy-matched against all variable labels in the schema — typos and partial matches are handled.

Do NOT call submit_group_answers or generate_pdf for this flow. This tool handles everything.`,
        inputSchema: UpdateVariableSchema,
    })
    @UseGuards(JwtGuard)
    @Widget('pdf-preview')
    async updateVariable(args: z.infer<typeof UpdateVariableSchema>, ctx: ExecutionContext) {
      try {
        const userId = getUserIdFromContext(ctx);
        toolLog('update_variable', 'CALLED', { templateName: args.templateName, variableLabel: args.variableLabel, newValue: args.newValue, userId });

        const tn0 = args.templateName?.trim() ?? '';
        if (tn0 && isValidObjectId(tn0)) {
            toolLog('update_variable', 'REJECTED — templateName is purchase ObjectId', { templateName: tn0 });
            return {
                success: false,
                step: 'error',
                message: messageForTemplateNameThatIsPurchaseObjectId(tn0),
            };
        }

        // ── Resolve template name ─────────────────────────────────────────────
        const validNames = this.docService.listTemplates();
        const matchedTemplate = fuzzyMatchTemplate(args.templateName, validNames);
        if (!matchedTemplate) {
            return { success: false, step: 'error', message: invalidTemplateNameForToolMessage(args.templateName) };
        }

        // ── Fuzzy-match variable label against schema ─────────────────────────
        const schema = this.docService.getCompactSchema(matchedTemplate);
        if ('error' in schema) {
            return { success: false, step: 'error', message: schema.error };
        }
        const match = fuzzyMatchVariableLabel(args.variableLabel, schema);
        if (!match) {
            const allLabels = schema.groups.flatMap(g => g.variables.map(v => `"${v.label}"`));
            toolLog('update_variable', 'VARIABLE NOT FOUND', { variableLabel: args.variableLabel });
            return {
                success: false, step: 'error',
                message: `Could not find a variable matching "${args.variableLabel}". Available variables: ${allLabels.join(', ')}`,
            };
        }
        toolLog('update_variable', 'VARIABLE MATCHED', { input: args.variableLabel, matched: match.label, key: match.key, groupId: match.groupId, score: match.score });

        const purchaseOpt = args.userDocumentId?.trim();
        const usePurchase = Boolean(purchaseOpt && isValidObjectId(purchaseOpt));

        // ── STEP 1: no newValue — return current value and ask user ───────────
        if (args.newValue === undefined || args.newValue === null || args.newValue === '') {
            const sessionVars = usePurchase
                ? await this.docService.getSessionVariablesByPurchaseId(purchaseOpt!, userId)
                : await this.docService.getSessionVariables(matchedTemplate, userId);
            const currentValue = sessionVars[match.key] ?? '(not set)';
            toolLog('update_variable', 'STEP1 LOOKUP', { key: match.key, currentValue });
            const lookupResult = {
                success: true,
                step: 'lookup',
                matchedLabel: match.label,
                key: match.key,
                groupId: match.groupId,
                currentValue,
                message: `Found variable "${match.label}". Current value: "${currentValue}". Please ask the user what they would like to change it to.`,
            };
            toolLog('update_variable', 'RETURNED_RESULT', {
                success: true,
                step: 'lookup',
                templateName: matchedTemplate,
                userDocumentId: purchaseOpt,
                variable: { key: match.key, label: match.label },
            });
            ctx.logger.info('update_variable step 1 lookup completed', {
                success: true,
                step: 'lookup',
                templateName: matchedTemplate,
                userDocumentId: purchaseOpt,
                key: match.key,
            });
            return lookupResult;
        }

        const sessionVarsForValidation = usePurchase
            ? await this.docService.getSessionVariablesByPurchaseId(purchaseOpt!, userId)
            : await this.docService.getSessionVariables(matchedTemplate, userId);

        const mergedForValidation = { ...sessionVarsForValidation, [match.key]: args.newValue };
        const validationErrors = getInvalidCedulaFieldsInVariables(mergedForValidation);
        if (validationErrors.length > 0) {
            return {
                success: false,
                step: 'error',
                message: validationErrors[0].message,
            };
        }
        if (isContratoTeletrabajoTemplate(matchedTemplate)) {
            const duplicateIds = detectTeletrabajoDuplicatePartyCedulas(mergedForValidation);
            if (duplicateIds) {
                return {
                    success: false,
                    step: 'error',
                    message: duplicateIds.message,
                };
            }
        }

        // ── STEP 2: newValue provided — update session and regenerate preview ──
        const benefitsPairPatch = isDomesticContractTemplate(matchedTemplate)
            ? domesticAdditionalBenefitsUpdatePatch(match.key, String(args.newValue))
            : isPropuestaDeTrabajoTemplate(matchedTemplate)
              ? propuestaAdditionalBenefitsUpdatePatch(match.key, String(args.newValue))
              : null;
        const updatePayload: Record<string, string | number> = benefitsPairPatch ?? {
            [match.key]: args.newValue,
        };
        if (usePurchase) {
            await this.docService.storeGroupVariablesByPurchaseId(purchaseOpt!, userId, match.groupId, updatePayload);
        } else {
            await this.docService.storeGroupVariables(match.groupId, updatePayload, matchedTemplate, userId);
        }
        toolLog('update_variable', 'VARIABLE UPDATED', { key: match.key, groupId: match.groupId, newValue: args.newValue, usePurchase });

        const variables = usePurchase
            ? await this.docService.getSessionVariablesByPurchaseId(purchaseOpt!, userId)
            : await this.docService.getSessionVariables(matchedTemplate, userId);
        toolLog('update_variable', 'REGENERATING PDF PREVIEW (no S3)', { variableCount: Object.keys(variables).length });
        const varsForPdf =
            usePurchase && purchaseOpt
                ? await this.docService.syncNormalizedSessionVariablesByPurchaseId(purchaseOpt, userId)
                : this.docService.getNormalizedVariablesForStorage(matchedTemplate, variables);
        if (usePurchase && purchaseOpt) {
            await this.docService.patchSessionVariablesByPurchaseId(purchaseOpt, userId, {
                [PDF_PREVIEW_ACTIVE_KEY]: 'false',
            });
        }
        const result = await this.docService.fillAndExportPdf(matchedTemplate, varsForPdf, true);
        if (!result.success) {
            toolLog('update_variable', 'PDF GENERATION FAILED', { error: result.error });
            return { success: false, step: 'error', pdfPath: '', htmlContent: '', message: result.error || 'Failed to regenerate PDF' };
        }

        const previewUpload = await this.docService.uploadEphemeralPreviewHtml(
            matchedTemplate,
            userId,
            result.htmlContent,
            usePurchase ? purchaseOpt : undefined,
        );
        if (usePurchase && purchaseOpt) {
            const previewFingerprint = computePdfPreviewFingerprint(varsForPdf);
            await this.docService.patchSessionVariablesByPurchaseId(purchaseOpt, userId, {
                [PDF_PREVIEW_FINGERPRINT_KEY]: previewFingerprint,
                [PDF_PREVIEW_ACTIVE_KEY]: 'true',
            });
        }
        toolLog('update_variable', 'PREVIEW UPDATED', { key: match.key, newValue: args.newValue, pdfPath: result.pdfPath, previewS3: Boolean(previewUpload?.previewHtmlUrl) });
        const htmlPayload = widgetHtmlPayload(result.htmlContent, previewUpload?.previewHtmlUrl);
        if (htmlPayload.htmlContent === '' && previewUpload?.previewHtmlUrl) {
            toolLog('update_variable', 'INLINE HTML OMITTED (size cap)', { maxBytes: MAX_WIDGET_INLINE_HTML_BYTES });
        }
        const updateResult = {
            success: true,
            step: 'updated',
            pdfPath: result.pdfPath,
            templateName: matchedTemplate,
            ...htmlPayload,
            updatedVariable: { label: match.label, key: match.key, groupId: match.groupId, newValue: args.newValue },
            message: `Updated "${match.label}" to "${args.newValue}". Preview regenerated.`,
            instruction: usePurchase
                ? `Reply IN SPANISH with ONLY the short preview follow-up (same as after generate_pdf; no HTML, no document text):\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\nIf the user wants more changes, use update_variable again with userDocumentId="${purchaseOpt}". On download confirmation, call confirm_document and reply with downloadChatMessage in Spanish only (system prompt STEP 5).`
                : `Reply IN SPANISH with ONLY the short preview follow-up (same as after generate_pdf):\n\n${PREVIEW_READY_CHAT_MESSAGE}\n\nIf the user wants more changes, use update_variable again. On download confirmation, call confirm_document and reply with downloadChatMessage only (chat link), per STEP 5.`,
        };
        toolLog('update_variable', 'RETURNED_RESULT', {
            success: true,
            step: 'updated',
            templateName: matchedTemplate,
            userDocumentId: purchaseOpt,
            updatedVariable: { key: match.key, label: match.label },
            hasHtml: typeof updateResult.htmlContent === 'string' && updateResult.htmlContent.length > 0,
            hasUrl: typeof updateResult.previewHtmlUrl === 'string' && updateResult.previewHtmlUrl.length > 0,
        });
        ctx.logger.info('update_variable step 2 update completed', {
            success: true,
            step: 'updated',
            templateName: matchedTemplate,
            userDocumentId: purchaseOpt,
            key: match.key,
        });
        return updateResult;
      } catch (err) {
        const msg = safeErrorMessage(err);
        toolLog('update_variable', 'UNHANDLED ERROR', { error: msg });
        return { success: false, step: 'error', pdfPath: '', htmlContent: '', templateName: args.templateName, message: msg };
      }
    }

    @Tool({
        name: 'confirm_document',
        description: `Uploads the finalized PDF to S3 and returns the download link.

Pass userDocumentId (same as submit_group_answers) when the flow started from a purchase link so the correct row gets the download link and the right session is cleared.

⚠️ ONLY call this tool when the user explicitly confirms they want the final download, per system prompt STEP 5.
After the PDF preview exists, call confirm_document as soon as the user confirms (chat or widget button). Do not show a separate download CTA message first.
NEVER call this without user confirmation.
After this tool succeeds, the document is FINAL — no more changes allowed.

PREREQUISITE: generate_pdf must have been called successfully first (the PDF must already exist locally).

After this tool returns successfully, reply IN SPANISH using ONLY the downloadChatMessage field from this tool (markdown link + closing text). Do NOT attach or update the pdf-preview widget for download — the link is chat-only.
Do NOT show the raw S3 signed URL except inside the markdown link label.`,
        inputSchema: ConfirmDocumentSchema,
    })
    @UseGuards(JwtGuard)
    async confirmDocument(args: z.infer<typeof ConfirmDocumentSchema>, ctx: ExecutionContext) {
      try {
        const userId = getUserIdFromContext(ctx);
        toolLog('confirm_document', 'CALLED', { templateName: args.templateName, userId });

        const tn = args.templateName?.trim() ?? '';
        if (tn && isValidObjectId(tn)) {
            toolLog('confirm_document', 'REJECTED — templateName is purchase ObjectId', { templateName: tn });
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName: args.templateName,
                message: messageForTemplateNameThatIsPurchaseObjectId(tn),
            };
        }

        const validNames = this.docService.listTemplates();
        const matched = fuzzyMatchTemplate(args.templateName, validNames);
        if (!matched) {
            toolLog('confirm_document', 'INVALID TEMPLATE', { templateName: args.templateName });
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName: args.templateName,
                message: invalidTemplateNameForToolMessage(args.templateName),
            };
        }
        const templateName = matched;

        const purchaseArg = args.userDocumentId?.trim();
        const purchaseResolved = purchaseArg && isValidObjectId(purchaseArg) ? purchaseArg : '';

        /**
         * Términos de Uso: rebuild the PDF before upload so download cannot ship
         * a stale preview that still contains "El Sitio Web ofrece el sitio web ofrece".
         */
        if (isTerminosUsoPaginaWebTemplate(templateName)) {
            const vars =
                purchaseResolved
                    ? await this.docService.getSessionVariablesByPurchaseId(purchaseResolved, userId)
                    : await this.docService.getSessionVariables(templateName, userId);
            if (Object.keys(vars).length > 0) {
                const rebuilt = await this.docService.fillAndExportPdf(templateName, vars, true);
                if (!rebuilt.success) {
                    toolLog('confirm_document', 'TERMINOS REBUILD FAILED', { error: rebuilt.error });
                    return {
                        success: false,
                        pdfPath: '',
                        htmlContent: '',
                        templateName,
                        message: rebuilt.error || 'Failed to regenerate PDF before download.',
                    };
                }
            }
        }

        const uploadResult = await this.docService.uploadExistingPdf(templateName);
        if (uploadResult.error) {
            toolLog('confirm_document', 'UPLOAD FAILED', { error: uploadResult.error });
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName,
                message: uploadResult.error,
                instruction:
                    `Do NOT apologize as a technical error and do NOT present this as final download failure. ` +
                    `The PDF preview has not been generated yet. Call generate_pdf only after submit_group_answers returned allComplete: true and the user asked to preview/download. ` +
                    `If the fill flow has not started, call submit_group_answers with only the userDocumentId from the purchase link and continue asking the pending questions.`,
            };
        }
        if (!uploadResult.s3Url) {
            toolLog('confirm_document', 'S3 NOT CONFIGURED');
            return { success: false, pdfPath: uploadResult.pdfPath, templateName, message: 'S3 is not configured. Cannot upload the document for download.' };
        }

        await this.docService.deleteEphemeralPreviewForSession(
            templateName,
            userId,
            purchaseResolved || undefined,
        );
        toolLog('confirm_document', 'EPHEMERAL PREVIEW REMOVED');

        toolLog('confirm_document', 'UPLOADED', { pdfPath: uploadResult.pdfPath, s3Url: uploadResult.s3Url });

        const fillingSession = purchaseResolved
            ? await this.docService.getPurchaseSession(purchaseResolved, userId)
            : await this.docService.getFillingSession(templateName, userId);
        const purchaseRowId = fillingSession?.userDocumentId?.trim() ?? purchaseResolved ?? '';
        const catalogDocId = fillingSession?.documentId ?? '';

        if (userId !== 'anonymous' && purchaseRowId && isValidObjectId(purchaseRowId)) {
            const { matched, modified } = await this.mongoService.updateUserDocumentLinkByPurchaseId(
                purchaseRowId,
                userId,
                uploadResult.s3Url,
            );
            toolLog('confirm_document', 'USER_DOCUMENTS_LINK_BY_PURCHASE_ID', { purchaseRowId, matched, modified });
            if (!matched) {
                ctx.logger.warn('confirm_document: no user_documents row matched by purchase _id', { purchaseRowId, userId });
            }
        } else if (userId !== 'anonymous' && catalogDocId && isValidObjectId(catalogDocId)) {
            const { matched, modified } = await this.mongoService.updateUserDocumentLink(
                catalogDocId,
                userId,
                uploadResult.s3Url,
            );
            toolLog('confirm_document', 'USER_DOCUMENTS_LINK_BY_CATALOG_ID', { catalogDocId, matched, modified });
            if (!matched) {
                ctx.logger.warn('confirm_document: no user_documents row matched for link update', { catalogDocId, userId });
            }
        } else {
            toolLog('confirm_document', 'SKIP_USER_DOCUMENTS_LINK', {
                reason: userId === 'anonymous' ? 'anonymous' : !catalogDocId ? 'no_session_document_id' : 'document_id_not_objectid',
                catalogDocId: catalogDocId || '(empty)',
                hadPurchaseRowId: Boolean(purchaseRowId),
            });
        }

        if (purchaseResolved) {
            await this.docService.clearSessionByPurchaseId(purchaseResolved, userId, templateName);
        } else {
            await this.docService.clearSession(templateName, userId);
        }
        toolLog('confirm_document', 'SESSION CLEARED', { templateName, userId, purchaseResolved: purchaseResolved || '(template index)' });

        const downloadChatMessage = buildConfirmDownloadChatMessage(templateName, uploadResult.s3Url);

        const confirmResult = {
            success: true,
            pdfPath: uploadResult.pdfPath,
            templateName,
            s3Url: uploadResult.s3Url,
            downloadChatMessage,
            message: `Document finalized and uploaded.`,
            instruction:
                `The document is FINAL. Do NOT call generate_pdf or update_variable again. ` +
                `Reply with ONLY the exact Spanish text in downloadChatMessage (verbatim — do NOT translate to English). ` +
                `Includes the markdown link line starting with "¡Tu documento está listo!" and the closing paragraph. ` +
                `Do NOT show a widget download button; the user downloads from the chat link only. ` +
                `If the user asks for more changes, inform them: "El documento ya ha sido finalizado y no es posible realizar más cambios."`,
        };
        toolLog('confirm_document', 'RETURNED_RESULT', {
            success: true,
            templateName,
            userDocumentId: purchaseResolved || undefined,
            s3Url: uploadResult.s3Url,
        });
        ctx.logger.info('confirm_document completed', {
            success: true,
            templateName,
            userDocumentId: purchaseResolved || undefined,
            hasS3Url: Boolean(uploadResult.s3Url),
        });
        return confirmResult;
      } catch (err) {
        const msg = safeErrorMessage(err);
        toolLog('confirm_document', 'UNHANDLED ERROR', { error: msg });
        return { success: false, pdfPath: '', htmlContent: '', templateName: args.templateName, message: msg };
      }
    }

    @Tool({
        name: 'analyze_template',
        description: 'Admin tool — Analyze an HBS template to extract variable names and conditional blocks.',
        inputSchema: AnalyzeTemplateSchema,
    })
    @UseGuards(JwtGuard)
    async analyzeTemplate(args: z.infer<typeof AnalyzeTemplateSchema>, ctx: ExecutionContext) {
        const tn = args.templateName?.trim() ?? '';
        if (tn && isValidObjectId(tn)) {
            ctx.logger.warn('analyze_template: mistaken purchase id as templateName', { templateName: tn });
            return { success: false, message: messageForTemplateNameThatIsPurchaseObjectId(tn) };
        }
        ctx.logger.info('Analyzing template', { templateName: args.templateName });
        const result = this.docService.analyzeTemplate(args.templateName);
        if ('error' in result) return { success: false, message: result.error };
        return { success: true, ...result };
    }

    @Tool({
        name: 'save_template_schema',
        description: 'Admin tool — Save the structured variable schema for a template.',
        inputSchema: SaveTemplateSchemaSchema,
    })
    @UseGuards(JwtGuard)
    async saveTemplateSchema(args: z.infer<typeof SaveTemplateSchemaSchema>, ctx: ExecutionContext) {
        const schema = args.schema as TemplateSchema;
        if (!schema.templateName || !schema.groups || !Array.isArray(schema.groups)) {
            return { success: false, message: 'Invalid schema: must have templateName and groups array' };
        }
        ctx.logger.info('Saving schema', { templateName: args.templateName });
        return this.docService.saveTemplateSchema(args.templateName, schema);
    }

    @Tool({
        name: 'generate_sample_pdf',
        description: `Generates a sample PDF using the first available template with placeholder values.
Use this tool to verify that the PDF generation pipeline (Puppeteer / Chromium) is working correctly.

Call this when the user says "generate sample pdf", "test pdf", "sample pdf", "test puppeteer", or similar.

Takes no input. Returns the generated PDF preview on success or an error message on failure.`,
        inputSchema: z.object({}),
    })
    @UseGuards(JwtGuard)
    @Widget('pdf-preview')
    async generateSamplePdf(_args: object, ctx: ExecutionContext) {
      try {
        toolLog('generate_sample_pdf', 'CALLED');
        ctx.logger.info('Generating sample PDF');

        const result = await this.docService.generateSamplePdf();
        if (!result.success) {
            toolLog('generate_sample_pdf', 'FAILED', { error: result.error });
            return {
                success: false,
                pdfPath: '',
                htmlContent: '',
                templateName: result.templateName,
                message: result.error || 'Failed to generate sample PDF',
            };
        }

        toolLog('generate_sample_pdf', 'SUCCESS', { pdfPath: result.pdfPath, templateName: result.templateName, s3Url: result.s3Url });
        return {
            success: true,
            pdfPath: result.pdfPath,
            htmlContent: result.htmlContent,
            templateName: result.templateName,
            s3Url: result.s3Url,
            message: result.s3Url
                ? `Sample PDF generated and uploaded to S3. Download: ${result.s3Url}`
                : `Sample PDF generated successfully using template "${result.templateName}" with placeholder values.`,
        };
      } catch (err) {
        const msg = safeErrorMessage(err);
        toolLog('generate_sample_pdf', 'UNHANDLED ERROR', { error: msg });
        return { success: false, pdfPath: '', htmlContent: '', templateName: '', message: msg };
      }
    }

}
