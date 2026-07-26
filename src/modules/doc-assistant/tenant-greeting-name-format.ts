const TERMINATION_NOTICE_TEMPLATE_NAME = 'notificación de terminación contrato de alquiler';

function fold(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

export function isTerminationNoticeTemplate(templateName: string): boolean {
    return fold(templateName) === fold(TERMINATION_NOTICE_TEMPLATE_NAME);
}

function normalizeWhitespace(s: string): string {
    return s.trim().replace(/\s+/g, ' ');
}

/**
 * Derive a greeting surname from full name when the UI did not provide
 * `tenantLastName` separately.
 *
 * Examples:
 * - "María López Rodríguez" -> "López"
 * - "Juan Pérez" -> "Pérez"
 * - "María José López Rodríguez" -> "López"
 */
function deriveGreetingLastName(fullName: string): string {
    const cleaned = normalizeWhitespace(fullName);
    if (!cleaned) return '';
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0] ?? '';
    if (parts.length === 2) return parts[1] ?? '';
    return parts[parts.length - 2] ?? '';
}

export function fillTenantGreetingLastName(vars: Record<string, string | number>): boolean {
    const existing = vars.tenantLastName;
    const hasExisting = typeof existing === 'string' && existing.trim().length > 0;
    if (hasExisting) return false;

    const fullName = vars.tenantFullName;
    if (typeof fullName !== 'string' || !fullName.trim()) return false;

    const derived = deriveGreetingLastName(fullName);
    if (!derived) return false;

    vars.tenantLastName = derived;
    return true;
}
