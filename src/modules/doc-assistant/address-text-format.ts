/**
 * Title-case human-entered address lines (cities, streets, provinces) for PDF output.
 * Each whitespace-separated word: first letter upper, following letters lower (Unicode-aware).
 */

/** Keys that look like postal / location text (not emails, URLs, IDs, phones). */
export function isAddressLikeVariableKey(key: string): boolean {
    const k = key.toLowerCase();
    if (
        /(email|url|website|phone|tel|fax|rnc|ncf|nationality|nacionalidad|idtype|idnumber|cedula|c[eé]dula|pasaport|iban|account|cuenta|horario|hours|reference|capacity|method|notification|matr[ií]cula)/i.test(
            k,
        )
    ) {
        return false;
    }
    if (k.includes('address') || k.includes('domicilio')) return true;
    if (k === 'city' || k.endsWith('city')) return true;
    if (k === 'province' || k.endsWith('province') || k.endsWith('provincestate')) return true;
    if (k.includes('municipality') || k.includes('municipio') || k.includes('barrio') || k.includes('borough')) return true;
    if (k.includes('postal') || k.includes('zipcode') || k.endsWith('zip')) return true;
    if (k.endsWith('country') || k.includes('country')) return true;
    if (k.endsWith('jurisdiction') || k.includes('jurisdiction') || k.includes('jurisdiccion')) return true;

    // Administrative / geographic naming (English and common schema suffixes).
    // Exclude *estate (e.g. realEstate) — ends with "state" but is not a region.
    if ((k.endsWith('state') && !k.endsWith('estate')) || k.endsWith('region')) return true;
    if (k.endsWith('district') || k.endsWith('county') || k.endsWith('territory')) return true;
    if (k.endsWith('town') || k.endsWith('parish') || k.endsWith('canton') || k.endsWith('prefecture')) return true;

    // Spanish suffixes on camelCase variable keys (ciudad, provincia, país, etc.).
    if (k.endsWith('ciudad')) return true;
    if (k.endsWith('provincia')) return true;
    if (k.endsWith('municipio')) return true;
    if (k.endsWith('distrito')) return true;
    if (k.endsWith('colonia')) return true;
    // país / pais at end of key (Unicode-aware lowercasing keeps í in `país`).
    if (/pa[ií]s$/.test(k)) return true;

    return false;
}

/**
 * Keys for street / full-address text where we may append provincia y país (not isolated ciudad/provincia variables).
 * Structured Teletrabajo fields (*AddressStreet|City|Country) never get auto-appended país — país is explicit.
 */
export function isDominicanAddressCompletionKey(key: string): boolean {
    const k = key.toLowerCase();
    if (!isAddressLikeVariableKey(key)) return false;
    if (/(addressstreet|addresscity|addresscountry)$/i.test(key)) return false;
    if (k.endsWith('country') && !k.includes('address')) return false;
    return k.includes('address') || k.includes('domicilio');
}

function foldSegmentAscii(s: string): string {
    return s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

function hasCountrySegment(parts: string[]): boolean {
    return parts.some((p) => {
        const f = foldSegmentAscii(p);
        return f === 'republica dominicana' || f === 'dominican republic' || f === 'rd';
    });
}

/** If any comma segment names another sovereign country, do not append República Dominicana (avoids "…, Colombia, República Dominicana"). */
function hasNonDominicanCountrySegment(parts: string[]): boolean {
    const other = new Set([
        'colombia',
        'estados unidos',
        'united states',
        'usa',
        'u.s.a',
        'mexico',
        'méxico',
        'espana',
        'españa',
        'spain',
        'venezuela',
        'panama',
        'panamá',
        'chile',
        'argentina',
        'peru',
        'perú',
        'ecuador',
        'brasil',
        'brazil',
        'canada',
        'canadá',
        'reino unido',
        'united kingdom',
        'uk',
        'francia',
        'france',
        'italia',
        'italy',
        'alemania',
        'germany',
        'china',
        'japon',
        'japón',
        'japan',
        'haiti',
        'haíti',
        'puerto rico',
        'republica de haiti',
        'republica de haití',
        'india',
    ]);
    return parts.some((p) => other.has(foldSegmentAscii(p)));
}

/** Common Dominican provinces / distrito — last segment is usually provincia, not país extranjero. */
const DR_PROVINCE_OR_DISTRICT_SEGMENTS = new Set([
    'azua',
    'bahoruco',
    'barahona',
    'dajabon',
    'distrito nacional',
    'duarte',
    'el seibo',
    'elias pina',
    'espaillat',
    'hato mayor',
    'hermanas mirabal',
    'independencia',
    'la altagracia',
    'la romana',
    'la vega',
    'maria trinidad sanchez',
    'monsenor nouel',
    'monte cristi',
    'monte plata',
    'pedernales',
    'peravia',
    'puerto plata',
    'samana',
    'san cristobal',
    'san jose de ocoa',
    'san juan',
    'san pedro de macoris',
    'sanchez ramirez',
    'santiago',
    'santiago rodriguez',
    'valverde',
    'santo domingo',
    'santo domingo de guzman',
]);

/**
 * When the user ends the address with an explicit non-RD country (e.g. "…, India"),
 * do not append República Dominicana.
 */
function hasExplicitForeignCountryAtEnd(parts: string[]): boolean {
    if (hasNonDominicanCountrySegment(parts)) return true;
    if (parts.length < 3) return false;
    const last = foldSegmentAscii(parts[parts.length - 1]!);
    if (hasCountrySegment([parts[parts.length - 1]!])) return false;
    if (DR_PROVINCE_OR_DISTRICT_SEGMENTS.has(last)) return false;
    if (looksLikeStreetOnlySegment(parts[parts.length - 1]!)) return false;
    // Street + city + provincia (RD) is common; street + city + provincia + país needs 4+ for país
    if (parts.length >= 4) return true;
    // Three segments: if the last is not a known DR province, treat it as país
    return !DR_PROVINCE_OR_DISTRICT_SEGMENTS.has(last) && last !== 'santo domingo';
}

function normalizeProvinceAbbreviations(segment: string): string {
    const f = foldSegmentAscii(segment);
    if (f === 'dn' || f === 'd.n.' || f === 'd.n') return 'Distrito Nacional';
    return segment;
}

function hasDistritoNacional(parts: string[]): boolean {
    return parts.some((p) => {
        const f = foldSegmentAscii(p);
        return f.includes('distrito nacional') || f === 'dn' || f === 'd.n.' || f === 'd.n';
    });
}

function hasSantoDomingoMunicipalityCardinal(parts: string[]): boolean {
    return parts.some((p) => /\b(este|oeste|norte)\b/i.test(p));
}

/** Common spelling for this avenue in Santo Domingo. */
function fixKnownStreetSpellings(segment: string): string {
    return segment.replace(/\bMejia\b/gi, 'Mejía');
}

/**
 * Spanish street prefixes: Av → Av., Avda → Avda., etc. (does not alter words like "Avilés").
 */
export function normalizeSpanishStreetAbbreviations(line: string): string {
    let s = line;
    // Av / AV without period before street name (not Av. already, not inside longer words)
    s = s.replace(/\bAv\b(?![.])/gi, 'Av.');
    s = s.replace(/\bAvda\b(?![.])/gi, 'Avda.');
    s = s.replace(/\bAve\b(?![.])/gi, 'Ave.');
    s = s.replace(/\bCalle\b(?=\s)/gi, 'Calle');
    // Collapse double period if user had "Av.." or "Ave.."
    s = s.replace(/\b(Av|Ave)\.\.+/gi, '$1.');
    return s;
}

function looksLikeStreetOnlySegment(segment: string): boolean {
    const t = segment.trim();
    if (!t) return false;
    if (/\b(santo domingo|santiago|distrito nacional|la romana|punta cana)\b/i.test(t)) return false;
    return (
        /^(av\.?|avda\.?|calle|c\/|carrera|urbanización|urb\.?|ens\.?|carretera|km\.?)/i.test(t) ||
        /\#\s*\d/.test(t)
    );
}

/**
 * When only [calle…, país] and país is RD, insert capital city + DN (common for incomplete workplace addresses).
 */
function insertCityProvinceBeforeCountryIfStreetOnly(parts: string[]): string[] {
    if (parts.length !== 2) return parts;
    const last = foldSegmentAscii(parts[1]);
    if (last !== 'republica dominicana' && last !== 'dominican republic' && last !== 'rd') return parts;
    const first = parts[0];
    if (!looksLikeStreetOnlySegment(first)) return parts;
    return [first, 'Santo Domingo', 'Distrito Nacional', parts[1]];
}

/**
 * Templates that print `{{var}}, República Dominicana` must not store país at the end of `var`
 * (Propuesta: workLocationFullAddress). Recibo de descargo declarantAddress includes país in the variable.
 */
const KEYS_STRIP_TRAILING_RD_BEFORE_TEMPLATE_SUFFIX = new Set([
    'workLocationFullAddress',
    'employeeFullAddress',
    'companyAddress',
]);

const TRAILING_RD_COUNTRY_SUFFIX =
    /\s*,\s*(República Dominicana|Republica Dominicana|Dominican Republic|RD)\s*$/i;

/**
 * Templates that suffix `, República Dominicana` must not store país at the end of the variable.
 * Strip every trailing país segment (LLM + ensureDominicanAddressCompleteness can both add it).
 */
export function stripTrailingDominicanCountryForDuplicatingTemplate(key: string, line: string): string {
    if (!KEYS_STRIP_TRAILING_RD_BEFORE_TEMPLATE_SUFFIX.has(key)) return line;
    let s = line.trim();
    while (TRAILING_RD_COUNTRY_SUFFIX.test(s)) {
        s = s.replace(TRAILING_RD_COUNTRY_SUFFIX, '');
    }
    return s.trim();
}

/**
 * If a stored address line looks like República Dominicana but omits provincia/país, append them.
 * Bare "Santo Domingo" (capital) without Este/Oeste/Norte gets "Distrito Nacional" before país.
 */
export function ensureDominicanAddressCompleteness(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return line;

    return trimmed
        .split(/\r?\n/)
        .map((singleLine) => {
            let working = singleLine.trim();
            // Strip leading "en " / "En " preposition if present
            working = working.replace(/^en\s+/i, '');

            let parts = working
                .split(',')
                .map((p) => normalizeProvinceAbbreviations(fixKnownStreetSpellings(p.trim())))
                .filter((p) => p.length > 0);

            if (parts.length === 0) return singleLine;

            if (
                !hasCountrySegment(parts) &&
                !hasNonDominicanCountrySegment(parts) &&
                !hasExplicitForeignCountryAtEnd(parts)
            ) {
                parts.push('República Dominicana');
            }

            parts = insertCityProvinceBeforeCountryIfStreetOnly(parts);

            const sdIndex = parts.findIndex((p) => {
                const f = foldSegmentAscii(p);
                return f === 'santo domingo' || f === 'santo domingo de guzman';
            });

            const foreignCountryAtEnd =
                hasExplicitForeignCountryAtEnd(parts) || hasNonDominicanCountrySegment(parts);

            if (sdIndex !== -1 && !hasSantoDomingoMunicipalityCardinal(parts) && !foreignCountryAtEnd) {
                /**
                 * Only rename bare "Santo Domingo" → "Santo Domingo de Guzmán" when the
                 * user did NOT already supply Distrito Nacional. If they wrote
                 * "Santo Domingo, Distrito Nacional", preserve their wording (RULE 5o
                 * clarification belongs in chat — do not silently rewrite).
                 */
                if (foldSegmentAscii(parts[sdIndex]) === 'santo domingo' && !hasDistritoNacional(parts)) {
                    parts[sdIndex] = 'Santo Domingo de Guzmán';
                }
                if (!hasDistritoNacional(parts)) {
                    const next = parts[sdIndex + 1];
                    const nf = next ? foldSegmentAscii(next) : '';
                    if (nf === 'republica dominicana') {
                        parts.splice(sdIndex + 1, 0, 'Distrito Nacional');
                    } else if (nf !== 'distrito nacional') {
                        parts.splice(sdIndex + 1, 0, 'Distrito Nacional');
                    }
                }
            }

            return parts.join(', ');
        })
        .join('\n');
}

/** Spanish place-name particles that stay lowercase unless first word of the segment. */
const PLACE_NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

function titleCaseWord(word: string): string {
    if (!word) return word;
    if (/^[\d#°.,\-:/]+$/i.test(word)) return word;
    const m = word.match(/^([\p{L}])([\p{L}'’\u00B4-]*)$/u);
    if (!m) return word;
    return m[1].toUpperCase() + m[2].toLowerCase();
}

function titleCaseSegment(segment: string): string {
    const t = segment.trim();
    if (!t) return segment;
    const words = t.split(/\s+/);
    return words
        .map((word, index) => {
            const folded = foldSegmentAscii(word);
            if (index > 0 && PLACE_NAME_PARTICLES.has(folded)) {
                return folded;
            }
            // Multi-word particle already split: "De" + "Los" → de + los
            return titleCaseWord(word);
        })
        .join(' ');
}

/** Fix frequent typos in geographic segments after title case (does not spell-check arbitrary text). */
function fixKnownLocationTypos(segment: string): string {
    const s = segment.trim();
    if (/^distrito\s+naional$/iu.test(s)) return 'Distrito Nacional';
    return segment;
}

/**
 * Format one or more lines; comma-separated clauses get title case per clause.
 * Commas are always followed by a single space (e.g. "Ciudad, Provincia") for PDF consistency.
 */
export function formatAddressLineTitleCase(raw: string): string {
    const s = raw.trim();
    if (!s) return raw;

    return s
        .split(/\r?\n/)
        .map((line) => {
            const parts = line
                .split(',')
                .map((part) => fixKnownLocationTypos(titleCaseSegment(part)))
                .filter((p) => p.length > 0);
            let joined = parts.join(', ');
            joined = joined.replace(/,\s*,/g, ', ');
            joined = normalizeSpanishStreetAbbreviations(joined);
            return joined;
        })
        .join('\n');
}
