'use client';

import { useEffect, useState } from 'react';
import { useTheme, useMaxHeight, useWidgetSDK } from '@nitrostack/widgets';
export const dynamic = 'force-dynamic';

interface WidgetData {
    success: boolean;
    duplicatePreviewBlocked?: boolean;
    needsMoreAnswers?: boolean;
    previewGenerated?: boolean;
    pdfPath: string;
    htmlContent?: string;
    /** Signed S3 URL for ephemeral preview HTML (embedded widgets cannot use relative /api/preview). */
    previewHtmlUrl?: string;
    templateName: string;
    message: unknown;
    pendingGroup?: {
        group?: {
            label?: string;
            variables?: Array<{ label?: string }>;
        };
    };
}

/** Hide widget chrome when the tool output has no preview payload (e.g. submit_group_answers mid-flow). */
function shouldShowPdfPreviewWidget(data: WidgetData | null | undefined): boolean {
    if (!data) return false;
    if (data.needsMoreAnswers) return true;
    if (data.duplicatePreviewBlocked) return true;
    if (data.previewHtmlUrl?.trim()) return true;
    if (data.htmlContent?.trim()) return true;
    if (!data.success && data.message != null) return true;
    return false;
}

function formatErrorMessage(msg: unknown): string {
    if (typeof msg === 'string') return msg;
    if (msg instanceof Error) return msg.message;
    if (msg && typeof msg === 'object') {
        if ('message' in msg && typeof (msg as Record<string, unknown>).message === 'string') {
            return (msg as Record<string, unknown>).message as string;
        }
        try { return JSON.stringify(msg); } catch { /* fall through */ }
    }
    return String(msg ?? 'Unknown error');
}

/** Derive template name from tool output (templateName or from pdfPath filename). */
function getTemplateName(data: WidgetData): string | null {
    if (data.templateName) return data.templateName;
    if (data.pdfPath) {
        const base = data.pdfPath.split(/[/\\]/).pop() || '';
        const withoutExt = base.replace(/\.pdf$/i, '');
        return withoutExt || null;
    }
    return null;
}

export default function PdfPreviewWidget() {
    const theme = useTheme();
    const maxHeight = useMaxHeight();
    const { isReady, getToolOutput, sendFollowUpMessage, callTool } = useWidgetSDK();
    const isDark = theme === 'dark';

    const data = getToolOutput<WidgetData>();
    const showWidget = shouldShowPdfPreviewWidget(data);
    const [confirmState, setConfirmState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [confirmError, setConfirmError] = useState<string | null>(null);

    const templateName = data ? getTemplateName(data) : null;
    const previewReady = Boolean(data?.success || data?.duplicatePreviewBlocked);
    const hasPreviewContent = Boolean(data?.htmlContent?.trim() || data?.previewHtmlUrl?.trim());
    const showErrorBanner = Boolean(
        data && !data.success && !data.duplicatePreviewBlocked && !hasPreviewContent && data.message != null,
    );
    const pendingMessage =
        data?.needsMoreAnswers && data?.message
            ? formatErrorMessage(data.message)
            : null;
    const pendingLabels =
        data?.needsMoreAnswers && Array.isArray(data?.pendingGroup?.group?.variables)
            ? data!.pendingGroup!.group!.variables!
                .map((v) => (typeof v?.label === 'string' ? v.label.trim() : ''))
                .filter(Boolean)
                .join(', ')
            : '';

    useEffect(() => {
        setConfirmState('idle');
        setConfirmError(null);
    }, [data?.pdfPath, data?.htmlContent, data?.previewHtmlUrl]);

    const requestDownload = async () => {
        if (confirmState === 'sending') return;
        setConfirmState('sending');
        setConfirmError(null);
        try {
            const resolvedTemplateName = data?.templateName || templateName || '';
            if (!resolvedTemplateName) {
                throw new Error('No se encontró templateName para confirmar la descarga.');
            }
            const confirmArgs: Record<string, unknown> = { templateName: resolvedTemplateName };
            if ((data as { userDocumentId?: unknown } | undefined)?.userDocumentId) {
                confirmArgs.userDocumentId = (data as { userDocumentId?: unknown }).userDocumentId;
            }

            try {
                await callTool('confirm_document', confirmArgs);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                const hostLacksCallTool =
                    /calltool.*not a function/i.test(msg) ||
                    /window\\.openai\\.callTool is not a function/i.test(msg);
                if (!hostLacksCallTool) {
                    throw err;
                }
                await sendFollowUpMessage(
                    'Sí, confirmo. Por favor, genera el PDF final y envíame el enlace de descarga en el chat.'
                );
            }
            setConfirmState('sent');
        } catch (err) {
            setConfirmState('error');
            setConfirmError(err instanceof Error ? err.message : String(err));
        }
    };

    const bg = isDark ? '#0f0f0f' : '#f4f4f5';
    const surface = isDark ? '#1a1a1a' : '#ffffff';
    const border = isDark ? '#2a2a2a' : '#e4e4e7';
    const text = isDark ? '#f4f4f5' : '#18181b';
    const muted = isDark ? '#71717a' : '#71717a';
    const accent = '#2563eb';
    const accentHover = '#1d4ed8';
    const successBg = isDark ? '#052e16' : '#f0fdf4';
    const successBorder = isDark ? '#166534' : '#bbf7d0';
    const successText = isDark ? '#4ade80' : '#15803d';
    const errorBg = isDark ? '#2d0707' : '#fef2f2';
    const errorBorder = isDark ? '#7f1d1d' : '#fecaca';
    const errorText = isDark ? '#f87171' : '#dc2626';

    const containerStyle: React.CSSProperties = {
        background: bg,
        minHeight: '400px',
        maxHeight: maxHeight || '900px',
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
    };

    if (!data || !showWidget) {
        return null;
    }

    const fileName = data.pdfPath ? data.pdfPath.split(/[/\\]/).pop() : 'document.pdf';
    const confirmed = confirmState === 'sent';

    return (
        <div style={containerStyle}>
            <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${border}`,
                background: surface,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexShrink: 0,
            }}>
                <span style={{ fontSize: '20px' }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {data.templateName || 'Document Preview'}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: muted }}>
                        {fileName}
                    </p>
                </div>

                {data.needsMoreAnswers ? (
                    <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                        background: isDark ? '#422006' : '#fffbeb',
                        border: `1px solid ${isDark ? '#92400e' : '#fde68a'}`,
                        color: isDark ? '#fbbf24' : '#92400e',
                    }}>
                        Pendiente
                    </span>
                ) : confirmed ? (
                    <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                        background: successBg, border: `1px solid ${successBorder}`, color: successText,
                    }}>
                        ✓ Confirmado
                    </span>
                ) : data.success || (data.duplicatePreviewBlocked && hasPreviewContent) ? (
                    <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                        background: isDark ? '#1e1b4b' : '#eef2ff',
                        border: `1px solid ${isDark ? '#3730a3' : '#c7d2fe'}`,
                        color: isDark ? '#a5b4fc' : '#4338ca',
                    }}>
                        Vista previa
                    </span>
                ) : (
                    <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                        background: errorBg, border: `1px solid ${errorBorder}`, color: errorText,
                    }}>
                        ✗ Error
                    </span>
                )}
            </div>

            {showErrorBanner && (
                <div style={{
                    margin: '16px 20px', padding: '14px 16px', borderRadius: '10px',
                    background: errorBg, border: `1px solid ${errorBorder}`, color: errorText,
                    fontSize: '14px',
                }}>
                    <strong>Error:</strong> {formatErrorMessage(data.message)}
                </div>
            )}

            {confirmed && (
                <div style={{
                    margin: '12px 20px 0',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 500,
                    background: successBg,
                    border: `1px solid ${successBorder}`,
                    color: successText,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}>
                    <span style={{ flexShrink: 0, fontSize: '18px' }} aria-hidden>✅</span>
                    <span>Documento finalizado. Revisa el chat para descargar el PDF.</span>
                </div>
            )}

            {data.needsMoreAnswers ? (
                <div style={{
                    margin: '16px 20px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    background: isDark ? '#422006' : '#fffbeb',
                    border: `1px solid ${isDark ? '#92400e' : '#fde68a'}`,
                    color: isDark ? '#fbbf24' : '#92400e',
                }}>
                    {pendingMessage ? (
                        <>
                            <strong>Aún no hay vista previa.</strong> {pendingMessage}
                        </>
                    ) : pendingLabels ? (
                        <>
                            <strong>Aún no hay vista previa.</strong> Para continuar, falta completar: {pendingLabels}.
                        </>
                    ) : (
                        <>
                            <strong>Aún no hay vista previa.</strong> Continúa respondiendo en el chat para completar el documento.
                        </>
                    )}
                </div>
            ) : (data.success || (data.duplicatePreviewBlocked && hasPreviewContent)) && !confirmed && (
                <div style={{
                    margin: '12px 20px 0',
                    padding: '14px 16px', borderRadius: '10px',
                    background: isDark ? '#1e1b4b' : '#eef2ff',
                    border: `1px solid ${isDark ? '#3730a3' : '#c7d2fe'}`,
                    color: isDark ? '#a5b4fc' : '#4338ca',
                    display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', lineHeight: 1.45 }}>
                        <span style={{ flexShrink: 0, fontSize: '16px' }} aria-hidden>👁️</span>
                        <span>
                            <strong>Esto es una vista previa.</strong> Revísala con calma.
                            Cuando todo esté correcto, confirma para recibir el enlace de descarga en el chat.
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => { void requestDownload(); }}
                        disabled={confirmState === 'sending'}
                        aria-label="Confirmar y solicitar el PDF descargable"
                        style={{
                            width: '100%',
                            padding: '14px 22px',
                            borderRadius: '10px',
                            fontSize: '15px',
                            fontWeight: 700,
                            background: accent,
                            color: '#fff',
                            cursor: confirmState === 'sending' ? 'default' : 'pointer',
                            border: `2px solid ${accentHover}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            opacity: confirmState === 'sending' ? 0.85 : 1,
                            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                        }}
                        onMouseOver={e => {
                            if (confirmState !== 'sending') {
                                e.currentTarget.style.background = accentHover;
                            }
                        }}
                        onMouseOut={e => {
                            if (confirmState !== 'sending') {
                                e.currentTarget.style.background = accent;
                            }
                        }}
                    >
                        {confirmState === 'sending' ? (
                            <>Generando PDF final…</>
                        ) : confirmState === 'error' ? (
                            <>Reintentar confirmación</>
                        ) : (
                            <>
                                <span style={{ fontSize: '18px', lineHeight: 1 }} aria-hidden>✓</span>
                                Confirmar y descargar PDF
                            </>
                        )}
                    </button>
                    {confirmState === 'error' && confirmError && (
                        <p style={{
                            margin: 0, fontSize: '12px',
                            color: errorText,
                        }}>
                            No pudimos confirmar automáticamente: {confirmError}.
                            Escribe <strong>“confirmo, descargar”</strong> en el chat para continuar.
                        </p>
                    )}
                </div>
            )}

            {previewReady && !data.needsMoreAnswers && hasPreviewContent ? (
                <div style={{
                    flex: 1,
                    margin: '12px 20px 20px',
                    border: `1px solid ${border}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    background: '#fff',
                    boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.5)' : '0 2px 12px rgba(0,0,0,0.08)',
                }}>
                    <div style={{
                        padding: '8px 14px',
                        background: isDark ? '#27272a' : '#f9fafb',
                        borderBottom: `1px solid ${border}`,
                        display: 'flex', alignItems: 'center', gap: '8px',
                    }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {['#ef4444', '#f59e0b', '#22c55e'].map(c => (
                                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                            ))}
                        </div>
                        <span style={{ fontSize: '11px', color: muted }}>Document Preview</span>
                    </div>

                    <iframe
                        src={data?.previewHtmlUrl || undefined}
                        srcDoc={data?.htmlContent || undefined}
                        style={{
                            width: '100%',
                            height: '580px',
                            border: 'none',
                            display: 'block',
                            background: '#fff',
                        }}
                        title="Document Preview"
                        sandbox="allow-same-origin"
                    />
                </div>
            ) : previewReady && !data.needsMoreAnswers ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                    <p style={{ color: muted, fontSize: '14px' }}>
                        No preview available. Regenerate the document preview (generate_pdf) after configuring S3 preview storage.
                    </p>
                </div>
            ) : null}
        </div>
    );
}
