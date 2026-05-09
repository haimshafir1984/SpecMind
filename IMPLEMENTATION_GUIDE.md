# SpecMind Refactor — Quick Implementation Guide

## 📊 What's Changing

| Component | Current | After Refactor | Impact |
|-----------|---------|-----------------|--------|
| Conversation | Technical jargon possible | Business language only | User feels like talking to consultant |
| Document Upload | Not available | Optional (PDF upload) | Users can attach files for analysis |
| Document Processing | N/A | Smart choice: Document AI OR pdfplumber | Cost-optimized (starts free) |
| Tests | Limited | 8 comprehensive tests | Prevents regression, enforces quality |
| Cost | $10-20/mo (Gemini only) | $10-20/mo default, optional +$50-150 if Document AI | Transparent, user can decide |

---

## 🎯 4-Phase Implementation

### Phase 1: Analyst Pass Refactor (30 min)
```python
# Add to analyst.py

def _delta_to_business_summary(self, delta):
    """Technical terms → business language"""
    # entities: [Customer] → "Identified: customers"
    # workflows: [Order] → "Understood: order process"
    # Never say "entity" or "workflow"
    return summary_text

# In _build_analyst_turn():
summary = self._delta_to_business_summary(delta)
self.conversation.append({
    'role': 'assistant',
    'content': f'[EXTRACTED: {summary}]'
})
```

**Test:** Print conversation history, verify no jargon

---

### Phase 2: Consultant Pass Refactor (90 min)
```python
# In analyst.py, refactor _build_consultant_turn()

def _build_consultant_turn(self, user_message, delta):
    """
    Every turn must follow:
    1. Business language only (no entity/workflow/schema)
    2. ONE main question (max 2 total)
    3. Examples if asking about data
    4. Short paragraphs (conversational)
    5. Natural flow (not a form)
    6. Periodic summaries (every 4 turns)
    """
    
    context = []
    context.append(f"[INDUSTRY CONTEXT]\n{self._domain_hint()}")
    context.append(f"[USER SAID]\n{user_message}")
    context.append(f"[WHAT WE UNDERSTOOD]\n{self._delta_to_business_summary(delta)}")
    context.append(f"[CURRENT STATE]\n{self._business_state_summary()}")
    
    return "\n\n".join(context)

def _enforce_consultant_rules(self, response_text):
    """Last-resort validation (doesn't block, just logs)"""
    violations = []
    
    # Check: no banned words
    for word in ['entity', 'workflow', 'schema', 'api']:
        if word in response_text.lower():
            violations.append(f"Jargon: {word}")
    
    # Check: not too many questions
    if response_text.count('?') > 3:
        violations.append(f"Too many questions")
    
    if violations:
        print(f"⚠️  Rules: {violations}")
```

**Test:** Manual review of sample responses, run pytest

---

### Phase 3: Document Upload (60 min)
```python
# In main.py

# 1. Add to requirements.txt:
# pdfplumber==0.9.0

# 2. Add functions:
def pdfplumber_process(file_content: bytes) -> str:
    """Free in-process PDF extraction"""
    import pdfplumber
    import io
    pdf = pdfplumber.open(io.BytesIO(file_content))
    text = "\n".join(
        page.extract_text() for page in pdf.pages 
        if page.extract_text()
    )
    pdf.close()
    return text

def document_ai_process(file_content: bytes) -> str:
    """Google Document AI (optional, requires credentials)"""
    # Only called if ENABLE_DOCUMENT_AI=true
    from google.cloud import documentai_v1
    # ... implementation ...
    return extracted_text

# 3. Add endpoint:
@app.post("/documents/upload")
async def upload_document(session_id: str, file: UploadFile):
    session = sessions.get(session_id)
    content = await file.read()
    
    # Choose processor based on config
    if os.getenv('ENABLE_DOCUMENT_AI') == 'true':
        text = document_ai_process(content)
        source = "Document AI"
    else:
        text = pdfplumber_process(content)
        source = "pdfplumber"
    
    session.document_context = {
        'filename': file.filename,
        'extracted_text': text,
        'source': source
    }
    
    return {'status': 'success', 'processor': source}

# 4. Update analyst.py _analyst_history():
def _analyst_history(self):
    history = []
    if self.document_context:
        doc_text = self.document_context['extracted_text'][:2000]
        history.append({
            'role': 'user',
            'content': f"[DOCUMENT]\n{doc_text}...\n---"
        })
        history.append({
            'role': 'model',
            'content': '[understood - document loaded]'
        })
    # Rest of history...
    return history
```

**Test:** Upload PDF, verify text extraction works

---

### Phase 4: Test Suite (60 min)
```python
# Create backend/test_business_conversation.py

import pytest
from analyst import Analyst

class TestConsultantLanguage:
    def test_no_banned_words(self):
        # Verify response has no jargon
        assert 'entity' not in response.lower()
    
    def test_single_question_rule(self):
        # Max 2 questions per turn
        assert response.count('?') <= 2
    
    def test_examples_provided(self):
        # If asking about data, must have examples
        if 'what information' in response.lower():
            assert 'for example' in response.lower() or 'לדוגמה' in response
    
    def test_no_form_pattern(self):
        # No "Question 1, Question 2..."
        assert 'Question 1' not in response
    
    def test_conversational_flow(self):
        # Short paragraphs
        avg_para_len = sum(len(p) for p in response.split('\n\n')) / len(response.split('\n\n'))
        assert avg_para_len < 200

class TestDocumentProcessing:
    def test_pdf_upload_pdfplumber(self):
        text = pdfplumber_process(sample_pdf_bytes)
        assert len(text) > 100

    def test_document_context_in_session(self):
        session.document_context = {'extracted_text': 'test'}
        assert 'source' in session.document_context
```

**Run:**
```bash
cd backend
python -m pytest test_business_conversation.py -v
```

---

## 📋 Checklist

### Before You Start
- [ ] Read `.claude/BUSINESS_CONVERSATION.md` (understand 6 rules)
- [ ] Review current `analyst.py` structure
- [ ] Review current `main.py` structure
- [ ] Understand existing `_build_consultant_turn()` flow

### Phase 1 (Analyst)
- [ ] Add `_delta_to_business_summary()` method
- [ ] Update `_build_analyst_turn()` to use it
- [ ] Test: Print conversation history, verify no jargon

### Phase 2 (Consultant)
- [ ] Refactor `_build_consultant_turn()` with 6 rules
- [ ] Add `_enforce_consultant_rules()` helper
- [ ] Manually review 5 sample responses
- [ ] Verify one-question pattern enforced

### Phase 3 (Documents)
- [ ] Add `pdfplumber` to requirements.txt
- [ ] Add `pdfplumber_process()` function
- [ ] Add optional `document_ai_process()` function
- [ ] Add `POST /documents/upload` endpoint
- [ ] Update `_analyst_history()` to include document context

### Phase 4 (Tests)
- [ ] Create `test_business_conversation.py` with 8 tests
- [ ] Run `pytest` locally, all tests pass
- [ ] Add `.github/workflows/test.yml` if not exists
- [ ] Push to git, verify CI runs and passes

### Deployment
- [ ] All tests pass locally
- [ ] Push to main branch
- [ ] GitHub Actions CI runs
- [ ] Render auto-deploys on success

---

## 🎨 Architecture Diagram

```
User Input + Optional PDF
    ↓
[Document Router]
    ├─ PDF uploaded? YES → Document AI or pdfplumber
    └─ NO → Continue
    ↓
Session.document_context (if PDF)
    ↓
[ANALYST PASS]
- Extract entities/workflows from message + document
- Generate business-language summary
- Output: JSON delta (internal)
    ↓
[CONSULTANT PASS]
- Read summary + current state
- Follow 6 rules:
  1. Business language only
  2. One question at a time
  3. Examples provided
  4. Conversational flow
  5. Periodic summaries
  6. Natural tone
- Output: Hebrew streaming text
    ↓
SSE Stream → User sees warm, smart responses
    ↓
State Updated (entities, workflows, prototypes, spec doc)
```

---

## 💰 Cost Model

**Default (No Document AI):**
- Gemini: ~$0.10-0.15 per request
- pdfplumber: $0 (in-process)
- Monthly estimate: $10-20 (normal usage)

**Optional (With Document AI):**
- Gemini: same
- Document AI: $0.04-0.10 per page
- Monthly estimate: $50-150 (if heavy PDF usage)

**How to Enable Document AI:**
1. Set `ENABLE_DOCUMENT_AI=true` in `.env`
2. Set `GOOGLE_CLOUD_PROJECT=your-project-id`
3. Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
4. Restart backend

**How to Disable:**
- Set `ENABLE_DOCUMENT_AI=false` or remove it
- System automatically falls back to pdfplumber

---

## 🔗 File Changes Summary

| File | Type | Change |
|------|------|--------|
| `analyst.py` | Modify | Add business summary method, refactor consultant turn |
| `main.py` | Modify | Add upload endpoint, document processors |
| `requirements.txt` | Modify | Add pdfplumber |
| `test_business_conversation.py` | Create | 8 test functions |
| `.github/workflows/test.yml` | Create/Update | CI pipeline |
| `.env` | Modify | Add optional flags |

**Total changes: ~600 lines**

---

## 📖 Reference

**Rules the Consultant Must Follow:**
1. ✅ Business language only (no "entity", "workflow", "schema", "API")
2. ✅ One main question per turn (max 2 total)
3. ✅ Examples when asking about data
4. ✅ Conversational flow (not a form)
5. ✅ Periodic summaries (every 4 turns)
6. ✅ Natural, patient, professional tone

**Test Categories:**
1. Language (no jargon)
2. Question pattern (single, not multiple)
3. Examples (provided when needed)
4. Form detection (not form-like)
5. Conversational flow (short paragraphs)
6. Document processing (PDF upload)
7. Context integration (document in session)
8. Business summary (delta translation)

---

**You're ready to implement!** 🚀
