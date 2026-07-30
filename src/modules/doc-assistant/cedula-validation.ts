import { formatDominicanCedula11, formatDominicanRnc9 } from './id-presentation-format.js';

export type CedulaNormalizeReason = 'empty' | 'wrong_length' | 'invalid_placeholder';

export type CedulaNormalizeResult =
    | { ok: true; formatted: string; reason?: never }
    | { ok: false; digits: string; reason: CedulaNormalizeReason };

export type CedulaValidationError = {
    key: string;
    digitCount: number;
    message: string;
};

function foldAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

/** Variable holds an identification number (not tipo de documento / composite blocks). */
export function isIdNumberVariableKey(key: string): boolean {
    const k = key.toLowerCase();
    if (/(nationality|nacionalidad|chasis|matr[ií]cula|employeridblock)/i.test(k)) return false;
    if (/idtype/i.test(k)) return false;
    return (/idnumber|idnumbers|idnum/i.test(k) || /cedula/i.test(k)) && !/block/i.test(k);
}

/** Schema / user label indicates pasaporte — do not apply cédula digit rules. */
export function isPassportIdTypeLabel(idType: string): boolean {
    const f = foldAscii(idType);
    if (!f) return false;
    if (/pasaport/i.test(f) && !/c[eé]dula|electoral|identidad/i.test(f)) return true;
    return f === 'pasaporte' || f === 'el pasaporte' || f === 'del pasaporte';
}

/** Cédula (not pasaporte-only); includes "Cédula", "de la Cédula…", etc. */
export function isCedulaIdTypeLabel(idType: string): boolean {
    if (isPassportIdTypeLabel(idType)) return false;
    const f = foldAscii(idType);
    return /c[eé]dula|electoral|identidad/i.test(f) || f === 'cedula';
}

/** RNC (Registro Nacional de Contribuyentes) label */
export function isRncIdTypeLabel(idType: string): boolean {
    const f = foldAscii(idType);
    return /rnc|registro\s+nacional\s+de\s+contribuyentes/i.test(f);
}

/**
 * True for RNC *number* fields (employerRnc, sellerRnc, companyRnc, …).
 * Excludes Yes/No flags that merely mention RNC (HasDominicanRnc, IncludeRnc*).
 */
export function isRncVariableKey(key: string): boolean {
    const k = key.toLowerCase();
    if (/hasdominicanrnc$|includernc/i.test(k)) return false;
    return /rnc$/i.test(k);
}

/** Both documents in one tipo (Declaración Jurada) — free-text number field. */
export function isCombinedCedulaAndPassportIdType(idType: string): boolean {
    const f = foldAscii(idType);
    return /c[eé]dula|electoral/i.test(f) && /pasaport/i.test(f);
}

/** Pair *IdNumber / *IdNumbers with sibling *IdType when present. */
export function pairedIdTypeKey(numberKey: string): string | null {
    if (/idnumbers$/i.test(numberKey)) {
        return numberKey.replace(/numbers$/i, 'Type');
    }
    if (/idnumber$/i.test(numberKey)) {
        return numberKey.replace(/number$/i, 'Type');
    }
    return null;
}

export function extractCedulaDigits(raw: string): string {
    return String(raw ?? '').replace(/\D/g, '');
}

/** Normalize user input to XXX-XXXXXXX-X when exactly 11 digits; otherwise invalid. */
export function normalizeCedulaNumberInput(raw: string): CedulaNormalizeResult {
    const digits = extractCedulaDigits(raw);
    if (!digits) return { ok: false, digits: '', reason: 'empty' };
    if (digits.length !== 11) return { ok: false, digits, reason: 'wrong_length' };
    if (/^0{11}$/.test(digits) || /^.{3}0{7}.$/.test(digits)) {
        return { ok: false, digits, reason: 'invalid_placeholder' };
    }
    return { ok: true, formatted: formatDominicanCedula11(digits) };
}

/** True when the stored value satisfies 11-digit cédula rules (or field is not a cédula number). */
export function isCedulaFieldValueValid(
    numberKey: string,
    rawValue: string,
    idType: string | undefined,
): boolean {
    if (!shouldApplyCedulaDigitValidation(numberKey, idType, rawValue)) return true;
    return normalizeCedulaNumberInput(rawValue).ok;
}

export function cedulaValidationErrorMessage(digitCount: number, reason?: CedulaNormalizeResult['reason']): string {
    if (reason === 'invalid_placeholder') {
        return 'La cédula proporcionada no es válida; verifique que no sea un valor de ejemplo como 001-0000000-0.';
    }
    if (digitCount === 0) {
        return 'La cédula debe tener exactamente 11 dígitos (formato XXX-XXXXXXX-X).';
    }
    return `La cédula debe tener exactamente 11 dígitos (formato XXX-XXXXXXX-X); recibí ${digitCount}.`;
}

/**
 * Whether this field must be validated as an 11-digit Dominican cédula.
 * Defaults to cédula when tipo is unknown and the value is mostly numeric.
 */
export function shouldApplyCedulaDigitValidation(
    numberKey: string,
    idType: string | undefined,
    rawValue: string,
): boolean {
    if (!isIdNumberVariableKey(numberKey)) return false;
    const type = (idType ?? '').trim();
    if (type && isPassportIdTypeLabel(type)) return false;
    if (type && isCombinedCedulaAndPassportIdType(type)) return false;
    if (type && isRncIdTypeLabel(type)) return false;
    if (type && isCedulaIdTypeLabel(type)) return true;
    if (!type) {
        const digits = extractCedulaDigits(rawValue);
        if (digits.length === 0) return false;
        if (digits.length === 9) return false;
        return /^\d[\d\s.\-/]*$/.test(rawValue.trim());
    }
    return false;
}

export function shouldApplyRncDigitValidation(
    numberKey: string,
    idType: string | undefined,
    rawValue: string,
): boolean {
    if (isRncVariableKey(numberKey)) return true;
    const type = (idType ?? '').trim();
    if (type && isRncIdTypeLabel(type)) return true;
    if (!type && isIdNumberVariableKey(numberKey)) {
        const digits = extractCedulaDigits(rawValue);
        return digits.length === 9;
    }
    return false;
}

export type RncNormalizeReason = 'empty' | 'wrong_length' | 'invalid_placeholder' | 'invalid_characters';

export type RncNormalizeResult =
    | { ok: true; formatted: string; reason?: never }
    | { ok: false; digits: string; reason: RncNormalizeReason };

export function normalizeRncNumberInput(raw: string): RncNormalizeResult {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return { ok: false, digits: '', reason: 'empty' };
    // Digits + common separators only — reject letters/junk (e.g. 102234543D)
    if (!/^[\d\s.\-/]+$/.test(trimmed)) {
        return { ok: false, digits: extractCedulaDigits(trimmed), reason: 'invalid_characters' };
    }
    const digits = extractCedulaDigits(trimmed);
    if (!digits) return { ok: false, digits: '', reason: 'empty' };
    if (digits.length !== 9) return { ok: false, digits, reason: 'wrong_length' };
    if (/^0{9}$/.test(digits)) {
        return { ok: false, digits, reason: 'invalid_placeholder' };
    }
    return { ok: true, formatted: formatDominicanRnc9(digits) };
}

export function rncValidationErrorMessage(digitCount: number, reason?: RncNormalizeResult['reason']): string {
    if (reason === 'invalid_placeholder') {
        return 'El RNC proporcionado no es válido; verifique que no sea un valor de ejemplo como 000-00000-0.';
    }
    if (reason === 'invalid_characters') {
        return 'El RNC solo puede contener dígitos (formato XXX-XXXXX-X); no se permiten letras ni otros caracteres.';
    }
    if (digitCount === 0) {
        return 'El RNC debe tener exactamente 9 dígitos (formato XXX-XXXXX-X).';
    }
    return `El RNC debe tener exactamente 9 dígitos (formato XXX-XXXXX-X); recibí ${digitCount}.`;
}

/** User message is mostly digits (standalone cédula reply). */
export function looksLikeDominicanCedulaAttempt(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const digits = extractCedulaDigits(trimmed);
    if (digits.length < 8 || digits.length > 13) return false;
    return digits.length >= trimmed.replace(/\D/g, '').length;
}

/**
 * Validate a short userMessage that is only (or mostly) a cédula/RNC attempt,
 * against pending id-number fields in the active group.
 */
export function detectCedulaValidationErrorsFromUserMessage(
    userMessage: string,
    groupVariables: Array<{ key: string; label: string }>,
    contextVars: Record<string, string | number>,
    explicitAnswers: Record<string, string | number> = {},
): CedulaValidationError[] {
    const msg = userMessage.trim();
    if (!msg || !looksLikeDominicanCedulaAttempt(msg)) return [];

    const errors: CedulaValidationError[] = [];
    for (const v of groupVariables) {
        if (!isIdNumberVariableKey(v.key) && !isRncVariableKey(v.key)) continue;
        const typeKey = pairedIdTypeKey(v.key);
        const idType = typeKey
            ? String(explicitAnswers[typeKey] ?? contextVars[typeKey] ?? '').trim()
            : '';

        if (shouldApplyRncDigitValidation(v.key, idType, msg)) {
            const result = normalizeRncNumberInput(msg);
            if (!result.ok) {
                errors.push({
                    key: v.key,
                    digitCount: result.digits.length,
                    message: rncValidationErrorMessage(result.digits.length, result.reason),
                });
            }
        } else if (shouldApplyCedulaDigitValidation(v.key, idType, msg)) {
            const result = normalizeCedulaNumberInput(msg);
            if (!result.ok) {
                errors.push({
                    key: v.key,
                    digitCount: result.digits.length,
                    message: cedulaValidationErrorMessage(result.digits.length, result.reason),
                });
            }
        }
    }
    return errors;
}

/** Scan all session variables for id/RNC numbers that fail their respective rules. */
export function getInvalidCedulaFieldsInVariables(
    variables: Record<string, string | number>,
): CedulaValidationError[] {
    const errors: CedulaValidationError[] = [];
    for (const [key, val] of Object.entries(variables)) {
        if (typeof val !== 'string' && typeof val !== 'number') continue;
        const raw = String(val).trim();
        if (!raw) continue;
        const typeKey = pairedIdTypeKey(key);
        const idType = typeKey ? String(variables[typeKey] ?? '').trim() : '';

        if (shouldApplyRncDigitValidation(key, idType, raw)) {
            const result = normalizeRncNumberInput(raw);
            if (!result.ok) {
                errors.push({
                    key,
                    digitCount: result.digits.length,
                    message: rncValidationErrorMessage(result.digits.length, result.reason),
                });
            }
        } else if (shouldApplyCedulaDigitValidation(key, idType, raw)) {
            const result = normalizeCedulaNumberInput(raw);
            if (!result.ok) {
                errors.push({
                    key,
                    digitCount: result.digits.length,
                    message: cedulaValidationErrorMessage(result.digits.length, result.reason),
                });
            }
        }
    }
    return errors;
}

/**
 * Format cédula/RNC answers before persist; collect keys that fail the rules.
 */
export function validateAndNormalizeCedulaAnswers(
    answers: Record<string, string | number>,
    contextVars: Record<string, string | number> = {},
): {
    normalized: Record<string, string | number>;
    rejected: CedulaValidationError[];
} {
    const normalized: Record<string, string | number> = { ...answers };
    const rejected: CedulaValidationError[] = [];

    for (const [key, val] of Object.entries(answers)) {
        if (typeof val !== 'string' && typeof val !== 'number') continue;
        const raw = String(val).trim();
        if (!raw) continue;

        const typeKey = pairedIdTypeKey(key);
        const idType = typeKey
            ? String(normalized[typeKey] ?? contextVars[typeKey] ?? answers[typeKey] ?? '').trim()
            : '';

        if (shouldApplyRncDigitValidation(key, idType, raw)) {
            const result = normalizeRncNumberInput(raw);
            if (result.ok) {
                if (result.formatted !== raw) normalized[key] = result.formatted;
            } else {
                rejected.push({
                    key,
                    digitCount: result.digits.length,
                    message: rncValidationErrorMessage(result.digits.length, result.reason),
                });
                delete normalized[key];
            }
        } else if (shouldApplyCedulaDigitValidation(key, idType, raw)) {
            const result = normalizeCedulaNumberInput(raw);
            if (result.ok) {
                if (result.formatted !== raw) normalized[key] = result.formatted;
            } else {
                rejected.push({
                    key,
                    digitCount: result.digits.length,
                    message: cedulaValidationErrorMessage(result.digits.length, result.reason),
                });
                delete normalized[key];
            }
        }
    }

    return { normalized, rejected };
}
