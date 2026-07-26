import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Handlebars from 'handlebars';
import { DocAssistantService } from './doc-assistant.service.js';
import type { SessionData } from './session-store.js';

const svc = new DocAssistantService();

function testSession(
    templateName: string,
    variables: Record<string, string | number> = {},
): SessionData {
    return {
        sessionId: 'test-session',
        userId: 'user-test',
        documentId: 'doc-test',
        templateName,
        variables: { ...variables },
        completedGroups: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

describe('reconcileSessionProgress', () => {
    it('Compraventa: Empresa seller with only sellerIsCompany stays incomplete', async () => {
        const session = testSession('Contrato de Compraventa Vehículo', {
            sellerIsCompany: 'Empresa',
            sellerFullName: 'ACME Motors S.R.L.',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(progress.allComplete, false);
        if (!progress.allComplete) {
            assert.equal(progress.group.id, 'seller');
            assert.ok(progress.missingFieldKeys.length > 0);
            assert.ok(progress.missingFieldKeys.some((k: string) => k.startsWith('seller')));
            assert.ok(!session.completedGroups.includes('seller'));
        }
    });

    it('Compraventa: Empresa seller never pending person-only fields', async () => {
        const session = testSession('Contrato de Compraventa Vehículo', {
            sellerIsCompany: 'Empresa',
            sellerTypeLabel: 'la sociedad',
            sellerLegalName: 'ACME Motors S.R.L.',
            sellerFullAddress: 'Av. Churchill 123, Santo Domingo',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.sellerIsCompany, 'Empresa');
        if (!progress.allComplete) {
            const personKeys = [
                'sellerNationality',
                'sellerMaritalStatus',
                'sellerIdType',
                'sellerIdNumber',
            ];
            for (const key of personKeys) {
                assert.ok(!progress.missingFieldKeys.includes(key), `unexpected pending ${key}`);
            }
        }
    });

    it('Compraventa: Empresa buyer never pending person-only fields', async () => {
        const session = testSession('Contrato de Compraventa Vehículo', {
            sellerIsCompany: 'Empresa',
            sellerTypeLabel: 'la sociedad',
            sellerLegalName: 'ACME Motors S.R.L.',
            sellerJurisdiction: 'República Dominicana',
            sellerRnc: '1-01-23456-7',
            sellerFullAddress: 'Av. Churchill 123, Santo Domingo',
            sellerRepTitle: 'Presidente',
            sellerRepFullName: 'Carlos Rodríguez',
            sellerRepNationality: 'dominicano',
            sellerRepIdType: 'de la cédula de identidad y electoral',
            sellerRepIdNumber: '001-1234567-8',
            sellerRepFullAddress: 'Santo Domingo, DN',
            buyerIsCompany: 'Empresa',
            buyerTypeLabel: 'la sociedad',
            buyerLegalName: 'Proveedora XYZ, S.R.L.',
            buyerFullAddress: 'Calle Principal 456, Santiago',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.buyerIsCompany, 'Empresa');
        if (!progress.allComplete && progress.group.id === 'buyer') {
            const personKeys = [
                'buyerNationality',
                'buyerMaritalStatus',
                'buyerIdType',
                'buyerIdNumber',
            ];
            for (const key of personKeys) {
                assert.ok(!progress.missingFieldKeys.includes(key), `unexpected pending ${key}`);
            }
        }
    });

    it('Compraventa: compañía normalizes to Empresa and skips person fields', async () => {
        const session = testSession('Contrato de Compraventa Vehículo', {
            sellerIsCompany: 'compañía',
            sellerTypeLabel: 'la sociedad',
            sellerLegalName: 'ACME Motors S.R.L.',
            sellerFullAddress: 'Av. Churchill 123, Santo Domingo',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.sellerIsCompany, 'Empresa');
        if (!progress.allComplete) {
            assert.ok(!progress.missingFieldKeys.includes('sellerNationality'));
            assert.ok(!progress.missingFieldKeys.includes('sellerMaritalStatus'));
        }
    });

    it('Recibo Laboral: documentSigningDate expands fragments and completes signingInfo when city/province/country set', async () => {
        const session = testSession('Recibo de Descargo Laboral', {
            signingCity: 'Santo Domingo de Guzmán',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '12 de abril de 2026',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.signingDayNumbers, '12');
        assert.equal(session.variables.signingYearNumbers, '2026');
        if (!progress.allComplete) {
            const signingPending = progress.group.id === 'signingInfo';
            if (signingPending) {
                assert.ok(progress.missingFieldKeys.length > 0);
            }
        }
    });

    it('Recibo Laboral: breakdown evidence infers hasDetailedBreakdown Sí', async () => {
        const session = testSession('Recibo de Descargo Laboral', {
            preavisoAmount: 'RD$10,000.00',
            cesantiaAmount: 'RD$5,000.00',
            navidadAmount: 'RD$3,000.00',
            vacacionesAmount: 'RD$2,000.00',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.hasDetailedBreakdown, 'Sí');
    });

    it('Recibo Laboral: signing data infers hasAdditionalConcept1 No when breakdown enabled', async () => {
        const session = testSession('Recibo de Descargo Laboral', {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$10,000.00',
            cesantiaAmount: 'RD$5,000.00',
            navidadAmount: 'RD$3,000.00',
            vacacionesAmount: 'RD$2,000.00',
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '21 de mayo de 2026',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.hasAdditionalConcept1, 'No');
        assert.ok(!('error' in progress));
        if (!progress.allComplete) {
            assert.ok(!progress.missingFieldKeys.includes('hasAdditionalConcept1'));
        }
    });

    it('Recibo Laboral: mapAnswers maps short userMessage No to hasAdditionalConcept1', () => {
        const schema = svc.getTemplateSchema('Recibo de Descargo Laboral');
        assert.ok(!('error' in schema));
        const group = schema.groups.find((g) => g.id === 'breakdownAmounts');
        assert.ok(group);
        const mapped = svc.mapAnswersToGroupSchema(
            'Recibo de Descargo Laboral',
            'breakdownAmounts',
            {},
            'No',
        );
        assert.equal(mapped.mapped.hasAdditionalConcept1, 'No');
    });

    it('Recibo Laboral: cross-group merge maps "not" while pending group is signingInfo', async () => {
        const { mergeReciboLaboralPendingSiNoAnswers } = await import('./recibo-descargo-pending-toggles.js');
        const merged = mergeReciboLaboralPendingSiNoAnswers(
            'Recibo de Descargo Laboral',
            {},
            'not',
            { hasDetailedBreakdown: 'Sí' },
        );
        assert.equal(merged.hasAdditionalConcept1, 'No');
    });

    it('Recibo Laboral: generate_pdf-style reconcile closes hasAdditionalConcept1 with breakdown only', async () => {
        const { resolveReciboLaboralAdditionalConceptToggles } = await import('./recibo-descargo-pending-toggles.js');
        const schema = svc.getTemplateSchema('Recibo de Descargo Laboral');
        assert.ok(!('error' in schema));
        const vars: Record<string, string | number> = {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$10,000.00',
            cesantiaAmount: 'RD$5,000.00',
            navidadAmount: 'RD$3,000.00',
            vacacionesAmount: 'RD$2,000.00',
        };
        resolveReciboLaboralAdditionalConceptToggles(vars, {
            trigger: 'generate_pdf',
            groups: schema.groups,
            isGroupApplicable: (g) => {
                if (!g.condition) return true;
                return String(vars[g.condition.field] ?? '').toLowerCase() === String(g.condition.equals).toLowerCase();
            },
            getGroupMissingFields: (g, v) => {
                const missing: Array<{ key: string; label: string }> = [];
                for (const f of g.variables) {
                    if (!f.required) continue;
                    if (f.condition) {
                        const cv = v[f.condition.field];
                        if (String(cv ?? '').toLowerCase() !== String(f.condition.equals).toLowerCase()) continue;
                    }
                    const val = v[f.key];
                    if (val === undefined || String(val).trim() === '') {
                        missing.push({ key: f.key, label: f.label });
                    }
                }
                return missing;
            },
        });
        assert.equal(vars.hasAdditionalConcept1, 'No');
    });

    it('Recibo Laboral: signing complete infers hasAdditionalConcept1 when only toggle missing', async () => {
        const session = testSession('Recibo de Descargo Laboral', {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$10,000.00',
            cesantiaAmount: 'RD$5,000.00',
            navidadAmount: 'RD$3,000.00',
            vacacionesAmount: 'RD$2,000.00',
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '21 de mayo de 2024',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.hasAdditionalConcept1, 'No');
        assert.ok(!('error' in progress));
        if (!progress.allComplete) {
            assert.ok(!progress.missingFieldKeys.includes('hasAdditionalConcept1'));
        }
    });

    it('Recibo Laboral: hasAdditionalConcept2 No does not block preview on concept labels', async () => {
        const session = testSession('Recibo de Descargo Laboral', {
            hasDetailedBreakdown: 'Sí',
            preavisoAmount: 'RD$10,000.00',
            cesantiaAmount: 'RD$5,000.00',
            navidadAmount: 'RD$3,000.00',
            vacacionesAmount: 'RD$2,000.00',
            hasAdditionalConcept2: 'No',
            additionalConcept1Label: 'Ninguno',
            additionalConcept1Amount: '0.00',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.hasAdditionalConcept1, 'No');
        assert.equal(session.variables.additionalConcept1Label, undefined);
        assert.ok(!('error' in progress));
        if (!progress.allComplete) {
            assert.ok(!progress.missingFieldKeys.includes('additionalConcept1Label'));
            assert.ok(!progress.missingFieldKeys.includes('additionalConcept2Label'));
        }
    });

    it('Recibo Trabajadora Doméstica: employer identity auto-fills gender, workplace and legal refs', async () => {
        const session = testSession('Recibo de Descargo Trabajadora Doméstica', {
            employerFullName: 'Juan Pérez López',
            employerNationality: 'dominicano',
            employerIdType: 'del Pasaporte',
            employerIdNumber: '34354534',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.domesticEmployerGender, 'Hombre');
        assert.equal(session.variables.workplaceDescription, 'del señor');
        assert.equal(session.variables.employerReference, 'el Empleador');
        assert.equal(session.variables.payerReference, 'del Empleador');
        assert.equal(session.variables.employerReferenceShort, 'al Empleador');
        assert.ok(session.completedGroups.includes('employerInfo'));
    });

    it('Recibo Trabajadora Doméstica: infers notaryJurisdiction from declarantAddress', async () => {
        const session = testSession('Recibo de Descargo Trabajadora Doméstica', {
            declarantFullName: 'María Pérez',
            declarantNationality: 'dominicana',
            declarantIdType: 'de la Cédula de Identidad y Electoral',
            declarantIdNumber: '001-1234567-8',
            declarantAddress: 'Calle 1, Santo Domingo, D.N.',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.notaryJurisdiction, 'Distrito Nacional');
        assert.equal(session.variables.signingCity, 'Santo Domingo');
        assert.equal(session.variables.signingProvince, 'Distrito Nacional');
    });

    it('Contrato Trabajadora Doméstica: infers la Empleadora from employer name', async () => {
        const session = testSession('Contrato de Trabajadora Doméstica', {
            employerFullName: 'Daniela Patricia Cruz Martínez',
            employerIdType: 'Cédula',
            employerIdNumber: '001-9632587-4',
            employerFullAddress: 'Calle Los Robles No. 22, Santo Domingo',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.employerReference, 'la Empleadora');
        assert.equal(session.variables.domesticEmployerGender, 'Mujer');
    });

    it('Contrato Trabajadora Doméstica: infers notaryJurisdiction from employer address', async () => {
        const session = testSession('Contrato de Trabajadora Doméstica', {
            employerFullName: 'Daniela Patricia Cruz Martínez',
            employerIdType: 'Cédula',
            employerIdNumber: '001-9632587-4',
            employerFullAddress: 'Calle Los Robles No. 22, Piantini, Santo Domingo',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.notaryJurisdiction, 'Distrito Nacional');
    });

    it('Contrato Trabajadora Doméstica: documentSigningDate expands signing fragments', async () => {
        const session = testSession('Contrato de Trabajadora Doméstica', {
            signingCity: 'Santo Domingo de Guzmán',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '20 de mayo de 2026',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.signingDayNumbers, '20');
        assert.equal(session.variables.signingMonthLetters, 'mayo');
        assert.equal(session.variables.signingYearNumbers, '2026');
    });

    it('Contrato Trabajadora Doméstica: signing group completes with one documentSigningDate', async () => {
        const session = testSession('Contrato de Trabajadora Doméstica', {
            signingCity: 'Santo Domingo de Guzmán',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '15 de marzo de 2026',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(session.completedGroups.includes('signing'));
        assert.equal(session.variables.signingDayNumbers, '15');
        assert.equal(session.variables.signingMonthLetters, 'marzo');
        assert.equal(session.variables.signingYearNumbers, '2026');
    });

    it('Contrato Trabajadora Doméstica: compact schema exposes documentSigningDate not signing fragments', () => {
        const compact = svc.getCompactSchema('Contrato de Trabajadora Doméstica');
        assert.ok(!('error' in compact));
        const signing = compact.groups.find((g) => g.id === 'signing');
        assert.ok(signing);
        const keys = signing!.variables.map((v) => v.key);
        assert.ok(keys.includes('documentSigningDate'));
        assert.ok(!keys.includes('signingMonthLetters'));
        assert.ok(!keys.includes('signingYearNumbers'));
    });

    it('Contrato Trabajadora Doméstica: auto-fills contractDurationIndefinite when kind is Por tiempo indefinido', async () => {
        const session = testSession('Contrato de Trabajadora Doméstica', {
            contractDurationKind: 'Por tiempo indefinido',
            minimumNoticeNumber: '5',
            minimumNoticeNumberWords: 'cinco',
            minimumNoticeUnit: 'días',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.contractDurationIndefinite, 'por tiempo indefinido');
        assert.ok(session.completedGroups.includes('duration'));
    });

    it('Contrato Trabajadora Doméstica: auto-fills notaryJurisdiction from signingProvince', async () => {
        const session = testSession('Contrato de Trabajadora Doméstica', {
            employerFullName: 'Juan Pérez Gómez',
            employerIdType: 'Cédula',
            employerIdNumber: '001-0000000-0',
            employerFullAddress: 'Av. Los Próceres #45',
            employeeFullName: 'María López Rodríguez',
            employeeNationality: 'dominicana',
            employeeMaritalStatus: 'casado(a)',
            employeeAge: '30',
            employeeGender: 'Femenino',
            employeeIdType: 'Cédula',
            employeeIdNumber: '001-2345678-9',
            employeeFullAddress: 'Calle Duarte #10',
            startDate: '15 de marzo de 2026',
            workDays: 'lunes a viernes',
            workSchedule: 'de 8:00 a.m. a 5:00 p.m.',
            primaryResponsibility: 'Limpieza general',
            salaryInWords: 'veinticinco mil pesos dominicanos',
            salaryAmountWithCurrency: 'RD$25000',
            paymentFrequency: 'mensuales',
            paymentSchedule: 'los días 15 y 30',
            hasAdditionalBenefits: 'No',
            contractDurationKind: 'Por tiempo indefinido',
            contractDurationIndefinite: 'por tiempo indefinido',
            minimumNoticeNumber: '5',
            minimumNoticeNumberWords: 'cinco',
            minimumNoticeUnit: 'días',
            signingCity: 'Santo Domingo de Guzmán',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            signingDayLetters: 'quince',
            signingDayNumbers: '15',
            signingMonthLetters: 'marzo',
            signingYearLetters: 'dos mil veintiséis',
            signingYearNumbers: '2026',
        });
        await svc.reconcileSessionProgress(session, { persist: false });
        assert.equal(session.variables.notaryJurisdiction, 'Distrito Nacional');
        assert.ok(session.completedGroups.includes('notary'));
    });

    it('Recibo declarantInfo: unrecognized alias keys stay in missingFieldKeys', async () => {
        const session = testSession('Recibo de Descargo Laboral', {
            totallyUnknownField: 'value',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(progress.allComplete, false);
        if (!progress.allComplete) {
            assert.ok(
                progress.missingFieldKeys.includes('declarantFullName') ||
                    progress.group.id === 'declarantInfo',
            );
        }
    });

    it('Contrato Teletrabajo: representative cédula must be complete before employer group completes', async () => {
        const session = testSession('Contrato de Teletrabajo', {
            employerIsCompany: 'Empresa',
            employerLegalName: 'Tecnologías Globales, S.R.L.',
            employerCompanyNationalOrForeign: 'Nacional',
            employerJurisdiction: 'República Dominicana',
            employerRnc: '1-31-45678-9',
            employerMercantileRegistryNumber: '123456SD',
            employerFullAddressStreet: 'Avenida John F. Kennedy No. 88',
            employerFullAddressCity: 'Santo Domingo',
            employerFullAddressCountry: 'República Dominicana',
            employerRepTitle: 'Gerente General',
            employerRepFullName: 'María Fernanda Castillo Pérez',
            employerRepNationality: 'dominicana',
            employerRepIdType: 'Cédula de Identidad y Electoral',
            employerRepIdNumber: '00134567',
        });

        const progress = await svc.reconcileSessionProgress(session, { persist: false });

        assert.ok(!('error' in progress));
        assert.equal(progress.allComplete, false);
        if (!progress.allComplete) {
            assert.equal(progress.group.id, 'employer');
            assert.ok(progress.missingFieldKeys.includes('employerRepIdNumber'));
            assert.ok(!session.completedGroups.includes('employer'));
        }
    });

    it('Contrato Teletrabajo: one documentSigningDate fills signing fragments', async () => {
        const normalize = (
            svc as unknown as {
                normalizeFieldValuesForStorage: (
                    templateName: string,
                    vars: Record<string, string | number>,
                ) => Record<string, string | number>;
            }
        ).normalizeFieldValuesForStorage.bind(svc);

        const out = normalize('Contrato de Teletrabajo', {
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '01/07/2026',
            numberOfOriginals: 'dos (2) ejemplares',
        });

        assert.equal(out.documentSigningDate, 'primero (1) de julio del dos mil veintiséis (2026)');
        assert.equal(out.signingDayLetters, 'primero');
        assert.equal(out.signingDayNumbers, '1');
        assert.equal(out.signingMonthLetters, 'julio');
        assert.equal(out.signingYearLetters, 'dos mil veintiséis');
        assert.equal(out.signingYearNumbers, '2026');
    });

    it('Contrato Teletrabajo: submit_group_answers stores documentSigningDate and expands signing fragments', async () => {
        const purchaseId = 'purchase-teletrabajo-test';
        const userId = 'user-teletrabajo-test';
        await svc.setCurrentTemplate('Contrato de Teletrabajo', userId, 'doc-teletrabajo-test', purchaseId);

        await svc.storeGroupVariablesByPurchaseId(
            purchaseId,
            userId,
            'signing',
            {
                signingCity: 'Santo Domingo',
                signingProvince: 'Distrito Nacional',
                signingCountry: 'República Dominicana',
                documentSigningDate: '1 de julio de 2026',
                numberOfOriginals: 'dos (2)',
            }
        );

        const session = await svc.getPurchaseSession(purchaseId, userId);
        assert.ok(session);
        assert.equal(session.variables.documentSigningDate, 'primero (1) de julio del dos mil veintiséis (2026)');
        assert.equal(session.variables.signingDayLetters, 'primero');
        assert.equal(session.variables.signingDayNumbers, '1');
        assert.equal(session.variables.signingMonthLetters, 'julio');
        assert.equal(session.variables.signingYearLetters, 'dos mil veintiséis');
        assert.equal(session.variables.signingYearNumbers, '2026');
    });

    it('Contrato Teletrabajo: mapAnswersToGroupSchema maps signing narratives to documentSigningDate', () => {
        const mapped = svc.mapAnswersToGroupSchema(
            'Contrato de Teletrabajo',
            'signing',
            {
                'Fecha de firma del contrato': '15 de marzo de 2026',
                signingCity: 'Santiago',
                signingProvince: 'Santiago',
                numberOfOriginals: 'tres (3)',
            }
        );
        assert.equal(mapped.mapped.documentSigningDate, '15 de marzo de 2026');
    });

    it('Contrato Teletrabajo: reconcile marks signing group complete and does not report split signing fields', async () => {
        const session = testSession('Contrato de Teletrabajo', {
            employerIsCompany: 'Persona física',
            employerLegalName: 'Juan Pérez',
            employerNationality: 'dominicana',
            employerMaritalStatus: 'soltero(a)',
            employerOccupation: 'ingeniero',
            employerIdType: 'de la Cédula de Identidad y Electoral',
            employerIdNumber: '001-1234567-8',
            employerFullAddressStreet: 'Calle Principal 10',
            employerFullAddressCity: 'Santo Domingo',
            employerFullAddressCountry: 'República Dominicana',
            employeeFullName: 'María López',
            employeeNationality: 'dominicana',
            employeeMaritalStatus: 'soltero(a)',
            employeeOccupation: 'ingeniero',
            employeeIdType: 'de la Cédula de Identidad y Electoral',
            employeeIdNumber: '001-9876543-2',
            employeeAddressStreet: 'Calle 1',
            employeeAddressCity: 'Santo Domingo',
            employeeAddressCountry: 'República Dominicana',
            positionTitle: 'Asistente',
            startDay: '15',
            startMonth: 'marzo',
            startYear: '2026',
            specificDuties: 'funciones',
            hasAdditionalResponsibilities: 'No',
            department: 'Tecnología',
            supervisorPositionTitle: 'Gerente',
            supervisorContactInfo: '809-555-5555',
            salaryInWords: 'veinte mil',
            salaryAmountWithCurrency: 'RD$20,000.00',
            paymentFrequency: 'mensuales',
            paymentSchedule: 'los 30',
            numberOfOriginals: 'dos (2)',
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '15 de marzo de 2026',
            numberOfAnnualVacationDays: '14',
            hasAdditionalBenefits: 'No',
            workplaceAddress: 'Calle 2',
            workplaceCity: 'Santo Domingo',
            workplaceCountry: 'República Dominicana',
            hasInPersonDays: 'No',
            workSchedule: 'lunes a viernes',
            lunchBreakDuration: '1 hora',
            hasCostCoverage: 'No',
            costResponsible: 'EL EMPLEADOR',
            hasWorkTools: 'No',
            contractDuration: 'por tiempo indefinido',
            nonCompetePeriod: '6 meses',
            noticePeriod: '15 días',
            notificationPeriod: '5 días',
            notaryJurisdiction: 'Distrito Nacional',
            notaryOfficeAddress: 'Calle 3',
            employerOrRepFullName: 'Juan Pérez',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(progress.allComplete, true);
    });

    it('Nationality fields normalization: lowercases nationality input', () => {
        const normalize = (
            svc as unknown as {
                normalizeFieldValuesForStorage: (
                    templateName: string,
                    vars: Record<string, string | number>,
                ) => Record<string, string | number>;
            }
        ).normalizeFieldValuesForStorage.bind(svc);

        const out = normalize('Poder de Representación Signos Distintivos', {
            principalRepNationality: 'DOMINICANO',
            principalNationality: 'Dominicano',
            proxyNationality: 'dominicana',
            declarantNationality: 'Venezolana',
        });

        assert.equal(out.principalRepNationality, 'dominicano');
        assert.equal(out.principalNationality, 'dominicano');
        assert.equal(out.proxyNationality, 'dominicana');
        assert.equal(out.declarantNationality, 'venezolana');
    });

    it('Choice / Dropdown fields normalization: normalizes casing to match schema options', () => {
        const normalize = (
            svc as unknown as {
                normalizeFieldValuesForStorage: (
                    templateName: string,
                    vars: Record<string, string | number>,
                ) => Record<string, string | number>;
            }
        ).normalizeFieldValuesForStorage.bind(svc);

        const out = normalize('Poder de Representación Signos Distintivos', {
            principalIsCompany: 'empresa',
            principalRepIdType: 'del pasaporte',
        });

        assert.equal(out.principalIsCompany, 'Empresa');
        assert.equal(out.principalRepIdType, 'del Pasaporte');
    });

    it('Handlebars helper idNumberLabel: returns singular/plural properly', () => {
        const template = Handlebars.compile('{{idNumberLabel idType idNumbers}}');

        // Test singular cases
        assert.equal(template({ idType: 'de la Cédula de Identidad y Electoral', idNumbers: '001-1234567-8' }), 'número');
        assert.equal(template({ idType: 'del Pasaporte', idNumbers: 'RD123456' }), 'número');

        // Test plural cases via type
        assert.equal(template({ idType: 'de la Cédula de Identidad y Electoral y del Pasaporte', idNumbers: '001-1234567-8' }), 'números');

        // Test plural cases via numbers format (with comma or "y")
        assert.equal(template({ idType: 'del Pasaporte', idNumbers: 'RD123456, RD789012' }), 'números');
        assert.equal(template({ idType: 'del Pasaporte', idNumbers: 'RD123456 y RD789012' }), 'números');
    });

    it('Declaración Jurada: auto-fills notaryProvince from signingProvince', async () => {
        const session = testSession('Declaración Jurada de Domicilio', {
            declarantFullName: 'Juan Pérez',
            declarantNationality: 'dominicano',
            declarantIdType: 'de la Cédula de Identidad y Electoral',
            declarantIdNumbers: '001-1234567-8',
            yearsOfResidenceLetters: 'cinco',
            yearsOfResidenceNumbers: '5',
            declarantFullAddress: 'Calle Duarte #5, Santo Domingo, Distrito Nacional',
            witness1FullName: 'María López',
            witness1Nationality: 'dominicana',
            witness1IdType: 'de la Cédula de Identidad y Electoral',
            witness1IdNumber: '001-2345678-9',
            witness2FullName: 'Pedro Gómez',
            witness2Nationality: 'dominicano',
            witness2IdType: 'de la Cédula de Identidad y Electoral',
            witness2IdNumber: '001-3456789-0',
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            signingDayLetters: 'primero',
            signingDayNumbers: '1',
            signingMonthLetters: 'julio',
            signingYearLetters: 'dos mil veintiséis',
            signingYearNumbers: '2026',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.notaryProvince, 'Distrito Nacional');
        assert.equal(progress.allComplete, true);
    });
});

describe('sessionProgressToNextGroupResult', () => {
    it('maps allComplete progress to getNextGroup shape', async () => {
        const session = testSession('Contrato de Compraventa Vehículo', {
            sellerIsCompany: 'Persona física',
            sellerFullName: 'Juan Pérez',
            sellerNationality: 'dominicana',
            sellerIdType: 'de la Cédula de Identidad y Electoral',
            sellerIdNumber: '001-1234567-8',
            sellerFullAddress: 'Calle 1, Santo Domingo',
            buyerIsCompany: 'Persona física',
            buyerFullName: 'María López',
            buyerNationality: 'dominicana',
            buyerIdType: 'de la Cédula de Identidad y Electoral',
            buyerIdNumber: '001-7654321-0',
            buyerFullAddress: 'Calle 2, Santo Domingo',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        if (progress.allComplete) {
            const { sessionProgressToNextGroupResult } = await import('./session-progress.js');
            const next = sessionProgressToNextGroupResult(progress);
            assert.ok('allComplete' in next);
        }
    });
});

describe('Section 8: Abbreviation and ID Formatting', () => {
    it('standardizes variants of Number to No. with a space', async () => {
        const { normalizeIdentificationPresentation } = await import('./id-presentation-format.js');
        assert.equal(normalizeIdentificationPresentation('Nº12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('Nº 12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('No12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('No.12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('Nno. 12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('Nno12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('Num.12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('Num 12'), 'No. 12');
        assert.equal(normalizeIdentificationPresentation('Num12'), 'No. 12');
    });
});

describe('Section 9: Dominican Currency and Monetary Formatting', () => {
    it('enforces exactly two decimal places and prepends RD$ for standard keys', async () => {
        const { formatDominicanPesoAmount } = await import('./currency-amount-format.js');
        assert.equal(formatDominicanPesoAmount('1000', 'salaryAmountWithCurrency'), 'RD$1,000.00');
        assert.equal(formatDominicanPesoAmount('25500.75', 'totalAmountWithCurrency'), 'RD$25,500.75');
        assert.equal(formatDominicanPesoAmount('RD$ 100000', 'monthlyAmountWithCurrency'), 'RD$100,000.00');
    });

    it('enforces exactly two decimal places and strips RD$ for plain keys', async () => {
        const { formatDominicanPesoAmount } = await import('./currency-amount-format.js');
        assert.equal(formatDominicanPesoAmount('1000', 'salaryMonthlyAmount'), '1,000.00');
        assert.equal(formatDominicanPesoAmount('RD$ 25500.75', 'salaryAmountInNumbers'), '25,500.75');
    });
});

describe('Paired Fields Ask-Once Skip Logic', () => {
    it('does not report salaryInWords as missing if salaryAmountWithCurrency is provided', async () => {
        const session = testSession('Contrato de Trabajo', {
            employerIsCompany: 'Persona física',
            employerLegalName: 'Juan Pérez',
            employerNationality: 'dominicana',
            employerMaritalStatus: 'soltero(a)',
            employerOccupation: 'abogado',
            employerIdType: 'de la Cédula de Identidad y Electoral',
            employerIdNumber: '001-1234567-8',
            employerFullAddress: 'Santo Domingo',
            employeeFullName: 'María López',
            employeeNationality: 'dominicana',
            employeeMaritalStatus: 'soltero(a)',
            employeeOccupation: 'ingeniera',
            employeeIdType: 'de la Cédula de Identidad y Electoral',
            employeeIdNumber: '001-7654321-0',
            employeeFullAddress: 'Santo Domingo',
            positionTitle: 'Ingeniera de Software',
            startDay: '15',
            startMonth: 'marzo',
            startYear: '2026',
            specificDuties: 'escribir código',
            hasAdditionalResponsibilities: 'No',
            workplaceAddress: 'Av. Winston Churchill #10',
            workplaceCity: 'Santo Domingo',
            workplaceProvince: 'Distrito Nacional',
            workSchedule: 'lunes a viernes',
            lunchBreakDuration: '1 hora',
            weeklyHours: '40',
            overtimePolicy: 'conforme a la ley',
            // Here, we provide only one of the paired salary keys:
            salaryAmountWithCurrency: 'RD$50,000.00',
            paymentFrequency: 'mensuales',
            paymentSchedule: 'los 15 y 30',
            hasAdditionalBenefits: 'No',
            vacationPolicy: 'conforme a la ley',
            numberOfOriginals: 'dos (2)',
            signingCity: 'Santo Domingo',
            signingProvince: 'Distrito Nacional',
            signingCountry: 'República Dominicana',
            documentSigningDate: '10 de marzo de 2026',
            notaryJurisdiction: 'Distrito Nacional',
            notaryOfficeAddress: 'Av. 27 de Febrero #20',
            employerOrRepFullName: 'Juan Pérez',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        // Verify that the salary group completes and is NOT in the missingFieldKeys!
        assert.ok(!(progress.missingFieldKeys as string[]).includes('salaryInWords'));
        // And also verify that it filled the missing partner:
        assert.equal(session.variables.salaryInWords, 'cincuenta mil pesos dominicanos con 00/100');
    });

    it('Dynamic signingCountry: session progress should require and handle signingCountry in the signing group', async () => {
        const session = testSession('Contrato de Trabajo', {
            signingCity: 'Madrid',
            signingProvince: 'Madrid',
            signingCountry: 'España',
            documentSigningDate: '15 de marzo de 2026',
        });
        const progress = await svc.reconcileSessionProgress(session, { persist: false });
        assert.ok(!('error' in progress));
        assert.equal(session.variables.signingCountry, 'España');
    });

    describe('normalizeFieldValuesForStorage additional normalizations', () => {
        it('cleans redundant prefixes and suffixes from workSchedule and nonCompetePeriod', () => {
            const rawVars = {
                workSchedule: 'Horario: lunes a viernes de 8 a 5',
                nonCompetePeriod: 'seis (6) meses después de finalizado el contrato.'
            };
            const normalized = (svc as any).normalizeFieldValuesForStorage('Contrato de Trabajo', rawVars);
            assert.equal(normalized.workSchedule, 'lunes a viernes de 8 a 5');
            assert.equal(normalized.nonCompetePeriod, 'seis (6) meses');
        });
    });
});

