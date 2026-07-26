/**
 * Migrates legacy single-line address variables to structured street/city/country for Contrato de Teletrabajo.
 */
export function migrateContratoTeletrabajoLegacyAddresses(out: Record<string, string | number>): boolean {
    let changed = false;

    const lift = (oldKey: string, streetKey: string, cityKey: string, countryKey: string) => {
        const raw = out[oldKey];
        if (typeof raw !== 'string' || !raw.trim()) return;
        if (String(out[streetKey] ?? '').trim()) return;

        out[streetKey] = raw.trim();
        out[cityKey] = '';
        out[countryKey] = 'República Dominicana';
        delete out[oldKey];
        changed = true;
    };

    lift('employerFullAddress', 'employerFullAddressStreet', 'employerFullAddressCity', 'employerFullAddressCountry');
    lift('employerRepAddress', 'employerRepAddressStreet', 'employerRepAddressCity', 'employerRepAddressCountry');
    lift('employeeFullAddress', 'employeeAddressStreet', 'employeeAddressCity', 'employeeAddressCountry');

    return changed;
}
