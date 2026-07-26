import { ALL_COMPLETE_CHAT_MESSAGE } from './pdf-preview-message.js';
import { isDomesticContractTemplate } from './domestic-salary-format.js';

/**
 * Submit pre-warm for Contrato de Trabajadora Doméstica must not mark preview active;
 * generate_pdf in the same turn should run the normal success path (inline HTML for widget).
 */
export function shouldDeferDomesticPreviewSessionFlags(logTag: string, templateName: string): boolean {
    return logTag === 'submit_group_answers';
}

/** Tool result shape from runPdfPreviewForSession — widget-ready when true. */
export function isPdfPreviewWidgetReady(preview: Record<string, unknown>): boolean {
    if (preview.success === true) return true;
    if (preview.duplicatePreviewBlocked === true) {
        return Boolean(preview.previewHtmlUrl || preview.htmlContent);
    }
    return false;
}

/**
 * Whether the pdf-preview widget should render for a tool output.
 * Prevents empty chrome when a tool returns success: true without preview payload.
 */
export function shouldShowPdfPreviewWidget(data: Record<string, unknown> | null | undefined): boolean {
    if (!data) return false;
    if (data.needsMoreAnswers === true) return true;
    if (data.duplicatePreviewBlocked === true) return true;
    if (typeof data.previewHtmlUrl === 'string' && data.previewHtmlUrl.trim()) return true;
    if (typeof data.htmlContent === 'string' && data.htmlContent.trim()) return true;
    if (data.success === false && data.message != null) return true;
    return false;
}

export type DomesticAllCompleteBase = {
    totalCollected: number;
    templateName: string;
    userDocumentId: string;
};

/**
 * Contrato de Trabajadora Doméstica allComplete after server-side preview prep.
 * Widget is shown by generate_pdf in the same assistant turn (not on submit_group_answers).
 */
export function buildDomesticAllCompleteWithAutoPreview(
    base: DomesticAllCompleteBase,
    preview: Record<string, unknown>,
): Record<string, unknown> {
    const purchaseOpt = base.userDocumentId;
    const templateName = base.templateName;
    return {
        success: true,
        allComplete: true,
        previewGenerated: true,
        totalCollected: base.totalCollected,
        templateName,
        userDocumentId: purchaseOpt,
        assistantChatMessage: ALL_COMPLETE_CHAT_MESSAGE,
        message: preview.message,
        instruction:
            `Your assistant message "content" for this turn MUST be non-empty Spanish text. ALL GROUPS ARE DONE; the PDF preview is prepared server-side but the widget only appears after generate_pdf. ` +
            `Reply IN SPANISH with ONLY the following text (no paraphrase, no prefix, no suffix):\n\n${ALL_COMPLETE_CHAT_MESSAGE}\n\n` +
            `Then IMMEDIATELY in the SAME assistant turn call generate_pdf with templateName="${templateName}" and userDocumentId="${purchaseOpt}" — do NOT wait for the user to confirm. ` +
            `The preview is already validated server-side; generate_pdf will surface it in the widget with inline HTML. ` +
            `FORBIDDEN: asking the user to confirm before generate_pdf; ending the turn without calling generate_pdf. ` +
            `If the user wants changes later, use update_variable. On final download confirmation, call confirm_document per system prompt STEP 5.`,
    };
}

export function buildDomesticAllCompletePreviewFailedInstruction(
    preview: Record<string, unknown>,
    purchaseId: string,
): string {
    const extra =
        typeof preview.instruction === 'string' && preview.instruction.trim()
            ? `\n\n${preview.instruction}`
            : '';
    return (
        `Your assistant message "content" for this turn MUST be non-empty Spanish text. ALL GROUPS ARE DONE but the PDF preview could not be generated automatically. ` +
        `Reply IN SPANISH with ONLY the following text:\n\n${ALL_COMPLETE_CHAT_MESSAGE}\n\n` +
        `Then help the user fix any missing data if needed and call generate_pdf with templateName and userDocumentId="${purchaseId}".${extra}`
    );
}
