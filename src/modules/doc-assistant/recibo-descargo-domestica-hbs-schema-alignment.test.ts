import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
    RECIBO_DOMESTICA_HBS_PLACEHOLDERS,
    RECIBO_DOMESTICA_SCHEMA_USER_KEYS,
    reciboDomesticaHbsKeysMissingFromSchema,
    reciboDomesticaPdfKeysForSchemaDate,
} from './recibo-descargo-domestica-template-map.js';

const SCHEMA_PATH = join(
    process.cwd(),
    'src/templates/schemas/Recibo de Descargo Trabajadora Doméstica.json',
);

describe('Recibo de Descargo Trabajadora Doméstica — schema vs HBS alignment', () => {
    it('every HBS placeholder is either a schema key or server-derived from schema', () => {
        const missing = reciboDomesticaHbsKeysMissingFromSchema();
        assert.deepEqual(
            missing,
            [],
            `HBS keys without schema or derivation mapping: ${missing.join(', ')}`,
        );
    });

    it('schema JSON documents pdfKeys matching the template map for date fields', () => {
        const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
            groups: Array<{ variables: Array<{ key: string; type?: string; pdfKeys?: string[] }> }>;
        };
        for (const g of schema.groups) {
            for (const v of g.variables) {
                if (v.type !== 'date' || !v.pdfKeys?.length) continue;
                const expected = reciboDomesticaPdfKeysForSchemaDate(v.key);
                assert.deepEqual(
                    [...v.pdfKeys].sort(),
                    [...expected].sort(),
                    `pdfKeys mismatch for ${v.key}`,
                );
            }
        }
    });

    it('schema user keys count matches exported list', () => {
        const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
            groups: Array<{ variables: Array<{ key: string }> }>;
        };
        const fromFile = schema.groups.flatMap((g) => g.variables.map((v) => v.key)).sort();
        const exported = [...RECIBO_DOMESTICA_SCHEMA_USER_KEYS].sort();
        assert.deepEqual(fromFile, exported);
    });

    it('HBS placeholder list matches placeholders extracted from template file', () => {
        const hbsPath = join(
            process.cwd(),
            'src/templates/hbs/Recibo de Descargo Trabajadora Doméstica.hbs',
        );
        const hbs = readFileSync(hbsPath, 'utf8');
        const found = new Set<string>();
        const re = /\{\{([^}#/]+)\}\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(hbs)) !== null) {
            found.add(m[1]!.trim());
        }
        const exported = new Set(RECIBO_DOMESTICA_HBS_PLACEHOLDERS);
        assert.deepEqual([...found].sort(), [...exported].sort());
    });
});
