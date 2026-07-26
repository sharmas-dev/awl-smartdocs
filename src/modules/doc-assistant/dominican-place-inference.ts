/**
 * Infer city / province from free-text Dominican addresses (Recibo doméstica signing & notary).
 */
export type DominicanInferredPlace = {
    city: string;
    province: string;
    /** Value for notaryJurisdiction / signingProvince when they differ only by article. */
    jurisdiction: string;
};

const PLACE_ALIASES: Array<{ patterns: RegExp[]; place: DominicanInferredPlace }> = [
    {
        patterns: [/\bd\.?\s*n\.?\b/i, /\bdistrito\s+nacional\b/i],
        place: {
            city: 'Santo Domingo',
            province: 'Distrito Nacional',
            jurisdiction: 'Distrito Nacional',
        },
    },
    {
        patterns: [/\bsanto\s+domingo\b/i],
        place: {
            city: 'Santo Domingo',
            province: 'Distrito Nacional',
            jurisdiction: 'Santo Domingo',
        },
    },
    {
        patterns: [/\bsantiago\b/i],
        place: { city: 'Santiago', province: 'Santiago', jurisdiction: 'Santiago' },
    },
    {
        patterns: [/\bla\s+vega\b/i, /\bvega\b/i],
        place: { city: 'La Vega', province: 'La Vega', jurisdiction: 'La Vega' },
    },
    {
        patterns: [/\bsan\s+crist[oó]bal\b/i],
        place: {
            city: 'San Cristóbal',
            province: 'San Cristóbal',
            jurisdiction: 'San Cristóbal',
        },
    },
    {
        patterns: [/\bpuerto\s+plata\b/i],
        place: {
            city: 'Puerto Plata',
            province: 'Puerto Plata',
            jurisdiction: 'Puerto Plata',
        },
    },
];

export function inferDominicanPlaceFromText(text: string): DominicanInferredPlace | null {
    const t = String(text ?? '').trim();
    if (!t) return null;
    for (const { patterns, place } of PLACE_ALIASES) {
        if (patterns.some((p) => p.test(t))) {
            return place;
        }
    }
    return null;
}
