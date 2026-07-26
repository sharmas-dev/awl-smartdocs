# Document pipeline – what to do next

Your **Acuerdo de Confidencialidad y No-Elusión** DOCX is set up. Here’s what’s done and what’s next.

---

## Done

1. **Variables identified** – 72 placeholders (e.g. `[Insert party 1 jurisdiction]`, `[INSERT PARTY 1 LEGAL NAME]`).
2. **DOCX → .hbs** – The DOCX was converted to a Handlebars template:
   - **Template:** `templates/Acuerdo de Confidencialidad y No-Elusión.hbs`
   - All `[Insert ...]` / `[INSERT ...]` blocks were replaced with `{{variableName}}` (e.g. `{{party1Jurisdiction}}`, `{{party1LegalName}}`).

---

## Next steps

### 1. Fill the template from the chatbot (Handlebars)

- **Handlebars** compiles the `.hbs` with a data object and outputs HTML.
- The chatbot (NitroStack tools) will collect the 72 values (party 1 name, RNC, dates, etc.) and pass them as one object into Handlebars.
- Add a **NitroStack tool** (e.g. `fill_confidentiality_agreement`) that:
  - Reads the `.hbs` file.
  - Accepts variables from the chat (or a form).
  - Calls Handlebars to produce HTML.
  - (Optional) Returns HTML for preview or passes it to the PDF step.

### 2. Convert HTML → PDF (Puppeteer)

- Use **Puppeteer** (or Playwright) to open the filled HTML and `page.pdf()` to generate a PDF.
- This can be a second tool (e.g. `generate_agreement_pdf`) or the same tool that fills the template and then generates the PDF.

### 3. Wire it in NitroStack

- **New module** (e.g. `doc-assistant`): tools + service for:
  - Listing templates.
  - Getting required variables for a template.
  - Filling a template (Handlebars).
  - Generating PDF (Puppeteer).
- **Chatbot flow:** User asks for an agreement → tool returns list of variables → user (or AI) provides values → tool fills template and returns PDF or download link.

---

## Commands you have

```bash
# List variables in a DOCX
npm run identify-variables -- "templates/Acuerdo de Confidencialidad y No-Elusión.docx"

# Convert DOCX → .hbs (run again if you change the DOCX)
npm run docx-to-hbs -- "templates/Acuerdo de Confidencialidad y No-Elusión.docx"

# Fill template with variables and export PDF (CLI)
npm run fill-and-export-pdf -- "templates/Acuerdo de Confidencialidad y No-Elusión.hbs" templates/sample-variables.json
```

**Variables file:** Edit `templates/sample-variables.json` with your values, or pass another JSON file. Keys must match the placeholders in the .hbs (e.g. `party1LegalName`, `signingCity`). Output PDF is written to `templates/output/<template-name>.pdf` and is ready for download.

---

## Summary

| Step                    | Status   | How |
|-------------------------|----------|-----|
| Identify variables      | Done     | `npm run identify-variables -- <docx>` |
| DOCX → .hbs             | Done     | `npm run docx-to-hbs -- <docx>` |
| Fill .hbs (Handlebars)  | To build | NitroStack tool + Handlebars |
| HTML → PDF              | To build | NitroStack service + Puppeteer |
| Chatbot flow            | To build | Tools: list templates, get variables, fill & export PDF |

**NitroStack tools:** When you run the MCP server (`npm run dev` or `npm start`), the chatbot can call:
- **`list_document_templates`** – lists available .hbs template names.
- **`fill_document_and_export_pdf`** – pass `templateName` and `variables` (object); the server fills the template and writes the PDF to `templates/output/<templateName>.pdf`. The tool returns the path so the user can download the file.

If you want, next we can add the **Handlebars + Puppeteer** flow and a first NitroStack tool that fills the agreement and generates the PDF.
