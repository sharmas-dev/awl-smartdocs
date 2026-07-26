import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseDeclarantInfoNarrative } from './declarant-info-parse.js';

describe('parseDeclarantInfoNarrative', () => {
    it('parses "reside en" address without putting address text in declarantFullName', () => {
        const t =
            'El trabajador reside en Calle Las Flores No. 18, Sector Villa Juana, Santo Domingo, India';
        const parsed = parseDeclarantInfoNarrative(t);
        assert.equal(parsed.declarantFullName, undefined);
        assert.match(String(parsed.declarantAddress ?? ''), /Calle Las Flores No\. 18/);
        assert.match(String(parsed.declarantAddress ?? ''), /India/);
    });

    it('parses golden Laboral address with Santo Domingo Oeste and India', () => {
        const t =
            'El trabajador reside en Calle Primera No. 22, Sector Herrera, Santo Domingo Oeste, India';
        const parsed = parseDeclarantInfoNarrative(t);
        assert.equal(parsed.declarantFullName, undefined);
        assert.equal(
            parsed.declarantAddress,
            'Calle Primera No. 22, Sector Herrera, Santo Domingo Oeste, India',
        );
    });
});
