import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_COMPLETE_CHAT_MESSAGE } from './pdf-preview-message.js';
import {
    buildDomesticAllCompletePreviewFailedInstruction,
    buildDomesticAllCompleteWithAutoPreview,
    isPdfPreviewWidgetReady,
    shouldDeferDomesticPreviewSessionFlags,
    shouldShowPdfPreviewWidget,
} from './domestic-auto-preview-on-complete.js';
import { isDomesticContractTemplate } from './domestic-salary-format.js';

describe('domestic auto-preview on complete', () => {
    it('isPdfPreviewWidgetReady accepts success or duplicate with URL', () => {
        assert.equal(isPdfPreviewWidgetReady({ success: true, htmlContent: '<html></html>' }), true);
        assert.equal(
            isPdfPreviewWidgetReady({
                success: false,
                duplicatePreviewBlocked: true,
                previewHtmlUrl: 'https://example.com/preview.html',
            }),
            true,
        );
        assert.equal(isPdfPreviewWidgetReady({ success: false }), false);
    });

    it('shouldDeferDomesticPreviewSessionFlags only for submit pre-warm across all templates', () => {
        assert.equal(
            shouldDeferDomesticPreviewSessionFlags('submit_group_answers', 'Contrato de Trabajadora Doméstica'),
            true,
        );
        assert.equal(shouldDeferDomesticPreviewSessionFlags('generate_pdf', 'Contrato de Trabajadora Doméstica'), false);
        assert.equal(shouldDeferDomesticPreviewSessionFlags('submit_group_answers', 'Recibo de Descargo Laboral'), true);
    });

    it('shouldShowPdfPreviewWidget hides bare submit_group_answers success', () => {
        assert.equal(shouldShowPdfPreviewWidget({ success: true, pdfPath: '', templateName: 'Contrato de Trabajadora Doméstica' }), false);
        assert.equal(shouldShowPdfPreviewWidget({ success: true, allComplete: true, previewGenerated: true }), false);
        assert.equal(
            shouldShowPdfPreviewWidget({
                success: true,
                htmlContent: '<html></html>',
                pdfPath: '/tmp/x.pdf',
                templateName: 'Contrato de Trabajadora Doméstica',
            }),
            true,
        );
        assert.equal(
            shouldShowPdfPreviewWidget({
                success: true,
                duplicatePreviewBlocked: true,
                htmlContent: '<html>cached</html>',
                pdfPath: '/tmp/x.pdf',
                templateName: 'Contrato de Trabajadora Doméstica',
            }),
            true,
        );
        assert.equal(
            shouldShowPdfPreviewWidget({
                success: false,
                duplicatePreviewBlocked: true,
                previewHtmlUrl: 'https://example.com/p.html',
                pdfPath: '',
                templateName: 'Contrato de Trabajadora Doméstica',
            }),
            true,
        );
    });

    it('domestic hydrated duplicate uses success with inline html', () => {
        const domesticDuplicate = {
            success: true,
            duplicatePreviewBlocked: true,
            htmlContent: '<html>contract</html>',
            templateName: 'Contrato de Trabajadora Doméstica',
        };
        assert.equal(domesticDuplicate.success, true);
        assert.ok(domesticDuplicate.htmlContent.length > 0);
    });

    it('buildDomesticAllCompleteWithAutoPreview requires same-turn generate_pdf', () => {
        const out = buildDomesticAllCompleteWithAutoPreview(
            {
                totalCollected: 42,
                templateName: 'Contrato de Trabajadora Doméstica',
                userDocumentId: '507f1f77bcf86cd799439011',
            },
            {
                success: true,
                pdfPath: '/tmp/x.pdf',
                htmlContent: '<html>draft</html>',
                message: 'ok',
            },
        );
        assert.equal(out.previewGenerated, true);
        assert.equal(out.allComplete, true);
        assert.equal(out.assistantChatMessage, ALL_COMPLETE_CHAT_MESSAGE);
        assert.equal('htmlContent' in out, false);
        assert.match(String(out.instruction), /IMMEDIATELY.*generate_pdf/i);
        assert.match(String(out.instruction), /SAME assistant turn/i);
        assert.match(String(out.instruction), /FORBIDDEN.*without calling generate_pdf/i);
    });

    it('buildDomesticAllCompletePreviewFailedInstruction keeps ALL_COMPLETE text', () => {
        const instruction = buildDomesticAllCompletePreviewFailedInstruction(
            { message: 'missing fields' },
            '507f1f77bcf86cd799439011',
        );
        assert.match(instruction, /ALL GROUPS ARE DONE/);
        assert.ok(instruction.includes(ALL_COMPLETE_CHAT_MESSAGE));
        assert.match(instruction, /generate_pdf/);
    });

    it('isDomesticContractTemplate matches only domestic contract', () => {
        assert.equal(isDomesticContractTemplate('Contrato de Trabajadora Doméstica'), true);
        assert.equal(isDomesticContractTemplate('Recibo de Descargo Laboral'), false);
        assert.equal(isDomesticContractTemplate('Recibo de Descargo Trabajadora Doméstica'), false);
        assert.equal(isDomesticContractTemplate('Contrato de Compraventa Vehículo'), false);
    });

    it('auto-preview gate: only domestic contract template', () => {
        const shouldAutoPreview = (templateName: string) => isDomesticContractTemplate(templateName);
        assert.equal(shouldAutoPreview('Contrato de Trabajadora Doméstica'), true);
        assert.equal(shouldAutoPreview('Recibo de Descargo Trabajadora Doméstica'), false);
        assert.equal(shouldAutoPreview('Recibo de Descargo Laboral'), false);
    });

    it('Recibo notary allComplete response shape has no previewGenerated', () => {
        const reciboNotaryAllComplete = {
            success: true,
            allComplete: true,
            requireNotaryConfirmationBeforePreview: true,
            notaryJurisdictionChatMessage: '¿Confirmas la jurisdicción?',
            totalCollected: 10,
        };
        assert.equal('previewGenerated' in reciboNotaryAllComplete, false);
        assert.equal(reciboNotaryAllComplete.requireNotaryConfirmationBeforePreview, true);
    });

    it('generic allComplete response shape has no previewGenerated', () => {
        const genericAllComplete = {
            success: true,
            allComplete: true,
            totalCollected: 10,
            templateName: 'Recibo de Descargo Laboral',
        };
        assert.equal('previewGenerated' in genericAllComplete, false);
    });
});
