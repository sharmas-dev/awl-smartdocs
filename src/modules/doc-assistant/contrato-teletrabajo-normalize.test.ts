import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    applyContratoTeletrabajoNormalizations,
    compactTeletrabajoCostSlots,
    detectTeletrabajoDuplicatePartyCedulas,
    normalizeTeletrabajoAddressTriple,
    normalizeTeletrabajoNationalityFields,
    normalizeTeletrabajoWorkScheduleField,
    resolveTeletrabajoPersonGender,
} from './contrato-teletrabajo-normalize.js';
import { formatAddressLineTitleCase } from './address-text-format.js';

describe('normalizeTeletrabajoWorkScheduleField', () => {
    it('strips wrapper sentence and lunch clause', () => {
        const raw =
            'El horario de trabajo será de lunes a viernes, de 8 a.m. a 5 p.m., con una hora de almuerzo.';
        assert.equal(
            normalizeTeletrabajoWorkScheduleField(raw),
            'lunes a viernes, de 8 a.m. a 5 p.m',
        );
    });
});

describe('normalizeTeletrabajoNationalityFields', () => {
    it('fixes dominicana → dominicano for casado male employer', () => {
        const out: Record<string, string | number> = {
            employerLegalName: 'Roberto Manuel Castillo Peña',
            employerMaritalStatus: 'casado',
            employerNationality: 'dominicana',
        };
        assert.equal(normalizeTeletrabajoNationalityFields(out), true);
        assert.equal(out.employerNationality, 'dominicano');
    });

    it('resolveTeletrabajoPersonGender uses marital ending', () => {
        assert.equal(resolveTeletrabajoPersonGender('casado', 'Roberto'), 'Hombre');
        assert.equal(resolveTeletrabajoPersonGender('soltera', 'Ana'), 'Mujer');
    });
});

describe('normalizeTeletrabajoAddressTriple', () => {
    it('removes duplicate Santo Domingo and country from street/city', () => {
        const out: Record<string, string | number> = {
            employerFullAddressStreet: 'Torre Novo Centro, Piso 5, Santo Domingo',
            employerFullAddressCity: 'Santo Domingo, Distrito Nacional, Santo Domingo',
            employerFullAddressCountry: 'República Dominicana',
        };
        assert.equal(
            normalizeTeletrabajoAddressTriple(
                out,
                'employerFullAddressStreet',
                'employerFullAddressCity',
                'employerFullAddressCountry',
            ),
            true,
        );
        assert.equal(out.employerFullAddressStreet, 'Torre Novo Centro, Piso 5');
        assert.equal(out.employerFullAddressCity, 'Santo Domingo, Distrito Nacional');
        assert.equal(out.employerFullAddressCountry, 'República Dominicana');
    });

    it('strips República Dominicana from workplace address when country set', () => {
        const out: Record<string, string | number> = {
            workplaceAddress: 'Calle Respaldo 27 No. 15, Urbanización Fernández, República Dominicana',
            workplaceCity: 'Santiago De Los Caballeros, República Dominicana',
            workplaceCountry: 'República Dominicana',
        };
        normalizeTeletrabajoAddressTriple(out, 'workplaceAddress', 'workplaceCity', 'workplaceCountry');
        assert.ok(!String(out.workplaceAddress).includes('República Dominicana'));
        assert.ok(!String(out.workplaceCity).includes('República Dominicana'));
        assert.equal(out.workplaceCountry, 'República Dominicana');
    });
});

describe('compactTeletrabajoCostSlots', () => {
    it('packs non-empty costs into a/b/c sequence', () => {
        const out: Record<string, string | number> = {
            cost1: 'Servicio de internet',
            cost2: '',
            cost3: '',
            cost4: 'Energía eléctrica',
        };
        assert.equal(compactTeletrabajoCostSlots(out), true);
        assert.equal(out.cost1, 'Servicio de internet');
        assert.equal(out.cost2, 'Energía eléctrica');
        assert.equal(out.cost3, '');
        assert.equal(out.cost4, '');
    });
});

describe('detectTeletrabajoDuplicatePartyCedulas', () => {
    it('flags identical 11-digit cédulas', () => {
        const err = detectTeletrabajoDuplicatePartyCedulas({
            employerIsCompany: 'Persona física',
            employerIdNumber: '031-0456789-1',
            employeeIdNumber: '031-0456789-1',
        });
        assert.ok(err);
        assert.match(err!.message, /iguales/i);
    });

    it('allows distinct cédulas', () => {
        assert.equal(
            detectTeletrabajoDuplicatePartyCedulas({
                employerIdNumber: '031-0456789-1',
                employeeIdNumber: '001-1234567-8',
            }),
            null,
        );
    });
});

describe('place-name particle casing', () => {
    it('keeps de / de los lowercase', () => {
        assert.equal(
            formatAddressLineTitleCase('santiago de los caballeros'),
            'Santiago de los Caballeros',
        );
        assert.equal(
            formatAddressLineTitleCase('santo domingo de guzmán'),
            'Santo Domingo de Guzmán',
        );
    });
});

describe('applyContratoTeletrabajoNormalizations', () => {
    it('applies schedule + nationality together', () => {
        const out: Record<string, string | number> = {
            employerLegalName: 'Roberto Manuel Castillo Peña',
            employerMaritalStatus: 'casado',
            employerNationality: 'dominicana',
            workSchedule:
                'El horario de trabajo será de lunes a viernes, de 8 a.m. a 5 p.m., con una hora de almuerzo.',
            lunchBreakDuration: '1 hora',
            cost1: 'Internet',
            cost4: 'Luz',
        };
        assert.equal(applyContratoTeletrabajoNormalizations(out), true);
        assert.equal(out.employerNationality, 'dominicano');
        assert.equal(out.workSchedule, 'lunes a viernes, de 8 a.m. a 5 p.m');
        assert.equal(out.cost2, 'Luz');
        assert.equal(out.cost4, '');
    });
});
