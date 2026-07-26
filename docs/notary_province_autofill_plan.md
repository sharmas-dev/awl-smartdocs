# Implementation Plan - Auto-fill Notary Province from Signing Province

This plan outlines the changes required to automatically fill the notary certification province (`notaryProvince` / `notaryJurisdiction`) from the signing province (`signingProvince`) across all templates that collect a signing province and have a notary block. This will prevent the AI chatbot from asking redundant questions when they are legally identical.

## User Review Required

> [!IMPORTANT]
> The auto-fill logic will run globally for all document templates that define both `signingProvince` and either `notaryProvince` or `notaryJurisdiction` in their schema. By default, it will copy the value of `signingProvince` (with leading articles stripped, e.g. "Distrito Nacional" instead of "el Distrito Nacional") if the notary province/jurisdiction is not yet filled.

## Proposed Changes

### Document Assistant Module

#### [MODIFY] [doc-assistant.service.ts](file:///Users/vc/Downloads/document-ai-prod/src/modules/doc-assistant/doc-assistant.service.ts)

Extend `normalizeFieldValuesForStorage` to inspect the template schema and automatically propagate `signingProvince` to `notaryProvince` or `notaryJurisdiction` if it is present and the notary field is empty:

```typescript
        // Auto-fill notaryProvince or notaryJurisdiction from signingProvince if present and empty
        if (typeof out.signingProvince === 'string' && out.signingProvince.trim()) {
            let notaryKey: string | undefined;
            for (const g of schema.groups) {
                for (const v of g.variables) {
                    if (v.key === 'notaryProvince' || v.key === 'notaryJurisdiction') {
                        notaryKey = v.key;
                        break;
                    }
                }
                if (notaryKey) break;
            }
            if (notaryKey && (out[notaryKey] === undefined || out[notaryKey] === null || String(out[notaryKey]).trim() === '')) {
                const stripLeadingArticle = (s: string): string => {
                    const t = s.trim();
                    const lower = t.toLowerCase();
                    if (lower.startsWith('el ')) return t.slice(3).trim();
                    if (lower.startsWith('la ')) return t.slice(3).trim();
                    return t;
                };
                out[notaryKey] = stripLeadingArticle(out.signingProvince);
                changed = true;
            }
        }
```

#### [MODIFY] [doc-assistant.prompt.ts](file:///Users/vc/Downloads/document-ai-prod/src/modules/doc-assistant/doc-assistant.prompt.ts)

Generalize the chatbot prompt instructions regarding the notary province/jurisdiction at lines 339-340 to apply to all documents, not just "Recibo de Descargo Laboral" and "Recibo de Descargo Trabajadora Doméstica":

```diff
-**Recibo de Descargo Laboral** y **Recibo de Descargo Trabajadora Doméstica** — **notaría / jurisdicción:** En el mismo grupo que ciudad, provincia y fecha de firma, el esquema puede incluir *notaryProvince* / *notaryJurisdiction* **solo cuando difiere** de la provincia donde se firma. **No** pidas la provincia del notario de nuevo «por rutina» si ya tienes *signingProvince* — en la práctica es la misma. Solo pregunta **una aclaración corta** si el notario actuará en **otra** provincia; si no, omite la clave y el servidor usa *signingProvince* para el bloque notarial del PDF.
+**Notaría / Jurisdicción (notaryProvince / notaryJurisdiction):** En cualquier documento que incluya bloque notarial o de certificación (como Declaración Jurada de Domicilio, Contratos, Recibos, etc.), si ya tienes la provincia de firma (*signingProvince*), **no** pidas la provincia del notario de nuevo «por rutina» — en la práctica es la misma y el servidor la completa automáticamente. Solo pregunta **una aclaración corta** si el notario actuará en **otra** provincia; de lo contrario, omite la clave y el servidor usa *signingProvince* para el bloque notarial del PDF.
```

#### [MODIFY] [session-progress.test.ts](file:///file:///Users/vc/Downloads/document-ai-prod/src/modules/doc-assistant/session-progress.test.ts)

Add a unit test verifying this behavior for a document template like `Declaración Jurada de Domicilio`:

```typescript
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
```

---

## Verification Plan

### Automated Tests
- Run the build: `npm run build`
- Run the test suite: `node --test dist/modules/doc-assistant/session-progress.test.js`

### Manual Verification
- Verify that the chat assistant directly completes the workflow without presenting the notary province question when the signing province is provided.
