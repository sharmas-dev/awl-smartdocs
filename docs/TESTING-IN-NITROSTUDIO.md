# Testing document tools in NitroStudio

Because the Acuerdo template has many variables (~60+), use one of these ways to test without pasting everything.

---

## Option 1: Use a variables file (easiest)

Call **`fill_document_and_export_pdf`** with **`variablesFilePath`** pointing to the sample JSON:

```json
{
  "templateName": "Acuerdo de Confidencialidad y No-Elusión",
  "variablesFilePath": "templates/sample-variables.json"
}
```

- Leave **`variables`** empty or omit it.
- The server reads `templates/sample-variables.json` (relative to the project root) and uses that for all placeholders.
- Edit `templates/sample-variables.json` on disk to change values; then run the tool again.

**In NitroStudio:** In the tool input for `fill_document_and_export_pdf`, enter only:

- **templateName:** `Acuerdo de Confidencialidad y No-Elusión`
- **variablesFilePath:** `templates/sample-variables.json`

No need to paste dozens of variables.

---

## Option 2: Minimal variables (quick smoke test)

To only check that the tool runs and a PDF is generated, pass a **small** `variables` object. Missing placeholders will render blank:

```json
{
  "templateName": "Acuerdo de Confidencialidad y No-Elusión",
  "variables": {
    "party1LegalName": "Constructora ABC, S.A.",
    "party2LegalName": "María López",
    "signingCity": "Santo Domingo de Guzmán",
    "signingDayNumbers": "18",
    "signingMonthLetters": "marzo",
    "signingYearNumbers": "2026"
  }
}
```

Good for confirming the flow in NitroStudio; the PDF will have many empty fields.

---

## Option 3: Full variables in the tool

You can still pass the full set of variables in the **`variables`** object (e.g. copy from `templates/sample-variables.json`). Use this when you want to drive everything from the chat/client without a file.

---

## AI speaks first (greeting + list documents on new chat)

**Goal:** When you open a new chat tab, the AI should immediately say something like: "I'm the document assistant, I can help you fill documents. Which document would you like to fill?" and call `list_document_templates` to show available documents — without you typing first.

**What we did (server side):** The doc-assistant **module description** now instructs the AI that on a **new chat** (no user messages yet), it **must** speak first: greet in Spanish, call `list_document_templates` with `{}`, show the templates list, and ask which document to fill.

**What depends on NitroStudio:** For the AI to actually *send* that first message when you open a new tab, NitroStudio must either:
- **Trigger a first turn** when a new chat is opened (e.g. send an empty or system "new conversation" message so the AI generates the greeting), or
- Expose a setting like "Initial message" / "Greeting" / "Run this prompt on new chat" that runs the assistant once with no user input.

NitroStack docs do not describe a "greeting" or "auto first message" config for NitroStudio; that behavior would be in the NitroStudio app itself. If NitroStudio does not trigger the AI on new chat, the user still has to send any message first (e.g. "Hi" or "List documents"); then the AI should reply with the greeting and the list, per the module instructions.

---

## "Hi" still gets generic NitroStudio greeting

If you say **"hi"** or **"Hola"** and the AI replies with something like *"Hello! How can I assist you today? If you have questions about NitroStack Studio or its MCP tools..."* instead of *"I'm document assistant AI, I can help you fill the documents..."*, that reply is **NitroStudio's default**, not from this MCP server.

**Fix:** NitroStudio is using its own system prompt for the chat. You need to **override it** with our instructions:

1. In NitroStudio, open **Settings** (gear icon) or **Project / AI / Chat** settings.
2. Find **System prompt**, **Agent instructions**, **Custom instructions**, or similar.
3. Paste the contents of **`docs/NITROSTUDIO-AGENT-INSTRUCTIONS.md`** (from "When the user says hi..." onward) into that field.
4. Save. New chats (or a new message like "hi") should then use the document-assistant greeting and call `list_document_templates`.

The MCP server cannot replace NitroStudio's built-in prompt; only a setting in NitroStudio can.

---

## AI chat not calling tools

If you ask **"What tools are available?"** in the NitroStudio AI chat and get a generic reply (e.g. "I cannot provide a specific list of tools") with **no tool calls**, the chat model is answering from its default behavior instead of using the MCP tools.

**Why:** The AI may not be configured to invoke MCP tools for that question, or tool-calling may not be in scope for that prompt.

**What to do:**

1. **Ask in a way that triggers a tool**  
   Try: **"List the available document templates"** or **"What documents can I fill?"** so the AI is more likely to call `list_document_templates` and show the result.

2. **Use the Tools panel**  
   In NitroStudio, open the **Tools** (or similar) panel and **invoke** `list_document_templates` with input `{}` yourself. You’ll get `{ "templates": ["Acuerdo de Confidencialidad y No-Elusión", ...] }`.

3. **Configure the AI in NitroStudio**  
   If NitroStudio lets you set a **system prompt** or **agent instructions**, add something like:  
   *When the user asks what tools are available or which documents can be filled, call the tool `list_document_templates` with empty input `{}` and then show the user the returned `templates` array. Prefer calling tools to answer rather than saying you cannot list tools.*

The MCP server cannot force the chat to call tools; the client (NitroStudio) and its AI config control that.

---

## Steps in NitroStudio

1. Start the MCP server from the project root: `npm run dev` (or `npm start`).
2. In NitroStudio, open your project and connect to the server.
3. **List templates:** **Invoke** the tool **`list_document_templates`** with empty input `{}`. The response will be `{ "templates": ["Acuerdo de Confidencialidad y No-Elusión", ...] }`. Do not use "list tools" (that returns the MCP tools catalog — tool definitions — not the document names).
4. **Generate PDF:** Call **`fill_document_and_export_pdf`** with:
   - `templateName`: `Acuerdo de Confidencialidad y No-Elusión`
   - `variablesFilePath`: `templates/sample-variables.json`
5. Check the tool response for **`pdfPath`** (e.g. `templates/output/Acuerdo de Confidencialidad y No-Elusión.pdf`). Open that file on your machine to view the PDF.

The PDF is written on the server’s filesystem (in your project folder). NitroStudio will show the path; use your file manager or IDE to open the PDF.

---

## Debugging: "No preview available"

For **purchase flows** (userDocumentId), the preview widget loads HTML from a **signed S3 URL** (`previewHtmlUrl`) returned by `generate_pdf` — not from a shared file on disk. Each purchase session has its own object under `previews/<hash>/preview.html`.

**Required env (production / NitroStudio):**

- `AWS_BUCKET_NAME_ECOM`, `AWS_S3_REGION_ECOM`, `AWS_ACCESS_KEY_ID_ECOM`, `AWS_SECRET_ACCESS_KEY_ECOM`
- S3 bucket CORS must allow GET from your chat/widget origin
- Optional: `NEXT_PUBLIC_WIDGET_API_ORIGIN` (widget app base URL) — only used by local `pdf-preview-test`, not production purchase previews

**After deploying Recibo de Descargo Trabajadora Doméstica fixes:**

1. Start a **fresh session**: call `submit_group_answers` with **only** `userDocumentId` (no `groupId`) so the server resets the purchase session.
2. On every group submit, pass **`userMessage`** with the user’s exact Spanish text (dates are parsed server-side).
3. Call **`generate_pdf` once** after `allComplete: true` (same `userDocumentId`).
4. If dates still look empty, the tool returns `pdfDatesNotReady: true` — re-ask the listed date groups; do not rely on a second `generate_pdf` with the same broken data.
5. **`generate_pdf` must use the same `userDocumentId` as `submit_group_answers`** (24-char hex). If the model omits it, the server now tries to infer it from the active session — verify logs show `INFERRED userDocumentId`.
6. After deploy, if the preview still shows `() de del año ()`, call `submit_group_answers` once more on each date group (server re-parses stored `__userMsg_*` blobs) then `generate_pdf` again.

**Question order (must not skip):** After **termination** (`terminationInfo`), the bot must still ask **vacation** (`vacationCoverageThroughDate`, e.g. “hasta qué año…”) and then **signing** (`signingCity`, `signingProvince`, `documentSigningDate`). Submitting termination with a date must **not** auto-fill vacation or signing from that same message. In logs, `vacationCoverageThroughDate` and `documentSigningDate` should appear in `SUBMIT_AFTER_STORE` only for `vacationInfo` / `signingInfo` submits — not right after `terminationInfo`.

### Verify logs (Recibo de Descargo Trabajadora Doméstica)

Structured lines are appended to **`doc-assistant.log`** (default: `logs/doc-assistant.log` locally, `/tmp/doc-assistant-logs/doc-assistant.log` in production). Grep:

```bash
grep RECIBO_DOMESTICA_VERIFY doc-assistant.log
# or
grep 'recibo-domestica' doc-assistant.log
```

Set **`DOC_ASSISTANT_LOG_CONSOLE=1`** to mirror the same lines to stderr during local dev.

Each verify entry includes **`pdfState`**:

- `canonicalDates` — schema keys (`employmentStartDate`, etc.)
- `pdfFragments` — HBS keys (`startDayNumbers`, `signingMonthLetters`, etc.)
- `emptyPdfFragments` — fragment keys still empty (should be `[]` before a good PDF)
- `pdfFragmentsReady` — `true` when all fragments are filled

**Event sequence to expect on a successful flow:**

| Event | When |
|--------|------|
| `SUBMIT_BEFORE_STORE` / `SUBMIT_AFTER_STORE` | Each `submit_group_answers` with a group |
| `STORE_GROUP_NORMALIZED` | After normalize on save |
| `NORMALIZE_DATE_PIPELINE` | Backfill + expand ran during normalize |
| `SYNC_NORMALIZED_AFTER` | Right before `generate_pdf` render |
| `GENERATE_PDF_AFTER_SYNC` | Session vars after sync |
| `GENERATE_PDF_DATE_CHECK` | `ok: true`, `issueCount: 0` |
| `FILL_PDF_VARS_READY` / `FILL_PDF_HTML_BUILT` | `htmlHasEmptyDatePlaceholders: false` |
| `GENERATE_PDF_PREVIEW_READY` | Final preview; check `previewS3` and fragments |

Override log directory: **`DOC_ASSISTANT_LOG_DIR`** or **`LOG_DIR`**.

**Local-only:** `/api/preview?name=<templateName>` still serves `src/templates/output/<Name>.html` for `pdf-preview-test` — that path is **global per template** and must not be used to validate purchase-specific Recibo doméstica sessions.

**Check:** (1) Backend writes `src/templates/output/<Name>.html` and `.pdf` on each `generate_pdf`. (2) Tool response includes `previewHtmlUrl` when S3 is configured. (3) Session variables after sync include PDF fragments such as `startDayNumbers`, `signingMonthLetters` (not only canonical keys like `employmentStartDate`).
