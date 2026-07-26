/**
 * Contrato de Compraventa Vehículo — structured address completeness for AWLi follow-ups.
 */

export type CompraventaAddressComponent = 'street' | 'sector' | 'city' | 'province' | 'country';

const DR_PROVINCES =
    /\b(distrito nacional|santo domingo|santiago|la vega|san cristóbal|puerto plata|la romana|san pedro de macorís|barahona|azua|peravia|san juan|elías piña|dajabón|monte cristi|espaillat|hermanas mirabal|duarte|samaná|hato mayor|monte plata|sánchez ramírez|monseñor nouel|maría trinidad sánchez|valverde|baoruco|pedernales|independencia|san josé de ocoa)\b/i;

const COUNTRY_MARKERS =
    /\b(república dominicana|republica dominicana|dominican republic|rd\b|usa|estados unidos|united states|españa|spain|méxico|mexico|colombia|venezuela|panamá|panama)\b/i;

const SECTOR_MARKERS =
    /\b(piantini|naco|bella vista|gazcue|ensanche|urbanización|urbanizacion|sector|barrio|residencial|villa|los prados|paraiso|paraíso|cerros|mirador)\b/i;

function hasStreetNumberHint(text: string): boolean {
    return /\b(calle|av\.|avenida|autopista|carretera|no\.|nº|#)\b/i.test(text) || /\d{1,5}/.test(text);
}

/**
 * Returns address components that appear missing from a free-text Dominican-style address.
 */
export function missingCompraventaAddressComponents(address: string): CompraventaAddressComponent[] {
    const t = String(address ?? '').trim();
    if (!t) {
        return ['street', 'sector', 'city', 'province', 'country'];
    }

    const missing: CompraventaAddressComponent[] = [];
    if (!hasStreetNumberHint(t)) missing.push('street');
    if (!SECTOR_MARKERS.test(t) && t.split(',').length < 3) missing.push('sector');
    if (!/,\s*[^,]{2,}/.test(t) && !/\ben\s+[A-ZÁÉÍÓÚ]/i.test(t)) missing.push('city');
    if (!DR_PROVINCES.test(t) && !/\bprovincia\b/i.test(t)) missing.push('province');
    if (!COUNTRY_MARKERS.test(t)) missing.push('country');

    return missing;
}

export function isCompraventaAddressComplete(address: string): boolean {
    return missingCompraventaAddressComponents(address).length === 0;
}

const COMPONENT_LABELS: Record<CompraventaAddressComponent, string> = {
    street: 'calle y número',
    sector: 'sector o urbanización',
    city: 'ciudad o municipio',
    province: 'provincia',
    country: 'país',
};

/** Spanish list of missing parts for AWLi verbatim follow-up. */
export function formatCompraventaAddressMissingPrompt(missing: CompraventaAddressComponent[]): string | null {
    if (missing.length === 0) return null;
    const labels = missing.map((c) => COMPONENT_LABELS[c]);
    const joined =
        labels.length === 1
            ? labels[0]
            : `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
    return `Gracias. Recibido. La dirección parece incompleta; por favor indícame también: ${joined}.\n\nSeguimos cuando quieras.`;
}
