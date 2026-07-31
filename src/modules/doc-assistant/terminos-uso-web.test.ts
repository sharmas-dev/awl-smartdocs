import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Handlebars from 'handlebars';

import { normalizePhoneNumber, isPhoneNumberVariableKey } from './phone-number-format.js';
import { stripOrphanEnumerationsFromHtml } from './not-applicable-cleanup.js';
import { normalizeMidSentencePhrase } from './mid-sentence-phrase-format.js';
import {
    enforceTerminosUsoWebNotificationCoherence,
    enforceTerminosUsoWebServicesCoherence,
    formatTerminosUsoWebServiceDescriptionFragment,
    formatTerminosUsoWebServiceFunctionalitiesFragment,
    normalizeTerminosUsoWebFunctionalitiesProse,
    normalizeTerminosUsoWebSiNo,
    normalizeTerminosUsoWebSiNoFlags,
    scrubTerminosUsoWebDoubleOfreceHtml,
} from './terminos-uso-web-enrichment.js';

const SCHEMA_PATH = join(process.cwd(), 'src/templates/schemas/Términos de Uso Página Web.json');
const HBS_PATH = join(process.cwd(), 'src/templates/hbs/Términos de Uso Página Web.hbs');

/** Local copies of the helpers the template relies on (mirrors doc-assistant.service.ts). */
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
    Handlebars.registerHelper('terminosServiceDescription', (value: unknown) =>
        formatTerminosUsoWebServiceDescriptionFragment(value),
    );
    Handlebars.registerHelper('terminosServiceFunctionalities', (value: unknown) =>
        formatTerminosUsoWebServiceFunctionalitiesFragment(value),
    );
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
        assert.match(html, /<strong>a\)<\/strong> Acceso a catálogo;/);
        assert.match(html, /<strong>b\)<\/strong> Formularios de contacto;/);
        assert.match(html, /<strong>c\)<\/strong> Descarga de recursos\./);
        assert.match(html, /serán enviadas mediante publicación en el Sitio Web\./);
        assert.match(html, /Fecha de última actualización:<\/strong> 31 de marzo de 2026/);
    });

    it('keeps §2.2 and §2.4 both starting at a) after post-render cleanup', () => {
        registerHelpers();
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const tpl = Handlebars.compile(hbs);
        const raw = tpl({
            hasSpecificServices: 'Sí',
            servicesList: 'Acceso a catálogo; Formularios de contacto; Descarga de recursos',
            hasRegistration: 'No',
            minimumAge: '16',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        });
        const html = stripOrphanEnumerationsFromHtml(raw);
        assert.match(html, /<strong>a\)<\/strong> Acceso a catálogo/);
        assert.match(html, /<strong>a\)<\/strong> Ser mayor de/);
        assert.equal(html.includes('<strong>c)</strong> Ser mayor de'), false);
    });
});

describe('Términos de Uso Página Web — Artículo 1 Cuenta de Usuario conditional', () => {
    it('omits the entire Cuenta de Usuario definition when registration is not required', () => {
        registerHelpers();
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const tpl = Handlebars.compile(hbs);
        const html = stripOrphanEnumerationsFromHtml(
            tpl({
                hasRegistration: 'No',
                notificationMethod: 'mediante publicación en el Sitio Web',
                updateDate: '31 de marzo de 2026',
            }),
        );
        assert.equal(html.includes('1.8. "Cuenta de Usuario"'), false);
        assert.equal(/ARTÍCULO 1: DEFINICIONES[\s\S]*?ARTÍCULO 2/.exec(html)?.[0].includes('Cuenta de Usuario') ?? true, false);
        assert.equal(html.includes('— ;'), false);
        assert.equal(html.includes('no aplica'), false);
        assert.match(html, /1\.7\. "Terceros"/);
    });

    it('renders 1.8 Cuenta de Usuario when registration is required', () => {
        registerHelpers();
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const tpl = Handlebars.compile(hbs);
        const html = tpl({
            hasRegistration: 'Sí',
            notificationMethod: 'al correo electrónico proporcionado por el Usuario durante el registro',
            updateDate: '31 de marzo de 2026',
        });
        assert.match(
            html,
            /1\.8\. "Cuenta de Usuario"<\/strong> se refiere al perfil personal creado por el Usuario mediante registro en el Sitio Web, que permite acceder a funcionalidades adicionales\./,
        );
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

    it('avoids doubled "El Sitio Web ofrece" after enrichment + render', () => {
        registerHelpers();
        const out: Record<string, string | number> = {
            serviceDescription: 'El sitio web ofrece alfombras hechas a mano',
            serviceFunctionalities: 'consultar el catálogo',
            hasRegistration: 'No',
            hasSpecificServices: 'No',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        };
        enforceTerminosUsoWebServicesCoherence(out);
        const hbs = readFileSync(HBS_PATH, 'utf8');
        const html = Handlebars.compile(hbs)(out);
        assert.match(html, /El Sitio Web ofrece alfombras hechas a mano, permitiendo a los Usuarios consultar el catálogo\./);
        assert.equal(/el sitio web ofrece/i.test(html.replace(/El Sitio Web ofrece/, '')), false);
    });

    it('collapses screenshot-exact TechNova description through mid-sentence + enrichment + HBS', () => {
        registerHelpers();
        const raw =
            'El sitio web ofrece información sobre los productos y servicios tecnológicos de TechNova Solutions, incluyendo desarrollo de software, consultoría tecnológica, soluciones en la nube y soporte técnico.';
        const out: Record<string, string | number> = {
            serviceDescription: normalizeMidSentencePhrase(raw),
            serviceFunctionalities: 'consultar información sobre productos y servicios',
            hasRegistration: 'No',
            hasSpecificServices: 'No',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        };
        enforceTerminosUsoWebServicesCoherence(out);
        const html = Handlebars.compile(readFileSync(HBS_PATH, 'utf8'))(out);
        assert.match(
            html,
            /El Sitio Web ofrece información sobre los productos y servicios tecnológicos de TechNova Solutions/,
        );
        assert.equal(/El Sitio Web ofrece\s+el sitio web ofrece/i.test(html), false);
    });

    it('collapses already-doubled stored serviceDescription', () => {
        const out: Record<string, string> = {
            serviceDescription:
                'El sitio web ofrece el sitio web ofrece información sobre los productos de TechNova Solutions',
        };
        assert.equal(enforceTerminosUsoWebServicesCoherence(out), true);
        assert.equal(out.serviceDescription, 'información sobre los productos de TechNova Solutions');
    });

    it('scrubs doubled ofrece from rendered HTML as belt-and-braces', () => {
        const raw =
            '<p>El Sitio Web ofrece el sitio web ofrece información sobre los productos, permitiendo a los Usuarios consultar.</p>';
        const cleaned = scrubTerminosUsoWebDoubleOfreceHtml(raw);
        assert.equal(
            cleaned,
            '<p>El Sitio Web ofrece información sobre los productos, permitiendo a los Usuarios consultar.</p>',
        );
    });

    it('scrubs doubled ofrece case-insensitively', () => {
        const raw =
            '<p>EL SITIO WEB OFRECE El Sitio Web Ofrece información sobre los productos.</p>';
        const cleaned = scrubTerminosUsoWebDoubleOfreceHtml(raw);
        assert.equal(cleaned, '<p>El Sitio Web ofrece información sobre los productos.</p>');
    });

    it('scrubs doubled ofrece when separated by &nbsp;', () => {
        const raw =
            '<p>El Sitio Web ofrece&nbsp;el sitio web ofrece información sobre los productos.</p>';
        const cleaned = scrubTerminosUsoWebDoubleOfreceHtml(raw);
        assert.equal(cleaned, '<p>El Sitio Web ofrece información sobre los productos.</p>');
    });

    it('strips "el sitio web proporciona" so template does not double the subject', () => {
        assert.equal(
            formatTerminosUsoWebServiceDescriptionFragment(
                'el sitio web proporciona información sobre productos y servicios de tecnología de TechNova Solutions',
            ),
            'información sobre productos y servicios de tecnología de TechNova Solutions',
        );
    });

    it('renders "El Sitio Web ofrece información…" when stored value uses proporciona', () => {
        registerHelpers();
        const html = Handlebars.compile(readFileSync(HBS_PATH, 'utf8'))({
            serviceDescription:
                'el sitio web proporciona información sobre productos y servicios de tecnología de TechNova Solutions, incluyendo desarrollo de software',
            serviceFunctionalities: 'ver información de productos y servicios',
            hasRegistration: 'No',
            hasSpecificServices: 'No',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        });
        assert.match(
            html,
            /El Sitio Web ofrece información sobre productos y servicios de tecnología de TechNova Solutions/,
        );
        assert.equal(/El Sitio Web ofrece\s+el sitio web/i.test(html), false);
        assert.equal(/ofrece\s+proporciona/i.test(html), false);
    });

    it('scrubs HTML "ofrece el sitio web proporciona"', () => {
        const raw =
            '<p>El Sitio Web ofrece el sitio web proporciona información sobre los productos.</p>';
        const cleaned = scrubTerminosUsoWebDoubleOfreceHtml(raw);
        assert.equal(cleaned, '<p>El Sitio Web ofrece información sobre los productos.</p>');
    });

    it('rewrites semicolon functionalities into Spanish prose', () => {
        const prose = normalizeTerminosUsoWebFunctionalitiesProse(
            'consultar información sobre productos y servicios; Crear y administrar una cuenta de usuario; Solicitar cotizaciones y contactar al equipo comercial; Suscribirse a boletines informativos',
        );
        assert.equal(
            prose,
            'consultar información sobre productos y servicios, crear y administrar una cuenta de usuario, solicitar cotizaciones y contactar al equipo comercial y suscribirse a boletines informativos',
        );
    });

    it('renders TechNova screenshot paragraph without doubled ofrece or semicolon checklist', () => {
        registerHelpers();
        const out: Record<string, string | number> = {
            serviceDescription:
                'El sitio web ofrece información sobre los productos y servicios tecnológicos de TechNova Solutions, incluyendo desarrollo de software, consultoría tecnológica, soluciones en la nube y soporte técnico.',
            serviceFunctionalities:
                'consultar información sobre productos y servicios; Crear y administrar una cuenta de usuario; Solicitar cotizaciones y contactar al equipo comercial; Descargar recursos y documentación; Enviar formularios de contacto y soporte; Suscribirse a boletines informativos.',
            hasRegistration: 'No',
            hasSpecificServices: 'No',
            notificationMethod: 'mediante publicación en el Sitio Web',
            updateDate: '31 de marzo de 2026',
        };
        // Intentionally skip storage-time enrichment — helpers alone must fix render.
        const html = Handlebars.compile(readFileSync(HBS_PATH, 'utf8'))(out);
        assert.match(html, /El Sitio Web ofrece información sobre los productos y servicios tecnológicos de TechNova Solutions/);
        assert.equal(/El Sitio Web ofrece\s+el sitio web ofrece/i.test(html), false);
        assert.match(html, /permitiendo a los Usuarios consultar información sobre productos y servicios,/);
        assert.equal(html.includes('permitiendo a los Usuarios consultar información sobre productos y servicios;'), false);
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

