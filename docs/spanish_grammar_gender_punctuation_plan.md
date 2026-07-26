# Plan for Spanish Grammatical, Gender, and Punctuation Fixes

This document outlines the rules and implementations for correct Spanish grammar, gender agreement, and punctuation rendering within the **AWL Document Assistant** platform. It serves as a unified reference of all formatting, sanitization, and normalization guardrails.

---

## 1. Date Normalization & Punctuation
In Spanish legal documents, dual date formats (letters + digits) must follow standard casing and punctuation:
- **Lowercase Months**: Month names must be written in lowercase (e.g., `mayo`, `diciembre`, not `Mayo`, `Diciembre`).
- **Lowercase Primero**: The word "Primero" for the first day of a month must be written in lowercase (e.g. `primero (1) de julio`). Other day words are capitalized (e.g. `Dieciséis (16)`).
- **Capitalized Year Start**: The year words should start with a capitalized letter (e.g. `Dos Mil Veintiséis`, starting with `Dos`).
- **Month Numbers in Parentheses**: Month numbers in parentheses (e.g. `mayo (5)`) are retained to match the dual format structure in the system:
  - **Correct**: `primero (1) de julio (7) del Dos Mil Veintiséis (2026)`
  - **Correct**: `Dieciséis (16) de mayo (5) del Dos Mil Veintiséis (2026)`
- **Backward Compatibility**: Pre-existing session values with legacy capitalized month names will be automatically parsed, normalized, and upgraded to the clean lowercase format.

---

## 2. Name Gender Inference & Conjunction Rules
Employer names are parsed to determine whether to address them as `el señor` / `la señora` and refer to them as `el Empleador` / `la Empleadora` in legal boilerplate.

### A. Phonetic Conjunctions ("y" vs "e")
- In Spanish, the conjunction "and" is represented by "y".
- However, if the following name starts with an "I" or "Hi" sound (e.g., "Isabella", "Hilario"), the conjunction phonetically changes to "e" to avoid cacophony.
  - **Example**: `Sharma e Isabella`
  - **Example**: `sharma y kevin`

### B. Multiple-Name Gender Logic
- When a user inputs joint/multiple names (e.g., names joined by `y` or `e`), the system must determine the overall grammatical gender for the group:
  - If a group contains at least one male (or a name/surname that defaults to male/neutral), the entire group defaults to `Hombre` (masculine fallback).
  - The group is only inferred as `Mujer` (feminine) if ALL individual names are female.
- To implement this, the name parser splits inputs containing case-insensitive ` y ` or ` e ` into distinct name parts and resolves the gender of each part.

### C. Surname Exclusion Set
The naive gender inference rule that infers `Mujer` for any first name ending in "a" causes false-positives for surnames. A comprehensive exclusion set (`masculineA`) will prevent incorrect gender inference for common Spanish and international surnames ending in "a":
- **Excluded Surnames**: `sharma`, `garcia`, `bautista`, `mejia`, `pena`, `sosa`, `mota`, `mendoza`, `rivera`, `acosta`, `tejeda`, `guerra`, `silva`, `vega`, `plaza`, `peralta`, `sena`, `moya`, `reyna`, `ledezma`, `ortega`, `avila`, `tapia`, `morla`, `beltré`.
- Surnames matching this set will not trigger the ends-with-"a" feminine rule, defaulting correctly to the masculine fallback.

### D. Unisex / Ambiguous Name Clarification
- If a name is a unisex name (e.g. Alex, Jean, Sharma), ambiguous, or not obvious, or if the assistant has less information to confidently infer the gender, it MUST explicitly ask the user for their gender (e.g., asking whether they should be addressed as señor or señora) to ensure correct grammatical/gender agreement and avoid any formatting issues in the final document. This is enforced globally across all templates.

---

## 3. Marital Status Normalization (Gender Agreement)
Schema schemas define marital status options as `casado(a)` and `soltero(a)` to be gender-neutral for UI forms. However, inserting these raw split-forms directly into legal text produces unprofessional documents (e.g., `Yo, Juan, casado(a), ...`).

- **Dynamic Normalization**: Before rendering or storing variables, the system will dynamically format split marital choices:
  - **Feminine Context**: Maps `casado(a)` -> `casada` and `soltero(a)` -> `soltera`.
  - **Masculine/Fallback Context**: Maps `casado(a)` -> `casado` and `soltero(a)` -> `soltero`.
- **Gender Association**: The system matches the marital status variable (e.g. `employeeMaritalStatus`) with its corresponding name field (e.g. `employeeFullName`) and infers the gender dynamically to apply the correct form.

---

## 4. Mid-Sentence Phrase Casing & Punctuation Cleanup
When variables are interpolated mid-sentence in a Handlebars template, raw user inputs can introduce capitalization errors or redundant punctuation (e.g., "...en virtud de Mal comportamiento..").
- **First Letter Lowercasing**: For mid-sentence variables (such as `terminationCauseDetail`, `specificDuties`, `paymentFrequency`), the first character is automatically lowercased.
- **Proper Noun Preservation**: The system preserves capitalization if the phrase starts with a proper noun (e.g., "Juan Pérez") or an acronym (e.g., "RNC").
- **Trailing Punctuation Stripping**: Trailing sentence markers (periods, commas, semicolons, colons) are stripped from raw inputs because the template provides its own terminating punctuation, preventing doubled punctuation (like `..` or `,.`).

---

## 5. Abbreviation & Generic Double-Dot Collapsing
Double periods often occur during template rendering (e.g., when a value ending in `a.m.` or `p.m.` meets a template's closing period `.`):
- **Abbreviation Dot Collapsing**: Formats like `a.m..` or `p.m..` are automatically collapsed to `a.m.` and `p.m.` after the template is compiled.
- **Generic Double-Dot Collapsing**: Any plain occurrence of exactly two consecutive periods `..` (e.g., `alquiler..`) is collapsed to a single period `.`.
- **Ellipsis Protection**: The system explicitly preserves three or more consecutive periods (e.g. `...` for ellipses), leaving them untouched.

---

## 6. Not-Applicable (N/A) Cleanup & Orphan Enumerations
Optional fields skipped by the user or filled with "N/A" must not render ugly placeholders or orphaned bullet points in the final contract text:
- **Value Suppression**: Common N/A phrases (e.g., `n/a`, `no aplica`, `none`, `na`) are stripped from variables before rendering.
- **Orphan Enumeration Scrubbing**: If an optional item in an HTML sequence (e.g. `<strong>b)</strong> {{benefit2}};`) is omitted, post-rendering HTML regexes automatically remove the empty enumeration tag (`<strong>b)</strong> ;`) to avoid gaps.
- **Separator Collapsing**: Cleans up multiple consecutive semicolons (`; ;`) or commas (`, ,`) left behind by skipped optional clauses.

---

## 7. Dominican Address Format Guardrails
Addresses in Dominican legal documents must be consistently structured:
- **Title Casing**: Human-entered address lines are title-cased per comma segment while maintaining standard capitalization for street numbers.
- **Street Abbreviation Standardization**: Prepares shorthand prefixes (e.g., `Av` or `Avda` become `Av.` and `Avda.`).
- **Santo Domingo Capital Formatting**: Capital addresses that reference `Santo Domingo` without a cardinal suffix (like Este/Oeste/Norte) automatically append `Distrito Nacional` for exact legal province identification when resolved programmatically.
- **Santo Domingo Conversational Clarification**: When using the chatbot, if a user enters "Santo Domingo" standalone as the city, AWLi must ask them to clarify if they mean **Santo Domingo de Guzmán** (Distrito Nacional), **Santo Domingo Este**, **Santo Domingo Oeste**, or **Santo Domingo Norte**. A standalone "Santo Domingo" is not stored directly.
- **Completeness Backfill**: If only a street name and the country are present, the system inserts the default capital city and province before the country.
- **Duplicating Country Suffix Stripping**: In templates that already print `, República Dominicana` statically, the suffix is removed from the variables to prevent duplication.

---

## 8. Cédula ID & Abbreviation Formatting
- **Cédula Formatter**: Dominican identity cards (Cédula de Identidad y Electoral) consist of 11 digits and are formatted uniformly as `XXX-XXXXXXX-X`.
- **Abbreviation Uniformity**: References to abbreviations like `Nº`, `no.`, or `No` are standardized to `No. ` with proper spacing.

---

## 9. Dominican Payout & Currency Words
- **Legally Formatted Amounts in Words**: Currency amount strings in words (such as salary) must end in a standard legal suffix: `pesos dominicanos con DD/100` (e.g., `cinco mil pesos dominicanos con 00/100`).
- **Currency Numbers**: Numeric values are formatted as `RD$X,XXX.XX` with commas for thousands and exactly two decimal places.
