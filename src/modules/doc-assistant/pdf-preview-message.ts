/**
 * Spanish copy for the document completion / preview / download chat flow.
 *
 * Flow:
 * 1) ALL_COMPLETE — when every schema group is submitted (before preview).
 * 2) PREVIEW_READY — after generate_pdf or update_variable shows the widget (short; no duplicate of step 1).
 * 3) confirm_document — chat-only markdown download link + POST_DOWNLOAD (no widget download UI).
 */

/** Shown when submit_group_answers returns { allComplete: true } (before generating the preview). */
export const ALL_COMPLETE_CHAT_MESSAGE = `Con esto completamos la información que necesitamos para tu documento legal. A continuación podrás ver el borrador del documento legal completado. Favor revisa el mismo con detenimiento, recordando que en el próximo paso una vez hagas clic en Descargar, no podrás hacer modificaciones adicionales.

Si quieres hacer algún ajuste, indícame para proceder.`;

/** After generate_pdf / update_variable success — preview is in the widget; keep this brief (do not repeat ALL_COMPLETE). */
export const PREVIEW_READY_CHAT_MESSAGE = `Listo, ya puedes revisar el borrador del documento arriba. Si quieres cambiar algo, dímelo antes de descargar.`;

/**
 * Separate message: only after the user has seen the preview and expresses that they want to download.
 * Send this **before** confirm_document (see system prompt STEP 5). Do not bundle with ALL_COMPLETE or PREVIEW_READY.
 */
export const DOWNLOAD_CTA_CHAT_MESSAGE = `Ahora sí. ¿Ya estás listo para descargar? Haz clic en Descargar. Vas a recibir el documento en PDF por aquí y también en tu correo electrónico.`;

/** @deprecated Use PREVIEW_READY_CHAT_MESSAGE — alias kept for any external imports. */
export const PDF_PREVIEW_CHAT_MESSAGE = PREVIEW_READY_CHAT_MESSAGE;

/** Shown in chat after confirm_document succeeds (download link + this closing copy). */
export const POST_DOWNLOAD_CHAT_MESSAGE = `Gracias por permitirnos apoyarte. Con esto hemos concluido esta asistencia legal. A través de tu portal, podrás acceder a este documento y a todos los otros que esperamos poder trabajar contigo. Te invitamos a conocer nuestros servicios legales a través de nuestra página web: https://awl.com.do/

¡Huu, huu! 🦉`;

/** Opening line with markdown download link (Spanish only). */
export function formatConfirmDownloadLinkLine(templateDisplayName: string, downloadUrl: string): string {
    return `¡Tu documento está listo! Haz clic aquí para descargarlo: [Descargar ${templateDisplayName}](${downloadUrl})`;
}

/** Full assistant message after confirm — Spanish, chat-only (no widget download UI). */
export function buildConfirmDownloadChatMessage(templateDisplayName: string, downloadUrl: string): string {
    return `${formatConfirmDownloadLinkLine(templateDisplayName, downloadUrl)}\n\n${POST_DOWNLOAD_CHAT_MESSAGE}`;
}
