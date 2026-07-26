/**
 * Dominican legal style for amounts in words: "... pesos dominicanos con 00/100".
 */

const PESO_AMOUNT_IN_WORDS_KEYS = new Set([
    'salaryinwords',
    'totalamountinwords',
    'monthlyamountinwords',
    'referenceamountinwords',
    'navidadamountinwords',
    'salaryamountinwords',
]);

export function isDominicanPesoAmountInWordsKey(key: string): boolean {
    return PESO_AMOUNT_IN_WORDS_KEYS.has(key.toLowerCase());
}

/**
 * Ensure phrase ends with con DD/100; use "pesos dominicanos" before the fraction.
 * Only transforms strings that mention "peso(s)" (currency in words).
 */
export function normalizeDominicanPesoAmountInWords(raw: string): string {
    const s0 = raw.trim().replace(/\s+/g, ' ');
    if (!s0) return raw;
    if (!/\bpesos?\b/i.test(s0)) return raw;

    const stripTrailPunct = s0.replace(/[.,;:!?]+$/g, '').trim();

    const fracEnd = /\bcon\s+(\d{1,2})\s*\/\s*100\s*$/i;
    if (fracEnd.test(stripTrailPunct)) {
        return stripTrailPunct.replace(fracEnd, (_, d: string) => {
            const n = Math.min(99, Math.max(0, parseInt(d, 10)));
            return `con ${String(n).padStart(2, '0')}/100`;
        });
    }

    const s = stripTrailPunct;

    const withDomAtEnd = /^(.+?)\bpesos\s+dominicanos\s*$/i.exec(s);
    if (withDomAtEnd) {
        return `${withDomAtEnd[1]!.trimEnd()} pesos dominicanos con 00/100`;
    }

    const pesosOnlyEnd = /^(.+?)\bpesos\s*$/i.exec(s);
    if (pesosOnlyEnd && !/\bpesos\s+dominicanos\b/i.test(s)) {
        return `${pesosOnlyEnd[1]!.trimEnd()} pesos dominicanos con 00/100`;
    }

    if (/\bpesos\s+dominicanos\b/i.test(s) && !/\bcon\s+\d{1,2}\s*\/\s*100\s*$/i.test(s)) {
        return `${s} con 00/100`;
    }

    return s0;
}
