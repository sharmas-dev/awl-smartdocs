# Plan for Dynamic List Cleanups & Hyphen Placeholders

This plan details how the **AWL Document Assistant** will handle optional dynamic lists (e.g. services, benefits, costs, tools) correctly when not all list entries are filled, and prevent hyphen-like placeholder values (like `---`) from rendering in final PDFs.

---

## 1. The Problem

1. **Required Schema Variables**: In many schemas (e.g. `Términos de Uso Página Web.json`, `Contrato de Trabajo.json`, `Contrato de Teletrabajo.json`), list variables (like `service1`-`service6` or `benefit1`-`benefit4`) are all marked as `"required": true`. If a user only has 3 items to add, they are forced to fill the rest with dummy values like `"---"` or `"no aplica"` for the validation to pass.
2. **Untracked Not-Applicable Placeholders**: While standard phrases like `no aplica` or `N/A` are dynamically blanked by `blankNotApplicableValues`, raw hyphens like `---` are not listed in `NOT_APPLICABLE_FORMS`. Therefore, they remain unchanged and render directly into the document.
3. **Orphaned Enumerations**: When placeholders bypass sanitization, they print raw enum indexes like `d) ---; e) ---; f) ---.`, ruining the visual layout.

---

## 2. Proposed Solution

### A. Schema Updates
We will modify the schemas to only require the **first** item in a dynamic list, making subsequent items optional (`"required": false`):
- **[Términos de Uso Página Web.json](file:///Users/vc/Downloads/document-ai-prod/src/templates/schemas/T%C3%A9rminos%20de%20Uso%20P%C3%A1gina%20Web.json)**:
  - Make `service2`, `service3`, `service4`, `service5`, and `service6` optional (`"required": false`).
- **[Contrato de Trabajo.json](file:///Users/vc/Downloads/document-ai-prod/src/templates/schemas/Contrato%20de%20Trabajo.json)**:
  - Make `benefit2`, `benefit3`, and `benefit4` optional (`"required": false`).
- **[Contrato de Teletrabajo.json](file:///Users/vc/Downloads/document-ai-prod/src/templates/schemas/Contrato%20de%20Teletrabajo.json)**:
  - Make `benefit2`, `benefit3`, and `benefit4` optional (`"required": false`).
  - Make `cost2`, `cost3`, and `cost4` optional (`"required": false`).
  - Make `tool2` and `tool3` optional (`"required": false`).

### B. Handlebars & Sanitizer Updates
- **[not-applicable-cleanup.ts](file:///Users/vc/Downloads/document-ai-prod/src/modules/doc-assistant/not-applicable-cleanup.ts)**:
  - Add hyphen-based tokens to `NOT_APPLICABLE_FORMS`: `"-"`, `"--"`, `"---"`, `"----"`.
  - When raw user answers match these tokens, `blankNotApplicableValues` will automatically blank them to `""`.
  - When these variables evaluate to `""`, the global HTML post-processor `stripOrphanEnumerationsFromHtml` will automatically scrub the empty list items and seamlessly collapse trailing punctuation (e.g. converting `; .` to `.`).

---

## 3. Verification Plan

### A. Automated Tests
1. **New Unit Tests**:
   - Create **[not-applicable-cleanup.test.ts](file:///Users/vc/Downloads/document-ai-prod/src/modules/doc-assistant/not-applicable-cleanup.test.ts)** to assert:
     - Hyphen patterns (`-`, `--`, `---`, `----`) are successfully recognized as not-applicable values.
     - `stripOrphanEnumerationsFromHtml` correctly formats complex lists (e.g. `a) S1; b) S2; c) S3; d) ; e) ; f) .` collapsing into `a) S1; b) S2; c) S3.`).
2. **Running Tests**:
   - Compile and execute the test suites:
     ```bash
     npm run build && node --test dist/**/*.test.js
     ```

### B. Manual Verification
1. Run local generation for the `Términos de Uso Página Web` template with only 3 services filled (`service1`, `service2`, `service3`) and the rest skipped/empty or set to `"---"`.
2. Inspect the output HTML and PDF files inside `src/templates/output/` to ensure the final listing reads exactly:
   > **a)** [Service 1]; **b)** [Service 2]; **c)** [Service 3].
3. Ensure no orphaned bullet labels or raw hyphen values remain.
