# Document templates

Put your **sample DOCX** files here (e.g. `sample.docx`).

## Variable placeholders

Use one of these patterns in your Word document so the pipeline can detect and replace them:

| Pattern | Example | Use for |
|--------|---------|--------|
| `{{name}}` | `{{clientName}}`, `{{date}}` | **Handlebars** – recommended for .hbs → HTML → PDF |
| `{name}` | `{company}` | Single braces |
| `[[name]]` | `[[signature]]` | Double brackets |
| `${name}` | `${amount}` | Shell-style |

## Identify variables from a DOCX

From project root:

```bash
npm run identify-variables -- templates/sample.docx
```

Or after `npm install`:

```bash
node scripts/identify-docx-variables.mjs templates/sample.docx
```

The script will:

1. Extract raw text from the DOCX (using mammoth).
2. List all placeholder variables it finds.
3. Print the first 2000 characters of extracted text.

If you see *"No variable placeholders detected"*, add placeholders in one of the formats above and run again.
