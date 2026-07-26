/**
 * Thousands separators for peso amounts shown in PDFs (e.g. 150000 → 150,000; RD$150000 → RD$150,000).
 */

function formatNumericBody(originalCleaned: string, n: number): string {
    const dot = originalCleaned.indexOf('.');
    if (dot === -1) {
        return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    const dec = originalCleaned.slice(dot + 1);
    if (dec.replace(/0/g, '') === '') {
        return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return n.toLocaleString('en-US', {
        minimumFractionDigits: Math.min(dec.length, 2),
        maximumFractionDigits: 2,
    });
}

/** Parse stored peso display (with or without RD$, commas) into a number. */
export function parsePesoAmountToNumber(raw: unknown): number | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    let s = String(raw).trim();
    if (!s) return null;
    s = s.replace(/^[A-Z$€£¥\s]+/i, '').replace(/,/g, '').replace(/\s/g, '');
    if (!/^\d+\.?\d*$/.test(s)) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

export interface FormatDominicanPesoAmountOptions {
    /** When set (e.g. 2), output always shows that many fraction digits (Dominican legal style for table lines). */
    minimumFractionDigits?: number;
}

export function isPlainCurrencyAmountKey(key: string): boolean {
    const k = key.toLowerCase();
    return k === 'salarymonthlyamount' || k === 'salaryamountinnumbers' || k === 'navidadamountinnumbers';
}

/** Format a plain numeric string or value prefixed with RD$ (commas; exactly two decimal places). */
export function formatDominicanPesoAmount(raw: string, keyOrOptions?: string | FormatDominicanPesoAmountOptions): string {
    const s = raw.trim();
    if (!s) return raw;

    let numSection = s;
    const prefixed = s.match(/^(RD\$)\s*(.+)$/i);
    if (prefixed) {
        numSection = prefixed[2]!.trim();
    }

    const cleaned = numSection.replace(/,/g, '').replace(/\s/g, '');
    if (!/^\d+\.?\d*$/.test(cleaned)) return raw;

    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) return raw;

    const formattedBody = n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    const key = typeof keyOrOptions === 'string' ? keyOrOptions : undefined;
    if (key && isPlainCurrencyAmountKey(key)) {
        return formattedBody;
    }
    return `RD$${formattedBody}`;
}

/**
 * Recibo de Descargo Laboral — amounts shown in the breakdown table and matching total should use
 * two decimal places (e.g. RD$15,000.00) per standard Dominican legal formatting.
 */
export function isReciboDescargoLaboralPesoDisplayKey(key: string): boolean {
    const k = key.toLowerCase();
    return (
        k === 'totalamountwithcurrency' ||
        k === 'preavisoamount' ||
        k === 'cesantiaamount' ||
        k === 'navidadamount' ||
        k === 'vacacionesamount' ||
        k === 'additionalconcept1amount' ||
        k === 'additionalconcept2amount'
    );
}

/** Keys persisted as numeric amounts for display (with or without RD$ in the stored string). */
export function isCurrencyDisplayAmountKey(key: string): boolean {
    const k = key.toLowerCase();
    if (k === 'salarymonthlyamount') return true;
    if (k === 'salaryamountinnumbers' || k === 'navidadamountinnumbers') return true;
    const reciboBreakdown = [
        'preavisoamount',
        'cesantiaamount',
        'navidadamount',
        'vacacionesamount',
        'additionalconcept1amount',
        'additionalconcept2amount',
    ];
    if (reciboBreakdown.includes(k)) return true;
    if (k.endsWith('amountwithcurrency')) return true;
    return false;
}
