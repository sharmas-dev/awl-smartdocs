/**
 * Contrato de Teletrabajo — detect contradictory re-submissions before merge.
 */

export const TELETRABAJO_CONFLICT_WATCH_KEYS = [
    'employeeIdNumber',
    'employeeAddressStreet',
    'employeeAddressCity',
    'salaryAmountWithCurrency',
    'salaryInWords',
    'employerFullAddressStreet',
    'employerLegalName',
] as const;

export type TeletrabajoValueConflict = {
    key: string;
    label: string;
    previous: string;
    next: string;
};

const KEY_LABELS: Record<string, string> = {
    employeeIdNumber: 'número de documento del trabajador',
    employeeAddressStreet: 'calle del domicilio del trabajador',
    employeeAddressCity: 'ciudad del domicilio del trabajador',
    salaryAmountWithCurrency: 'salario en números',
    salaryInWords: 'salario en letras',
    employerFullAddressStreet: 'dirección del empleador',
    employerLegalName: 'nombre legal del empleador',
};

function foldCompare(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[\s,.$]/g, '');
}

function normalizeIdForCompare(key: string, value: string): string {
    const folded = foldCompare(value);
    if (/idnumber|idnum/i.test(key)) {
        return folded.replace(/-/g, '');
    }
    return folded;
}

function materiallyDifferent(key: string, a: string, b: string): boolean {
    const fa = normalizeIdForCompare(key, a);
    const fb = normalizeIdForCompare(key, b);
    if (!fa || !fb) return false;
    if (fa === fb) return false;
    if (fa.includes(fb) || fb.includes(fa)) return false;
    return true;
}

export function detectContratoTeletrabajoConflicts(
    sessionVars: Record<string, string | number>,
    incoming: Record<string, string | number>,
): TeletrabajoValueConflict | null {
    for (const key of TELETRABAJO_CONFLICT_WATCH_KEYS) {
        const prev = String(sessionVars[key] ?? '').trim();
        const nextRaw = incoming[key];
        if (nextRaw === undefined || nextRaw === null) continue;
        const next = String(nextRaw).trim();
        if (!prev || !next) continue;
        if (materiallyDifferent(key, prev, next)) {
            return {
                key,
                label: KEY_LABELS[key] ?? key,
                previous: prev,
                next,
            };
        }
    }
    return null;
}

export function stripConflictingTeletrabajoKeys(
    incoming: Record<string, string | number>,
    conflict: TeletrabajoValueConflict,
): Record<string, string | number> {
    const out = { ...incoming };
    delete out[conflict.key];
    if (conflict.key === 'salaryAmountWithCurrency') delete out.salaryInWords;
    if (conflict.key === 'salaryInWords') delete out.salaryAmountWithCurrency;
    return out;
}

export function buildContratoTeletrabajoConflictInstruction(conflict: TeletrabajoValueConflict): string {
    return (
        `CONFLICTO DE DATOS — No guardé el nuevo valor para ${conflict.label}. ` +
        `Antes teníamos «${conflict.previous}» y ahora indicas «${conflict.next}». ` +
        `Tu mensaje al usuario DEBE ser en español: reconoce ambos valores y pregunta cuál es el correcto antes de continuar. ` +
        `Cuando el usuario confirme, llama submit_group_answers de nuevo solo con el valor elegido para esa variable.`
    );
}
