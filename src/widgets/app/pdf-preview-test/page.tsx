'use client';

/**
 * Local test page for the pdf-preview widget.
 * Visit http://localhost:3001/pdf-preview-test to preview the widget without NitroStudio.
 *
 * It fetches the saved HTML from /api/preview, injects it into window.openai
 * (the same object the SDK reads), then renders the real widget component.
 */

import { useEffect, useState } from 'react';
import PdfPreviewWidget from '../pdf-preview/page';
import { getPreviewFetchUrl } from '../../lib/get-preview-fetch-url';

const TEMPLATE_NAME = 'Acuerdo de Confidencialidad y No-Elusión';

export default function PdfPreviewTestPage() {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const pdfPath = `/Users/vc/Downloads/doc-assistant-mcp/templates/output/${TEMPLATE_NAME}.pdf`;

        fetch(getPreviewFetchUrl(TEMPLATE_NAME))
            .then(async r => {
                if (!r.ok) {
                    const body = await r.text();
                    throw new Error(body);
                }
                return r.text();
            })
            .then(htmlContent => {
                // Inject mock window.openai so the widget SDK is satisfied
                (window as any).openai = {
                    toolOutput: {
                        success: true,
                        pdfPath,
                        htmlContent,
                        templateName: TEMPLATE_NAME,
                        message: 'PDF ready. Preview shown in the widget.',
                    },
                    toolInput: {},
                    theme: 'dark',
                    maxHeight: 900,
                    displayMode: 'inline',
                    // openExternal opens the URL in the system browser
                    openExternal: ({ href }: { href: string }) => {
                        window.open(href, '_blank');
                    },
                    callTool: async () => {},
                    setWidgetState: async () => {},
                    requestDisplayMode: async () => {},
                    requestClose: () => {},
                    sendFollowUpMessage: async () => {},
                };
                // Fire the ready event — the useWidgetSDK hook listens for this
                window.dispatchEvent(new Event('openai:ready'));
                setReady(true);
            })
            .catch(err => setError(String(err)));
    }, []);

    if (error) {
        return (
            <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#dc2626' }}>
                <strong>Test page error:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{error}</pre>
                <p style={{ marginTop: 16, color: '#555' }}>
                    Make sure you ran <code>fill_document_and_export_pdf</code> first
                    to generate <code>templates/output/{TEMPLATE_NAME}.html</code>
                </p>
            </div>
        );
    }

    if (!ready) {
        return (
            <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#888' }}>
                Loading preview data…
            </div>
        );
    }

    return <PdfPreviewWidget />;
}
