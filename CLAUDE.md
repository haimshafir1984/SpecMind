# SpecMind — Business Requirements Consultant

## What This Project Does

SpecMind turns a natural Hebrew business conversation into a live functional specification. The user talks about their business; SpecMind acts as a **Business Success Consultant** — understanding the domain, extracting entities, workflows, roles, and business rules, and generating a spec document, technical schema, visual flow diagram, and UI prototypes.

**Domain-agnostic:** Retail, FinTech, Construction, Healthcare, HR, Logistics, etc. Domain is detected from context and business language adapts accordingly.

---

## Architecture

```
SpecMind/
├── backend/           FastAPI + Google Gemini SDK (Python)
├── frontend/          React 18 + Vite + Tailwind CSS
├── .claude/           Skill files (business_conversation_skill.md)
└── CLAUDE.md          This file
```

### Backend (`backend/`)

| File | Role |
|------|------|
| `main.py` | FastAPI app — CORS, session management, SSE, export, templates, Supabase routes |
| `analyst.py` | Two-pass Gemini architecture — Analyst (JSON) + Consultant (Hebrew text) |
| `supabase_client.py` | Supabase persistence — sessions, named blueprints, recent projects |
| `export_utils.py` | Word (.docx) and PDF generation with Hebrew RTL support |
| `templates.json` | 5 starter templates (Retail, FinTech, Healthcare, HR, Logistics) |
| `test_business_conversation.py` | 34 automated tests — jargon detection, prompt rules, delta language |
| `.env` | `GOOGLE_API_KEY=...` and optional Supabase vars |
| `requirements.txt` | Python dependencies |

**Key design decisions:**
- Sessions are in-memory (`dict[str, Analyst]`) — restart clears sessions (Supabase is the durable store)
- Each `Analyst` owns two separate conversation histories: `self.conversation` (Analyst) and `self._consultant_conversation` (Consultant)
- `main.py` monkey-patches `httpx.AsyncClient` to disable proxy detection (required for Gemini SDK on this machine)
- Use `py` not `python` on this machine when running commands

### AI Provider

SpecMind uses **Google Gemini exclusively**.

| Model | SDK | Config |
|-------|-----|--------|
| `gemini-2.5-flash` | `google-genai` (`from google import genai`) | Analyst: `max_output_tokens=32768` / Consultant: `max_output_tokens=800` |

**Provider badge** in Blueprint Dashboard header: `✦ Gemini 2.5 Flash`

**Environment variable:** Only `GOOGLE_API_KEY` is required. Supabase vars are optional.

**Note:** The old `google-generativeai` package is deprecated. Use `google-genai` only.

---

## Two-Pass Architecture

Every user message triggers **two sequential Gemini calls**. There is no `===BLUEPRINT===` delimiter anymore — the two roles are completely separated.

### Pass 1 — Analyst (non-streaming, silent)

- Prompt constant: `ANALYST_PROMPT`
- Outputs ONLY a raw delta JSON object — no prose, no markdown
- History: `_analyst_history()` injects `[CURRENT SYSTEM STATE: ...]` as a fake first turn so the Analyst never re-extracts existing items
- `self.conversation` stores: user messages + `[EXTRACTED: business-language summary]` assistant turns
- Phase-aware: `self._analyst_system_prompt` is swapped by `start_phase()` using `_build_phase_analyst_prompt()`

### Pass 2 — Consultant (streaming to user)

- Prompt constant: `CONSULTANT_PROMPT`
- The **only** voice the user ever sees — warm, business-focused Hebrew
- History: `self._consultant_conversation` stores formatted context turns + Hebrew responses
- Input per turn is built by `_build_consultant_turn()`:

```
[INDUSTRY CONTEXT]
<from _domain_hint()>

[CONVERSATION TURN: N]
<optional: [HINT: Time for a periodic summary] every 4 turns>

[USER SAID]
<user's message>

[WHAT WAS BUILT/UNDERSTOOD THIS TURN]
<from _delta_to_business_terms() — bullet list in plain language>

[CURRENT BUSINESS STATE]
<from _business_state_summary()>
```

**Special input formats:**
- `__init__` → `[SESSION START]` → Consultant generates warm opening greeting
- `__phase_start__:Name — Description` → `[PHASE START]` → business-language phase intro

### Key helper methods

| Method | Purpose |
|--------|---------|
| `_analyst_extract(msg)` | Pass 1 non-streaming call, returns delta dict |
| `_stream_consultant(msg, delta)` | Pass 2 streaming call, yields `{type:"text"}` events |
| `_consultant_respond(msg, delta)` | Pass 2 non-streaming (used by `_send()` for init/phases) |
| `_delta_to_business_terms(delta)` | Converts technical delta → natural business bullet list |
| `_business_state_summary()` | Current spec state in business terms for Consultant context |
| `_domain_hint()` | Priority: intake `industry` → intake `domain` → infer from entity/workflow names |
| `_build_consultant_turn(msg, delta)` | Assembles the full formatted context string for Consultant |
| `_analyst_history()` | Builds Gemini history for Analyst with state injection |
| `_consultant_history_contents(turn)` | Builds Gemini history for Consultant + current turn |

---

## Business Consultant Persona

### Role

The Consultant is a **Business-Oriented Requirements Consultant** — NOT a developer, NOT a technical analyst. The user must feel like they're talking to a smart business partner, not a software tool.

### The 8 Conversation Rules (from `.claude/business_conversation_skill.md`)

All rules are enforced in `CONSULTANT_PROMPT`:

1. **Business language only** — Never: entity, schema, database, API, backend, frontend, node, edge, workflow engine, permissions matrix, validation layer
2. **One main question per turn** — Max 1 question (+ optional 1-line follow-up if answer was incomplete)
3. **Gradual discovery** — Follow this order: business goal → current process → pain points → people involved → desired process → exceptions → required info → outputs → summary confirmation
4. **Use examples** — When asking about information/processes, give concrete examples: "לדוגמה: לקוחות, תורים, תשלומים..."
5. **Detect incomplete answers** — Follow up naturally: "ואחרי שהמנהל מאשר — מה קורה?"
6. **Never sound like a form** — No "שאלה 1... שאלה 2..." patterns
7. **Summarize every ~4 turns** — `_build_consultant_turn()` injects `[HINT: Time for a periodic summary]` automatically at turn 4, 8, 12...
8. **Avoid solution jumping** — Fully understand business before offering screens or automations

### Absolute Forbidden Phrases

These are in `CONSULTANT_PROMPT` with `❌` markers and tested in `test_business_conversation.py`:

- `טענתי` — never say "I loaded"
- `נקודת התחלה` — never say "starting point"
- `תחום` as generic word — name the actual industry
- `ישויות` / entities / schema / JSON / backend / frontend / API / database / nodes / edges
- `הבנתי:` / `שאלות:` / numbered question lists
- `זה נשמע מעניין` / `מצוין` / `נהדר` — hollow validations

### Domain-Specific Questions

`CONSULTANT_PROMPT` contains a question bank for 8 industries (Logistics, Retail, Healthcare, HR, SaaS, Construction, Food & Beverage, Finance). The Consultant uses `[INDUSTRY CONTEXT]` to pick relevant questions instead of generic ones.

### Response Shape

3–5 lines maximum, always:
1. Domain validation (1 line — industry-vivid, speaks TO their reality)
2. Invisible update in plain language (1–2 lines)
3. ONE focused question (1 line)

Or at turn 4/8/12: periodic summary + "פספסתי משהו?"

---

## Analyst Prompt (`ANALYST_PROMPT`)

Silent technical extractor. Returns ONLY delta JSON. Never produces prose.

Key rules in the prompt:
- Omit any delta key that has no data this turn
- Never re-extract items already in `[CURRENT SYSTEM STATE]`
- Max 2 prototypes in `new_prototypes` per turn
- Phase-focused variant built by `_build_phase_analyst_prompt(name, description)`

---

## Running the Project

### Prerequisites
- Python 3.11+
- Node.js 18+
- Google AI API key (`GOOGLE_API_KEY` in `backend/.env`)

### Start Backend
```
cd backend
py -m uvicorn main:app --reload --port 8001
```

### Start Frontend
```
cd frontend
npm install   # first time only
npm run dev
```

Open `http://localhost:5173`

> **Note:** Port 8001 is used because port 8000 is occupied on this machine.

### Run Tests
```
cd backend
py -m pytest test_business_conversation.py -v
```

---

## API Endpoints

### Core

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check → `{"status": "ok"}` |
| POST | `/session/init` | Create or resume session |
| POST | `/chat/stream` | Send user message → SSE stream |

### Business Intake

| Method | Path | Description |
|--------|------|-------------|
| POST | `/session/business-intake` | SSE stream for intake phase (5-turn interview) |
| POST | `/session/{id}/skip-intake` | Skip intake → goes straight to template/chat |

### Phases

| Method | Path | Description |
|--------|------|-------------|
| POST | `/session/detect-phases` | Detect business phases from domain description |
| POST | `/session/start-phase` | Start a specific phase (swaps Analyst prompt) |
| POST | `/session/complete-phase` | Mark phase done, get remaining phases |
| POST | `/session/add-phase` | Add a previously-skipped phase |
| GET | `/session/{id}/phases` | Get all/current/completed phases |

### Blueprints & History

| Method | Path | Description |
|--------|------|-------------|
| POST | `/blueprints/save` | Save named blueprint to Supabase |
| GET | `/blueprints` | List all named blueprints |
| POST | `/blueprints/{id}/load` | Load saved blueprint into session |
| GET | `/projects/recent` | Get 3 most recently updated sessions |

### Analysis

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/validate` | Validate blueprint → issues JSON report |
| POST | `/estimate/cost` | Estimate project cost → cost JSON report |

### Export

| Method | Path | Description |
|--------|------|-------------|
| POST | `/export/word` | Export blueprint → `.docx` download |
| POST | `/export/pdf` | Export blueprint → `.pdf` download |

### Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/templates` | List all 5 starter templates (summary) |
| GET | `/templates/{id}/load` | Load full template → `{blueprint, flow_data, initial_message}` |

### SSE Event Types (`/chat/stream` and `/session/business-intake`)

```json
{ "type": "text",           "chunk": "streaming Hebrew text..." }
{ "type": "done",           "blueprint": {...}, "flow_data": {...}, "provider": "gemini", "truncated": false, "parse_error": false }
{ "type": "intake_complete","business_intake": {"domain":"...", "industry":"...", "recommended_templates":[...]} }
```

`truncated` and `parse_error` are always `false` — the two-pass architecture eliminates delimiter parsing. Kept for frontend compatibility.

---

## Frontend Components (`frontend/src/`)

| File | Role |
|------|------|
| `App.jsx` | Root state, session init, SSE handling, template loading, stage routing |
| `components/ChatPanel.jsx` | Chat UI with react-markdown + streaming cursor + "⚡ זהה Phases" button |
| `components/BlueprintDashboard.jsx` | 6-tab panel (flow, schema, doc, proto, validate, estimate) + header buttons |
| `components/BusinessIntakePanel.jsx` | Full-screen 5-turn business interview (SSE streaming) with IntakeSummary |
| `components/TemplateModal.jsx` | 5 starter template cards, shown on startup and via "תבניות" button |
| `components/HistoryModal.jsx` | Two sections: "3 פרויקטים אחרונים" (resume) + "שמורים ידנית" (load) |
| `components/SaveModal.jsx` | Save current blueprint with a name |
| `components/PhaseDetectionPanel.jsx` | Shows detected phases, lets user select which to analyze |
| `components/PhaseProgressBar.jsx` | Progress bar shown above dashboard during phase-focused mode |
| `components/PhaseCompletionPanel.jsx` | Shown after each phase completes, lists remaining phases |
| `components/RequirementsPanel.jsx` | "בדיקת דרישות" tab — calls `/chat/validate`, shows issues by severity |
| `components/CostEstimatorPanel.jsx` | "הערכת עלות" tab — calls `/estimate/cost`, shows cost breakdown |
| `components/FlowCanvas.jsx` | React Flow canvas with ReactFlowProvider |
| `components/CustomNodes.jsx` | Four typed nodes: entity (blue), action (emerald), role (violet), constraint (amber) |
| `components/SchemaTree.jsx` | Collapsible entity and workflow cards |
| `components/SpecDocument.jsx` | PRD-style document with table of contents |
| `components/PrototypeViewer.jsx` | iframe-based UI prototype previewer + copy button |

### App Stage Machine (`appStage` in `App.jsx`)

| Stage | What's shown |
|-------|-------------|
| `'business_intake'` | `BusinessIntakePanel` full-screen (new sessions only) |
| `'chat'` | Normal split: `ChatPanel` + `BlueprintDashboard` |
| `'phase_detection'` | `PhaseDetectionPanel` full-screen |
| `'phase_focused'` | `PhaseProgressBar` + split layout |
| `'phase_complete'` | `PhaseCompletionPanel` shown after each phase |

Resumed sessions (from localStorage/Supabase) skip intake and go directly to `'chat'`.

### Session Persistence

`SESSION_KEY = 'specmind_session_id'` is stored in `localStorage`.
On load: passed to `/session/init` → tries memory → Supabase → creates new.
`handleNewConversation()`: confirms with user → clears localStorage → resets all state.
`handleResumeSession(sid)`: sets localStorage → resets state → re-inits with that session.

---

## State Shape

### `blueprint` (React state in `App.jsx`)

```json
{
  "entities": [
    { "id": "...", "name": "...", "fields": [{ "name", "type", "required", "description" }] }
  ],
  "workflows": [
    { "id": "...", "name": "...", "steps": [...], "constraints": [...] }
  ],
  "spec_document": {
    "sections": [
      { "id": "section_overview", "title": "סקירה כללית", "content": "markdown..." }
    ]
  },
  "ui_prototypes": [
    { "id": "proto_...", "screen_name": "Hebrew Name", "code": "function Screen() { ... }" }
  ]
}
```

### `flowData`

```json
{
  "nodes": [{ "id", "type": "entity|action|role|constraint", "data": {"label"}, "position": {"x","y"} }],
  "edges": [{ "id", "source", "target", "label", "animated": true }]
}
```

### Spec Document Section IDs

| ID | Hebrew Title |
|----|--------------|
| `section_overview` | סקירה כללית |
| `section_roles` | תפקידים ומשתמשים |
| `section_entities` | ישויות המערכת |
| `section_workflows` | תהליכים מרכזיים |
| `section_rules` | כללים עסקיים |
| `section_open` | שאלות פתוחות |

---

## Delta Update Protocol

The Analyst sends **only what changed this turn** — never the full accumulated state.

### Delta JSON keys (all optional — omit if empty)

| Key | Meaning |
|-----|---------|
| `new_entities` | Entities discovered this turn |
| `updated_entities` | `{id, fields: [only new/changed fields]}` |
| `new_workflows` | Workflows discovered this turn |
| `updated_workflows` | `{id, ...changed fields only}` |
| `new_sections` | Spec sections added this turn |
| `updated_sections` | `{id, content: "updated markdown"}` |
| `new_prototypes` | UI screens generated this turn (max 2) |
| `updated_prototypes` | UI screens revised this turn |
| `new_nodes` | Flow nodes added this turn |
| `new_edges` | Flow edges added this turn |
| `updated_nodes` | Flow nodes updated |
| `updated_edges` | Flow edges updated |

### How state re-entry works (replaces old `_gemini_history` pruning)

`_analyst_history()` injects the current `_state_summary()` as a fake `[user, model]` turn pair at the beginning of every Analyst call:

```
user:  "[CURRENT SYSTEM STATE — do NOT re-extract these]
        Entities: [לקוח, מוצר]; Workflows: [הזמנה]; ..."
model: '{"delta": {}}'
```

This tells the Analyst what already exists without storing large JSON blobs in history.

### Backend Merge (`_merge_delta()`)

- `new_*` — appended only if the ID doesn't already exist
- `updated_*` — merged field-by-field into the existing item
- `self.spec` and `self.flow` are the source of truth

---

## Supabase Integration (`supabase_client.py`)

Optional — if `SUPABASE_URL` and `SUPABASE_KEY` are set in `.env`.

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=sb_secret_...   (service role key, NOT anon key)
```

### Tables

```sql
-- Sessions table (auto-save after each chat message)
CREATE TABLE sessions (
  session_id   text PRIMARY KEY,
  blueprint    jsonb,
  flow_data    jsonb,
  updated_at   timestamptz DEFAULT now()
);

-- Named blueprints (manual save with a name)
CREATE TABLE blueprints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   text,
  name         text,
  blueprint_json jsonb,
  flow_data    jsonb,
  created_at   timestamptz DEFAULT now()
);
```

### Key functions

| Function | Description |
|----------|-------------|
| `enabled()` | Returns True if package + env vars available |
| `upsert_session(sid, spec, flow)` | Auto-save after each chat turn (BackgroundTask) |
| `fetch_session(sid)` | Restore session from Supabase on init |
| `save_named_blueprint(sid, name, spec, flow)` | Manual save with name |
| `list_recent_sessions(limit=3)` | Most recently updated non-empty sessions |
| `list_named_blueprints()` | All manually saved blueprints |
| `fetch_named_blueprint(id)` | Load one named blueprint |

`_auto_name(blueprint)` generates a display name from the first entity + count when no name is given.

---

## Phase-Based Requirements Engineering

Phases let users analyze one business area at a time instead of all at once.

### Flow

1. User clicks "⚡ זהה Phases" in ChatPanel after first message
2. Frontend calls `POST /session/detect-phases` with domain description
3. `PhaseDetectionPanel` shows detected phases (3–7)
4. User selects a phase → `POST /session/start-phase`
5. `start_phase()` swaps `self._analyst_system_prompt` to phase-focused variant
6. After enough conversation, user clicks "סיים Phase" → `POST /session/complete-phase`
7. Repeat for remaining phases, or click "סיים הכל"

### Phase management in `Analyst`

```python
self.all_phases: list[dict]           # from detect_phases()
self.phase_context: dict[str, dict]   # id → phase object
self.current_phase: str | None
self.completed_phases: list[str]
self.phase_blueprints: dict[str, dict] # snapshot per completed phase
self._analyst_system_prompt: str       # swapped per phase, reset on finish
```

---

## Business Intake Layer

New sessions start with a 5-turn business interview (unless skipped or resumed).

### Flow

1. New session detected (no localStorage session_id) → `appStage = 'business_intake'`
2. `BusinessIntakePanel` streams conversation via `POST /session/business-intake`
3. After turn 5 → `intake_complete` SSE event → `IntakeSummary` shown with template recommendations
4. User selects a template (or none) → moves to `'chat'` stage
5. "דלג" button → `POST /session/{id}/skip-intake` → moves directly to template modal

### Extraction

`_extract_intake_data()` makes a one-shot Gemini call on the full intake conversation and returns:
```json
{
  "domain": "Retail",
  "industry": "E-Commerce",
  "pain_points": ["..."],
  "goals": ["..."],
  "stakeholders": ["..."],
  "recommended_templates": ["ecommerce"]
}
```

This data is stored in `self.business_intake_data` and used by `_domain_hint()` to give the Consultant explicit industry context throughout the session.

---

## Export Feature

### Word (.docx) — `export_utils.generate_word()`
- Library: `python-docx`
- Font: Arial (Hebrew RTL support on Windows)
- Includes: title page, spec document sections, entities table (4 columns), workflows with numbered steps
- RTL set via `w:bidi` XML element on each paragraph

### PDF — `export_utils.generate_pdf()`
- Libraries: `reportlab` + `python-bidi`
- Font: Arial from `C:/Windows/Fonts/arial.ttf` (fallback: Helvetica)
- `python-bidi` applies Unicode Bidirectional Algorithm for Hebrew RTL
- Includes: same sections as Word + styled entity tables with alternating row colors

### Export flow (frontend)
`BlueprintDashboard` → `POST /export/{word|pdf}` with `{session_id}` → returns binary → browser downloads via `URL.createObjectURL`.

---

## Templates Library

Five starter templates in `backend/templates.json`:

| ID | Name | Domain | Entities | Workflows |
|----|------|--------|----------|-----------|
| `ecommerce` | פלטפורמת E-Commerce | Retail | 4 | 2 |
| `saas` | פלטפורמת SaaS | FinTech | 4 | 2 |
| `healthcare` | ניהול מטופלים | Healthcare | 4 | 2 |
| `hrm` | ניהול משאבי אנוש | HR | 4 | 2 |
| `logistics` | ניהול לוגיסטיקה | Logistics | 4 | 2 |

### Template load flow

`GET /templates/{id}/load` returns `{blueprint, flow_data, initial_message}`.
`initial_message` is a business-language question (no mention of entities/workflows) that asks about the user's specific business context within that industry.

### Frontend UX
- `TemplateModal` shows automatically after intake (or session init if intake skipped)
- Can be reopened via "תבניות" button in `BlueprintDashboard` header
- Dismissed with "התחל בלי תבנית"
- Domain badge colors: Retail=emerald, FinTech=blue, Healthcare=red, HR=violet, Logistics=amber

---

## UI Prototype Rendering

Prototypes are rendered in sandboxed iframes using `srcdoc`. Each iframe loads:
- Tailwind CSS CDN
- React 18 UMD (production)
- ReactDOM 18 UMD (production)
- Babel standalone (for JSX transpilation)

Component must be named `Screen` — no imports/exports. Root element must have `dir="rtl"`. Tailwind only. Hebrew text. White/slate/blue design tokens.

**Security:** `sandbox="allow-scripts"` isolates the iframe.
**Prototype limit:** Max 2 per AI response.

---

## UI Design

- **Theme:** Light (white cards, slate-50 backgrounds, slate-200 borders)
- **Font:** Inter (Google Fonts, 15px base)
- **RTL:** `<html dir="rtl" lang="he">` — entire app is right-to-left
- **Chat bubbles:** User = `bg-blue-600 ml-auto`; AI = white card `mr-auto`
- **Node colors:** entity=blue-600, role=violet-600, action=emerald-600, constraint=amber-600
- **Animations:** `slideInRight 0.3s` on new items (`.schema-item` class)
- **LIVE indicator:** pulsing green dot in header during active SSE stream
- **BlueprintDashboard tabs:** 6 tabs in two rows — flow, schema, doc, proto (row 1) / validate, estimate (row 2)

---

## Test Suite (`backend/test_business_conversation.py`)

34 automated tests, zero Gemini API calls needed (uses `Analyst.__new__()` to bypass `__init__`).

| Class | What it tests |
|-------|---------------|
| `TestConsultantPromptIsJargonFree` | `CONSULTANT_PROMPT` rules sections contain no banned words in positive instructions; all 8 rules present; domain question bank covers 5+ industries |
| `TestConsultantTurnBuilding` | `_build_consultant_turn()` produces correct tags, includes industry context, embeds turn counter, triggers periodic summary hint at turn 4 |
| `TestDeltaToBusinessTerms` | `_delta_to_business_terms()` uses natural language, mentions entity/workflow names, no jargon, bullet format |
| `TestDomainHint` | Priority chain: intake industry → intake domain → entity/workflow inference → "ask user" |
| `TestResponseValidation` | Static good/bad response examples — jargon caught, form patterns caught, hollow validations caught, line limit enforced |

Run with:
```
cd backend
py -m pytest test_business_conversation.py -v
```

---

## Prompts Summary (`analyst.py`)

| Constant | Used by | Purpose |
|----------|---------|---------|
| `ANALYST_PROMPT` | Pass 1 Gemini call | Silent JSON extractor — outputs delta only |
| `CONSULTANT_PROMPT` | Pass 2 Gemini call | Business consultant voice — Hebrew text only |
| `BUSINESS_ANALYST_PROMPT` | `stream_business_intake()` | 5-turn intake interview |
| `PHASE_DETECTION_PROMPT` | `detect_phases()` | Returns JSON list of phases |
| `VALIDATION_PROMPT` | `validate_blueprint()` | Returns issues JSON report |
| `ESTIMATION_PROMPT` | `estimate_cost()` | Returns cost/timeline JSON |
| `_build_phase_analyst_prompt()` | `start_phase()` | Prefixes `ANALYST_PROMPT` with phase focus |
