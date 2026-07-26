import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Handlebars from 'handlebars';

import { normalizePhoneNumber, isPhoneNumberVariableKey } from './phone-number-format.js';
import {
    enforceTerminosUsoWebNotificationCoherence,
    enforceTerminosUsoWebServicesCoherence,
    normalizeTerminosUsoWebSiNo,
    normalizeTerminosUsoWebSiNoFlags,
} from './terminos-uso-web-enrichment.js';

const SCHEMA_PATH = join(process.cwd(), 'src/templates/schemas/Términos de Uso Página Web.json');
const HBS_PATH = join(process.cwd(), 'src/templates/hbs/Términos de Uso Página Web.hbs');

/** Local copies of the two helpers the template relies on (mirrors doc-assistant.service.ts). */
function registerHelpers() {
    Handlebars.registerHelper('eq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
        return String(a).toLowerCase() === String(b).toLowerCase() ? options.fn(this) : options.inverse(this);
    });
    Handlebars.registerHelper('neq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
        return String(a).toLowerCase() !== String(b).toLowerCase() ? options.fn(this) : options.inverse(this);
    });
    Handlebars.registerHelper('eachSplit', function (this: unknown, delimiter: unknown, str: unknown, options: Handlebars.HelperOptions) {
        const sep = typeof delimiter === 'string' && delimiter.length > 0 ? delimiter : ';';
        const raw = str === null || str === undefined ? '' : String(str);
        const parts = raw.split(sep).map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) return options.inverse(this);
        let out = '';
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const frame = Handlebars.createFrame(options.data ?? {});
            frame.index = index;
            frame.letter = String.fromCharCode(97 + index);
            frame.first = index === 0;
            frame.last = index === parts.length - 1;
            frame.length = parts.length;
            out += options.fn(part, { data: frame });
        }
        return out;
    });
}

describe('Términos de Uso Página Web — phone normalization (Rule 3)', () => {
    it('normalizes Dominican local numbers to +1 809-555-1234', () => {
        assert.equal(normalizePhoneNumber('8095551234'), '+1 809-555-1234');
        assert.equal(normalizePhoneNumber('(809) 555-1234'), '+1 809-555-1234');
        assert.equal(normalizePhoneNumber('809.555.1234'), '+1 809-555-1234');
        assert.equal(normalizePhoneNumber('1 809 555 1234'), '+1 809-555-1234');
        assert.equal(normalizePhoneNumber('+1 809-555-1234'), '+1 809-555-1234');
    });
    it('recognizes phone keys but not fax', () => {
        assert.equal(isPhoneNumberVariableKey('contactPhone'), true);
        assert.equal(isPhoneNumberVariableKey('faxNumber'), false);
    });
    it('leaves unparseable values untouched', () => {
        assert.equal(normalizePhoneNumber('ext. 12'), 'ext. 12');
    });
});

describe('Términos de Uso Página Web — Sí/No flag normalize (§2.4 d)', () => {
    it('maps Si / yes / no onto exact schema literals', () => {
        assert.equal(normalizeTerminosUsoWebSiNo('Si'), 'Sí');
        assert.equal(normalizeTerminosUsoWebSiNo('yes'), 'Sí');
        assert.equal(normalizeTerminosUsoWebSiNo('NO'), 'No');
        assert.equal(normalizeTerminosUsoWebSiNo('Sí'), 'Sí');
    });

    it('normalizes hasRegistration so dual-eq style branches would not leave d) empty', () => {
        const out: Record<string, string | number> = {
            hasRegistration: 'yes',
            hasUserContent: 'Si',
            hasSpecificServices: 'No',
        };
        assert.equal(normalizeTerminosUsoWebSiNoFlags(out), true);
        assert.equal(out.hasRegistration, 'Sí');
        assert.equal(out.hasUserContent, 'Sí');
        assert.equal(out.hasSpecificServices, 'No');
    });
});

describe('Términos de Uso Página Web — notification coherence (Rule 4)', () => {
    it('replaces registration-email method when there is no registration', () => {
        const out: Record<string, string> = {
            hasRegistration: 'No',
            notificationMethod: 'al correo electrónico proporcionado por el Usuario durante el registro',
        };
        const changed = enforceTerminosUsoWebNotificationCoherence(out);
        assert.equal(changed, true);
        assert.equal(out.notificationMethod, 'mediante publicación en el Sitio Web');
    });
    it('leaves the method untouched when registration exists', () => {
        const out: Record<string, string> = {
            hasRegistration: 'Sí',
            notificationMethod: 'al correo electrónico proporcionado por el Usuario durante el registro',
        };
        assert.equal(enforceTerminosUsoWebNotificationCoherence(out), false);
    });
    it('leaves a registration-agnostic method untouched even without registration', () => {
        const out: Record<string, string> = {
            hasRegistration: 'No',
            notificationMethod: 'por cualquier medio razonable',
        };
        assert.equal(enforceTerminosUsoWebNotificationCoherence(out), false);
    });
});

describe('Términos de Uso Página Web — schema/HBS alignment (Rules 1 & 2)', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
        groups: Array<{ id: string; variables: Array<{ key: string; type?: string; options?: string[]; example?: string }> }>;
    };
    const allKeys = new Set(schema.groups.flatMap((g) => g.variables.map((v) => v.key)));

    it('uses a single free-list servicesList variable, not service1..6', () => {
        assert.equal(allKeys.has('servicesList'), true);
        for (const n of [1, 2, 3, 4, 5, 6]) {
            assert.equal(allKeys.has(`service${n}`), false, `service${n} should be removed`);
        }
    });

    it('notificationMethod offers registration-agnostic options', () => {
        const v = schema.groups.flatMap((g) => g.variables).find((x) => x.key === 'notificationMethod');
        assert.ok(v?.options?.includes('mediante publicación en el Sitio Web'));
    });

    it('updateDate stays a date field documented as plain Spanish textual', () => {
        const v = schema.groups.flatMap((g) => g.variables).find((x) => x.key === 'updateDate');
        assert.equal(v?.type, 'date');
        assert.equal(v?.example, '31 de marzo de 2026');
    });
});

describe('Términos de Uso Página Web — services rendering (Rule 2)', () => {
    it('renders only as many enumerated services as provided', () => {
        registerHelpers();
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const tpl = Handlebars.compile(hbs);
        const html = tpl({
            hasSpecificServices: 'Sí',
            servicesList: 'Acceso a catálogo; Formularios de contacto; Descarga de recursos',
            hasRegistration: 'No',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        });
        const servicesLine = /Los Servicios incluyen[^]*?<p style="text-align:justify">(.*?)<\/p>/.exec(html)?.[1] ?? '';
        assert.equal(
            servicesLine,
            '<strong>a)</strong> Acceso a catálogo; <strong>b)</strong> Formularios de contacto; <strong>c)</strong> Descarga de recursos.',
        );
        assert.match(html, /serán enviadas mediante publicación en el Sitio Web\./);
        assert.match(html, /Fecha de última actualización:<\/strong> 31 de marzo de 2026/);
    });
});

describe('Términos de Uso Página Web — services normalization', () => {
    it('strips redundant leading phrase in serviceDescription', () => {
        const out: Record<string, string> = {
            serviceDescription: 'El sitio web ofrece materiales de construcción',
        };
        const changed = enforceTerminosUsoWebServicesCoherence(out);
        assert.equal(changed, true);
        assert.equal(out.serviceDescription, 'materiales de construcción');
    });

    it('strips redundant leading verb in serviceFunctionalities', () => {
        const out: Record<string, string> = {
            serviceFunctionalities: 'Pueden consultar catálogo',
        };
        const changed = enforceTerminosUsoWebServicesCoherence(out);
        assert.equal(changed, true);
        assert.equal(out.serviceFunctionalities, 'consultar catálogo');
    });

    it('leaves already normalized fields unchanged', () => {
        const out: Record<string, string> = {
            serviceDescription: 'materiales de construcción',
            serviceFunctionalities: 'consultar catálogo',
        };
        const changed = enforceTerminosUsoWebServicesCoherence(out);
        assert.equal(changed, false);
        assert.equal(out.serviceDescription, 'materiales de construcción');
        assert.equal(out.serviceFunctionalities, 'consultar catálogo');
    });
});

describe('Términos de Uso Página Web — Section 3.1 registration-free optional forms rendering', () => {
    it('renders the optional forms paragraph when hasRegistration is No and hasOptionalContactForms is Sí', () => {
        registerHelpers();
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const tpl = Handlebars.compile(hbs);
        const html = tpl({
            hasRegistration: 'No',
            hasOptionalContactForms: 'Sí',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        });
        assert.match(html, /No Requerimiento de Registro/);
        assert.match(html, /No obstante, ciertas funcionalidades opcionales pueden requerir/);
    });

    it('omits the optional forms paragraph when hasRegistration is No and hasOptionalContactForms is No', () => {
        registerHelpers();
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const tpl = Handlebars.compile(hbs);
        const html = tpl({
            hasRegistration: 'No',
            hasOptionalContactForms: 'No',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        });
        assert.match(html, /No Requerimiento de Registro/);
        assert.equal(html.includes('No obstante, ciertas funcionalidades opcionales pueden requerir'), false);
    });
});

