# Claude Code Refactor Prompt — SpecMind Business Conversation Skill + Document Upload

## 🎯 Objective

**Two-part refactor:**

1. **Conversation System**: Make Analyst + Consultant strictly follow **Business Conversation Skill** rules (no jargon, natural flow, Hebrew-native)
2. **Document Upload**: Add optional PDF processing with **conditional architecture**:
   - If user uploads PDF → Use Google Document AI (optimal extraction)
   - If no PDF uploaded → Use existing pdfplumber + Gemini (cheapest option)
   - Both routes merge into same Analyst/Consultant pipeline

The user should feel like they're talking to a smart business consultant, NOT a developer. And document upload should be seamless, not forced.

---

## 🏗️ Architecture: Conditional PDF Processing

### Data Flow (New)

```
User Message + Optional PDF Upload
     ↓
[Document Router]
     ├─→ PDF Uploaded? 
     │    ├─ YES: Google Document AI (extract text + structure)
     │    └─ NO: Skip document processing
     ↓
Session Context Updated (if PDF processed)
     ↓
[Analyst Pass] - Extracts entities/workflows from message + document context
     ↓
[Consultant Pass] - Responds in natural Hebrew business language
     ↓
SSE Stream → User sees warm, conversational response
```

### Key Design Points

- **No vendor lock-in**: Document AI is OPTIONAL, system works fine without it
- **Cost efficiency**: Default is cheap (no Document AI), only escalate if user uploads
- **Transparent to user**: No mention of "Document AI" or "extraction" — just works
- **Session persistence**: Document context stored in `session.document_context` (in-memory)

---

## 📋 What to Change

### 1. **Backend Architecture** (`backend/analyst.py` + `backend/main.py`)

#### 1A. Analyst Pass — Business Language Extraction Summaries

**Current Issue:**
- Analyst internally uses technical terms for JSON delta
- Conversation history (`self.conversation`) also shows technical summaries
- User never sees jargon, but the system architecture leaks it

**What to Fix:**
- Keep JSON delta structure (internal, no user sees it)
- Refactor `_build_analyst_turn()` to generate **business-focused extraction summaries**
- These summaries go into `self.conversation` (Consultant reads this)
- Example:
  ```
  ❌ "Added 3 entities: Customer, Order, Product. Updated Workflow: OrderProcessing with 5 steps."
  ✅ "Learned: the business handles customers, processes orders with products, and tracks the approval chain."
  ```

**Implementation:**
```python
# In analyst.py, add new helper method:

def _delta_to_business_summary(self, delta):
    """
    Convert technical delta → natural business language for conversation history.
    This is what the Consultant will see and respond to.
    """
    summary_parts = []
    
    if delta.get('new_entities'):
        names = [e['name'] for e in delta['new_entities']]
        summary_parts.append(f"Identified: {', '.join(names)}")
    
    if delta.get('new_workflows'):
        names = [w['name'] for w in delta['new_workflows']]
        summary_parts.append(f"Understood the process: {', '.join(names)}")
    
    if delta.get('updated_entities'):
        summary_parts.append("Refined details about the information tracked")
    
    # Never use words: entity, workflow, schema, database, API, node, edge, etc.
    # Always convert to business terms: people, process, information, approval, etc.
    
    return " · ".join(summary_parts) if summary_parts else "Understood."

# In _build_analyst_turn(), store summary in self.conversation:
summary = self._delta_to_business_summary(delta)
self.conversation.append({
    'role': 'assistant',
    'content': f'[EXTRACTED: {summary}]'  # Consultant sees this
})
```

#### 1B. Consultant Pass — Business Conversation Rules

**Current Issue:**
- Consultant sometimes asks multiple questions at once
- Uses technical terms in some contexts
- Summarization feels robotic

**What to Fix:**
Implement 6 core rules in every Consultant response:

```
RULE 1: Business language ONLY
   ✅ "Who are the people involved?"
   ❌ "Define user roles and permissions matrix"

RULE 2: ONE main question per turn (+ optional brief follow-up)
   ✅ "When the manager approves it, what happens?"
   ❌ "What's the approval process? Who approves? How long does it take?"

RULE 3: Examples when asking about data
   ✅ "What information do you track? For example: customers, orders, payments..."
   ❌ "What data models do you need?"

RULE 4: Conversational flow, not a form
   ✅ "And after that?" or "So the customer receives..."
   ❌ "Question 1. ... Question 2. ... Question 3. ..."

RULE 5: Periodic summaries (every ~4 turns)
   ✅ "Let me make sure I got this right... The main flow is..."
   ❌ Ignore this, just keep asking

RULE 6: Tone — calm, professional, patient, Hebrew-native
   ✅ Short paragraphs, conversational phrasing, no jargon
   ❌ Corporate speak, walls of text, technical terms
```

**Implementation:**
```python
# In analyst.py, refactor _build_consultant_turn():

def _build_consultant_turn(self, user_message, delta, is_summary_turn=False):
    """
    Build the full formatted context for the Consultant.
    Enforces: one question, business language, examples, natural flow.
    """
    
    # If summary turn (every 4 turns), format differently
    if is_summary_turn:
        turn_content = self._build_summary_turn(user_message, delta)
    else:
        turn_content = self._build_normal_turn(user_message, delta)
    
    return turn_content

def _build_normal_turn(self, user_message, delta):
    """
    Single-question turn. Format:
    
    [INDUSTRY CONTEXT]
    Hebrew industry description
    
    [TURN COUNTER]
    Turn 3 of conversation
    
    [USER SAID]
    {user_message}
    
    [WHAT WE UNDERSTOOD]
    Business-focused bullet list from delta
    
    [CURRENT STATE]
    Summary of business state in Hebrew
    """
    
    context = []
    context.append(f"[INDUSTRY CONTEXT]\n{self._domain_hint()}")
    context.append(f"[TURN: {len(self.conversation) // 2}]")
    context.append(f"[USER SAID]\n{user_message}")
    context.append(f"[WHAT WE UNDERSTOOD]\n{self._delta_to_business_summary(delta)}")
    context.append(f"[CURRENT STATE]\n{self._business_state_summary()}")
    
    return "\n\n".join(context)

# Add rule enforcement function:
def _enforce_consultant_rules(self, response_text):
    """
    Validate response before sending. Catch violations.
    This is a last-resort check, not primary filter.
    """
    violations = []
    
    # Check 1: No jargon
    banned = ['entity', 'workflow', 'schema', 'database', 'API', 'backend', 'frontend']
    for word in banned:
        if word.lower() in response_text.lower():
            violations.append(f"Jargon: '{word}'")
    
    # Check 2: Not too many questions
    question_count = response_text.count('?')
    if question_count > 3:
        violations.append(f"Too many questions ({question_count})")
    
    # Check 3: Not form-like
    if 'Question 1' in response_text or 'שאלה 1' in response_text:
        violations.append("Form-like pattern detected")
    
    if violations:
        print(f"⚠️ Consultant rule violations: {violations}")
        # Log but don't block (graceful degradation)
    
    return response_text
```

#### 1C. Document Upload Route (NEW)

**What to Add:**
```python
# In main.py, add new endpoint:

@app.post("/documents/upload")
async def upload_document(session_id: str, file: UploadFile):
    """
    Upload PDF → extract text → add to session context
    
    If Document AI credentials available: use Document AI
    Else: use local pdfplumber (fallback, free)
    """
    
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Read file into memory
    content = await file.read()
    
    # Try Document AI first (if enabled)
    if os.getenv('GOOGLE_CLOUD_PROJECT'):
        try:
            extracted_text = document_ai_process(content)
            source = "Document AI"
        except Exception as e:
            print(f"Document AI failed, falling back to pdfplumber: {e}")
            extracted_text = pdfplumber_process(content)
            source = "pdfplumber"
    else:
        # No Google Cloud credentials → use free pdfplumber
        extracted_text = pdfplumber_process(content)
        source = "pdfplumber"
    
    # Store in session context
    session.document_context = {
        'filename': file.filename,
        'extracted_text': extracted_text,
        'source': source,
        'uploaded_at': datetime.now()
    }
    
    return {
        'status': 'success',
        'filename': file.filename,
        'extracted_length': len(extracted_text),
        'processor': source
    }

def pdfplumber_process(file_content: bytes) -> str:
    """
    Free, in-process PDF text extraction.
    """
    import pdfplumber
    import io
    
    pdf = pdfplumber.open(io.BytesIO(file_content))
    text = "\n".join(page.extract_text() for page in pdf.pages if page.extract_text())
    pdf.close()
    return text

def document_ai_process(file_content: bytes) -> str:
    """
    Use Google Document AI for better structure extraction.
    Requires: GOOGLE_CLOUD_PROJECT env var + service account JSON
    """
    from google.cloud import documentai_v1
    
    # Implementation details omitted for brevity
    # Returns: extracted text + structure
    pass
```

#### 1D. Integrate Document Context into Analyst Pass

**What to Change:**
When the Analyst runs, it should include uploaded document context in the prompt:

```python
# In _analyst_history(), add document context:

def _analyst_history(self):
    """
    Build history for Analyst, including document context if available.
    """
    history = []
    
    # If document uploaded, inject as context
    if self.document_context:
        doc_context = f"""
[DOCUMENT CONTEXT - {self.document_context['filename']}]

{self.document_context['extracted_text'][:2000]}...  (truncated)

---
        """
        history.append({
            'role': 'user',
            'content': f"[DOCUMENT LOADED]\n{doc_context}"
        })
        history.append({
            'role': 'model',
            'content': '[understood - document context loaded]'
        })
    
    # Rest of history as before
    return history
```

---

### 2. **Frontend Components** (optional additions)

#### 2A. Document Upload Button (optional)

**Where to Add:**
- `BusinessIntakePanel.jsx` — "לחץ לטעינת מסמך עסקי (אופציונלי)"
- `ChatPanel.jsx` — Upload button in footer

**Component:**
```jsx
// Add to ChatPanel.jsx footer

<input
  type="file"
  accept=".pdf"
  onChange={async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    
    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    console.log(`Document uploaded (${result.processor})`);
    // Show user toast: "מסמך הועלה בהצלחה"
  }}
  className="hidden"
  ref={fileInputRef}
/>
<button
  onClick={() => fileInputRef.current?.click()}
  className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700"
  title="העלה מסמך PDF (אופציונלי)"
>
  📎
</button>
```

**Note:** This is OPTIONAL. The system works perfectly without it. Only add if you want users to have the option.

---

### 3. **Environment Configuration**

**Update `.env` (backend):**
```
# Existing
GOOGLE_API_KEY=...

# New (OPTIONAL - only if you want Document AI)
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Cost optimization flag
ENABLE_DOCUMENT_AI=false  # Set to true only if credentials available
```

**In Dockerfile/Render:**
- If you set `ENABLE_DOCUMENT_AI=true` and credentials, Document AI is used
- If not, system falls back to free pdfplumber
- No code changes needed, just environment variables

---

### 4. **Business Conversation Test Suite** (`backend/test_business_conversation.py`)

**Why This Matters:**
The refactor changes how the AI talks. Tests ensure it never regresses back to technical jargon.

**What to Test:**
```python
import pytest
from analyst import Analyst

class TestConsultantLanguage:
    """Validate Consultant responses have zero technical jargon"""
    
    def test_no_banned_words(self):
        """Consultant response must never contain:
        entity, workflow, schema, database, API, backend, frontend,
        node, edge, permissions, validation, business logic, etc.
        """
        # Test by running Consultant on sample inputs
        banned = ['entity', 'workflow', 'schema', 'database', 'api', 'backend']
        for word in banned:
            assert word not in response_text.lower()
    
    def test_single_question_rule(self):
        """Response should have at most 2 question marks (1 main + 1 optional follow-up)"""
        questions = response_text.count('?')
        assert questions <= 2, f"Too many questions: {questions}"
    
    def test_examples_in_data_questions(self):
        """If asking about data/information, must include examples"""
        if 'what information' in response_text.lower() or 'מה מידע' in response_text:
            assert 'for example' in response_text.lower() or 'לדוגמה' in response_text
    
    def test_no_form_pattern(self):
        """Response must not look like a form (numbered questions)"""
        assert 'Question 1' not in response_text
        assert 'שאלה 1' not in response_text
    
    def test_conversational_flow(self):
        """Paragraphs should be short and digestible"""
        paragraphs = response_text.split('\n\n')
        avg_length = sum(len(p) for p in paragraphs) / len(paragraphs)
        assert avg_length < 200, "Paragraphs too long, not conversational"

class TestDocumentProcessing:
    """Validate document upload works end-to-end"""
    
    def test_pdf_upload_pdfplumber(self):
        """If no Document AI, pdfplumber should extract text"""
        text = pdfplumber_process(sample_pdf_bytes)
        assert len(text) > 100
        assert 'sample content' in text.lower()  # Verify content is there
    
    def test_document_context_in_session(self):
        """After upload, session.document_context should be set"""
        session.document_context = {...}
        assert 'extracted_text' in session.document_context
        assert 'source' in session.document_context

class TestAnalystSummaries:
    """Validate Analyst generates business-focused summaries"""
    
    def test_delta_to_business_summary(self):
        """Delta technical terms → business language"""
        delta = {
            'new_entities': [{'name': 'Customer'}],
            'new_workflows': [{'name': 'Order'}]
        }
        summary = analyst._delta_to_business_summary(delta)
        assert 'entity' not in summary.lower()
        assert 'workflow' not in summary.lower()
        assert 'Customer' in summary or 'Identified' in summary
```

**Running the Tests:**
```bash
cd backend
python -m pytest test_business_conversation.py -v

# Should see:
# ✓ test_no_banned_words
# ✓ test_single_question_rule
# ✓ test_examples_in_data_questions
# ✓ test_no_form_pattern
# ✓ test_conversational_flow
# ✓ test_pdf_upload_pdfplumber
# ✓ test_document_context_in_session
# ✓ test_delta_to_business_summary
```

---

### 5. **requirements.txt Updates**

Add these dependencies:
```
pdfplumber==0.9.0      # Free PDF text extraction (fallback)
google-cloud-documentai==1.11.0  # Optional, only if GOOGLE_CLOUD_PROJECT set
python-multipart==0.0.6  # For file upload handling
```

The code should handle missing `google-cloud-documentai` gracefully — if not installed, use pdfplumber.

---

---

## 📝 Implementation Plan (4 Phases)

### Phase 1: Analyst Pass Refactor (analyst.py)
**Goal:** Business-focused extraction summaries

**Changes:**
1. Add `_delta_to_business_summary()` method
2. Update `_build_analyst_turn()` to use it
3. Ensure `self.conversation` contains only business language

**Files to modify:**
- `backend/analyst.py` (lines: 150-180, add new method; lines: 200-220, update _build_analyst_turn)

**Testing:** Run locally with sample prompts, verify no jargon in conversation history

---

### Phase 2: Consultant Pass Refactor (analyst.py)
**Goal:** Enforce 6 conversation rules in every response

**Changes:**
1. Refactor `_build_consultant_turn()` to enforce single-question pattern
2. Add `_enforce_consultant_rules()` helper for validation
3. Update periodic summary logic (every 4 turns)
4. Ensure domain context is injected into every turn

**Files to modify:**
- `backend/analyst.py` (lines: 250-350, refactor _build_consultant_turn)

**Testing:** Unit tests in Phase 4 will catch violations

---

### Phase 3: Document Upload Integration (analyst.py + main.py)
**Goal:** Add optional PDF processing (Document AI or pdfplumber)

**Changes:**
1. Add `pdfplumber_process()` function in `main.py`
2. Add `document_ai_process()` function (fallback if no credentials)
3. Add `POST /documents/upload` endpoint
4. Update Analyst to include document context in `_analyst_history()`
5. Update requirements.txt with `pdfplumber` and optional `google-cloud-documentai`

**Files to modify:**
- `backend/main.py` (add endpoint, add processor functions)
- `backend/analyst.py` (update _analyst_history to include document context)
- `backend/requirements.txt` (add pdfplumber)

**Environment variables:**
- `ENABLE_DOCUMENT_AI=false` (default, cost-optimization)
- `GOOGLE_CLOUD_PROJECT=...` (optional, only if using Document AI)
- `GOOGLE_APPLICATION_CREDENTIALS=...` (optional)

**Testing:** Test both pdfplumber (default) and Document AI (if credentials available)

---

### Phase 4: Test Suite (backend/test_business_conversation.py)
**Goal:** Enforce rules via automated tests

**Changes:**
1. Create test file with 8 test functions (see section 4 above)
2. Add to GitHub Actions workflow (`.github/workflows/test.yml`)
3. Ensure all tests pass before deployment

**Files to create:**
- `backend/test_business_conversation.py`
- `.github/workflows/test.yml` (if not exists)

**Running:**
```bash
cd backend
python -m pytest test_business_conversation.py -v
```

**Expected output:**
```
✓ test_no_banned_words
✓ test_single_question_rule
✓ test_examples_in_data_questions
✓ test_no_form_pattern
✓ test_conversational_flow
✓ test_pdf_upload_pdfplumber
✓ test_document_context_in_session
✓ test_delta_to_business_summary

8 passed
```

---

## 🎯 Success Criteria

1. ✅ **No technical jargon** in any Consultant response
   - Test: `test_no_banned_words()` passes
   - Manual: Read sample Consultant responses, confirm natural business language

2. ✅ **Single-question pattern enforced**
   - Test: `test_single_question_rule()` passes
   - Manual: Consultant asks at most 2 questions per turn

3. ✅ **Document upload works** (optional, but if added)
   - Test: `test_pdf_upload_pdfplumber()` passes
   - Default: uses free pdfplumber (no cost)
   - Optional: uses Document AI if credentials available

4. ✅ **Tests pass in CI**
   - GitHub Actions workflow runs on every push
   - All tests must pass before merge

5. ✅ **Spec still generates correctly**
   - The JSON delta, entities, workflows, prototypes are generated correctly
   - No regression in core functionality

---

## 📂 Files Changed Summary

| File | Change | Lines |
|------|--------|-------|
| `analyst.py` | Add `_delta_to_business_summary()` | +25 |
| `analyst.py` | Refactor `_build_consultant_turn()` | ~80 modified |
| `analyst.py` | Update `_analyst_history()` for document context | ~15 modified |
| `main.py` | Add `POST /documents/upload` endpoint | +60 |
| `main.py` | Add `pdfplumber_process()` function | +15 |
| `main.py` | Add `document_ai_process()` function | +30 |
| `requirements.txt` | Add `pdfplumber` | +1 |
| `test_business_conversation.py` | New test suite | +200 |
| `.github/workflows/test.yml` | New CI workflow | +20 |
| `.env` | Add optional flags | +3 optional |

**Total: ~500 lines of new/modified code**

---

## 🔐 Cost Optimization Strategy

**Default (Cheapest):**
- No Document AI enabled
- Uses free, in-process pdfplumber for any PDF text extraction
- Cost: $0 for document processing
- Result: Plain text extraction (good enough for most cases)

**Optional (Better Quality):**
- Set `ENABLE_DOCUMENT_AI=true` + provide credentials
- Uses Google Document AI for structured extraction
- Cost: $50-150/month if heavily used
- Result: Better handling of complex PDFs, tables, forms

**Migration Path:**
- Start with default (pdfplumber) — zero cost
- If users report PDF quality issues, enable Document AI
- Switch back anytime — no code changes, just env vars

---

## 🚀 Implementation Order

1. **Read** `.claude/BUSINESS_CONVERSATION.md` — understand 6 rules
2. **Review** current `analyst.py` `_build_consultant_turn()` — understand flow
3. **Implement Phase 1** — Analyst summaries (easiest)
4. **Test Phase 1** — ensure summaries are business-focused
5. **Implement Phase 2** — Consultant refactor (most impact)
6. **Test Phase 2** — manual review of sample responses
7. **Implement Phase 3** — Document upload (optional, but straightforward)
8. **Test Phase 3** — upload PDFs, verify text extraction
9. **Implement Phase 4** — Test suite (ensures no regression)
10. **Run all tests** — `pytest test_business_conversation.py -v`
11. **Deploy** — Render detects git push, runs CI, deploys if green

---

## 📌 Key Design Principles

1. **Graceful Degradation** — System works without Document AI, escalates if available
2. **Cost-First** — Default to free options, expensive options are opt-in
3. **No User Awareness** — User doesn't know if Document AI or pdfplumber is being used
4. **Natural Conversation** — Business language only, never mention technical architecture
5. **Backward Compatible** — Existing sessions/blueprints unaffected by changes
