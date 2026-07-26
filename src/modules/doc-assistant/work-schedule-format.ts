/**
 * Canonical Spanish work-schedule text: "8 a.m. a 5 p.m., híbrido"
 * (lowercase a.m./p.m., Spanish " a " between times, optional modality after comma).
 */

const TIME_WITH_PERIOD = /(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)(?![a-z])/gi;

function foldPeriod(periodRaw: string): 'am' | 'pm' {
    const f = periodRaw.replace(/\./g, '').replace(/\s+/g, '').toLowerCase();
    return f.includes('p') ? 'pm' : 'am';
}

function formatClockHourMinute(hourStr: string, minStr: string | undefined, period: 'am' | 'pm'): string {
    let h = parseInt(hourStr, 10);
    const minutes = minStr ? parseInt(minStr, 10) : 0;
    const suffix = period === 'pm' ? ' p.m.' : ' a.m.';
    if (minutes !== 0) {
        return `${h}:${minutes.toString().padStart(2, '0')}${suffix}`;
    }
    return `${h}${suffix}`;
}

export function normalizeWorkScheduleText(raw: string): string {
    let s = raw.trim().replace(/\s+/g, ' ');
    if (!s) return raw;

    s = s.replace(TIME_WITH_PERIOD, (_, h: string, m: string | undefined, per: string) =>
        formatClockHourMinute(h, m, foldPeriod(per)),
    );

    // Range connectors after first time: – / - / hasta / to → Spanish " a "
    s = s.replace(/(a\.m\.|p\.m\.)\s*(?:[-–—]|hasta|to)\s*(?=\d)/gi, '$1 a ');
    s = s.replace(/(a\.m\.|p\.m\.)\s+a\s+(?=\d)/gi, '$1 a ');

    // Run time pass again if "8 - 5 p.m." left digits unparsed (unlikely after above)
    s = s.replace(TIME_WITH_PERIOD, (_, h: string, m: string | undefined, per: string) =>
        formatClockHourMinute(h, m, foldPeriod(per)),
    );

    s = normalizeTrailingModalityClause(s);

    return s;
}

/** Last comma-separated clause: normalize known modality keywords (Spanish, lowercase accents). */
function normalizeTrailingModalityClause(s: string): string {
    const lastComma = s.lastIndexOf(',');
    if (lastComma === -1) return s;

    const head = s.slice(0, lastComma).trimEnd();
    let tail = s.slice(lastComma + 1).trim();

    const fold = tail
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();

    const modalityMap: Record<string, string> = {
        hibrido: 'híbrido',
        hybrid: 'híbrido',
        presencial: 'presencial',
        remoto: 'remoto',
        remota: 'remoto',
        teletrabajo: 'teletrabajo',
        virtual: 'virtual',
        domicilio: 'domicilio',
        oficina: 'oficina',
    };

    const mapped = modalityMap[fold];
    if (mapped) {
        tail = mapped;
    } else if (/^modalidad\s+/i.test(tail)) {
        tail = tail.replace(/^modalidad\s+/i, 'modalidad ');
        const rest = tail.slice('modalidad '.length).trim();
        const restFold = rest
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase();
        if (modalityMap[restFold]) {
            tail = `modalidad ${modalityMap[restFold]}`;
        }
    }

    return `${head}, ${tail}`;
}

export function isWorkScheduleLikeKey(key: string): boolean {
    const k = key.toLowerCase();
    return k === 'workschedule' || k === 'modalitydetails';
}
