import os
import json
import re
from google import genai as google_genai
from google.genai import types as genai_types

# =============================================================================
# ANALYST PROMPT — silent technical extractor, outputs only delta JSON
# =============================================================================

ANALYST_PROMPT = """You are a silent Technical Architect embedded in a business analysis system.

Your ONLY output is a valid JSON delta object. No prose. No markdown fences. No explanation.

## WHAT TO EXTRACT
From natural business conversation, identify and extract:
- New business entities (data building blocks)
- New business workflows (processes/operations)
- Updates to existing items
- Spec document sections to write
- UI screens to generate (max 2 per turn)
- Flow diagram nodes and edges

## DELTA JSON FORMAT (return ONLY this — no markdown, no code fences):
{"delta": {
  "new_entities":       [...],
  "updated_entities":   [{"id": "existing_id", "fields": [...only new/changed fields...]}],
  "new_workflows":      [...],
  "updated_workflows":  [{"id": "existing_id", "...changed fields only..."}],
  "new_sections":       [...],
  "updated_sections":   [{"id": "existing_id", "content": "markdown..."}],
  "new_prototypes":     [...],
  "updated_prototypes": [...],
  "new_nodes":          [...],
  "new_edges":          [...]
}}

Omit any key with no data this turn. Return {"delta": {}} if nothing new.
Never re-send items that already appear in [CURRENT SYSTEM STATE] below.

## ENTITY SCHEMA
{"id": "snake_case_id", "name": "Hebrew Name", "fields": [{"name": "field", "type": "string|number|boolean|date|enum", "required": true, "description": "Hebrew"}]}

## WORKFLOW SCHEMA
{"id": "snake_case_id", "name": "Hebrew Name", "steps": ["Hebrew step"], "constraints": ["Hebrew constraint"]}

## SPEC SECTION IDs
section_overview | section_roles | section_entities | section_workflows | section_rules | section_open

## UI PROTOTYPE SCHEMA
{"id": "proto_name", "screen_name": "Hebrew", "code": "function Screen() { return (<div dir=\"rtl\" className=\"p-6 bg-white\">...</div>); }"}
- React is global (no imports/exports). Root MUST have dir="rtl". Tailwind only. Hebrew text. White/blue design.
- Max 2 in new_prototypes per turn.

## FLOW NODE SCHEMA
{"id": "node_id", "type": "entity|action|role|constraint", "data": {"label": "Hebrew"}, "position": {"x": 0, "y": 0}}
Y positions: roles=50, entities=220, actions=390, constraints=560. 200px horizontal spacing.
Edge: {"id": "edge_id", "source": "node_id", "target": "node_id", "label": "Hebrew", "animated": true}"""


# =============================================================================
# CONSULTANT PROMPT — the only voice the user ever sees
# =============================================================================

CONSULTANT_PROMPT = """You are a Business-Oriented Requirements Consultant.

You are NOT a developer. You are NOT a technical analyst. You are NOT a software tool.
You are a calm, patient, knowledgeable business partner helping a real person organize and articulate how their business works.

The user must feel: comfortable, understood, guided — never interrogated or overwhelmed.
The conversation must feel like: "a smart consultant helping me organize my thoughts" — NOT "a developer asking spec questions".

---

## YOUR CORE MISSION

Gradually build a complete picture of the business — without any technical language.
Follow this natural discovery order (check [CURRENT BUSINESS STATE] to know where you are):
1. Business goal — what problem are we solving?
2. Current process — how does it work TODAY, manually or otherwise?
3. Pain points — what breaks, slows down, or causes errors?
4. People involved — who does what, and who approves what?
5. Desired future process — how SHOULD it work?
6. Exceptions — what happens when something goes wrong or is unusual?
7. Required information — what needs to be remembered/tracked?
8. Outputs — what reports, screens, or notifications are needed?
9. Summary confirmation — did I understand everything correctly?

---

## RESPONSE RULES (follow ALL of them every turn):

### Rule 1 — Business language ONLY
Say this:           people, information, stages, approvals, actions, what happens next
Never say:          API, database, schema, entity, workflow engine, backend, frontend, node, edge, permissions matrix, validation layer

### Rule 2 — One main question per turn
Maximum: 1 main question, optionally 1 short follow-up if the answer was incomplete.
❌ "מי המשתמשים, אילו הרשאות יש להם, ואיזה דוחות הם צריכים?"
✅ "מי האנשים שמעורבים בתהליך הזה?"

### Rule 3 — Use examples when a question could be unclear
❌ "איזה מידע אתה מנהל?"
✅ "איזה מידע אתה מנהל? לדוגמה: לקוחות, תורים, תשלומים, מלאי, עובדים, מסמכים..."

### Rule 4 — Detect incomplete answers and continue the thread naturally
If the user gives a partial answer, follow up:
"ואחרי שהמנהל מאשר — מה קורה?"
"ומי אחראי על זה בדרך כלל?"
"ואם קורה תקלה — מי מקבל התראה?"

### Rule 5 — Never sound like a form
❌ "שאלה 1... שאלה 2... שאלה 3..."
✅ Respond naturally and contextually, based on what was just said.

### Rule 6 — Summarize every 3–4 turns
Instead of a question, say: "רגע — בואו נוודא שהבנתי נכון..."
Then briefly confirm: business goal, current pain, who is involved, what should change.
Then ask: "פספסתי משהו?"

### Rule 7 — Avoid solution jumping
Do NOT offer screens, automations, or integrations BEFORE fully understanding the need.
First: understand. Then: describe what was captured. Then: ask what's next.
Only offer to design screens if the user explicitly asks or if understanding is complete.

### Rule 8 — Invisible update (describe progress without technical terms)
When [WHAT WAS BUILT/UNDERSTOOD THIS TURN] has content, briefly tell the user what was captured — in plain business language.
✅ "כבר הנחתי את הבסיס לכך שכל משלוח יהיה ניתן למעקב"
✅ "רשמתי שהמנהל הוא זה שמאשר, ושזה קורה לפני שהחשבונית יוצאת"
❌ Never: "טענתי", "הוספתי ישויות", "ה-Blueprint מכיל", "נקודת התחלה"

---

## RESPONSE SHAPE (3–5 lines total — NEVER more):

When [CURRENT BUSINESS STATE] is empty (early conversation):
→ Validate/empathize with what was shared (1 line, industry-specific, vivid)
→ Ask ONE discovery question (with example if needed)

When [CURRENT BUSINESS STATE] has content (building up):
→ Validate the business world (1 line — speak TO their reality, not ABOUT it)
→ Invisible update in plain language (1–2 lines)
→ ONE focused question to advance the discovery

Every ~4 turns (check how many assistant turns are in conversation history):
→ Summary turn instead: "בוא נוודא שהבנתי..." + confirm + "פספסתי משהו?"

---

## SPECIAL CASES:

**[SESSION START]** → 2–3 lines ONLY:
- Introduce yourself as a business partner, not a software tool
- Ask ONE vivid, open question about their daily business reality
Example tone: "שלום! אני כאן כדי לעזור לך לארגן את הרעיון ולהבין מה המערכת תצטרך לעשות. ספר לי — מה הדבר שהכי מאטה אותך ביום-יום בעסק?"

**[PHASE START]** → 2–3 lines ONLY:
- Frame the focus area in business terms (name the industry, not the phase ID)
- Ask ONE opening question specific to that area of the business

---

## DOMAIN-AWARE QUESTIONS (never copy verbatim — adapt to the conversation):
Use [INDUSTRY CONTEXT] to pick relevant questions. If it says "infer from component names", identify the industry yourself.
- **Logistics / הובלה:** "כמה ספקים אתה מתאם ביום, ומי יודע בכל רגע מה כבר יצא ומה עוד מחכה?"
- **Retail / קמעונאות:** "כשלקוח בא עם תלונה או מחזיר מוצר — מה קורה בפועל, ומי מרשה את זה?"
- **Healthcare / בריאות:** "כמה ימים מראש מתקשרים למטופל, ומה קורה אם הוא לא עונה?"
- **HR / משאבי אנוש:** "כשעובד חדש מגיע ביום הראשון — מי מכין לו הכל, וכמה זמן זה לוקח?"
- **SaaS / B2B:** "כשלקוח מפסיק לשלם — מי מגלה ראשון, ומה צעד ההמשך?"
- **Construction / בנייה:** "כמה קבלני משנה עובדים במקביל, ואיך יודעים מי סיים מה?"
- **Food & Beverage:** "בשעת השיא — מי מחליט מה להכין ראשון, ואיך יודעים מה אזל?"
- **Finance / פיננסים:** "כשלקוח מבקש דוח — מה צריך לאסוף ומכמה מקומות שונים?"

---

## ABSOLUTE FORBIDDEN PHRASES:
❌ "טענתי" — never say you "loaded" anything
❌ "נקודת התחלה" — never say "starting point"
❌ "תחום" as a generic word — name the actual industry
❌ "ישויות" / entities / schema / JSON / backend / frontend / API / database / nodes / edges
❌ "הבנתי:" / "שאלות:" / bullet lists of questions
❌ "זה נשמע מעניין" / "מצוין" / "נהדר" — hollow validations that say nothing
❌ Numbered question lists ("שאלה 1...", "שאלה 2...")

## LANGUAGE MAP:
entity → the actual name (לקוח, מוצר, עובד)  |  workflow → "תהליך עבודה" / "איך זה קורה"
field → "פרט" / "נתון"  |  user role → "מי רואה ומי עושה מה"
screen → "מסך" / "תצוגה"  |  permissions → "מי יכול לאשר"

## FORMAT:
- 3–5 lines maximum. No exceptions.
- No bullets. No numbered lists. No emojis.
- Bold only key business concept names.
- ONE question mark per response. If you have two questions, pick the more important one.
- Tone: calm, patient, warm, human — like a seasoned consultant at a first client meeting."""


# =============================================================================
# OTHER PROMPTS (unchanged)
# =============================================================================

INIT_MESSAGE = "__init__"

VALIDATION_PROMPT = """You are a Requirements Validation Expert. Analyze the provided software blueprint and return a structured JSON report.

Check for:
1. **Missing non-functional requirements**: security (auth, encryption), performance (caching, response times), scalability, reliability (backup, SLA), compliance (GDPR, PCI-DSS, HIPAA)
2. **Contradictions**: conflicting workflows, circular dependencies, mismatched field types
3. **Unused or orphaned items**: entities not referenced in any workflow, workflows missing steps
4. **Missing edge cases**: error handling, concurrency/race conditions, input validation, rate limiting
5. **Missing integrations**: payment gateway, email/SMS notifications, third-party APIs, webhooks

Return ONLY valid JSON (no markdown fences, no prose):
{
  "issues": [
    {
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "missing_nonfunctional|contradiction|unused_entity|edge_case|integration|compliance",
      "issue": "תיאור הבעיה בעברית",
      "suggestion": "הצעה לתיקון בעברית",
      "affected_items": ["entity or workflow name"]
    }
  ],
  "coverage_score": 0.75,
  "summary": "סיכום קצר בעברית",
  "quick_fixes": ["הוסף אימות JWT", "הוסף טיפול בשגיאות"]
}

Write all issue/suggestion/summary/quick_fixes text in Hebrew. Be specific and actionable."""

ESTIMATION_PROMPT = """You are a senior Project Manager and cost estimator. Analyze the provided blueprint and return a structured JSON estimate.

Guidelines:
- Complexity score (1-10): 1-3 = simple CRUD, 4-6 = standard business system, 7-8 = complex with integrations, 9-10 = enterprise/AI
- Use USD, assume mid-level team ($100-150/hr blended rate)
- Add 20% buffer for unknowns
- Identify top 3-5 risk factors

Return ONLY valid JSON (no markdown fences, no prose):
{
  "complexity_score": 7,
  "estimated_duration": {
    "backend": "8 שבועות",
    "frontend": "6 שבועות",
    "testing": "4 שבועות",
    "infrastructure": "1 שבוע",
    "total": "4-5 חודשים"
  },
  "team_size": "4-6 מפתחים",
  "team_breakdown": { "backend": 2, "frontend": 2, "qa": 1, "devops": 0.5 },
  "cost_estimate": {
    "min": 80000,
    "max": 120000,
    "currency": "USD",
    "notes": "הערה קצרה בעברית"
  },
  "breakdown": {
    "פיתוח": "60%",
    "בדיקות": "20%",
    "תשתית": "10%",
    "מרווח": "10%"
  },
  "risk_factors": [
    {
      "risk": "תיאור הסיכון בעברית",
      "impact": "HIGH|MEDIUM|LOW",
      "mitigation": "מיטיגציה בעברית",
      "additional_cost": 5000
    }
  ],
  "recommendations": ["המלצה 1 בעברית", "המלצה 2 בעברית"]
}

Write all Hebrew fields in Hebrew. Be realistic and specific."""


BUSINESS_ANALYST_PROMPT = """You are an experienced Business Consultant who speaks in simple, everyday business language.

🎯 YOUR ROLE:
- Understand what the user's business does (current state)
- Identify pain points and goals
- Do NOT design a solution or mention any technical details

⚠️ NEVER mention: entities, workflows, blueprints, database, API, UI/UX, code, architecture.
✅ DO ask about: current process, problems, goals, who is affected, financial impact.

### Conversation guide (one question per turn, 5 turns max)
Turn 1: "בקצרה, מה אתה עושה היום ומה המערכת אמורה לפתור?"
Turn 2: (listen) → "מה הבעיה הגדולה ביותר שאתה חווה?"
Turn 3: (listen) → "מה אתה רוצה שישתנה?"
Turn 4: (listen) → "למי זה חשוב — מי ייהנה מהפתרון?"
Turn 5: (listen) → "מה ההשפעה הכספית אם זה יפתר?"

After turn 5, respond warmly and say you understood the needs, summarize in 2 sentences, and say you are now ready to start building.

✅ Be conversational and warm. Ask ONE question per response. Speak Hebrew. Keep it under 4 sentences."""


PHASE_DETECTION_PROMPT = """You are a Business Requirements Expert.

Given a system/domain description, identify ALL logical phases or sub-domains that need to be analyzed separately.

Rules:
- Each phase should be independently analyzable (own entities, workflows, rules)
- 3-7 phases is ideal; avoid too granular or too coarse
- Order by natural implementation sequence
- Use emojis in Hebrew phase names for visual clarity

Return ONLY valid JSON (no markdown fences):
{
  "domain": "Hebrew domain name",
  "phases": [
    {
      "id": "snake_case_id",
      "name": "🔍 עברית עם אמוג'י",
      "description": "תיאור קצר בעברית",
      "estimated_entities": 4,
      "order": 1
    }
  ]
}"""


def _build_phase_analyst_prompt(phase_name: str, phase_description: str) -> str:
    return f"""## PHASE FOCUS: {phase_name}
Focus ONLY on extracting entities and workflows relevant to: {phase_description}
Do not extract items outside this domain even if the user mentions them.

---

""" + ANALYST_PROMPT


# =============================================================================
# ANALYST CLASS
# =============================================================================

class Analyst:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not set in environment")

        self.gemini = google_genai.Client(api_key=api_key)

        # Accumulated spec state (source of truth)
        self.spec = {
            "entities": [],
            "workflows": [],
            "spec_document": {"sections": []},
            "ui_prototypes": [],
        }
        self.flow = {"nodes": [], "edges": []}

        # Analyst conversation: user messages + "[EXTRACTED: ...]" summaries
        self.conversation: list[dict] = []
        # Consultant conversation: user context turns + Hebrew business responses
        self._consultant_conversation: list[dict] = []

        # Phase management
        self.domain_description: str = ""
        self.all_phases: list[dict] = []
        self.phase_context: dict[str, dict] = {}
        self.current_phase: str | None = None
        self.completed_phases: list[str] = []
        self.phase_blueprints: dict[str, dict] = {}
        self._analyst_system_prompt: str = ANALYST_PROMPT

        # Business intake
        self.intake_turn_count: int = 0
        self.max_intake_turns: int = 5
        self.intake_complete: bool = False
        self.intake_skipped: bool = False
        self.business_intake_data: dict = {}
        self._intake_conversation: list[dict] = []

        # Document context (optional PDF upload)
        self.document_context: dict | None = None

    # ================================================================ helpers

    def _state_summary(self) -> str:
        parts = []
        if self.spec["entities"]:
            parts.append("Entities: [" + ", ".join(e["name"] for e in self.spec["entities"]) + "]")
        if self.spec["workflows"]:
            parts.append("Workflows: [" + ", ".join(w["name"] for w in self.spec["workflows"]) + "]")
        if self.spec["spec_document"]["sections"]:
            parts.append("Sections: [" + ", ".join(s["id"] for s in self.spec["spec_document"]["sections"]) + "]")
        if self.spec["ui_prototypes"]:
            parts.append("Screens: [" + ", ".join(p["screen_name"] for p in self.spec["ui_prototypes"]) + "]")
        if self.flow["nodes"]:
            parts.append(f"Nodes: {len(self.flow['nodes'])}, Edges: {len(self.flow['edges'])}")
        return "; ".join(parts) if parts else "empty"

    def _delta_to_business_terms(self, delta: dict) -> str:
        """
        Converts the technical delta into a plain-language summary of what was *learned*
        this turn. This feeds directly into the Consultant's context, so it must read
        like a colleague briefing — never like a database log.
        """
        parts = []
        new_entities = delta.get("new_entities", [])
        updated_entities = delta.get("updated_entities", [])
        new_workflows = delta.get("new_workflows", [])
        updated_workflows = delta.get("updated_workflows", [])
        new_sections = delta.get("new_sections", [])
        new_prototypes = delta.get("new_prototypes", [])

        if new_entities:
            names = [e["name"] for e in new_entities]
            parts.append(f"Learned about: {', '.join(names)} — who they are and what information they hold")
        if updated_entities:
            names = [e["id"].replace("_", " ") for e in updated_entities]
            parts.append(f"Got more detail about: {', '.join(names)}")
        if new_workflows:
            names = [w["name"] for w in new_workflows]
            parts.append(f"Understood how the following happens in the business: {', '.join(names)}")
        if updated_workflows:
            parts.append("Clarified some steps in an existing process")
        if new_sections:
            titles = [s.get("title", "") or s["id"].replace("section_", "").replace("_", " ") for s in new_sections]
            parts.append(f"Captured in the working document: {', '.join(titles)}")
        if new_prototypes:
            screens = [p["screen_name"] for p in new_prototypes]
            parts.append(f"Created an initial screen design for: {', '.join(screens)}")
        if not parts:
            parts.append("Conversation deepened — listening and building context, nothing new to record yet")
        return "\n".join(f"- {p}" for p in parts)

    def _business_state_summary(self) -> str:
        parts = []
        if self.spec["entities"]:
            parts.append("Business components mapped: " + ", ".join(e["name"] for e in self.spec["entities"]))
        if self.spec["workflows"]:
            parts.append("Work processes documented: " + ", ".join(w["name"] for w in self.spec["workflows"]))
        if self.spec["ui_prototypes"]:
            parts.append("Screens designed: " + ", ".join(p["screen_name"] for p in self.spec["ui_prototypes"]))
        return " | ".join(parts) if parts else "Session just started — nothing built yet"

    def _domain_hint(self) -> str:
        """Best available domain signal — intake data beats entity inference."""
        if self.business_intake_data.get("industry"):
            return self.business_intake_data["industry"]
        if self.business_intake_data.get("domain"):
            return self.business_intake_data["domain"]
        # Fall back to entity + workflow names so Consultant can infer industry
        names = (
            [e["name"] for e in self.spec["entities"]] +
            [w["name"] for w in self.spec["workflows"]]
        )
        return f"infer from these business terms: {', '.join(names)}" if names else "unknown — ask the user what their business does"

    def _enforce_consultant_rules(self, response_text: str) -> None:
        """
        Validate Consultant response against 6 conversation rules.
        Logs violations but does NOT block response (graceful degradation).

        Rules:
        1. Business language only (no jargon)
        2. One main question per turn (max 2 total)
        3. Examples provided when asking about data
        4. Conversational flow (not form-like)
        5. Tone is conversational (short paragraphs)
        6. Not marked as form pattern
        """
        violations = []

        # Rule 1: No jargon
        banned_words = [
            'entity', 'workflow', 'schema', 'database', 'api', 'backend',
            'frontend', 'node', 'edge', 'permission', 'validation'
        ]
        for word in banned_words:
            if word.lower() in response_text.lower():
                violations.append(f"Jargon detected: '{word}'")
                break  # Only report first violation

        # Rule 2: Not too many questions
        question_count = response_text.count('?')
        if question_count > 3:
            violations.append(f"Too many questions ({question_count}, max 3)")

        # Rule 4: No form-like pattern
        if 'Question 1' in response_text or 'שאלה 1' in response_text:
            violations.append("Form-like pattern detected (Question 1...)")

        # Rule 5: Check paragraph length
        paragraphs = response_text.split('\n\n')
        if len(paragraphs) > 0:
            avg_length = sum(len(p) for p in paragraphs) / len(paragraphs)
            if avg_length > 250:
                violations.append(f"Paragraphs too long (avg {int(avg_length)}), should be conversational")

        # Log violations (don't block)
        if violations:
            print(f"⚠️  Consultant rule violations: {', '.join(violations)}")
            # Violations are logged but response is sent anyway (graceful degradation)

    def _build_consultant_turn(self, user_message: str, delta: dict) -> str:
        if user_message == INIT_MESSAGE:
            return "[SESSION START] Generate a warm opening greeting for a new business consultation session."
        if user_message.startswith("__phase_start__:"):
            info = user_message[16:]
            domain = self._domain_hint()
            return f"[PHASE START] Industry: {domain}\nFocus: {info}"
        business_summary = self._delta_to_business_terms(delta)
        state_summary = self._business_state_summary()
        domain = self._domain_hint()
        # Count assistant turns so the Consultant knows when to do a periodic summary
        assistant_turns = sum(1 for m in self._consultant_conversation if m["role"] == "assistant")
        summary_hint = "[HINT: Time for a periodic summary — confirm understanding instead of asking a new question]" \
            if assistant_turns > 0 and assistant_turns % 4 == 0 else ""
        return (
            f"[INDUSTRY CONTEXT]\n{domain}\n\n"
            f"[CONVERSATION TURN: {assistant_turns + 1}]\n"
            + (f"{summary_hint}\n\n" if summary_hint else "\n")
            + f"[USER SAID]\n{user_message}\n\n"
            f"[WHAT WAS BUILT/UNDERSTOOD THIS TURN]\n{business_summary}\n\n"
            f"[CURRENT BUSINESS STATE]\n{state_summary}"
        )

    # ================================================================ Gemini configs

    def _analyst_config(self) -> genai_types.GenerateContentConfig:
        return genai_types.GenerateContentConfig(
            system_instruction=self._analyst_system_prompt,
            max_output_tokens=32768,
        )

    def _consultant_config(self) -> genai_types.GenerateContentConfig:
        return genai_types.GenerateContentConfig(
            system_instruction=CONSULTANT_PROMPT,
            max_output_tokens=800,
        )

    # ================================================================ history builders

    def _analyst_history(self) -> list:
        """History for Analyst: current state injected first, then conversation."""
        contents = []

        # Inject current system state if not empty
        state = self._state_summary()
        if state != "empty":
            contents.append(genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=f"[CURRENT SYSTEM STATE — do NOT re-extract these]\n{state}")],
            ))
            contents.append(genai_types.Content(
                role="model",
                parts=[genai_types.Part(text='{"delta": {}}')],
            ))

        # Inject document context if available (PDF uploaded)
        if self.document_context:
            doc_text = self.document_context.get('extracted_text', '')[:3000]  # Truncate to preserve tokens
            processor = self.document_context.get('processor', 'unknown')
            contents.append(genai_types.Content(
                role="user",
                parts=[genai_types.Part(text=f"[DOCUMENT CONTEXT]\nFile: {self.document_context.get('filename')}\nProcessor: {processor}\n\n{doc_text}\n...")],
            ))
            contents.append(genai_types.Content(
                role="model",
                parts=[genai_types.Part(text='{"delta": {}}')],
            ))

        # Add conversation history
        for m in self.conversation:
            contents.append(genai_types.Content(
                role="model" if m["role"] == "assistant" else "user",
                parts=[genai_types.Part(text=m["content"])],
            ))
        return contents

    def _consultant_history_contents(self, current_turn: str) -> list:
        """History for Consultant: previous exchanges + current formatted turn."""
        contents = []
        for m in self._consultant_conversation:
            contents.append(genai_types.Content(
                role="model" if m["role"] == "assistant" else "user",
                parts=[genai_types.Part(text=m["content"])],
            ))
        contents.append(genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=current_turn)],
        ))
        return contents

    # ================================================================ restore

    def restore_from_saved(self, blueprint: dict, flow_data: dict) -> dict:
        self.spec = blueprint
        self.flow = flow_data
        msg = (
            "**ברוך השב!** טענתי את העבודה שלך — אפשר להמשיך מאיפה שעצרנו.\n\n"
            "מה הדבר הבא שרצית לפתח? יש נושא שלא הספקנו לכסות בפגישה הקודמת?"
        )
        return {"chat_response": msg, "blueprint": self.spec, "flow_data": self.flow}

    # ================================================================ business intake

    async def stream_business_intake(self, user_message: str):
        self.intake_turn_count += 1
        self._intake_conversation.append({"role": "user", "content": user_message})

        full_text = ""
        try:
            stream = await self.gemini.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=[
                    genai_types.Content(
                        role="model" if m["role"] == "assistant" else "user",
                        parts=[genai_types.Part(text=m["content"])],
                    )
                    for m in self._intake_conversation
                ],
                config=genai_types.GenerateContentConfig(
                    system_instruction=BUSINESS_ANALYST_PROMPT,
                    max_output_tokens=512,
                ),
            )
            async for chunk in stream:
                text = getattr(chunk, "text", None)
                if text:
                    full_text += text
                    yield {"type": "text", "chunk": text}
        except Exception as e:
            yield {"type": "text", "chunk": f"\n\nשגיאה: {str(e)[:100]}"}

        self._intake_conversation.append({"role": "assistant", "content": full_text})

        if self.intake_turn_count >= self.max_intake_turns:
            try:
                intake_data = await self._extract_intake_data()
                self.intake_complete = True
                self.business_intake_data = intake_data
                self.domain_description = intake_data.get("domain", "")
                yield {"type": "intake_complete", "business_intake": intake_data}
            except Exception as e:
                print(f"[INTAKE] Extraction failed: {e}")
                yield {"type": "intake_complete", "business_intake": {
                    "domain": "", "industry": "", "pain_points": [], "goals": [],
                    "stakeholders": [], "recommended_templates": ["saas"],
                }}

    async def _extract_intake_data(self) -> dict:
        conv_text = "\n".join(
            f"{'משתמש' if m['role'] == 'user' else 'יועץ'}: {m['content']}"
            for m in self._intake_conversation
        )
        extraction_prompt = (
            "Based on this Hebrew business conversation, extract structured data.\n\n"
            "Return ONLY valid JSON (no markdown):\n"
            '{"domain":"e.g. FinTech","industry":"e.g. Payments",'
            '"pain_points":["problem 1","problem 2"],'
            '"goals":["goal 1","goal 2"],'
            '"stakeholders":["role 1","role 2"],'
            '"recommended_templates":["choose from: ecommerce, saas, healthcare, hrm, logistics"]}'
            "\n\nConversation:\n" + conv_text
        )
        return await self._gemini_json_call("", extraction_prompt)

    # ================================================================ phase management

    async def detect_phases(self, domain_description: str) -> dict:
        self.domain_description = domain_description
        result = await self._gemini_json_call(PHASE_DETECTION_PROMPT, domain_description)
        self.all_phases = result.get("phases", [])
        self.phase_context = {p["id"]: p for p in self.all_phases}
        return {"domain": result.get("domain", ""), "phases": self.all_phases}

    async def start_phase(self, phase_id: str) -> dict:
        if phase_id not in self.phase_context:
            raise ValueError(f"Phase '{phase_id}' not found")
        phase = self.phase_context[phase_id]
        self.current_phase = phase_id
        self._analyst_system_prompt = _build_phase_analyst_prompt(phase["name"], phase["description"])

        self.conversation = []
        if self.domain_description:
            self.conversation.append({"role": "user", "content": self.domain_description})
        if self.completed_phases:
            existing = ", ".join(e["name"] for e in self.spec["entities"])
            note = f"[Context: phases {self.completed_phases} already done. Existing entities: {existing}. Now focus on: {phase['name']}]"
            self.conversation.append({"role": "user", "content": note})

        init_msg = f"__phase_start__:{phase['name']} — {phase['description']}"
        response = await self._send(init_msg)
        return {
            "phase_id": phase_id,
            "phase_name": phase["name"],
            "message": response.get("chat_response", ""),
            "blueprint": self.spec,
            "flow_data": self.flow,
        }

    def complete_phase(self) -> dict:
        import copy
        if not self.current_phase:
            raise ValueError("No active phase")
        self.phase_blueprints[self.current_phase] = copy.deepcopy(self.spec)
        self.completed_phases.append(self.current_phase)
        remaining = [p for p in self.all_phases if p["id"] not in self.completed_phases]
        phase_name = self.phase_context[self.current_phase]["name"]

        if not remaining:
            self._analyst_system_prompt = ANALYST_PROMPT
            self.current_phase = None

        if remaining:
            bullets = "\n".join(f"• **{p['name']}** — {p['description']}" for p in remaining)
            msg = (f"✅ סיימנו את **{phase_name}**!\n\n"
                   f"**נושאים שנותרו לסקירה:**\n{bullets}\n\nבחר את הנושא הבא או לחץ 'סיים' לייצוא.")
        else:
            msg = (f"✅ סיימנו את **{phase_name}** — זה היה הנושא האחרון!\n\n"
                   "המסמך מוכן לייצוא. תוכל להוריד אותו כ-Word או PDF.")

        return {
            "completed_phase": self.current_phase,
            "phase_name": phase_name,
            "blueprint": self.spec,
            "flow_data": self.flow,
            "remaining_phases": remaining,
            "message": msg,
        }

    async def add_phase(self, phase_id: str) -> dict:
        return await self.start_phase(phase_id)

    # ================================================================ two-pass core

    async def _analyst_extract(self, message: str) -> dict:
        """Pass 1: non-streaming Analyst call — returns delta dict."""
        self.conversation.append({"role": "user", "content": message})
        try:
            resp = await self.gemini.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=self._analyst_history(),
                config=self._analyst_config(),
            )
            raw = (resp.text or "").strip()
        except Exception as e:
            print(f"[ANALYST] Gemini error: {e}")
            self.conversation.append({"role": "assistant", "content": '{"delta": {}}'})
            return {}

        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw.strip())
        try:
            data = json.loads(raw)
            delta = data.get("delta", {})
        except json.JSONDecodeError:
            print(f"[ANALYST] JSON parse failed: {raw[:300]}")
            delta = {}

        summary = self._delta_to_business_terms(delta)
        self.conversation.append({"role": "assistant", "content": f"[EXTRACTED: {summary}]"})
        return delta

    async def _consultant_respond(self, user_message: str, delta: dict) -> str:
        """Pass 2 (non-streaming): Consultant generates response text."""
        consultant_turn = self._build_consultant_turn(user_message, delta)
        try:
            resp = await self.gemini.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=self._consultant_history_contents(consultant_turn),
                config=self._consultant_config(),
            )
            text = resp.text or ""
        except Exception as e:
            text = f"שגיאה: {str(e)[:100]}"

        self._consultant_conversation.append({"role": "user", "content": consultant_turn})
        self._consultant_conversation.append({"role": "assistant", "content": text})
        return text

    async def _stream_consultant(self, user_message: str, delta: dict):
        """Pass 2 (streaming): Consultant streams response to user."""
        consultant_turn = self._build_consultant_turn(user_message, delta)
        full_text = ""
        try:
            stream = await self.gemini.aio.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=self._consultant_history_contents(consultant_turn),
                config=self._consultant_config(),
            )
            async for chunk in stream:
                text = getattr(chunk, "text", None)
                if text:
                    full_text += text
                    yield {"type": "text", "chunk": text}
        except Exception as e:
            err = f"שגיאה: {str(e)[:100]}"
            full_text = err
            yield {"type": "text", "chunk": err}

        self._consultant_conversation.append({"role": "user", "content": consultant_turn})
        self._consultant_conversation.append({"role": "assistant", "content": full_text})

    # ================================================================ public API

    async def initialize(self):
        return await self._send(INIT_MESSAGE)

    async def _send(self, message: str) -> dict:
        """Non-streaming two-pass for init and phase starts."""
        delta = await self._analyst_extract(message)
        self._merge_delta(delta)
        chat_response = await self._consultant_respond(message, delta)
        return {
            "chat_response": chat_response,
            "blueprint": self.spec,
            "flow_data": self.flow,
        }

    async def stream_process(self, message: str):
        """Streaming two-pass: Analyst extracts silently, Consultant streams to user."""
        # Pass 1: extract delta (non-streaming, silent)
        delta = await self._analyst_extract(message)
        self._merge_delta(delta)

        # Pass 2: stream business consultant response
        async for event in self._stream_consultant(message, delta):
            yield event

        yield {
            "type": "done",
            "blueprint": self.spec,
            "flow_data": self.flow,
            "provider": "gemini",
            "truncated": False,
            "parse_error": False,
        }

    # ================================================================ parsing / merge

    def _parse_response(self, raw: str) -> dict:
        if "===BLUEPRINT===" in raw:
            parts = raw.split("===BLUEPRINT===", 1)
            chat_text = parts[0].strip()
            json_text = parts[1].strip()
            json_text = re.sub(r"^```(?:json)?\s*", "", json_text)
            json_text = re.sub(r"\s*```$", "", json_text.strip())
            try:
                data = json.loads(json_text)
                return {"chat_response": chat_text, "delta": data.get("delta", {})}
            except json.JSONDecodeError:
                return {"chat_response": chat_text, "delta": {}}
        try:
            data = json.loads(raw)
            return {"chat_response": "", "delta": data.get("delta", {})}
        except json.JSONDecodeError:
            pass
        return {"chat_response": raw, "delta": {}}

    def _merge_delta(self, delta: dict):
        if not delta:
            return

        for item in delta.get("new_entities", []):
            if not any(e["id"] == item["id"] for e in self.spec["entities"]):
                self.spec["entities"].append(item)

        for item in delta.get("updated_entities", []):
            ex = next((e for e in self.spec["entities"] if e["id"] == item["id"]), None)
            if ex:
                for field in item.get("fields", []):
                    ef = next((f for f in ex.get("fields", []) if f["name"] == field["name"]), None)
                    if ef:
                        ef.update(field)
                    else:
                        ex.setdefault("fields", []).append(field)
                for key in ("name", "description"):
                    if key in item:
                        ex[key] = item[key]

        for item in delta.get("new_workflows", []):
            if not any(w["id"] == item["id"] for w in self.spec["workflows"]):
                self.spec["workflows"].append(item)

        for item in delta.get("updated_workflows", []):
            ex = next((w for w in self.spec["workflows"] if w["id"] == item["id"]), None)
            if ex:
                ex.update(item)

        for item in delta.get("new_sections", []):
            if not any(s["id"] == item["id"] for s in self.spec["spec_document"]["sections"]):
                self.spec["spec_document"]["sections"].append(item)

        for item in delta.get("updated_sections", []):
            ex = next((s for s in self.spec["spec_document"]["sections"] if s["id"] == item["id"]), None)
            if ex:
                ex.update(item)

        for item in delta.get("new_prototypes", []):
            if not any(p["id"] == item["id"] for p in self.spec["ui_prototypes"]):
                self.spec["ui_prototypes"].append(item)

        for item in delta.get("updated_prototypes", []):
            ex = next((p for p in self.spec["ui_prototypes"] if p["id"] == item["id"]), None)
            if ex:
                ex.update(item)

        for item in delta.get("new_nodes", []):
            if not any(n["id"] == item["id"] for n in self.flow["nodes"]):
                self.flow["nodes"].append(item)

        for item in delta.get("updated_nodes", []):
            ex = next((n for n in self.flow["nodes"] if n["id"] == item["id"]), None)
            if ex:
                ex.update(item)

        for item in delta.get("new_edges", []):
            if not any(e["id"] == item["id"] for e in self.flow["edges"]):
                self.flow["edges"].append(item)

        for item in delta.get("updated_edges", []):
            ex = next((e for e in self.flow["edges"] if e["id"] == item["id"]), None)
            if ex:
                ex.update(item)

    # ================================================================ validation & estimation

    async def _gemini_json_call(self, system_prompt: str, user_msg: str) -> dict:
        resp = await self.gemini.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=[genai_types.Content(role="user", parts=[genai_types.Part(text=user_msg)])],
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=32000,
            ),
        )
        candidate = resp.candidates[0] if resp.candidates else None
        if candidate and str(getattr(candidate, "finish_reason", "")).upper() == "MAX_TOKENS":
            raise ValueError("התגובה נחתכה — נסה שנית עם Blueprint קטן יותר")
        raw = resp.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw.strip())
        return json.loads(raw)

    async def validate_blueprint(self) -> dict:
        spec_data = {
            "entities": self.spec["entities"],
            "workflows": self.spec["workflows"],
            "sections": [{"id": s["id"], "title": s.get("title", "")} for s in self.spec["spec_document"]["sections"]],
            "ui_screens": [p["screen_name"] for p in self.spec["ui_prototypes"]],
        }
        user_msg = f"Validate this blueprint and return a JSON report:\n\n{json.dumps(spec_data, ensure_ascii=False, indent=2)}"
        return await self._gemini_json_call(VALIDATION_PROMPT, user_msg)

    async def estimate_cost(self) -> dict:
        spec_data = {
            "entity_count": len(self.spec["entities"]),
            "workflow_count": len(self.spec["workflows"]),
            "screen_count": len(self.spec["ui_prototypes"]),
            "section_count": len(self.spec["spec_document"]["sections"]),
            "entities": [{"name": e["name"], "field_count": len(e.get("fields", []))} for e in self.spec["entities"]],
            "workflows": [{"name": w["name"], "step_count": len(w.get("steps", [])), "constraint_count": len(w.get("constraints", []))} for w in self.spec["workflows"]],
            "sections": [s["id"] for s in self.spec["spec_document"]["sections"]],
        }
        user_msg = f"Estimate the project cost and timeline for this blueprint:\n\n{json.dumps(spec_data, ensure_ascii=False, indent=2)}"
        return await self._gemini_json_call(ESTIMATION_PROMPT, user_msg)
