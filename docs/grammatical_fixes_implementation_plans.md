# Grammatical and Legal Formatting Implementation Plans

This document consolidates the implementation plans and technical specifications for all grammatical, gender inference, and legal formatting rules applied across the document assistant pipeline.

---

## 1. Date Normalization and Legal Formatting

### 1.1 Overview and Rules
To ensure compliance with Spanish legal drafting conventions, generated dates in Spanish documents must adhere to the following standards:
1. **Month Formatting**: Month names must always be lowercase (e.g. `mayo`, `diciembre` instead of `Mayo`, `Diciembre`).
2. **Parenthesized Numeric Values**: Numeric month values must not be displayed in parentheses. Only day and year numeric representations may be parenthesized.
3. **Legal Date Rendering Format**:
   - Correct: `dieciséis (16) de mayo del dos mil veintiséis (2026)`
   - Incorrect: `Dieciséis (16) de Mayo (5) del Dos Mil Veintiséis (2026)`
4. **Paragraph Initiation**: If the date starts a paragraph, table cell, or list item, the first letter must be capitalized (e.g. `Dieciséis (16)...`). Otherwise, it remains lowercase (e.g. in the middle of a sentence: `...en fecha dieciséis (16)...`).

### 1.2 Proposed Changes

#### A. Date Formatting Engine (`natural-date-normalize.ts`)
- Update `buildSpanishLegalDateDualFromYMD` to generate lowercase day and year words.
- Remove the parenthesized month numeric representation (`(${monthNum})`) from the generated dual date string.
- Retain lowercase month names.
- Update `isAlreadyDualSpanishLegalDate` regex to correctly validate the new dual format.

#### B. Teletrabajo Month Mapping Bug (`contrato-teletrabajo-dates.ts`)
- Replaced the duplicate `'setiembre'` index-based lookup in `monthNameFromNumber` with a standard 12-month lowercase array.

#### C. HTML/PDF Post-Processing (`doc-assistant.service.ts`)
- Added JSDOM post-processing inside `fillAndExport` to query block tags (`p`, `td`, `li`).
- If their text content starts with a lowercase dual date, capitalize the first letter. This ensures correct casing at sentence/paragraph start while preserving lowercase in the middle of sentences.

#### D. Unit Tests (`natural-date-normalize.test.ts`)
- Updated tests for `formatSpanishLegalDateDual` to assert the new lowercase and month-parenthesis-free dual format, as well as migration of legacy dual styles.

---

## 2. Name Gender Inference and Conjunction Handling

### 2.1 Overview and Rules
To ensure phonetic harmony and grammatical gender agreement in Spanish texts, the pipeline must follow these rules for names and conjunctions:
1. **Phonetic Conjunction Rules**:
   - The conjunction `y` ("and") changes to `e` when the following word begins with the sound of `i` (written `i` or `hi`), e.g., `Sharma e Isabella`, `Pedro e Hilario`.
   - The conjunction does not change to `e` before diphthongs like `ia`, `ie`, `io`, `iu` (e.g., `Pedro y Ian`, `Pedro y Hieronimo` are correct).
   - This change must apply both in the chat responses and in the generated PDF.
2. **Multiple-Party Gender Resolution**:
   - When multiple individuals are joined by `y` or `e`, each name is evaluated independently.
   - If at least one individual is identified as male or gender-neutral, the group defaults to masculine (`Hombre`).
   - A group is considered feminine (`Mujer`) only when all identified individuals are female.
3. **Surname Exclusion Set**:
   - To prevent incorrect classification of surnames ending in `a` as feminine given names, the following list of surnames is excluded from feminine given name inference:
     `garcia, bautista, mejia, pena, sosa, mota, mendoza, rivera, acosta, tejeda, guerra, silva, vega, plaza, peralta, sena, moya, reyna, ledezma, ortega, avila, tapia, morla, beltré`
   - These surnames default to the masculine/neutral fallback unless stronger gender evidence exists (e.g., a feminine given name preceding them).
4. **Unisex/Ambiguous Names Gender Verification**:
   - If a name is a unisex name, ambiguous, or not obvious, or if the assistant has less information to confidently infer the gender, it must explicitly ask the user for their gender (e.g., whether they should be addressed as señor or señora) to ensure grammatical correctness and gender agreement.

### 2.2 Proposed Changes

#### A. Conjunction Normalization (`gender-choice-format.ts`)
- Implement a helper function `normalizeNameConjunction(fullName: string): string` that splits names by ` y ` or ` e ` (case-insensitively).
- Check if each subsequent name starts with an `i` or `hi` sound (i.e. `i` or `hi` followed by a consonant).
- Standardize the conjunction to `e` if it starts with an `i` sound, otherwise standardizing to `y`.
- Preserve spacing and casing structure.

#### B. Storage Pipeline Integration (`doc-assistant.service.ts`)
- In `normalizeFieldValuesForStorage`, identify name-like fields (such as `declarantFullName`, `witness1FullName`, `employerFullName`, etc.) and apply `normalizeNameConjunction` before persisting. This ensures the clean names are propagated to both the chat context and the PDF template variables.

#### C. Prompt Instructions Update (`doc-assistant.prompt.ts`)
- Modify `RULE 5c` (GÉNERO Y TRATAMIENTO) to instruct the assistant to check for unisex, ambiguous, or not obvious names. If in doubt or with insufficient information, the assistant must ask the user for clarification (asking if they prefer "señor" or "señora") rather than guessing. This requirement applies globally across all templates.

#### D. Verification & Tests (`declaracion-jurada-domicilio-gender.test.ts`)
- Add unit tests for the phonetic conjunction rules and verify existing tests for multiple-party gender resolution and surname exclusions.
