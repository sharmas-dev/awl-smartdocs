# Fix Contrato de Trabajadora Doméstica Template Issues

Six reported issues with the domestic worker contract template. All fixes scoped to this template only — no other templates will be affected.

## Proposed Changes

### Issue A & B — Redundant Questions (Same Info Asked Multiple Times)

The LLM is re-asking fields already provided. Root causes:

1. **Schema groups have overlapping/duplicate fields** — The `signing` group contains `signingCity`, `signingProvince`, and `documentSigningDate`. These fields also get asked in earlier groups because the LLM doesn't realize they've been answered.
2. **Missing prompt instructions** — The prompt file has template-specific pacing/grouping instructions for other templates (Compraventa, Teletrabajo, Recibo), but **none** for `Contrato de Trabajadora Doméstica` that limit per-turn field count or de-duplicate fields across groups.

**Fix:** Add a template-specific prompt section for `Contrato de Trabajadora Doméstica` that:
- Instructs the LLM to **never re-ask** fields already answered (employer name, ID, address) when transitioning between groups.
- Clarifies that the `employer` group data should be asked only once and not repeated when moving to the `signing` group.
- Reinforces that city/province in the signing group are about the **signing location** (which may differ from the employer's address), but if already provided, do not re-ask.

---

#### [MODIFY] [doc-assistant.prompt.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/doc-assistant.prompt.ts)

Add a `Contrato de Trabajadora Doméstica` prompt section (similar to existing template-specific sections) that:
- Prohibits re-asking employer name, ID, or address if already provided in an earlier group.
- Instructs that once the signing group starts, city and province are about signing location — don't re-ask if the user already gave them.
- Reinforces the RULE 5h-bis (ask signing date as one date, not separate fragments) which is already in the prompt but needs explicit mention for this template.

---

### Issue C — Notary Section Showing City Instead of Province/District

The notary section in the HBS template displays `{{notaryJurisdiction}}`. The server-side auto-fill in [domestic-contract-enrichment.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/domestic-contract-enrichment.ts) uses `fillDomesticContractNotaryFromEmployerAddress` (L115-137) which **incorrectly infers** the notary jurisdiction.

When the employer address contains "Santo Domingo" without "Distrito Nacional", the code sets `notaryJurisdiction = 'Santo Domingo'` (the city). But the template text says "Notario Público de los del Número para el {{notaryJurisdiction}}" — which legally requires the **province/district** (e.g., "Distrito Nacional"), not the city.

There's also `fillDomesticContractNotaryFromSigningProvince` (L140-151) which correctly uses `signingProvince`, but it only runs when `notaryJurisdiction` is empty — if the address-based auto-fill ran first, it blocks the province-based fill.

**Fix:**
1. Update `fillDomesticContractNotaryFromEmployerAddress` to always prefer the **province/district** over the city. When "Santo Domingo" is detected, set jurisdiction to "Distrito Nacional" (not "Santo Domingo").
2. Alternatively, reorder the logic: let `fillDomesticContractNotaryFromSigningProvince` run first (since `signingProvince` is explicitly asked for and is the more reliable field), and only fall back to employer address inference.

---

#### [MODIFY] [domestic-contract-enrichment.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/domestic-contract-enrichment.ts)

Fix `fillDomesticContractNotaryFromEmployerAddress` to return `'Distrito Nacional'` (not `'Santo Domingo'`) when the address is in the Santo Domingo metro area. This matches the legal requirement.

#### [MODIFY] [doc-assistant.service.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/doc-assistant.service.ts)

Reorder the enrichment calls so `fillDomesticContractNotaryFromSigningProvince` runs **before** `fillDomesticContractNotaryFromEmployerAddress`, giving the explicit signing province priority over the address-based inference.

---

### Issue D — Benefits Not Separated (a, b, c)

The HBS template line 75:
```html
<strong>a)</strong> {{otherBenefits}}.
```

When the user provides multiple benefits like "Seguro de Salud, Combustible y Vacaciones Pagas", the template renders them all under `a)` as one block, instead of separate items `a)`, `b)`, `c)`.

**Fix:** Update the HBS template to split `otherBenefits` by semicolons (`;`) and render each as a separate lettered item (`a)`, `b)`, `c)`, etc.). The prompt already instructs benefits to be joined with `"; "` (RULE 5k, line 526). Use the existing `{{eachSplit}}` Handlebars helper (already registered at line 146) to split by `;`.

---

#### [MODIFY] [Contrato de Trabajadora Doméstica.hbs](file:///Users/admin/nava/apps/document-ai-prod/src/templates/hbs/Contrato%20de%20Trabajadora%20Dom%C3%A9stica.hbs)

Replace the single `a) {{otherBenefits}}` with an `{{eachSplit}}` block that generates `a)`, `b)`, `c)`, etc. for each semicolon-separated benefit.

---

### Issue E — Currency Format: `(40,000 RD$)` should be `RD$ 40,000`

The HBS template line 66:
```html
({{salaryAmountWithCurrency}})
```

The server stores the value as `RD$40,000` (with RD$ prefix). The template wraps it in parentheses: `(RD$40,000)`. The reported output `(40,000 RD$)` suggests either the value was stored with RD$ at the end, or the normalization missed adding the prefix.

Looking at [domestic-salary-format.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/domestic-salary-format.ts) `normalizeDomesticSalaryCurrencyDisplay` — this function already normalizes to `RD$…` format. The issue might be:
1. User typed `40,000 RD$` and it wasn't caught by the normalizer (the regex only checks for `$... DOP` variants, not `... RD$` suffix pattern).
2. The display should show `RD$ 40,000` (with a space after `RD$`).

**Fix:**
1. Update `normalizeDomesticSalaryCurrencyDisplay` to also handle the `AMOUNT RD$` suffix pattern (e.g. `40,000 RD$` → `RD$40,000`).
2. The HBS template already renders `({{salaryAmountWithCurrency}})` — if the stored value is `RD$40,000`, output is `(RD$40,000)`. The user wants `RD$ 40,000` (with space). Update the normalizer to add a space after `RD$`.

---

#### [MODIFY] [domestic-salary-format.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/domestic-salary-format.ts)

1. Handle suffix pattern `40,000 RD$` → `RD$ 40,000`.
2. Ensure final format includes space: `RD$ 40,000` instead of `RD$40,000`.

---

### Issue F — Cédula Format Validation (001-0000000-0 Invalid)

The Cédula value `001-0000000-0` was stored despite being obviously invalid (all zeros). The cédula validation in [cedula-validation.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/cedula-validation.ts) only checks for 11-digit length — it doesn't reject all-zero values.

The user wants:
1. The system to **verify** the cédula input until the user gives a proper value.
2. In the document, use only a valid cédula — no assumptions.

**Fix:**
1. Add validation in `isCedulaFieldValueValid` (or `normalizeCedulaNumberInput`) to reject all-zero cédula values (e.g., `00100000000`).
2. Add a prompt instruction for this template that tells the LLM to reject obviously invalid cédulas (all zeros, sequential patterns) and re-ask.

> [!IMPORTANT]  
> The cédula `001-0000000-0` is technically 11 digits with the right format, so it passes the current length check. We need to add a rule that rejects cédulas where the body (middle 7 digits) is all zeros, as this is clearly a placeholder — not a real ID.

---

#### [MODIFY] [cedula-validation.ts](file:///Users/admin/nava/apps/document-ai-prod/src/modules/doc-assistant/cedula-validation.ts)

Add a check in `normalizeCedulaNumberInput` that rejects cédula values where all 11 digits are `0` or where the middle 7 digits are all `0` (placeholder pattern like `001-0000000-0`).

---

## Verification Plan

### Automated Tests
1. Run existing tests: `npm test` to ensure no regressions.
2. Add test cases for:
   - Cédula `001-0000000-0` being rejected.
   - Currency `40,000 RD$` being normalized to `RD$ 40,000`.
   - Notary jurisdiction defaulting to `Distrito Nacional` for Santo Domingo addresses.

### Manual Verification
- Start a new chat session with this template and verify:
  - Questions are not repeated across groups.
  - Notary shows "Distrito Nacional" not "Santo Domingo".
  - Benefits are separated with `a)`, `b)`, `c)`.
  - Salary shows as `RD$ 40,000`.
  - Invalid cédula `001-0000000-0` is rejected.
