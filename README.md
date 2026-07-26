# 📄 AWL Legal Document Assistant MCP Server

A high-performance Model Context Protocol (MCP) server built on the [NitroStack](https://docs.nitrostack.ai/intro) framework. This server acts as the conversational backend for selecting, filling, and exporting Dominican Republic legal documents into print-ready, professionally formatted PDFs.

---

## 🗺️ System Architecture

The diagram below illustrates how the Model Context Protocol (MCP) server coordinates between the LLM chat client, local database persistence, and AWS S3 storage for rendering visual preview widgets.

```mermaid
graph TD
    Client["MCP Client (e.g. NitroStudio / Cursor)"] <-->|JSON-RPC| MCP["MCP Server (NitroStack Core)"]
    
    subgraph Controllers [Controllers]
        MCP <--> Prompts["DocAssistantPrompts"]
        MCP <--> Tools["DocAssistantTools"]
    end
    
    subgraph Services [Services]
        Tools <--> Service["DocAssistantService"]
        Tools <--> DB["MongoService"]
        Service <--> DB
    end
    
    subgraph Storage [Storage]
        DB <--> MongoDB[("MongoDB\n(Sessions & Purchases)")]
        Service <-->|Upload Previews & PDFs| S3[("Amazon S3\n(Pre-signed URLs)")]
    end
```

---

## ✨ Core Features

*   🔄 **Guided Group-by-Group Filling** — Rather than dumping a massive schema onto the LLM, variables are collected iteratively group-by-group via the `submit_group_answers` tool.
*   🇩🇴 **Dominican Legal Customizations**:
    *   **Verbose Date Normalization**: Converts relative phrases (e.g. *"today"*, *"ayer"*, *"next Monday"*) into formal Spanish legal format (e.g. *"a los treinta y un (31) días del mes de marzo del año dos mil veintiséis (2026)"*).
    *   **Cédula Validation**: Strictly checks Dominican National ID Card (Cédula) checksums to ensure validity before storing.
    *   **RNC Validation**: Validates the structure and length of Dominican corporate taxpayer IDs (RNC).
    *   **Adjective Adherence**: Dynamically formats Spanish grammatical genders (adjective endings like *ciudadano/ciudadana*, *casado/casada*) based on the client's gender selection.
    *   **Peso Amount Verbose Conversion**: Converts numeric totals (e.g. `150,000.50`) into Spanish verbal numbers: *"ciento cincuenta mil pesos dominicanos con 50/100 (RD$150,000.50)"*.
*   ⚖️ **Coherence Checkers & Guards**:
    *   **Discharge Breakdown Verification**: Validates that sub-items (e.g. vacation payout, Christmas salary, notice pay) sum up perfectly to the grand total in discharge receipts (*Recibos de Descargo*).
    *   **Telework Conflict Flags**: Identifies logic or cost conflicts in remote-work agreements (*Contrato de Teletrabajo*).
*   🖼️ **Real-time PDF Previews** — Translates Handlebars (`.hbs`) templates to HTML using variable inputs, converts HTML into PDFs on-the-fly using `pdfmake`, and uploads temporary HTML files to AWS S3. These are rendered to users in the chat via custom UI widgets.
*   🔒 **JWT Security** — Ensures session and purchase security by restricting document edits to the purchaser.

---

## 📁 Repository Structure

```
├── docs/                      # Reference manuals, grammar plans, and testing guides
├── scripts/                   # Pipelines to convert, fill, and query resources
│   ├── docx-to-hbs.mjs        # Convert Word DOCX templates to Handlebars (.hbs)
│   ├── identify-variables.mjs # Parse variables and templates from DOCX
│   └── fill-and-export-pdf.mjs# Test-render templates with sample variables local
├── src/
│   ├── app.module.ts          # NitroStack Root Module config
│   ├── index.ts               # Bootstraps the server on all interfaces (0.0.0.0)
│   ├── modules/
│   │   └── doc-assistant/     # Main module containing controller, service, and validation
│   │       ├── doc-assistant.prompt.ts # Prompt injection override for NitroStudio
│   │       ├── doc-assistant.service.ts# Logic for schema, normalization, S3 integration
│   │       └── doc-assistant.tools.ts  # Exposed MCP tools catalog
│   ├── templates/
│   │   ├── docx/              # Source Word documents (.docx)
│   │   ├── hbs/               # Compiled Handlebars templates (.hbs)
│   │   ├── schemas/           # Variable schema constraints and conditional logic (JSON)
│   │   └── output/            # Locally compiled test outputs (.html, .pdf)
│   └── widgets/               # Frontend preview components using NitroStack SDK
```

---

## 📋 Available Templates & Schemas

The server houses high-quality templates and JSON schemas for Dominican legal documents:

| Template Name | Description |
| :--- | :--- |
| `Acuerdo de Confidencialidad y No-Elusión` | Non-Disclosure & Non-Circumvention Agreement |
| `Contrato de Compraventa Vehículo` | Vehicle Sales Contract |
| `Contrato de Representación Agente de Bienes Raíces` | Real Estate Brokerage Representation Agreement |
| `Contrato de Teletrabajo` | Teleworking Employment Contract |
| `Contrato de Trabajadora Doméstica` | Domestic Worker Employment Contract |
| `Contrato de Trabajo` | General Legal Employment Contract |
| `Declaración Jurada de Domicilio` | Sworn Declaration of Residence |
| `Notificación de Terminación Contrato de Alquiler` | Rental Termination Notice |
| `Poder de Representación Signos Distintivos` | Power of Attorney for Trademark Registration |
| `Propuesta de Trabajo` | Employment Job Offer |
| `Recibo de Descargo Laboral` | Employee Termination Discharge Receipt |
| `Recibo de Descargo Trabajadora Doméstica` | Termination Discharge Receipt for Domestic Workers |
| `Términos de Uso Página Web` | Web App Terms of Service |

---

## ⚙️ Environment Variables

Copy the example file to `.env` and fill in the values:

```bash
cp .envexample .env
```

| Key | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Listening port for the MCP application. | `3000` |
| `MONGO_URI` | MongoDB connection string. | `mongodb://localhost:27017` |
| `MONGO_DB_NAME` | Database containing purchases and sessions. | `doc-assistant` |
| `JWT_SECRET` | Secret key used to sign session authorization tokens. | `super_secure_secret` |
| `AWS_ACCESS_KEY_ID_ECOM` | AWS access key for preview uploads. | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY_ECOM` | AWS secret key for preview uploads. | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_S3_REGION_ECOM` | Region where S3 bucket resides. | `us-east-1` |
| `AWS_BUCKET_NAME_ECOM` | Target S3 bucket name. | `awl-document-previews` |
| `NEXT_PUBLIC_WIDGET_API_ORIGIN` | Absolute URL serving static previews. | `http://localhost:3001` |
| `DOC_ASSISTANT_DATE_TIMEZONE` | Timezone to interpret relative dates. | `America/Santo_Domingo` |

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
This starts the backend with hot reloading enabled via the NitroStack CLI:
```bash
npm run dev
```

### 3. Build & Run Production Bundle
```bash
npm start
```

---

## 🛠️ CLI Utilities & Local Pipeline

The project provides robust command-line tools in the `scripts/` directory for onboarding and testing templates:

### Parse Placeholder Variables from a DOCX
Analyzes a raw `.docx` file, extracts text via Mammoth, and outputs all found variables (e.g. `{{clientName}}`):
```bash
npm run identify-variables -- "src/templates/docx/Contrato de Corretaje/Contrato de Corretaje.docx"
```

### Convert DOCX to Handlebars Template
Automatically parses a Word document and compiles its text/markers into a `.hbs` template file ready for rendering:
```bash
npm run docx-to-hbs -- "src/templates/docx/Contrato de Corretaje/Contrato de Corretaje.docx"
```

### Local Dry-Run Template Filling
Fills an `.hbs` template using variables from a JSON file and compiles a local PDF in `src/templates/output/` without running the MCP server:
```bash
npm run fill-and-export-pdf -- "src/templates/hbs/Contrato de Teletrabajo.hbs" src/templates/sample-variables.json
```

---

## 🧪 Testing & Logging

*   **Session Logs**: Integration logs are outputted to `logs/doc-assistant.log`. You can enable console stdout logs by setting `DOC_ASSISTANT_LOG_CONSOLE=1`.
*   **MongoDB Diagnostics**: Use the testing script to run diagnostics against the database:
    ```bash
    node scripts/query-mongo.js
    ```
*   **Testing in NitroStudio**: Detailed documentation on setting up custom system instructions for the LLM agent and testing widgets can be found in [docs/TESTING-IN-NITROSTUDIO.md](file:///Users/vc/Downloads/document-ai-prod/docs/TESTING-IN-NITROSTUDIO.md).
