/** Map LLM answer keys to exact schema variable keys for the active group. */
export function mapAnswersToGroupVariables(
    variables: Array<{ key: string; label: string }>,
    answers: Record<string, string | number>,
): {
    mapped: Record<string, string | number>;
    unrecognizedKeys: string[];
    mappedFrom: Record<string, string>;
} {
    const byKey = new Map(variables.map((v) => [v.key, v]));
    const mapped: Record<string, string | number> = {};
    const unrecognizedKeys: string[] = [];
    const mappedFrom: Record<string, string> = {};

    const aliasToSchemaKey = buildAliasIndex(variables);

    for (const [rawKey, value] of Object.entries(answers)) {
        if (byKey.has(rawKey)) {
            mapped[rawKey] = value;
            continue;
        }
        const lower = rawKey.trim().toLowerCase();
        const target =
            aliasToSchemaKey.get(lower) ??
            matchByLabelFragment(variables, lower) ??
            matchByKeySuffix(variables, lower);
        if (target) {
            mapped[target] = value;
            mappedFrom[rawKey] = target;
        } else {
            unrecognizedKeys.push(rawKey);
        }
    }

    return { mapped, unrecognizedKeys, mappedFrom };
}

function buildAliasIndex(variables: Array<{ key: string; label: string }>): Map<string, string> {
    const index = new Map<string, string>();
    for (const v of variables) {
        index.set(v.key.toLowerCase(), v.key);
        const tail = v.key.replace(/^[a-z]+/, '').toLowerCase();
        if (tail.length > 3) {
            index.set(tail, v.key);
            index.set(tail.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(), v.key);
        }
        if (/nationality/i.test(v.key)) {
            for (const a of ['nationality', 'nacionalidad', 'nacionalidadtrabajador', 'nacionalidadtrabajadora']) {
                index.set(a, v.key);
            }
        }
        if (/(fullname|legalname|name)/i.test(v.key)) {
            for (const a of [
                'fullname',
                'legalname',
                'nombre',
                'nombrecompleto',
                'nombretrabajador',
                'nombretrabajadora',
                'trabajadornombre',
                'nombrevendedor',
                'nombrecomprador',
                'nombreempleador',
                'razonsocial',
                'nombrelegal',
            ]) {
                index.set(a, v.key);
            }
            const prefix = v.key.replace(/(fullname|legalname|name)$/i, '').toLowerCase();
            if (prefix.length > 2) {
                index.set(`${prefix}nombre`, v.key);
                index.set(`nombre${prefix}`, v.key);
                index.set(`${prefix}nombrecompleto`, v.key);
            }
        }
        if (/declarantidtype/i.test(v.key)) {
            for (const a of ['idtype', 'tipodocumento', 'tipodedocumento', 'documentotype']) {
                index.set(a, v.key);
            }
        }
        if (/idnumber/i.test(v.key) && !/block/i.test(v.key)) {
            for (const a of [
                'idnumber',
                'numerocedula',
                'numerodedocumento',
                'cedula',
                'documentnumber',
                'numerodocumento',
                'numerodecedula',
            ]) {
                index.set(a, v.key);
            }
            const prefix = v.key.replace(/idnumber$/i, '').toLowerCase();
            if (prefix.length > 2) {
                index.set(`${prefix}cedula`, v.key);
                index.set(`${prefix}numerocedula`, v.key);
            }
        }
        if (/declarantnationality/i.test(v.key)) {
            for (const a of ['nationality', 'nacionalidad', 'nacionalidadtrabajador', 'nacionalidadtrabajadora']) {
                index.set(a, v.key);
            }
        }
        if (/maritalstatus/i.test(v.key)) {
            for (const a of ['maritalstatus', 'estadocivil']) {
                index.set(a, v.key);
            }
        }
        if (/hasadditionalconcept1/i.test(v.key)) {
            for (const a of [
                'hasadditionalconcept1',
                'additionalconcept1',
                'conceptoadicional1',
                'conceptoadicional',
                'agregarconcepto',
            ]) {
                index.set(a, v.key);
            }
        }
        if (/hasadditionalconcept2/i.test(v.key)) {
            for (const a of ['hasadditionalconcept2', 'additionalconcept2', 'conceptoadicional2', 'segundoconcepto']) {
                index.set(a, v.key);
            }
        }
        if (/hasdetailedbreakdown/i.test(v.key)) {
            for (const a of ['hasdetailedbreakdown', 'desglose', 'incluirdesglose', 'detailedbreakdown']) {
                index.set(a, v.key);
            }
        }
        if (/employmentstartdate/i.test(v.key)) {
            for (const a of ['employmentstartdate', 'fechainicio', 'inicio', 'startdate', 'fechacomienzo']) {
                index.set(a, v.key);
            }
        }
        if (/employmentenddate/i.test(v.key)) {
            for (const a of ['employmentenddate', 'fechafin', 'fin', 'enddate', 'fechatermino']) {
                index.set(a, v.key);
            }
        }
        if (/contractterminationdate/i.test(v.key)) {
            for (const a of ['contractterminationdate', 'fechaterminacion', 'terminacion', 'terminationdate']) {
                index.set(a, v.key);
            }
        }
        if (/lastsalaryperioddate/i.test(v.key)) {
            for (const a of ['lastsalaryperioddate', 'ultimosalario', 'periodosalario', 'mesultimosalario']) {
                index.set(a, v.key);
            }
        }
        if (/vacationcoveragethroughdate/i.test(v.key)) {
            for (const a of ['vacationcoveragethroughdate', 'vacaciones', 'anovacaciones']) {
                index.set(a, v.key);
            }
        }
        if (/documentsigningdate/i.test(v.key)) {
            for (const a of ['documentsigningdate', 'fechafirma', 'firmado', 'signingdate']) {
                index.set(a, v.key);
            }
        }
    }
    return index;
}

function normalizeForMatch(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]/g, '');
}

function matchByLabelFragment(
    variables: Array<{ key: string; label: string }>,
    rawLower: string,
): string | undefined {
    const rawNorm = normalizeForMatch(rawLower);
    if (!rawNorm) return undefined;
    let best: { key: string; score: number } | undefined;
    for (const v of variables) {
        const labelNorm = normalizeForMatch(v.label);
        if (labelNorm.includes(rawNorm) || rawNorm.includes(labelNorm.slice(0, 12))) {
            const score = labelNorm.length;
            if (!best || score > best.score) best = { key: v.key, score };
        }
    }
    return best?.key;
}

function matchByKeySuffix(variables: Array<{ key: string; label: string }>, rawLower: string): string | undefined {
    const rawNorm = normalizeForMatch(rawLower);
    const matches = variables.filter((v) => {
        const tail = normalizeForMatch(v.key.replace(/^[a-z]+/, ''));
        return tail.length > 4 && (rawNorm.includes(tail) || tail.includes(rawNorm));
    });
    return matches.length === 1 ? matches[0].key : undefined;
}
