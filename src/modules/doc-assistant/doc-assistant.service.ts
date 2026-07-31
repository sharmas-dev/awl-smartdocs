import { Injectable } from '@nitrostack/core';
import Handlebars from 'handlebars';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { JSDOM } from 'jsdom';
import htmlToPdfmake from 'html-to-pdfmake';
import { getSessionStore, SessionManager, type SessionData } from './session-store.js';
import { mapAnswersToGroupVariables } from './answer-key-map.js';
import {
    formatSpanishLegalDateDual,
    normalizeNaturalDateInput,
    parseStoredCalendarDateToYMD,
} from './natural-date-normalize.js';
import { PDF_PREVIEW_ACTIVE_KEY } from './pdf-preview-session.js';
import {
    formatAddressLineTitleCase,
    isAddressLikeVariableKey,
    ensureDominicanAddressCompleteness,
    isDominicanAddressCompletionKey,
    stripTrailingDominicanCountryForDuplicatingTemplate,
} from './address-text-format.js';
import { normalizeIdentificationPresentation, isIdPresentationVariableKey, formatDominicanCedula11, formatDominicanRnc9, formatCedula10 } from './id-presentation-format.js';
import { normalizeGenderChoice, isGenderSalutationKey, inferGenderFromName, normalizeNationalityGender, normalizeNameConjunction, isPersonNameLikeKey, resolveGenderForMaritalKey, normalizeMaritalStatus } from './gender-choice-format.js';
import { normalizeWorkScheduleText, isWorkScheduleLikeKey } from './work-schedule-format.js';
import {
    formatDominicanPesoAmount,
    parsePesoAmountToNumber,
    isCurrencyDisplayAmountKey,
    isReciboDescargoLaboralPesoDisplayKey,
} from './currency-amount-format.js';
import { normalizeProbationDaysInput, isProbationDaysKey } from './probation-period-format.js';
import { normalizeDominicanPesoAmountInWords, isDominicanPesoAmountInWordsKey } from './amount-in-words-format.js';
import { fillMissingAmountPartners, numberToDominicanPesoWords, findAmountPairForKey } from './peso-amount-conversion.js';
import { fillMissingIntegerPartners, normalizeCombinedIntegerKeys, findIntegerPairForKey } from './integer-word-conversion.js';
import { migrateContratoTeletrabajoLegacyAddresses } from './contrato-teletrabajo-address-migrate.js';
import {
    applyContratoTeletrabajoNormalizations,
    shouldApplyContratoTeletrabajoNormalizations,
} from './contrato-teletrabajo-normalize.js';
import {
    applyCorretajeInmobiliarioNormalizations,
    isCorretajeInmobiliarioTemplate,
    sanitizeCorretajeRenderedHtml,
} from './corretaje-inmobiliario-normalize.js';
import {
    applySignosDistintivosIdTypeNormalizations,
    isPoderSignosDistintivosTemplate,
} from './signos-distintivos-id-type.js';
import {
    applyPropuestaDeTrabajoNormalizations,
    isPropuestaDeTrabajoTemplate,
} from './propuesta-de-trabajo-normalize.js';
import { applyContratoTeletrabajoEmployerRncIdentificationFlag } from './contrato-teletrabajo-employer-rnc.js';
import { collapseAbbreviationDoubleDots, collapseGenericDoubleDots } from './abbreviation-dot-cleanup.js';
import { isDomesticPrimaryResponsibilityKey, normalizeDomesticPrimaryResponsibility } from './domestic-responsibility-format.js';
import { blankNotApplicableValues, stripOrphanEnumerationsFromHtml } from './not-applicable-cleanup.js';
import { isMidSentencePhraseKey, normalizeMidSentencePhrase } from './mid-sentence-phrase-format.js';
import { fillTenantGreetingLastName, isTerminationNoticeTemplate } from './tenant-greeting-name-format.js';
import {
    fillDomesticReciboEmployerAutoFields,
    fillReciboDescargoDomesticaLocationAndNotary,
} from './recibo-descargo-domestica-enrichment.js';
import {
    verifyReciboDomesticaPdfReady,
    type ReciboDomesticaPdfDateIssue,
} from './recibo-descargo-domestica-pdf-ready.js';
import { backfillReciboDomesticaDatesFromSessionText } from './recibo-domestica-session-backfill.js';
import { htmlHasEmptyReciboDomesticaDatePlaceholders } from './recibo-domestica-session-backfill.js';
import {
    fillReciboDomesticaTerminationDateFromEmploymentEnd,
    reconcileReciboDomesticaLastSalaryPeriod,
} from './recibo-domestica-date-parse.js';
import { reciboDomesticaVerifyLog, summarizeReciboDomesticaPdfState } from './doc-assistant-log.js';
import {
    isCompraventaVehiculoTemplate,
    isContratoTeletrabajoTemplate,
    isReciboDescargoTrabajadoraDomesticaTemplate,
    isReciboDescargoLaboralTemplate,
    isDeclaracionJuradaDomicilioTemplate,
    isTerminosUsoPaginaWebTemplate,
} from './template-name.js';
import { isPhoneNumberVariableKey, normalizePhoneNumber } from './phone-number-format.js';
import {
    enforceTerminosUsoWebNotificationCoherence,
    enforceTerminosUsoWebServicesCoherence,
    formatTerminosUsoWebServiceDescriptionFragment,
    formatTerminosUsoWebServiceFunctionalitiesFragment,
    normalizeTerminosUsoWebSiNoFlags,
    scrubTerminosUsoWebDoubleOfreceHtml,
} from './terminos-uso-web-enrichment.js';
import {
    expandCompraventaVehiculoCanonicalDates,
    expandContratoDomesticaCanonicalDates,
    ensureReciboDescargoDomesticaPdfDates,
    expandReciboDescargoDomesticaCanonicalDates,
    expandReciboDescargoLaboralCanonicalDates,
} from './recibo-descargo-date-expand.js';
import {
    backfillContratoDomesticaDocumentSigningDateFromFragments,
    fillDomesticContractEmployerAutoFields,
    fillDomesticContractIndefiniteDuration,
    fillDomesticContractNotaryFromEmployerAddress,
    fillDomesticContractNotaryFromSigningProvince,
    isDomesticContractSigningDateSatisfied,
    isDomesticContractSigningFragmentKey,
    syncDomesticAdditionalBenefitsGate,
} from './domestic-contract-enrichment.js';
import { enrichGroupAnswers } from './group-answers-enrich.js';
import { applyCompraventaCompanyRncFlags } from './compraventa-company-rnc.js';
import {
    applyCompraventaPartyBranchNormalization,
    filterCompraventaPendingVariables,
} from './compraventa-party-branch.js';
import { normalizeCompraventaSigningDateFragments } from './compraventa-signing-date.js';
import { sliceCompraventaPendingVariables } from './compraventa-question-pacing.js';
import {
    applyContratoTeletrabajoEmployerBranchNormalization,
    filterTeletrabajoCostsPendingVariables,
    filterTeletrabajoPendingVariables,
    fillContratoTeletrabajoDerivedFields,
} from './contrato-teletrabajo-employer-branch.js';
import {
    expandTeletrabajoContractStartDate,
    expandTeletrabajoSigningCanonicalDates,
} from './contrato-teletrabajo-dates.js';
import { sliceTeletrabajoPendingVariables } from './contrato-teletrabajo-question-pacing.js';
import {
    isCedulaFieldValueValid,
    isIdNumberVariableKey,
    pairedIdTypeKey,
} from './cedula-validation.js';
import {
    RECIBO_DESCARGO_LABORAL,
    clearReciboLaboralAdditionalConceptFieldsWhenDisabled,
    hasReciboLaboralAdditionalConcept1Content,
    isReciboLaboralPlaceholderAdditionalLabel,
    mergeReciboLaboralPendingSiNoAnswers,
    resolveReciboLaboralAdditionalConceptToggles,
} from './recibo-descargo-pending-toggles.js';
import type { SessionProgress, SessionProgressError } from './session-progress.js';
import { fillReciboDescargoNotaryFromSigningProvince } from './recibo-descargo-notary-from-signing.js';
import {
    isDomesticContractTemplate,
    isDomesticIndefiniteDurationKey,
    normalizeDomesticIndefiniteDurationPhrase,
    normalizeDomesticSalaryCurrencyDisplay,
    normalizeDomesticSalaryInWordsDisplay,
} from './domestic-salary-format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const _pdfmakePkgDir = dirname(_require.resolve('pdfmake/package.json'));
const PdfPrinter = _require(join(_pdfmakePkgDir, 'js', 'Printer.js')).default;

const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const TEMPLATES_DIR = join(PROJECT_ROOT, 'src', 'templates');
const HBS_DIR = join(TEMPLATES_DIR, 'hbs');
const SCHEMAS_DIR = join(TEMPLATES_DIR, 'schemas');
const OUTPUT_DIR = join(TEMPLATES_DIR, 'output');

Handlebars.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return String(a).toLowerCase() === String(b).toLowerCase() ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('neq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return String(a).toLowerCase() !== String(b).toLowerCase() ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('ifAll', function (this: unknown, ...args: unknown[]) {
    const options = args.pop() as Handlebars.HelperOptions;
    return args.every(Boolean) ? options.fn(this) : options.inverse(this);
});

/** Split a string by delimiter and iterate non-empty trimmed segments (e.g. functions separated by ";"). */
Handlebars.registerHelper('eachSplit', function (this: unknown, delimiter: unknown, str: unknown, options: Handlebars.HelperOptions) {
    const sep = typeof delimiter === 'string' && delimiter.length > 0 ? delimiter : ';';
    const raw = str === null || str === undefined ? '' : String(str);
    const parts = raw.split(sep).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return options.inverse(this);
    let out = '';
    for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (options.data) {
            const frame = Handlebars.createFrame(options.data);
            frame.index = index;
            frame.letter = String.fromCharCode(97 + index);
            frame.first = index === 0;
            frame.last = index === parts.length - 1;
            frame.length = parts.length;
            out += options.fn(part, { data: frame });
        } else {
            out += options.fn(part);
        }
    }
    return out;
});

/**
 * Render-time safety net for Dominican identification numbers.
 *
 * When `idType` is "Cédula" (default if omitted), strip non-digits and, if
 * the result is exactly 10 digits, format as **XXX-XXXXXX-X** (3-6-1); if
 * exactly 11 digits, format as **XXX-XXXXXXX-X** (3-7-1).
 * When `idType` is "Pasaporte" (or any non-Cédula label), pass the value
 * through unchanged — pasaportes are alphanumeric and must not be re-shaped.
 *
 * This is idempotent on already-formatted cédulas and complements the
 * server-side `normalizeIdentificationPresentation` so the rendered PDF
 * is always XXX-XXXXXXX-X even if some path bypassed the storage normalizer.
 */
Handlebars.registerHelper('formatIdNumber', (idNumber: unknown, idType: unknown) => {
    const raw = idNumber === null || idNumber === undefined ? '' : String(idNumber).trim();
    if (!raw) return '';
    const typeStr = typeof idType === 'string' ? idType : '';
    if (/pasaporte/i.test(typeStr)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 9) return formatDominicanRnc9(digits);
    if (digits.length === 10) return formatCedula10(digits);
    if (digits.length === 11) return formatDominicanCedula11(digits);
    return raw;
});

Handlebars.registerHelper('formatIdTypeLabel', (idType: unknown) => {
    const typeStr = typeof idType === 'string' ? idType : '';
    if (/pasaporte/i.test(typeStr)) return 'Pasaporte no.';
    if (/rnc|registro\s+nacional\s+de\s+contribuyentes/i.test(typeStr)) return 'RNC no.';
    return 'Cédula de Identidad y Electoral no.';
});

/**
 * Términos de Uso Página Web — render-time strip of a duplicated
 * "El sitio web ofrece…" prefix / semicolon checklist in functionalities.
 * Mirrors storage-time coherence so the PDF stays clean even if a session
 * bypassed normalizeFieldValuesForStorage.
 */
Handlebars.registerHelper('terminosServiceDescription', (value: unknown) =>
    formatTerminosUsoWebServiceDescriptionFragment(value),
);
Handlebars.registerHelper('terminosServiceFunctionalities', (value: unknown) =>
    formatTerminosUsoWebServiceFunctionalitiesFragment(value),
);

/**
 * Contrato de Compraventa Vehículo: schema keeps choice literals *casado(a)* / *soltero(a)* for
 * conditions; running text must agree with *sellerTypeLabel* / *buyerTypeLabel* (*el señor* → casado,
 * *la señora* → casada).
 */
Handlebars.registerHelper('compraventaDomicilePhrase', (idType: unknown, address: unknown) => {
    const type = String(idType ?? '').toLowerCase();
    const addr = String(address ?? '').trim();
    const isPassport = type.includes('pasaporte');
    const isDR =
        /república dominicana|republica dominicana|dominican republic|,\s*rd\b|\bdn\b|santo domingo|distrito nacional/i.test(
            addr,
        );
    const phrase = isPassport && isDR ? 'con domicilio en' : 'con domicilio y residencia en';
    return `${phrase} ${addr}`;
});

Handlebars.registerHelper('maritalWordForPartyType', (maritalStatus: unknown, partyTypeLabel: unknown) => {
    const m = String(maritalStatus ?? '').trim().toLowerCase();
    const label = String(partyTypeLabel ?? '').trim().toLowerCase();
    const masculine = label === 'el señor';
    const feminine = label === 'la señora';
    if (m === 'casado(a)') {
        if (masculine) return 'casado';
        if (feminine) return 'casada';
        return 'casado(a)';
    }
    if (m === 'soltero(a)') {
        if (masculine) return 'soltero';
        if (feminine) return 'soltera';
        return 'soltero(a)';
    }
    return String(maritalStatus ?? '').trim();
});

Handlebars.registerHelper('idNumberLabel', (idType: unknown, idNumbers: unknown) => {
    const typeStr = typeof idType === 'string' ? idType.toLowerCase() : '';
    const numbersStr = typeof idNumbers === 'string' ? idNumbers.toLowerCase() : '';
    const isPlural = typeStr.includes(' y del ') || numbersStr.includes(' y ') || numbersStr.includes(',');
    return isPlural ? 'números' : 'número';
});

const FONTS_DIR = join(PROJECT_ROOT, 'src', 'fonts');

const pdfFonts = {
    Poppins: {
        normal: join(FONTS_DIR, 'Poppins-Regular.ttf'),
        bold: join(FONTS_DIR, 'Poppins-SemiBold.ttf'),
        italics: join(FONTS_DIR, 'Poppins-Italic.ttf'),
        bolditalics: join(FONTS_DIR, 'Poppins-BoldItalic.ttf'),
    },
};
const pdfUrlResolver = { resolve: () => {}, resolved: () => Promise.resolve() };
const pdfPrinter = new PdfPrinter(pdfFonts, null, pdfUrlResolver);

function getS3Client(): S3Client | null {
    const region = process.env.AWS_S3_REGION_ECOM;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID_ECOM;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY_ECOM;
    if (!region || !accessKeyId || !secretAccessKey) return null;
    return new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
    });
}

/** Strip combining marks (NFD) so template titles map to stable ASCII folder names. */
function stripDiacritics(s: string): string {
    return s.normalize('NFC').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * S3 object key segment: ASCII-only + short hash of the original name so different
 * Unicode spellings / templates never collide. Avoids NFD vs NFC path encoding issues
 * that break presigned GET URLs in some clients.
 */
function slugifyForS3KeyFolder(templateName: string): string {
    const ascii = stripDiacritics(templateName)
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    const hash = createHash('sha256').update(templateName, 'utf8').digest('hex').slice(0, 8);
    return `${ascii || 'doc'}-${hash}`;
}

/**
 * RFC 6266: ASCII `filename` fallback plus UTF-8 `filename*` so download names stay
 * correct while the signed query string stays standards-compliant (raw UTF-8 in
 * filename="..." is invalid and can confuse proxies / S3).
 */
function attachmentContentDisposition(templateName: string): string {
    const base = templateName.normalize('NFC');
    const display = `${base}.pdf`;
    const safeAscii =
        stripDiacritics(base)
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'document';
    const filenameStar = encodeURIComponent(display);
    return `attachment; filename="${safeAscii}.pdf"; filename*=UTF-8''${filenameStar}`;
}

export interface MissingField {
    groupId: string;
    groupLabel: string;
    key: string;
    label: string;
}

export type VerifyRequiredFieldsResult =
    | { ok: true }
    | { ok: false; missingFields: MissingField[] };

export interface FillAndExportResult {
    pdfPath: string;
    htmlFilePath: string;
    htmlContent: string;
    success: boolean;
    error?: string;
    s3Url?: string;
}

export interface VariableInfo {
    name: string;
    usedInConditional: boolean;
    conditionalParent?: string;
}

export interface TemplateAnalysis {
    templateName: string;
    variables: VariableInfo[];
    conditionalBlocks: string[];
    totalVariables: number;
}

export interface VariableSchema {
    key: string;
    label: string;
    type: 'text' | 'number' | 'dropdown' | 'email' | 'date';
    required: boolean;
    options?: string[];
    condition?: { field: string; equals: string | boolean };
    example?: string;
    /** Handlebars keys filled from this schema key (server-side; not asked in chat). */
    pdfKeys?: string[];
    /** PDF keys auto-derived from this input (e.g. employer legal references from gender). */
    derivesPdfKeys?: string[];
}

export interface VariableGroup {
    id: string;
    label: string;
    /** When set, this entire group is collected only if variables[field] equals `equals` (same semantics as variable-level condition). */
    condition?: { field: string; equals: string | boolean };
    variables: VariableSchema[];
}

export interface TemplateSchema {
    templateName: string;
    displayName: string;
    description: string;
    groups: VariableGroup[];
}

@Injectable()
export class DocAssistantService {
    readonly session = new SessionManager(getSessionStore());

    private async uploadToS3(filePath: string, templateName: string): Promise<string | undefined> {
        const s3 = getS3Client();
        const bucket = process.env.AWS_BUCKET_NAME_ECOM;
        if (!s3 || !bucket) return undefined;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const keyFolder = slugifyForS3KeyFolder(templateName);
        const key = `documents/${keyFolder}/${timestamp}.pdf`;
        const body = readFileSync(filePath);

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/pdf',
        }));

        // Presigned GET requires the same IAM principal to have s3:GetObject on this bucket/prefix
        // (PutObject alone is not enough — otherwise the URL returns 403 Access Denied).
        const signedUrl = await getSignedUrl(s3, new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: attachmentContentDisposition(templateName),
        }), { expiresIn: 604800 });

        return signedUrl;
    }

    private async deleteS3Object(key: string): Promise<void> {
        const s3 = getS3Client();
        const bucket = process.env.AWS_BUCKET_NAME_ECOM;
        if (!s3 || !bucket) return;
        try {
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } catch {
            /* best-effort cleanup */
        }
    }

    /**
     * Preview flow (product): **HTML only** from S3 — users see a rendered draft in the widget.
     * `update_variable` / `generate_pdf` overwrite the same `previews/.../preview.html` key.
     * The **PDF** is generated on the server for later steps but is **not** uploaded to S3 for preview.
     * **`confirm_document`** uploads the final PDF to `documents/…` and deletes ephemeral preview HTML.
     *
     * Upload preview HTML to S3 under `previews/…` and return a signed GET URL.
     * Embedded widgets cannot fetch same-origin `/api/preview` (opaque origin); HTTPS URLs work.
     *
     * Uses one stable object key per fill session and overwrites with PutObject. Do not delete-then-new-key:
     * the widget may still fetch an older presigned URL from a prior tool response; deleting that object
     * caused 404. Overwriting the same key keeps old signed URLs valid until expiry (same authorized key).
     * Final PDFs use `documents/…` via uploadToS3.
     */
    async uploadEphemeralPreviewHtml(
        templateName: string,
        userId: string,
        fullHtml: string,
        userDocumentPurchaseId?: string,
    ): Promise<{ previewHtmlUrl: string } | undefined> {
        const s3 = getS3Client();
        const bucket = process.env.AWS_BUCKET_NAME_ECOM;
        if (!s3 || !bucket) return undefined;

        const session = userDocumentPurchaseId
            ? await this.session.getSessionByPurchaseId(userDocumentPurchaseId.trim(), userId)
            : await this.session.getSession(templateName, userId);
        if (!session) return undefined;

        const folder = createHash('sha256')
            .update(
                `${templateName}\0${userId}\0${session.documentId || 'nodoc'}\0${session.userDocumentId || ''}\0${userDocumentPurchaseId?.trim() || ''}`,
            )
            .digest('hex')
            .slice(0, 32);
        const key = `previews/${folder}/preview.html`;

        const prevKey = session.previewHtmlS3Key;
        if (prevKey && prevKey !== key) {
            await this.deleteS3Object(prevKey);
        }

        await s3.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: Buffer.from(fullHtml, 'utf8'),
                ContentType: 'text/html; charset=utf-8',
                CacheControl: 'private, max-age=60',
            }),
        );

        if (userDocumentPurchaseId?.trim()) {
            await this.session.updatePreviewHtmlKeyByPurchaseId(userDocumentPurchaseId.trim(), userId, key);
        } else {
            await this.session.updatePreviewHtmlKey(templateName, userId, key);
        }

        const previewHtmlUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            }),
            { expiresIn: 86400 },
        );

        return { previewHtmlUrl };
    }

    /** Signed GET URL for the session's last ephemeral preview HTML (if uploaded to S3). */
    async getEphemeralPreviewUrlForSession(
        templateName: string,
        userId: string,
        userDocumentPurchaseId?: string,
    ): Promise<string | undefined> {
        const s3 = getS3Client();
        const bucket = process.env.AWS_BUCKET_NAME_ECOM;
        if (!s3 || !bucket) return undefined;

        const session = userDocumentPurchaseId?.trim()
            ? await this.session.getSessionByPurchaseId(userDocumentPurchaseId.trim(), userId)
            : await this.session.getSession(templateName, userId);
        const key = session?.previewHtmlS3Key;
        if (!key) return undefined;

        return getSignedUrl(
            s3,
            new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            }),
            { expiresIn: 86400 },
        );
    }

    /** Read ephemeral preview HTML from S3 (server-side; widgets cannot reliably fetch presigned URLs). */
    async getEphemeralPreviewHtmlForSession(
        templateName: string,
        userId: string,
        userDocumentPurchaseId?: string,
    ): Promise<string | undefined> {
        const s3 = getS3Client();
        const bucket = process.env.AWS_BUCKET_NAME_ECOM;
        if (!s3 || !bucket) return undefined;

        const session = userDocumentPurchaseId?.trim()
            ? await this.session.getSessionByPurchaseId(userDocumentPurchaseId.trim(), userId)
            : await this.session.getSession(templateName, userId);
        const key = session?.previewHtmlS3Key;
        if (!key) return undefined;

        try {
            const res = await s3.send(
                new GetObjectCommand({
                    Bucket: bucket,
                    Key: key,
                }),
            );
            const body = await res.Body?.transformToString('utf-8');
            return body && body.trim() ? body : undefined;
        } catch {
            return undefined;
        }
    }

    /** Remove ephemeral preview object when the user confirms the final PDF (or abandon cleanup). */
    async deleteEphemeralPreviewForSession(templateName: string, userId: string, userDocumentPurchaseId?: string): Promise<void> {
        const session = userDocumentPurchaseId?.trim()
            ? await this.session.getSessionByPurchaseId(userDocumentPurchaseId.trim(), userId)
            : await this.session.getSession(templateName, userId);
        const key = session?.previewHtmlS3Key;
        if (!key) return;
        await this.deleteS3Object(key);
        if (userDocumentPurchaseId?.trim()) {
            await this.session.updatePreviewHtmlKeyByPurchaseId(userDocumentPurchaseId.trim(), userId, undefined);
        } else {
            await this.session.updatePreviewHtmlKey(templateName, userId, undefined);
        }
    }

    /**
     * Before persisting: normalize type "date" values; ID/cédula punctuation; title-case address-like text fields.
     */
    private normalizeFieldValuesForStorage(
        templateName: string,
        vars: Record<string, string | number> | null | undefined,
    ): Record<string, string | number> | null | undefined {
        if (!vars || typeof vars !== 'object') return vars;
        const schema = this.getTemplateSchema(templateName);
        if ('error' in schema) return vars;

        const dateKeys = new Set<string>();
        const choiceKeys = new Set<string>();
        const choiceOptions = new Map<string, string[]>();
        for (const g of schema.groups) {
            for (const v of g.variables) {
                if (v.type === 'date') dateKeys.add(v.key);
                if ((v.type as string) === 'dropdown' || (v.type as string) === 'choice' || v.options) {
                    choiceKeys.add(v.key);
                    if (v.options) {
                        choiceOptions.set(v.key, v.options);
                    }
                }
            }
        }
        if (isContratoTeletrabajoTemplate(templateName)) {
            dateKeys.add('documentSigningDate');
        }

        let changed = false;
        const out: Record<string, string | number> = { ...vars };

        /**
         * Strip whole-value "N/A" / "NA" / "no aplica"-style answers BEFORE any
         * other normalizer runs, so downstream code sees an empty value (which
         * the templates render as `""`) instead of the literal token. This is
         * the global guarantee that "N/A" never reaches the deliverable.
         */
        if (blankNotApplicableValues(out, choiceKeys)) {
            changed = true;
        }

        if (templateName === 'Contrato de Teletrabajo' && migrateContratoTeletrabajoLegacyAddresses(out)) {
            changed = true;
        }

        for (const key of Object.keys(out)) {
            const val = out[key];

            if (isCurrencyDisplayAmountKey(key)) {
                const str = typeof val === 'number' && Number.isFinite(val) ? String(val) : typeof val === 'string' ? val : '';
                if (str) {
                    const normalized = formatDominicanPesoAmount(str, key);
                    if (normalized !== str) {
                        out[key] = normalized;
                        changed = true;
                    }
                }
                continue;
            }

            if (isProbationDaysKey(key)) {
                const str = typeof val === 'number' && Number.isFinite(val) ? String(val) : typeof val === 'string' ? val : '';
                if (str) {
                    const normalized = normalizeProbationDaysInput(str);
                    if (normalized !== str) {
                        out[key] = normalized;
                        changed = true;
                    }
                }
                continue;
            }

            if (isDominicanPesoAmountInWordsKey(key)) {
                const str = typeof val === 'number' && Number.isFinite(val) ? String(val) : typeof val === 'string' ? val : '';
                if (str) {
                    const normalized = normalizeDominicanPesoAmountInWords(str);
                    if (normalized !== str) {
                        out[key] = normalized;
                        changed = true;
                    }
                }
                continue;
            }

            if (key === 'nonCompetePeriod' && typeof val === 'string') {
                const str = val.trim();
                const cleaned = str.replace(/,?\s*(?:despu[eé]s\s+de\s+finalizado\s+el\s+contrato|despu[eé]s\s+de\s+la\s+terminaci[oó]n\s+de\s+la\s+relaci[oó]n\s+laboral|posteriores?\s+a\s+la\s+terminaci[oó]n\s+de\s+la\s+relaci[oó]n\s+laboral|despu[eé]s\s+de\s+finalizada\s+la\s+relaci[oó]n\s+laboral)\.?$/i, '');
                if (cleaned !== str) {
                    out[key] = cleaned;
                    changed = true;
                }
                continue;
            }

            if (key === 'workSchedule' && typeof val === 'string') {
                const str = val.trim();
                const cleaned = str.replace(/^(?:horario\s*:\s*|el\s+horario\s+es\s+)/i, '');
                if (cleaned !== str) {
                    out[key] = cleaned;
                    changed = true;
                }
                continue;
            }

            if (choiceKeys.has(key) && typeof val === 'string') {
                const options = choiceOptions.get(key);
                if (options) {
                    const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
                    const matchedOption = options.find(
                        (opt) => fold(opt) === fold(val)
                    );
                    if (matchedOption && matchedOption !== val) {
                        out[key] = matchedOption;
                        changed = true;
                    }
                }
            }

            if (typeof val !== 'string') continue;

            if (isPhoneNumberVariableKey(key)) {
                const normalized = normalizePhoneNumber(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (key.toLowerCase().includes('nationality')) {
                const normalized = val.toLowerCase();
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (dateKeys.has(key)) {
                const normalized = normalizeNaturalDateInput(val);
                /**
                 * Recibos de descargo: canonical date keys feed expandRecibo*CanonicalDates
                 * into separate HBS fragment variables — keep "d de mes de aaaa" shape, not
                 * formatSpanishLegalDateDual, so fragment expansion is reliable in PDF/preview.
                 */
                /**
                 * Términos de Uso Página Web — updateDate must read as a plain
                 * Spanish textual date ("31 de marzo de 2026"), NOT the dual legal
                 * form (no "(31)" / "(2026)") and never a numeric/abbreviated form.
                 */
                const plainSpanishDateOnly =
                    isReciboDescargoTrabajadoraDomesticaTemplate(templateName) ||
                    isReciboDescargoLaboralTemplate(templateName) ||
                    isTerminosUsoPaginaWebTemplate(templateName);
                const stored = plainSpanishDateOnly
                    ? normalized
                    : (formatSpanishLegalDateDual(normalized) ?? normalized);
                if (stored !== val) {
                    out[key] = stored;
                    changed = true;
                }
                continue;
            }

            if (isGenderSalutationKey(key)) {
                const normalized = normalizeGenderChoice(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (isWorkScheduleLikeKey(key)) {
                const normalized = normalizeWorkScheduleText(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            /**
             * Mid-sentence phrase fields (e.g. terminationCauseDetail,
             * inspectionResultText, depositActionText) are interpolated by the
             * template inside an existing sentence and the template adds its
             * own punctuation. Lowercase the first letter and strip any
             * trailing period/comma/semicolon so the rendered prose is
             * grammatically correct (no `Mal comportamiento..`, just
             * `mal comportamiento.`).
             */
            if (isMidSentencePhraseKey(key)) {
                const normalized = normalizeMidSentencePhrase(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (isDomesticPrimaryResponsibilityKey(key)) {
                const normalized = normalizeDomesticPrimaryResponsibility(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (isDomesticContractTemplate(templateName) && isDomesticIndefiniteDurationKey(key)) {
                const normalized = normalizeDomesticIndefiniteDurationPhrase(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (isIdPresentationVariableKey(key)) {
                let normalized = normalizeIdentificationPresentation(val);
                if (isDomesticContractTemplate(templateName) && (key === 'employerIdNumber' || key === 'employeeIdNumber')) {
                    const idTypeKey = key === 'employerIdNumber' ? 'employerIdType' : 'employeeIdType';
                    const idType = String(out[idTypeKey] ?? vars[idTypeKey] ?? '').trim();
                    if (!/pasaporte/i.test(idType)) {
                        const digits = String(normalized).replace(/\D/g, '');
                        if (digits.length === 11) {
                            normalized = formatDominicanCedula11(digits);
                        } else if (digits.length === 10) {
                            normalized = formatCedula10(digits);
                        } else if (digits.length === 9) {
                            normalized = formatDominicanRnc9(digits);
                        }
                    }
                }
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
                continue;
            }

            if (isPersonNameLikeKey(key)) {
                const normalized = normalizeNameConjunction(val);
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
            }

            if (key.endsWith('MaritalStatus')) {
                const valStr = String(val);
                const gender = resolveGenderForMaritalKey(key, out);
                const normalized = normalizeMaritalStatus(valStr, gender);
                if (normalized !== valStr) {
                    out[key] = normalized;
                    changed = true;
                }
            }

            if (isAddressLikeVariableKey(key)) {
                let normalized = formatAddressLineTitleCase(val);
                if (isDominicanAddressCompletionKey(key)) {
                    normalized = ensureDominicanAddressCompleteness(normalized);
                    normalized = stripTrailingDominicanCountryForDuplicatingTemplate(key, normalized);
                }
                if (normalized !== val) {
                    out[key] = normalized;
                    changed = true;
                }
            }
        }

        /**
         * Recibos de descargo: one type "date" per logical fecha → server fills the
         * day/month/year fragment keys the HBS still uses (avoids five separate user questions).
         */
        if (isReciboDescargoLaboralTemplate(templateName) && expandReciboDescargoLaboralCanonicalDates(out)) {
            changed = true;
        }
        if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
            const beforeBackfill = summarizeReciboDomesticaPdfState(out);
            const backfilled = backfillReciboDomesticaDatesFromSessionText(out);
            if (fillReciboDomesticaTerminationDateFromEmploymentEnd(out)) {
                changed = true;
            }
            if (reconcileReciboDomesticaLastSalaryPeriod(out)) {
                changed = true;
            }
            const expanded = ensureReciboDescargoDomesticaPdfDates(out);
            if (backfilled) changed = true;
            if (expanded) changed = true;
            if (fillDomesticReciboEmployerAutoFields(out)) {
                changed = true;
            }
            if (fillReciboDescargoDomesticaLocationAndNotary(out)) {
                changed = true;
            }
            if (backfilled || expanded) {
                reciboDomesticaVerifyLog('NORMALIZE_DATE_PIPELINE', {
                    templateName,
                    backfilled,
                    expanded,
                    beforeEmptyFragments: beforeBackfill.emptyPdfFragments,
                }, out);
            }
        }
        if (isCompraventaVehiculoTemplate(templateName)) {
            if (applyCompraventaPartyBranchNormalization(out)) {
                changed = true;
            }
            if (applyCompraventaCompanyRncFlags(out)) {
                changed = true;
            }
            if (expandCompraventaVehiculoCanonicalDates(out)) {
                changed = true;
            }
        }

        if (isTerminosUsoPaginaWebTemplate(templateName)) {
            if (normalizeTerminosUsoWebSiNoFlags(out)) {
                changed = true;
            }
            if (enforceTerminosUsoWebNotificationCoherence(out)) {
                changed = true;
            }
            if (enforceTerminosUsoWebServicesCoherence(out)) {
                changed = true;
            }
        }

        if (isReciboDescargoLaboralTemplate(templateName)) {
            const declarantName = String(out.declarantFullName ?? '').trim();
            if (declarantName && typeof out.declarantNationality === 'string' && out.declarantNationality.trim()) {
                const gender = inferGenderFromName(declarantName);
                const norm = normalizeNationalityGender(out.declarantNationality, gender);
                if (norm !== out.declarantNationality) {
                    out.declarantNationality = norm;
                    changed = true;
                }
            }
        }

        if (isDeclaracionJuradaDomicilioTemplate(templateName)) {
            const declarantName = String(out.declarantFullName ?? '').trim();
            const witness1Name = String(out.witness1FullName ?? '').trim();
            const witness2Name = String(out.witness2FullName ?? '').trim();

            const declarantGender = declarantName ? inferGenderFromName(declarantName) : 'Hombre';
            const witness1Gender = witness1Name ? inferGenderFromName(witness1Name) : 'Hombre';
            const witness2Gender = witness2Name ? inferGenderFromName(witness2Name) : 'Hombre';

            if (out.declarantGender !== declarantGender) {
                out.declarantGender = declarantGender;
                changed = true;
            }
            if (out.witness1Gender !== witness1Gender) {
                out.witness1Gender = witness1Gender;
                changed = true;
            }
            if (out.witness2Gender !== witness2Gender) {
                out.witness2Gender = witness2Gender;
                changed = true;
            }

            if (out.declarantNationality && typeof out.declarantNationality === 'string') {
                const norm = normalizeNationalityGender(out.declarantNationality, declarantGender);
                if (norm !== out.declarantNationality) {
                    out.declarantNationality = norm;
                    changed = true;
                }
            }
            if (out.witness1Nationality && typeof out.witness1Nationality === 'string') {
                const norm = normalizeNationalityGender(out.witness1Nationality, witness1Gender);
                if (norm !== out.witness1Nationality) {
                    out.witness1Nationality = norm;
                    changed = true;
                }
            }
            if (out.witness2Nationality && typeof out.witness2Nationality === 'string') {
                const norm = normalizeNationalityGender(out.witness2Nationality, witness2Gender);
                if (norm !== out.witness2Nationality) {
                    out.witness2Nationality = norm;
                    changed = true;
                }
            }

            // Derive witnesses salutation headers
            let witnessesHeader = 'de los señores';
            let witness2Header = '';

            if (witness1Gender === 'Mujer' && witness2Gender === 'Mujer') {
                witnessesHeader = 'de las señoras';
                witness2Header = '';
            } else if (witness1Gender === 'Hombre' && witness2Gender === 'Hombre') {
                witnessesHeader = 'de los señores';
                witness2Header = '';
            } else if (witness1Gender === 'Mujer' && witness2Gender === 'Hombre') {
                witnessesHeader = 'de la señora';
                witness2Header = 'el señor ';
            } else if (witness1Gender === 'Hombre' && witness2Gender === 'Mujer') {
                witnessesHeader = 'del señor';
                witness2Header = 'la señora ';
            }

            if (out.witnessesHeader !== witnessesHeader) {
                out.witnessesHeader = witnessesHeader;
                changed = true;
            }
            if (out.witness2Header !== witness2Header) {
                out.witness2Header = witness2Header;
                changed = true;
            }

            // Derive signersHeader (for certifying declarant, witness1, witness2)
            const signersHeader = (declarantGender === 'Mujer' && witness1Gender === 'Mujer' && witness2Gender === 'Mujer')
                ? 'las señoras'
                : 'los señores';

            if (out.signersHeader !== signersHeader) {
                out.signersHeader = signersHeader;
                changed = true;
            }
        }
        if (
            (isReciboDescargoLaboralTemplate(templateName) || isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) &&
            fillReciboDescargoNotaryFromSigningProvince(templateName, out)
        ) {
            changed = true;
        }

        if (isCorretajeInmobiliarioTemplate(templateName)) {
            if (applyCorretajeInmobiliarioNormalizations(out)) {
                changed = true;
            }
            const restriction = String(out.assignmentRestriction ?? '').trim();
            if (restriction === 'EL AGENTE') {
                if (out.assigneeConsent !== 'EL PROPIETARIO') {
                    out.assigneeConsent = 'EL PROPIETARIO';
                    changed = true;
                }
            } else if (restriction === 'cualquiera de las Partes') {
                if (out.assigneeConsent !== 'la otra Parte') {
                    out.assigneeConsent = 'la otra Parte';
                    changed = true;
                }
            }
        }

        if (isPropuestaDeTrabajoTemplate(templateName)) {
            if (applyPropuestaDeTrabajoNormalizations(out)) {
                changed = true;
            }
        }

        if (isPoderSignosDistintivosTemplate(templateName)) {
            if (applySignosDistintivosIdTypeNormalizations(out)) {
                changed = true;
            }
        }

        // Auto-fill notaryProvince or notaryJurisdiction from signingProvince if present and empty
        if (typeof out.signingProvince === 'string' && out.signingProvince.trim()) {
            let notaryKey: string | undefined;
            for (const g of schema.groups) {
                for (const v of g.variables) {
                    if (v.key === 'notaryProvince' || v.key === 'notaryJurisdiction') {
                        notaryKey = v.key;
                        break;
                    }
                }
                if (notaryKey) break;
            }
            if (notaryKey && (out[notaryKey] === undefined || out[notaryKey] === null || String(out[notaryKey]).trim() === '')) {
                const stripLeadingArticle = (s: string): string => {
                    const t = s.trim();
                    const lower = t.toLowerCase();
                    if (lower.startsWith('el ')) return t.slice(3).trim();
                    if (lower.startsWith('la ')) return t.slice(3).trim();
                    return t;
                };
                out[notaryKey] = stripLeadingArticle(out.signingProvince);
                changed = true;
            }
        }


        /**
         * Recibo de Descargo Laboral: `employerIdBlock` is concatenated immediately after
         * `<strong>{{employerFullName}}</strong>` in the template, so the value must start with
         * a leading ", " for correct typography (e.g. "Empresa ABC, S.R.L., con el RNC…").
         * The schema documents this contract, but if the assistant ever submits a value with
         * leading whitespace, a missing comma, or no space after the comma, normalize it here
         * so the PDF never renders "Empresa ABC, S.R.L. , con el…" or "Empresa ABC, S.R.L.con el…".
         */
        if (templateName === 'Recibo de Descargo Laboral' && typeof out.employerIdBlock === 'string') {
            const original = out.employerIdBlock;
            let v = original.replace(/^\s+/, '');
            if (v.length > 0) {
                v = ', ' + v.replace(/^,+\s*/, '');
            }
            if (v !== original) {
                out.employerIdBlock = v;
                changed = true;
            }
        }

        /**
         * Auto-derive paired amounts (e.g. salaryInWords ↔ salaryAmountWithCurrency).
         * Lets the assistant ask once and submit only one form; the missing partner
         * is filled with canonical Dominican legal style here. Already-present
         * partners are never overwritten.
         */
        if (fillMissingAmountPartners(out)) {
            changed = true;
        }

        /**
         * Recibo de Descargo Laboral: when breakdown is enabled, keep total fields aligned with
         * the sum of breakdown line items. This prevents false "line items do not sum to total"
         * blocks caused by stale or partially-updated total fields.
         */
        if (templateName === 'Recibo de Descargo Laboral') {
            const yes = (v: unknown) => {
                const s = String(v ?? '').trim().toLowerCase();
                return s === 'sí' || s === 'si' || s === 'yes';
            };
            const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
            const hasText = (v: unknown) => !isBlank(v);
            const hasSigningData =
                hasText(out.signingCity) ||
                hasText(out.signingProvince) ||
                hasText(out.documentSigningDate) ||
                hasText(out.signingDayLetters) ||
                hasText(out.signingDayNumbers) ||
                hasText(out.signingMonthLetters) ||
                hasText(out.signingYearLetters) ||
                hasText(out.signingYearNumbers);

            const hasBreakdownEvidence =
                hasText(out.preavisoAmount) ||
                hasText(out.cesantiaAmount) ||
                hasText(out.navidadAmount) ||
                hasText(out.vacacionesAmount) ||
                hasText(out.additionalConcept1Label) ||
                hasText(out.additionalConcept1Amount) ||
                hasText(out.additionalConcept2Label) ||
                hasText(out.additionalConcept2Amount) ||
                hasText(out.hasAdditionalConcept1) ||
                hasText(out.hasAdditionalConcept2);

            // If the breakdown toggle is missing but the flow already progressed, infer it once.
            // Prefer "Sí" when breakdown evidence exists; otherwise default to "No" to stop loops.
            if (isBlank(out.hasDetailedBreakdown) && (hasBreakdownEvidence || hasSigningData)) {
                out.hasDetailedBreakdown = hasBreakdownEvidence ? 'Sí' : 'No';
                changed = true;
            }

            // If breakdown is enabled and we already have additional concept data, infer toggle #1.
            // If flow progressed to signing without concept-1 data, default to "No".
            const hasBaseBreakdownAmounts =
                hasText(out.preavisoAmount) &&
                hasText(out.cesantiaAmount) &&
                hasText(out.navidadAmount) &&
                hasText(out.vacacionesAmount);

            if (yes(out.hasDetailedBreakdown) && isBlank(out.hasAdditionalConcept1)) {
                if (hasReciboLaboralAdditionalConcept1Content(out)) {
                    out.hasAdditionalConcept1 = 'Sí';
                    changed = true;
                } else if (hasSigningData || hasBaseBreakdownAmounts) {
                    out.hasAdditionalConcept1 = 'No';
                    changed = true;
                }
            }

            if (
                yes(out.hasAdditionalConcept1) &&
                !hasReciboLaboralAdditionalConcept1Content(out) &&
                hasBaseBreakdownAmounts
            ) {
                const concept2No = String(out.hasAdditionalConcept2 ?? '').trim().toLowerCase() === 'no';
                const onlyPlaceholders =
                    isBlank(out.additionalConcept1Label) ||
                    isReciboLaboralPlaceholderAdditionalLabel(out.additionalConcept1Label);
                if (concept2No || (onlyPlaceholders && hasSigningData)) {
                    out.hasAdditionalConcept1 = 'No';
                    changed = true;
                }
            }

            if (!yes(out.hasAdditionalConcept1)) {
                if (clearReciboLaboralAdditionalConceptFieldsWhenDisabled(out)) {
                    changed = true;
                }
            } else if (yes(out.hasAdditionalConcept1) && isBlank(out.hasAdditionalConcept2)) {
                out.hasAdditionalConcept2 = 'No';
                changed = true;
            }

            if (yes(out.hasDetailedBreakdown)) {
                const requiredLineKeys: Array<keyof typeof out> = [
                    'preavisoAmount',
                    'cesantiaAmount',
                    'navidadAmount',
                    'vacacionesAmount',
                ];
                let canSum = true;
                let sum = 0;
                for (const k of requiredLineKeys) {
                    if (out[k] === undefined) {
                        canSum = false;
                        break;
                    }
                    const val = out[k];
                    const n = parsePesoAmountToNumber(val);
                    if (val === null || String(val).trim() === '' || String(val).toLowerCase().includes('aplica')) {
                        sum += 0;
                    } else if (n !== null) {
                        sum += n;
                    } else {
                        canSum = false;
                        break;
                    }
                }
                if (canSum && yes(out.hasAdditionalConcept1)) {
                    if (out.additionalConcept1Amount === undefined) {
                        canSum = false;
                    } else {
                        const val = out.additionalConcept1Amount;
                        const n = parsePesoAmountToNumber(val);
                        if (val === null || String(val).trim() === '' || String(val).toLowerCase().includes('aplica')) {
                            sum += 0;
                        } else if (n !== null) {
                            sum += n;
                        } else {
                            canSum = false;
                        }
                    }
                }
                if (canSum && yes(out.hasAdditionalConcept2)) {
                    if (out.additionalConcept2Amount === undefined) {
                        canSum = false;
                    } else {
                        const val = out.additionalConcept2Amount;
                        const n = parsePesoAmountToNumber(val);
                        if (val === null || String(val).trim() === '' || String(val).toLowerCase().includes('aplica')) {
                            sum += 0;
                        } else if (n !== null) {
                            sum += n;
                        } else {
                            canSum = false;
                        }
                    }
                }
                /**
                 * Only fill a *missing* total from the line sum. NEVER silently overwrite
                 * a user-stated total that disagrees with the desglose — mismatch must
                 * surface via validateReciboDescargoLaboralBreakdownSum (ask the user).
                 */
                if (canSum) {
                    const currentTotal = parsePesoAmountToNumber(out.totalAmountWithCurrency);
                    if (currentTotal === null && sum > 0) {
                        out.totalAmountWithCurrency = `RD$${sum.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}`;
                        out.totalAmountInWords = numberToDominicanPesoWords(sum);
                        changed = true;
                    }
                }
            }
        }

        /**
         * Recibo de Descargo Laboral: `fillMissingAmountPartners` derives *totalAmountWithCurrency*
         * (and breakdown lines are normalized earlier) using peso-amount `formatNumericPartner`,
         * which omits ".00" for whole pesos — but *totalAmountInWords* always uses "con NN/100",
         * so the PDF must show RD$…**.00** for consistency. Re-apply two-decimal display after
         * partner fill (idempotent if already formatted).
         */
        if (templateName === 'Recibo de Descargo Laboral') {
            for (const key of Object.keys(out)) {
                if (!isReciboDescargoLaboralPesoDisplayKey(key)) continue;
                const val = out[key];
                const str =
                    typeof val === 'number' && Number.isFinite(val)
                        ? String(val)
                        : typeof val === 'string'
                          ? val
                          : '';
                if (!str.trim()) continue;
                const normalized = formatDominicanPesoAmount(str, key);
                if (normalized !== str) {
                    out[key] = normalized;
                    changed = true;
                }
            }
        }

        /**
         * Same idea for non-monetary integer pairs:
         *   - signingDayLetters ↔ signingDayNumbers, signingYearLetters ↔ signingYearNumbers
         *   - contractDurationWords ↔ contractDurationNumbers, agreementTermYearsLetters ↔ agreementTermYearsNumbers
         *   - noticePeriodInDays ↔ noticePeriodInNumbers, terminationNoticeDaysWords ↔ terminationNoticeDaysNumbers
         *   - filingDeadlineDaysLetters ↔ filingDeadlineDaysNumbers, etc.
         * The assistant asks once for the duration / plazo / día / año and the
         * server fills the partner so the PDF always has both forms.
         */
        if (fillMissingIntegerPartners(out)) {
            changed = true;
        }

        /**
         * Combined "<word> (<digit>)" single-key fields like weeklyHours,
         * numberOfOriginals, minimumAge — accept just a number or just a word
         * from the user and normalize to "cuarenta (40)" / "tres (3)" so the
         * PDF renders both forms consistently.
         */
        if (normalizeCombinedIntegerKeys(out)) {
            changed = true;
        }

        if (isCompraventaVehiculoTemplate(templateName)) {
            if (normalizeCompraventaSigningDateFragments(out)) {
                changed = true;
            }
        }

        /**
         * Notificación de Terminación Contrato de Alquiler:
         * avoid asking the surname twice by deriving `tenantLastName` from
         * `tenantFullName` when the assistant already captured full name.
         */
        if (isTerminationNoticeTemplate(templateName) && fillTenantGreetingLastName(out)) {
            changed = true;
        }

        /**
         * Contrato de Trabajadora Doméstica specific display rules for salary:
         * - Words with initial capitals in key terms:
         *   "Treinta Mil Pesos Dominicanos con 00/100"
         * - Numeric currency with RD$ prefix (never "$... DOP"):
         *   "RD$30,000"
         *
         * Runs after partner auto-fill so it also formats server-derived values.
         */
        if (isDomesticContractTemplate(templateName)) {
            const words = out.salaryInWords;
            if (typeof words === 'string' && words.trim()) {
                const normalized = normalizeDomesticSalaryInWordsDisplay(words);
                if (normalized !== words) {
                    out.salaryInWords = normalized;
                    changed = true;
                }
            }
            const numeric = out.salaryAmountWithCurrency;
            if (typeof numeric === 'string' && numeric.trim()) {
                const normalized = normalizeDomesticSalaryCurrencyDisplay(numeric);
                if (normalized !== numeric) {
                    out.salaryAmountWithCurrency = normalized;
                    changed = true;
                }
            }
        }

        if (isContratoTeletrabajoTemplate(templateName)) {
            if (applyContratoTeletrabajoEmployerRncIdentificationFlag(out)) {
                changed = true;
            }
            if (applyContratoTeletrabajoEmployerBranchNormalization(out)) {
                changed = true;
            }
            if (fillContratoTeletrabajoDerivedFields(out)) {
                changed = true;
            }
            if (expandTeletrabajoContractStartDate(out)) {
                changed = true;
            }
            if (expandTeletrabajoSigningCanonicalDates(out)) {
                changed = true;
            }
            if (shouldApplyContratoTeletrabajoNormalizations(templateName) && applyContratoTeletrabajoNormalizations(out)) {
                changed = true;
            }
        }

        if (isDomesticContractTemplate(templateName)) {
            if (backfillContratoDomesticaDocumentSigningDateFromFragments(out)) {
                changed = true;
            }
            if (expandContratoDomesticaCanonicalDates(out)) {
                changed = true;
            }
            if (fillDomesticContractEmployerAutoFields(out)) {
                changed = true;
            }
            if (fillDomesticContractNotaryFromSigningProvince(out)) {
                changed = true;
            }
            if (fillDomesticContractNotaryFromEmployerAddress(out)) {
                changed = true;
            }
            if (fillDomesticContractIndefiniteDuration(out)) {
                changed = true;
            }
            if (syncDomesticAdditionalBenefitsGate(out)) {
                changed = true;
            }
        }

        return out;
    }

    async storeGroupVariables(
        groupId: string,
        vars: Record<string, string | number> | null | undefined,
        templateName: string,
        userId: string,
        userMessage?: string,
    ): Promise<number> {
        const session = await this.session.getSession(templateName, userId);
        if (!session) {
            throw new Error('No active session. Call submit_group_answers with only userDocumentId first.');
        }
        const enriched = this.mapAnswersToGroupSchema(templateName, groupId, vars && typeof vars === 'object' ? vars : {}, userMessage);
        const merged = { ...session.variables, ...enriched.mapped };
        const toStore = this.normalizeFieldValuesForStorage(templateName, merged);
        if (toStore && typeof toStore === 'object') {
            toStore[PDF_PREVIEW_ACTIVE_KEY] = 'false';
        }
        const { totalStored } = await this.session.storeGroupAnswers(groupId, toStore, templateName, userId);
        return totalStored;
    }

    /** Same as storeGroupVariables but session is resolved by user_documents row _id (LRU key). */
    async storeGroupVariablesByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
        groupId: string,
        vars: Record<string, string | number> | null | undefined,
        userMessage?: string,
    ): Promise<number> {
        const sess = await this.session.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!sess) {
            throw new Error('No active session. Call submit_group_answers with only userDocumentId first.');
        }
        const enriched = this.mapAnswersToGroupSchema(
            sess.templateName,
            groupId,
            vars && typeof vars === 'object' ? vars : {},
            userMessage,
        );
        let mappedAnswers = enriched.mapped;
        if (sess.templateName === RECIBO_DESCARGO_LABORAL) {
            mappedAnswers = mergeReciboLaboralPendingSiNoAnswers(
                sess.templateName,
                mappedAnswers,
                userMessage,
                sess.variables,
            );
        }
        const merged = { ...sess.variables, ...mappedAnswers };
        const toStore = this.normalizeFieldValuesForStorage(sess.templateName, merged);
        if (toStore && typeof toStore === 'object') {
            toStore[PDF_PREVIEW_ACTIVE_KEY] = 'false';
        }
        const { totalStored } = await this.session.storeGroupAnswersByPurchaseId(userDocumentPurchaseId, userId, groupId, toStore);
        if (isReciboDescargoTrabajadoraDomesticaTemplate(sess.templateName) && toStore && typeof toStore === 'object') {
            reciboDomesticaVerifyLog(
                'STORE_GROUP_NORMALIZED',
                { userDocumentPurchaseId, userId, groupId, templateName: sess.templateName },
                toStore as Record<string, string | number>,
            );
        }
        return totalStored;
    }

    async getSessionVariables(templateName: string, userId: string): Promise<Record<string, string | number>> {
        return this.session.getVariables(templateName, userId);
    }

    /** Merge keys into the purchase session without marking a schema group complete (internal flags, etc.). */
    async patchSessionVariablesByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
        patch: Record<string, string | number>,
    ): Promise<void> {
        const sess = await this.session.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!sess) return;
        const merged = { ...sess.variables, ...patch };
        const toStore =
            (this.normalizeFieldValuesForStorage(sess.templateName, merged) as Record<string, string | number>) ??
            merged;
        await this.session.patchVariablesByPurchaseId(userDocumentPurchaseId, userId, toStore);
    }

    /** Normalize session variables (including PDF date fragments) and persist for preview/PDF consistency. */
    getNormalizedVariablesForStorage(
        templateName: string,
        variables: Record<string, string | number>,
    ): Record<string, string | number> {
        return (
            (this.normalizeFieldValuesForStorage(templateName, variables) as Record<string, string | number>) ?? {
                ...variables,
            }
        );
    }

    async syncNormalizedSessionVariablesByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
    ): Promise<Record<string, string | number>> {
        const sess = await this.session.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!sess) {
            return {};
        }
        let normalized =
            (this.normalizeFieldValuesForStorage(sess.templateName, { ...sess.variables }) as Record<
                string,
                string | number
            >) ?? { ...sess.variables };
        if (sess.templateName === RECIBO_DESCARGO_LABORAL) {
            const full = this.getTemplateSchema(sess.templateName);
            if (!('error' in full)) {
                resolveReciboLaboralAdditionalConceptToggles(normalized, {
                    trigger: 'reconcile',
                    groups: full.groups,
                    isGroupApplicable: (g) => this.isGroupApplicable(g, normalized),
                    getGroupMissingFields: (g, vars) => this.getGroupMissingFields(g, vars),
                });
            }
        }
        if (isReciboDescargoTrabajadoraDomesticaTemplate(sess.templateName)) {
            reciboDomesticaVerifyLog(
                'SYNC_NORMALIZED_BEFORE',
                { userDocumentPurchaseId, userId, templateName: sess.templateName },
                sess.variables,
            );
        }
        await this.session.replaceVariablesByPurchaseId(userDocumentPurchaseId, userId, normalized);
        if (isReciboDescargoTrabajadoraDomesticaTemplate(sess.templateName)) {
            reciboDomesticaVerifyLog(
                'SYNC_NORMALIZED_AFTER',
                { userDocumentPurchaseId, userId, templateName: sess.templateName },
                normalized,
            );
        }
        return normalized;
    }

    async getCompletedGroups(templateName: string, userId: string): Promise<string[]> {
        return this.session.getCompletedGroups(templateName, userId);
    }

    /** Completed groups for this purchase row (correct when multiple purchases share the same template). */
    async getCompletedGroupsByPurchaseId(userDocumentPurchaseId: string, userId: string): Promise<string[]> {
        return this.session.getCompletedGroupsByPurchaseId(userDocumentPurchaseId, userId);
    }

    async getSessionVariablesByPurchaseId(userDocumentPurchaseId: string, userId: string): Promise<Record<string, string | number>> {
        return this.session.getVariablesByPurchaseId(userDocumentPurchaseId, userId);
    }

    async clearSession(templateName: string, userId: string): Promise<void> {
        await this.session.clear(templateName, userId);
    }

    async clearSessionByPurchaseId(userDocumentPurchaseId: string, userId: string, templateName: string): Promise<void> {
        await this.session.clearByPurchaseId(userDocumentPurchaseId, userId, templateName);
    }

    /** Active fill session for the template (includes catalog `documentId` when started from a purchase). */
    async getFillingSession(templateName: string, userId: string): Promise<SessionData | null> {
        return this.session.getSession(templateName, userId);
    }

    /** Session keyed by purchase row (avoids template-index collisions). */
    async getPurchaseSession(userDocumentPurchaseId: string, userId: string): Promise<SessionData | null> {
        return this.session.getSessionByPurchaseId(userDocumentPurchaseId, userId);
    }

    async setCurrentTemplate(name: string, userId: string, catalogDocumentId: string, userDocumentPurchaseId: string): Promise<void> {
        await this.session.start(name, userId, catalogDocumentId, userDocumentPurchaseId);
    }

    async getCurrentTemplate(templateName: string, userId: string): Promise<string> {
        return this.session.getTemplateName(templateName, userId);
    }

    /** True when a schema group applies given current answers (no group.condition → always applicable). */
    isGroupApplicable(
        group: { condition?: { field: string; equals: string | boolean } },
        variables: Record<string, string | number>,
    ): boolean {
        if (!group.condition) return true;
        const condValue = variables[group.condition.field];
        const expected = group.condition.equals;
        return String(condValue ?? '').toLowerCase() === String(expected).toLowerCase();
    }

    private getGroupMissingFields(
        group: { variables: Array<{ key: string; label: string; type: string; required: boolean; options?: string[]; condition?: { field: string; equals: string | boolean } }> },
        variables: Record<string, string | number>,
        templateName?: string,
    ): Array<{ key: string; label: string }> {
        const missing: Array<{ key: string; label: string }> = [];
        for (const variable of group.variables) {
            if (!variable.required) continue;
            if (variable.condition) {
                const condValue = variables[variable.condition.field];
                const expected = variable.condition.equals;
                if (String(condValue ?? '').toLowerCase() !== String(expected).toLowerCase()) continue;
            }
            if (
                templateName &&
                (isDomesticContractTemplate(templateName) || isContratoTeletrabajoTemplate(templateName)) &&
                variable.key === 'documentSigningDate'
            ) {
                if (!isDomesticContractSigningDateSatisfied(variables)) {
                    missing.push({ key: variable.key, label: variable.label });
                }
                continue;
            }
            const value = variables[variable.key];
            if (value === undefined || value === null || String(value).trim() === '') {
                const amountPair = findAmountPairForKey(variable.key);
                if (amountPair) {
                    if (amountPair.wordsKey.toLowerCase() === variable.key.toLowerCase()) {
                        const hasNumericInGroup = group.variables.some((v) => v.key.toLowerCase() === amountPair.numericKey.toLowerCase());
                        const numericVal = variables[amountPair.numericKey];
                        const numericIsEmpty = numericVal === undefined || numericVal === null || String(numericVal).trim() === '';
                        if (hasNumericInGroup && numericIsEmpty) {
                            continue;
                        }
                    }
                    const partnerKey = amountPair.wordsKey.toLowerCase() === variable.key.toLowerCase()
                        ? amountPair.numericKey
                        : amountPair.wordsKey;
                    const partnerVal = variables[partnerKey];
                    if (partnerVal !== undefined && partnerVal !== null && String(partnerVal).trim() !== '') {
                        continue;
                    }
                }
                const integerPair = findIntegerPairForKey(variable.key);
                if (integerPair) {
                    if (integerPair.wordsKey.toLowerCase() === variable.key.toLowerCase()) {
                        const hasNumericInGroup = group.variables.some((v) => v.key.toLowerCase() === integerPair.numericKey.toLowerCase());
                        const numericVal = variables[integerPair.numericKey];
                        const numericIsEmpty = numericVal === undefined || numericVal === null || String(numericVal).trim() === '';
                        if (hasNumericInGroup && numericIsEmpty) {
                            continue;
                        }
                    }
                    const partnerKey = integerPair.wordsKey.toLowerCase() === variable.key.toLowerCase()
                        ? integerPair.numericKey
                        : integerPair.wordsKey;
                    const partnerVal = variables[partnerKey];
                    if (partnerVal !== undefined && partnerVal !== null && String(partnerVal).trim() !== '') {
                        continue;
                    }
                }
                missing.push({ key: variable.key, label: variable.label });
                continue;
            }
            if (isIdNumberVariableKey(variable.key)) {
                const idTypeKey = pairedIdTypeKey(variable.key);
                const idType = idTypeKey ? String(variables[idTypeKey] ?? '').trim() : '';
                if (!isCedulaFieldValueValid(variable.key, String(value), idType)) {
                    missing.push({
                        key: variable.key,
                        label: `${variable.label} (formato válido: XXX-XXXXXXX-X)`,
                    });
                }
            }
        }
        return missing;
    }

    private getPendingCompactGroup<
        T extends { id: string; label: string; variables: Array<{ key: string; label: string; type: string; required: boolean; options?: string[]; condition?: { field: string; equals: string | boolean } }> },
    >(
        templateName: string,
        group: T,
        missing: Array<{ key: string }>,
        vars?: Record<string, string | number>,
    ): T {
        const missingKeys = new Set(missing.map((field) => field.key));
        if (templateName === 'Contrato de Compraventa Vehículo' && group.id === 'signing') {
            const signingDateFragmentKeys = new Set([
                'signingDateLetters',
                'signingDateNumbers',
                'signingMonthLetters',
                'signingYearLetters',
                'signingYearNumbers',
            ]);
            const hasMissingSigningDate = [...signingDateFragmentKeys].some((key) => missingKeys.has(key));
            const variables = group.variables.filter((variable) => missingKeys.has(variable.key) && !signingDateFragmentKeys.has(variable.key));
            if (hasMissingSigningDate) {
                variables.push({
                    key: 'documentSigningDate',
                    label: 'Fecha de firma del contrato',
                    type: 'date',
                    required: true,
                });
            }
            return { ...group, variables };
        }
        let variables = group.variables.filter((variable) => missingKeys.has(variable.key));
        if (templateName === 'Recibo de Descargo Trabajadora Doméstica' && group.id === 'signingInfo') {
            variables = variables.filter((variable) => variable.key !== 'notaryJurisdiction');
        }
        if (isDomesticContractTemplate(templateName) || isContratoTeletrabajoTemplate(templateName)) {
            variables = variables.filter(
                (variable) =>
                    variable.key !== 'contractDurationIndefinite' &&
                    !isDomesticContractSigningFragmentKey(variable.key),
            );
        }
        if (
            isCompraventaVehiculoTemplate(templateName) &&
            (group.id === 'seller' || group.id === 'buyer') &&
            vars
        ) {
            variables = filterCompraventaPendingVariables(group.id, variables, vars);
            variables = sliceCompraventaPendingVariables(group.id, variables, missingKeys, vars);
        }
        if (isContratoTeletrabajoTemplate(templateName) && vars) {
            variables = filterTeletrabajoPendingVariables(group.id, variables, vars);
            variables = filterTeletrabajoCostsPendingVariables(group.id, variables, vars);
            const openingEmployerOnly =
                group.id === 'employer' &&
                Object.keys(vars).filter((k) => String(vars[k] ?? '').trim() !== '').length <= 3;
            variables = sliceTeletrabajoPendingVariables(group.id, variables, missingKeys, vars, {
                openingEmployerOnly,
            });
        }
        return {
            ...group,
            variables,
        };
    }

    async getNextGroup(templateName: string, userId: string): Promise<{ group: { id: string; label: string; variables: Array<{ key: string; label: string; type: string; required: boolean; options?: string[]; condition?: { field: string; equals: string | boolean } }> }; groupIndex: number; totalGroups: number; completedCount: number } | { allComplete: true; totalCollected: number } | { error: string }> {
        const schema = this.getCompactSchema(templateName);
        if ('error' in schema) return schema;

        const full = this.getTemplateSchema(templateName);
        if ('error' in full) return { error: full.error };

        const completed = new Set(await this.session.getCompletedGroups(templateName, userId));
        const variables = await this.session.getVariables(templateName, userId);
        const normalizedVariables =
            (this.normalizeFieldValuesForStorage(templateName, variables) as Record<string, string | number> | undefined) ?? variables;

        for (let i = 0; i < schema.groups.length; i++) {
            const gCompact = schema.groups[i];
            const gFull = full.groups[i];
            if (gFull && !this.isGroupApplicable(gFull, normalizedVariables)) {
                continue;
            }

            const missing = gFull ? this.getGroupMissingFields(gFull, normalizedVariables, templateName) : [];
            if (missing.length === 0) {
                continue;
            }

            return {
                group: this.getPendingCompactGroup(templateName, gCompact, missing, normalizedVariables),
                groupIndex: i + 1,
                totalGroups: schema.groups.length,
                completedCount: completed.size,
            };
        }
        return { allComplete: true, totalCollected: Object.keys(normalizedVariables).length };
    }

    /**
     * Same as {@link getNextGroup} but reads progress from the purchase-scoped session
     * (`user_documents._id` + user), avoiding collisions when one user has multiple purchases
     * of the same template (templateName+userId index would point at only one session).
     */
    async getNextGroupByPurchaseId(
        templateName: string,
        userId: string,
        userDocumentPurchaseId: string,
    ): Promise<
        | { group: { id: string; label: string; variables: Array<{ key: string; label: string; type: string; required: boolean; options?: string[]; condition?: { field: string; equals: string | boolean } }> }; groupIndex: number; totalGroups: number; completedCount: number }
        | { allComplete: true; totalCollected: number }
        | { error: string }
    > {
        const schema = this.getCompactSchema(templateName);
        if ('error' in schema) return schema;

        const full = this.getTemplateSchema(templateName);
        if ('error' in full) return { error: full.error };

        const completed = new Set(await this.session.getCompletedGroupsByPurchaseId(userDocumentPurchaseId, userId));
        const variables = await this.session.getVariablesByPurchaseId(userDocumentPurchaseId, userId);
        const normalizedVariables =
            (this.normalizeFieldValuesForStorage(templateName, variables) as Record<string, string | number> | undefined) ?? variables;

        for (let i = 0; i < schema.groups.length; i++) {
            const gCompact = schema.groups[i];
            const gFull = full.groups[i];
            if (gFull && !this.isGroupApplicable(gFull, normalizedVariables)) {
                continue;
            }

            const missing = gFull ? this.getGroupMissingFields(gFull, normalizedVariables, templateName) : [];
            if (missing.length === 0) {
                continue;
            }

            return {
                group: this.getPendingCompactGroup(templateName, gCompact, missing, normalizedVariables),
                groupIndex: i + 1,
                totalGroups: schema.groups.length,
                completedCount: completed.size,
            };
        }
        return { allComplete: true, totalCollected: Object.keys(normalizedVariables).length };
    }

    /**
     * Verify that every required variable (whose condition is satisfied) has a
     * non-empty value in the provided variables map.
     *
     * Works generically for any template that has a JSON schema in schemas/.
     *
     * Condition evaluation:
     *   { field: "party1IsCompany", equals: "empresa" }
     *   → the variable is only required when variables["party1IsCompany"] === "empresa"
     *   → if the condition is NOT met, the field is skipped entirely
     */
    verifyRequiredFields(
        templateName: string,
        variables: Record<string, string | number>,
    ): VerifyRequiredFieldsResult {
        const schema = this.getTemplateSchema(templateName);
        if ('error' in schema) {
            // Can't verify — treat as ok and let generation fail naturally
            return { ok: true };
        }

        const effectiveVariables =
            (this.normalizeFieldValuesForStorage(templateName, variables) as Record<string, string | number> | undefined) ?? variables;
        const missingFields: MissingField[] = [];

        for (const group of schema.groups) {
            if (!this.isGroupApplicable(group, effectiveVariables)) {
                continue;
            }

            for (const variable of group.variables) {
                if (!variable.required) continue;

                // Evaluate condition — skip the field if condition is not met
                if (variable.condition) {
                    const condValue = effectiveVariables[variable.condition.field];
                    const expected = variable.condition.equals;
                    // Compare loosely (string vs boolean normalisation)
                    const met =
                        String(condValue).toLowerCase() === String(expected).toLowerCase();
                    if (!met) continue;
                }

                if (
                    (isDomesticContractTemplate(templateName) || isContratoTeletrabajoTemplate(templateName)) &&
                    variable.key === 'documentSigningDate'
                ) {
                    if (!isDomesticContractSigningDateSatisfied(effectiveVariables)) {
                        missingFields.push({
                            groupId: group.id,
                            groupLabel: group.label,
                            key: variable.key,
                            label: variable.label,
                        });
                        continue;
                    }
                    const canonical = String(effectiveVariables.documentSigningDate ?? '').trim();
                    if (canonical && !parseStoredCalendarDateToYMD(canonical)) {
                        missingFields.push({
                            groupId: group.id,
                            groupLabel: group.label,
                            key: variable.key,
                            label: `${variable.label} (fecha no válida — use día, mes y año, ej. 15 de marzo de 2026)`,
                        });
                    }
                    continue;
                }

                // Check value is present and non-empty
                const value = effectiveVariables[variable.key];
                const isEmpty =
                    value === undefined ||
                    value === null ||
                    String(value).trim() === '';

                if (isEmpty) {
                    const amountPair = findAmountPairForKey(variable.key);
                    if (amountPair) {
                        const partnerKey = amountPair.wordsKey.toLowerCase() === variable.key.toLowerCase()
                            ? amountPair.numericKey
                            : amountPair.wordsKey;
                        const partnerVal = effectiveVariables[partnerKey];
                        if (partnerVal !== undefined && partnerVal !== null && String(partnerVal).trim() !== '') {
                            continue;
                        }
                    }
                    const integerPair = findIntegerPairForKey(variable.key);
                    if (integerPair) {
                        const partnerKey = integerPair.wordsKey.toLowerCase() === variable.key.toLowerCase()
                            ? integerPair.numericKey
                            : integerPair.wordsKey;
                        const partnerVal = effectiveVariables[partnerKey];
                        if (partnerVal !== undefined && partnerVal !== null && String(partnerVal).trim() !== '') {
                            continue;
                        }
                    }

                    missingFields.push({
                        groupId: group.id,
                        groupLabel: group.label,
                        key: variable.key,
                        label: variable.label,
                    });
                    continue;
                }

                if (isIdNumberVariableKey(variable.key)) {
                    const idTypeKey = pairedIdTypeKey(variable.key);
                    const idType = idTypeKey ? String(effectiveVariables[idTypeKey] ?? '').trim() : '';
                    if (!isCedulaFieldValueValid(variable.key, String(value), idType)) {
                        missingFields.push({
                            groupId: group.id,
                            groupLabel: group.label,
                            key: variable.key,
                            label: `${variable.label} (formato válido: XXX-XXXXXXX-X)`,
                        });
                    }
                }

                if (
                    isReciboDescargoTrabajadoraDomesticaTemplate(templateName) &&
                    variable.type === 'date' &&
                    !parseStoredCalendarDateToYMD(String(value))
                ) {
                    missingFields.push({
                        groupId: group.id,
                        groupLabel: group.label,
                        key: variable.key,
                        label: `${variable.label} (fecha no válida — use día, mes y año, ej. 26 de mayo de 2026)`,
                    });
                }
            }
        }

        if (missingFields.length > 0) {
            return { ok: false, missingFields };
        }
        return { ok: true };
    }

    verifyReciboDomesticaPdfDateFragments(
        templateName: string,
        variables: Record<string, string | number>,
    ):
        | { ok: true; expanded: Record<string, string | number> }
        | { ok: false; issues: ReciboDomesticaPdfDateIssue[]; expanded: Record<string, string | number> } {
        if (!isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
            return { ok: true, expanded: { ...variables } };
        }
        const normalized =
            (this.normalizeFieldValuesForStorage(templateName, variables) as Record<string, string | number>) ?? {
                ...variables,
            };
        const result = verifyReciboDomesticaPdfReady(normalized);
        reciboDomesticaVerifyLog('VERIFY_PDF_DATE_FRAGMENTS', {
            templateName,
            ok: result.ok,
            issueCount: result.ok ? 0 : result.issues.length,
            issues: result.ok ? undefined : result.issues,
        }, result.expanded);
        return result;
    }

    /**
     * Remove metadata sections added by Word (e.g. "Fields Lists" reference tables)
     * that should not appear in the final rendered document.
     */
    private stripMetadataSections(html: string): string {
        // Strip everything from the first occurrence of a "Fields Lists" heading
        const markers = [
            '<p><strong>Fields Lists</strong></p>',
            '<p><strong>Fields List</strong></p>',
        ];
        for (const marker of markers) {
            const idx = html.indexOf(marker);
            if (idx !== -1) return html.slice(0, idx);
        }
        return html;
    }

    private wrapInPage(htmlBody: string): string {
        return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Document</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,600;0,700;1,400;1,700&display=swap" rel="stylesheet" />
  <style>
    @page { size: letter; margin: 1in 1.18in; }
    body { font-family: 'Poppins', sans-serif; font-size: 10pt; font-weight: 400; line-height: 1.25; color: #222; max-width: 680px; margin: 0 auto; padding: 24px; text-align: justify; }
    p { margin: 0 0 6pt 0; text-align: justify; }
    strong { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 10pt; }
    th { background: #f5f5f5; font-weight: 600; }
    ul, ol { margin: 0.4em 0; padding-left: 1.5em; }
    ol[type="a"] { list-style-type: none; counter-reset: alpha-counter; }
    ol[type="a"] li::before { counter-increment: alpha-counter; content: counter(alpha-counter, lower-alpha) ") "; }
    li { margin-bottom: 2px; }
    ol[type="a"] li { margin-bottom: 0; padding-bottom: 0; }
    .text-center { text-align: center !important; }
    .signature-block { text-align: center; margin-top: 2em; }
    .signature-block p { text-align: center; }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;
    }

    getTemplatesDir(): string {
        return TEMPLATES_DIR;
    }

    getOutputDir(): string {
        return OUTPUT_DIR;
    }

    /**
     * Load variables from a JSON file (path relative to project root).
     * Returns the parsed object, or { _error: string } on failure.
     */
    loadVariablesFromFile(relativePath: string): Record<string, string | number> | { _error: string } {
        const fullPath = join(PROJECT_ROOT, relativePath);
        if (!existsSync(fullPath)) {
            return { _error: `Variables file not found: ${relativePath} (resolved: ${fullPath})` };
        }
        try {
            const raw = readFileSync(fullPath, 'utf8');
            const data = JSON.parse(raw);
            if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                return { _error: 'Variables file must be a JSON object' };
            }
            return data as Record<string, string | number>;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { _error: `Failed to read variables file: ${message}` };
        }
    }

    /**
     * Extract all Handlebars variables and conditional blocks from an HBS template.
     */
    analyzeTemplate(templateName: string): TemplateAnalysis | { error: string } {
        const templatePath = join(HBS_DIR, templateName + '.hbs');
        if (!existsSync(templatePath)) {
            return { error: `Template not found: ${templateName}.hbs (no full catalog in message — check templates/hbs).` };
        }

        const source = readFileSync(templatePath, 'utf8');

        // Extract {{variableName}} (exclude helpers like #if, #unless, else, /)
        const varRegex = /\{\{(?!#|\/|else\b)([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        const variableNames = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = varRegex.exec(source)) !== null) {
            variableNames.add(m[1]);
        }

        // Extract {{#if varName}} and {{#unless varName}} blocks
        const condRegex = /\{\{#(?:if|unless)\s+([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        const conditionalBlocks: string[] = [];
        const conditionalVars = new Set<string>();
        while ((m = condRegex.exec(source)) !== null) {
            conditionalBlocks.push(m[0]);
            conditionalVars.add(m[1]);
        }

        // Build variable info — detect which variables appear inside conditional blocks
        const variables: VariableInfo[] = [];
        for (const name of variableNames) {
            // Check if this variable is inside a conditional block
            let conditionalParent: string | undefined;
            for (const condVar of conditionalVars) {
                const ifBlock = new RegExp(
                    `\\{\\{#if\\s+${condVar}\\}\\}[\\s\\S]*?\\{\\{${name}\\}\\}[\\s\\S]*?\\{\\{/if\\}\\}`,
                );
                if (ifBlock.test(source)) {
                    conditionalParent = condVar;
                    break;
                }
            }
            variables.push({
                name,
                usedInConditional: !!conditionalParent,
                conditionalParent,
            });
        }

        return {
            templateName,
            variables,
            conditionalBlocks,
            totalVariables: variables.length,
        };
    }

    /**
     * Save a template schema to templates/schemas/<templateName>.json
     */
    saveTemplateSchema(templateName: string, schema: TemplateSchema): { success: boolean; savedPath: string; error?: string } {
        if (!existsSync(SCHEMAS_DIR)) mkdirSync(SCHEMAS_DIR, { recursive: true });
        const schemaPath = join(SCHEMAS_DIR, templateName + '.json');
        try {
            writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
            return { success: true, savedPath: schemaPath };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, savedPath: '', error: message };
        }
    }

    /**
     * Returns a compact schema for AI consumption — strips examples and description
     * to minimise the token count sent back in the tool response.
     */
    getCompactSchema(templateName: string): { groups: Array<{ id: string; label: string; condition?: { field: string; equals: string | boolean }; variables: Array<{ key: string; label: string; type: string; required: boolean; options?: string[]; condition?: { field: string; equals: string | boolean } }> }> } | { error: string } {
        const full = this.getTemplateSchema(templateName);
        if ('error' in full) return full;
        return {
            groups: full.groups.map(g => ({
                id: g.id,
                label: g.label,
                ...(g.condition ? { condition: g.condition } : {}),
                variables: g.variables
                    .filter((v) => {
                        if (
                            templateName === 'Recibo de Descargo Trabajadora Doméstica' &&
                            v.key === 'notaryJurisdiction'
                        ) {
                            return false;
                        }
                        if (isDomesticContractTemplate(templateName) && v.key === 'contractDurationIndefinite') {
                            return false;
                        }
                        if (
                            (isDomesticContractTemplate(templateName) || isContratoTeletrabajoTemplate(templateName)) &&
                            isDomesticContractSigningFragmentKey(v.key)
                        ) {
                            return false;
                        }
                        return true;
                    })
                    .map(v => {
                    /** LLM-facing label: avoid "dropdown" — chat is not a form UI. JSON files still use type "dropdown". */
                    const aiType = v.type === 'dropdown' ? 'choice' : v.type;
                    const compact: { key: string; label: string; type: string; required: boolean; options?: string[]; condition?: { field: string; equals: string | boolean } } = {
                        key: v.key,
                        label: v.label,
                        type: aiType,
                        required: v.required,
                    };
                    if (v.options) compact.options = v.options;
                    if (v.condition) compact.condition = v.condition;
                    /** pdfKeys / derivesPdfKeys are for engineers only — not sent to the model. */
                    return compact;
                }),
            })),
        };
    }

    /**
     * Load a template schema from templates/schemas/<templateName>.json
     */
    getTemplateSchema(templateName: string): TemplateSchema | { error: string } {
        const schemaPath = join(SCHEMAS_DIR, templateName + '.json');
        if (!existsSync(schemaPath)) {
            return { error: `Schema not found: ${templateName}.json (see templates/schemas).` };
        }
        try {
            const raw = readFileSync(schemaPath, 'utf8');
            return JSON.parse(raw) as TemplateSchema;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { error: `Failed to read schema: ${message}` };
        }
    }

    /**
     * List document templates from the templates directory (.hbs files).
     * Returns template names that can be filled (e.g. "Acuerdo de Confidencialidad y No-Elusión").
     */
    listTemplates(): string[] {
        if (!existsSync(HBS_DIR)) return [];
        return readdirSync(HBS_DIR)
            .filter((f: string) => f.endsWith('.hbs'))
            .map((f: string) => f.replace(/\.hbs$/i, ''));
    }

    async fillAndExportPdf(
        templateName: string,
        variables: Record<string, string | number>,
        skipS3Upload = false,
    ): Promise<FillAndExportResult> {
        const templatePath = join(HBS_DIR, templateName + '.hbs');
        if (!existsSync(templatePath)) {
            return {
                pdfPath: '',
                htmlFilePath: '',
                htmlContent: '',
                success: false,
                error: `Template not found: ${templateName}.hbs (see templates/hbs).`,
            };
        }

        if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
        const pdfPath = join(OUTPUT_DIR, templateName + '.pdf');
        const htmlFilePath = join(OUTPUT_DIR, templateName + '.html');

        try {
            const templateSource = readFileSync(templatePath, 'utf8');
            const template = Handlebars.compile(templateSource);
            const normalizedVars = this.normalizeFieldValuesForStorage(templateName, variables);
            let varsForPdf = (normalizedVars ?? variables) as Record<string, string | number>;

            /**
             * Términos de Uso: re-apply services coherence immediately before
             * compile so a stale session value (or missed storage-time strip)
             * cannot produce "El Sitio Web ofrece el sitio web ofrece…".
             */
            if (isTerminosUsoPaginaWebTemplate(templateName)) {
                enforceTerminosUsoWebServicesCoherence(varsForPdf);
            }

            if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
                const pdfReady = verifyReciboDomesticaPdfReady(varsForPdf);
                if (!pdfReady.ok) {
                    reciboDomesticaVerifyLog('FILL_PDF_BLOCKED_DATES', {
                        templateName,
                        issues: pdfReady.issues,
                    }, pdfReady.expanded);
                    const labels = pdfReady.issues.map((i) => i.label).join('; ');
                    return {
                        pdfPath: '',
                        htmlFilePath: '',
                        htmlContent: '',
                        success: false,
                        error: `Las fechas del documento no están listas para el PDF: ${labels}. Vuelve a enviar esos datos con submit_group_answers.`,
                    };
                }
                varsForPdf = pdfReady.expanded;
                reciboDomesticaVerifyLog('FILL_PDF_VARS_READY', { templateName }, varsForPdf);
            }

            const htmlBody = template(varsForPdf);
            /**
             * Some templates write `{{workSchedule}}.` — when the value already ends
             * in `a.m.` / `p.m.` / `S.A.` the rendered output gets a doubled period
             * (`p.m..`). Collapse those here so both the saved HTML and the PDF
             * always show a single trailing dot.
             */
            const dedotedBody = collapseAbbreviationDoubleDots(htmlBody);
            /**
             * Final safety net: any value that already ends in `.` followed by
             * the template's own `.` produces `..` (e.g. `alquiler..`,
             * `dominicana..`). Collapse those to a single `.` while preserving
             * legitimate ellipses (`...`).
             */
            const grammarFixedBody = collapseGenericDoubleDots(dedotedBody);
            /**
             * Optional fields that the user answered with "N/A" / "no aplica"
             * are blanked at storage time, but that leaves orphan markers in
             * fixed enumerations like `<strong>b)</strong> ; <strong>c)</strong> …`.
             * Strip those orphans plus any stray visible "N/A" tokens from the
             * rendered body so the deliverable always reads cleanly.
             */
            const naCleanedBody = stripOrphanEnumerationsFromHtml(grammarFixedBody);
            const terminosCleanedBody = isTerminosUsoPaginaWebTemplate(templateName)
                ? scrubTerminosUsoWebDoubleOfreceHtml(naCleanedBody)
                : naCleanedBody;
            const corretajeCleanedBody = isCorretajeInmobiliarioTemplate(templateName)
                ? sanitizeCorretajeRenderedHtml(terminosCleanedBody)
                : terminosCleanedBody;
            let cleanedBody = this.stripMetadataSections(corretajeCleanedBody);

            // Post-process HTML to capitalize date string if it starts a paragraph (p), table cell (td), or list item (li)
            try {
                const dom = new JSDOM(cleanedBody);
                const doc = dom.window.document;
                const blocks = doc.querySelectorAll('p, td, li');
                const dualDateLowerRe = /^\s*([a-záéíóúñ]+)\s+\(\d{1,2}\)\s+de\s+[a-záéíóúñ]+\s+del?\s+[^()]+\s+\(\d{4}\)/;
                let changedAny = false;
                for (const block of Array.from(blocks)) {
                    let node = block.firstChild;
                    while (node && node.nodeType !== 3) {
                        node = node.nextSibling;
                    }
                    if (node && node.nodeValue) {
                        const match = dualDateLowerRe.exec(node.nodeValue);
                        if (match) {
                            const firstWord = match[1];
                            if (firstWord && firstWord === firstWord.toLowerCase()) {
                                const val = node.nodeValue;
                                const trimmedStartLength = val.length - val.trimStart().length;
                                const leadingWhitespace = val.slice(0, trimmedStartLength);
                                const textPart = val.slice(trimmedStartLength);
                                node.nodeValue = leadingWhitespace + textPart.charAt(0).toUpperCase() + textPart.slice(1);
                                changedAny = true;
                            }
                        }
                    }
                }
                if (changedAny) {
                    cleanedBody = doc.body.innerHTML;
                }
            } catch (e) {
                // Fail-safe: if DOM parsing fails, use the original cleanedBody
            }

            const fullHtml = this.wrapInPage(cleanedBody);

            if (isReciboDescargoTrabajadoraDomesticaTemplate(templateName)) {
                reciboDomesticaVerifyLog('FILL_PDF_HTML_BUILT', {
                    templateName,
                    htmlFilePath,
                    htmlHasEmptyDatePlaceholders: htmlHasEmptyReciboDomesticaDatePlaceholders(cleanedBody),
                    htmlLength: fullHtml.length,
                }, varsForPdf);
            }

            writeFileSync(htmlFilePath, fullHtml, 'utf8');

            const { window } = new JSDOM('');
            const pdfContent = htmlToPdfmake(cleanedBody, {
                window,
                removeExtraBlanks: true,
                defaultStyles: {
                    p: { margin: [0, 0, 0, 6], lineHeight: 1.25, alignment: 'justify' },
                    strong: { bold: true },
                    b: { bold: true },
                    i: { italics: true },
                    em: { italics: true },
                    u: { decoration: 'underline' },
                    table: { margin: [0, 4, 0, 4] },
                    th: { bold: true, fillColor: '#f5f5f5', margin: [4, 4, 4, 4] },
                    td: { margin: [4, 4, 4, 4] },
                    li: { margin: [0, 1, 0, 1] },
                    a: { color: '#2563eb', decoration: 'underline' },
                },
            });

            const fixListSeparators = (nodes: any[]): void => {
                for (const node of nodes) {
                    if (node.ol && node.type === 'lower-alpha') {
                        node.separator = ['', ')'];
                    }
                    if (Array.isArray(node.stack)) fixListSeparators(node.stack);
                    if (Array.isArray(node.ol)) fixListSeparators(node.ol);
                    if (Array.isArray(node.ul)) fixListSeparators(node.ul);
                    if (node.table?.body) {
                        for (const row of node.table.body) {
                            for (const cell of row) {
                                if (Array.isArray(cell.stack)) fixListSeparators(cell.stack);
                                if (Array.isArray(cell)) fixListSeparators(cell);
                            }
                        }
                    }
                }
            };
            if (Array.isArray(pdfContent)) fixListSeparators(pdfContent);

            const docDefinition = {
                content: pdfContent,
                defaultStyle: { font: 'Poppins', fontSize: 10, lineHeight: 1.25 },
                styles: {
                    'html-p': { margin: [0, 0, 0, 6] as [number, number, number, number] },
                    'html-strong': { bold: true },
                },
                pageMargins: [85, 72, 85, 72] as [number, number, number, number],
                pageSize: 'LETTER' as const,
            };

            const pdfDoc = await pdfPrinter.createPdfKitDocument(docDefinition);
            const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
                pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
                pdfDoc.on('error', reject);
                pdfDoc.end();
            });
            writeFileSync(pdfPath, pdfBuffer);

            const s3Url = skipS3Upload ? undefined : await this.uploadToS3(pdfPath, templateName);
            return { pdfPath, htmlFilePath, htmlContent: fullHtml, success: true, s3Url };
        } catch (err) {
            let message: string;
            if (err instanceof Error) {
                message = err.message;
            } else if (typeof err === 'string') {
                message = err;
            } else if (err && typeof err === 'object' && 'message' in err && typeof (err as Record<string, unknown>).message === 'string') {
                message = (err as Record<string, unknown>).message as string;
            } else {
                try { message = JSON.stringify(err); } catch { message = String(err); }
            }
            return { pdfPath: '', htmlFilePath: '', htmlContent: '', success: false, error: message };
        }
    }

    async uploadExistingPdf(templateName: string): Promise<{ s3Url?: string; pdfPath: string; htmlContent: string; error?: string }> {
        const pdfPath = join(OUTPUT_DIR, templateName + '.pdf');
        const htmlFilePath = join(OUTPUT_DIR, templateName + '.html');

        if (!existsSync(pdfPath)) {
            return { pdfPath: '', htmlContent: '', error: `PDF not found for "${templateName}". Call generate_pdf first.` };
        }

        const htmlContent = existsSync(htmlFilePath) ? readFileSync(htmlFilePath, 'utf8') : '';
        const s3Url = await this.uploadToS3(pdfPath, templateName);
        return { s3Url, pdfPath, htmlContent };
    }

    /**
     * Generate a sample PDF using the first available template with placeholder
     * values extracted from the schema's "example" fields.
     * Useful for verifying that Puppeteer / Chromium is working in the
     * deployment environment.
     */
    /**
     * Normalize session variables, sync completed groups from schema applicability,
     * and return compact progress for tests / internal tooling.
     */
    async reconcileSessionProgress(
        session: SessionData,
        options?: { persist?: boolean },
    ): Promise<SessionProgress | SessionProgressError> {
        const templateName = session.templateName;
        const schema = this.getTemplateSchema(templateName);
        if ('error' in schema) {
            return { error: schema.error };
        }

        const compact = this.getCompactSchema(templateName);
        if ('error' in compact) {
            return { error: compact.error };
        }

        const normalized = this.normalizeFieldValuesForStorage(templateName, { ...session.variables });
        if (normalized) {
            Object.assign(session.variables, normalized);
        }

        if (templateName === RECIBO_DESCARGO_LABORAL) {
            resolveReciboLaboralAdditionalConceptToggles(session.variables, {
                trigger: 'reconcile',
                groups: schema.groups,
                isGroupApplicable: (g) => this.isGroupApplicable(g, session.variables),
                getGroupMissingFields: (g, vars) => this.getGroupMissingFields(g, vars),
            });
        }

        const completed = new Set(session.completedGroups);
        for (const g of schema.groups) {
            if (!this.isGroupApplicable(g, session.variables)) {
                continue;
            }
            const missing = this.getGroupMissingFields(g, session.variables, templateName);
            if (missing.length === 0) {
                completed.add(g.id);
            }
        }
        session.completedGroups = [...completed];
        void options?.persist;

        const completedSet = new Set(session.completedGroups);
        for (let i = 0; i < compact.groups.length; i++) {
            const gCompact = compact.groups[i];
            const gFull = schema.groups[i];
            if (gFull && !this.isGroupApplicable(gFull, session.variables)) {
                continue;
            }

            const missing = gFull ? this.getGroupMissingFields(gFull, session.variables, templateName) : [];
            if (missing.length === 0) {
                continue;
            }

            return {
                allComplete: false,
                totalCollected: Object.keys(session.variables).length,
                completedGroups: session.completedGroups,
                missingFieldKeys: missing.map((m) => m.key),
                group: this.getPendingCompactGroup(templateName, gCompact, missing, session.variables),
                groupIndex: i + 1,
                totalGroups: compact.groups.length,
                completedCount: completedSet.size,
            };
        }

        return {
            allComplete: true,
            totalCollected: Object.keys(session.variables).length,
            completedGroups: session.completedGroups,
            missingFieldKeys: [],
        };
    }

    mapAnswersToGroupSchema(
        templateName: string,
        groupId: string,
        answers: Record<string, string | number>,
        userMessage?: string,
    ): ReturnType<typeof enrichGroupAnswers> {
        const schema = this.getTemplateSchema(templateName);
        if ('error' in schema) {
            return {
                mapped: {},
                unrecognizedKeys: Object.keys(answers),
                mappedFrom: {},
                parsedFromNarrative: false,
            };
        }
        const group = schema.groups.find((g) => g.id === groupId);
        if (!group) {
            return {
                mapped: {},
                unrecognizedKeys: Object.keys(answers),
                mappedFrom: {},
                parsedFromNarrative: false,
            };
        }
        let normalizedAnswers = { ...answers };
        if (isContratoTeletrabajoTemplate(templateName) && groupId === 'signing') {
            const signingDateKey = Object.keys(normalizedAnswers).find(
                (k) =>
                    k.toLowerCase().includes('firma') ||
                    k.toLowerCase().includes('fecha'),
            );
            if (signingDateKey && signingDateKey !== 'documentSigningDate') {
                normalizedAnswers.documentSigningDate = normalizedAnswers[signingDateKey];
                delete normalizedAnswers[signingDateKey];
            }
        }
        const res = enrichGroupAnswers(groupId, group.variables, normalizedAnswers, userMessage);
        if (res.unrecognizedKeys.length > 0) {
            const unrecognizedAnswers: Record<string, string | number> = {};
            for (const key of res.unrecognizedKeys) {
                if (key in normalizedAnswers) {
                    unrecognizedAnswers[key] = normalizedAnswers[key];
                }
            }
            const allVariables = schema.groups.flatMap((g) => g.variables);
            const otherVariables = allVariables.filter((v) => !group.variables.some((gv) => gv.key === v.key));
            const fallback = mapAnswersToGroupVariables(otherVariables, unrecognizedAnswers);
            for (const [k, val] of Object.entries(fallback.mapped)) {
                res.mapped[k] = val;
                if (fallback.mappedFrom[k]) {
                    res.mappedFrom[k] = fallback.mappedFrom[k];
                }
            }
            res.unrecognizedKeys = fallback.unrecognizedKeys;
        }
        return res;
    }

    async generateSamplePdf(): Promise<FillAndExportResult & { templateName: string }> {
        const templates = this.listTemplates();
        if (templates.length === 0) {
            return { pdfPath: '', htmlFilePath: '', htmlContent: '', success: false, error: 'No templates found.', templateName: '' };
        }

        const templateName = templates[0];
        const schema = this.getTemplateSchema(templateName);

        const sampleVars: Record<string, string | number> = {};
        if (!('error' in schema)) {
            for (const group of schema.groups) {
                for (const v of group.variables) {
                    if (v.example) {
                        const firstExample = v.example.split('/')[0].split('→')[0].trim();
                        sampleVars[v.key] = v.type === 'number' ? Number(firstExample) || 0 : firstExample;
                    } else if (v.options && v.options.length > 0) {
                        sampleVars[v.key] = v.options[0];
                    } else {
                        sampleVars[v.key] = v.type === 'number' ? 0 : `[${v.key}]`;
                    }
                }
            }
        }

        const result = await this.fillAndExportPdf(templateName, sampleVars);
        return { ...result, templateName };
    }
}
