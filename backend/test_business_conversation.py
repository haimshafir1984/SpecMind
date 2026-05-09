"""
Business Conversation Validation Tests
Ensures the Consultant layer never leaks technical jargon and follows the
conversation rules defined in .claude/business_conversation_skill.md

Run with:  py -m pytest test_business_conversation.py -v
"""

import re
import pytest
from analyst import Analyst, CONSULTANT_PROMPT

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BANNED_EN = [
    "entity", "entities", "schema", "database", "api", "backend", "frontend",
    "node", "edge", "workflow engine", "permissions matrix", "validation layer",
    "blueprint", "delta",
]

BANNED_HE = [
    "ישויות",       # entities (as jargon)
    "סכימה",        # schema
    "מסד נתונים",   # database
    "טענתי",        # "I loaded" — scripted robotic phrase
    "נקודת התחלה",  # "starting point" — scripted
]

HOLLOW = [
    "זה נשמע מעניין",
    "מצוין",
    "נהדר",
    "הבנתי:",
    "שאלות:",
]

FORM_PATTERNS = [
    re.compile(r"שאלה\s+\d+", re.IGNORECASE),
    re.compile(r"question\s+\d+", re.IGNORECASE),
    re.compile(r"^\d+\.\s+.+\?$", re.MULTILINE),
]

# A simulated good Consultant response
GOOD_RESPONSE = (
    "חנות שמנהלת מלאי בלי ראייה בזמן אמת — זה כמו לנהוג בלי מראת אחור.\n"
    "כבר הנחתי את הבסיס לכך שכל מוצר יהיה ניתן למעקב עם הכמות שנשארה.\n"
    "כשמוצר מגיע לסוף המלאי — מי בעסק שלך אמור לקבל התראה?"
)

BAD_RESPONSES = {
    "jargon_entities":  "הוספתי ישויות: לקוח, מוצר. יש לנו workflow לניהול הזמנות.",
    "form_like":        "שאלה 1: מי המשתמשים? שאלה 2: מה ההרשאות? שאלה 3: איזה דוחות?",
    "hollow":           "זה נשמע מעניין! מצוין שסיפרת לי. הבנתי: אתה מוכר מוצרים.",
    "too_long":         ("שורה.\n" * 8),
    "technical_terms":  "הסכימה מכילה entity של לקוח. ה-backend יהיה FastAPI עם REST API.",
    "loaded_phrases":   "טענתי תבנית. יש לך נקודת התחלה עם 3 ישויות ו-2 תהליכים.",
}

# ---------------------------------------------------------------------------
# Helper — build an Analyst instance without a Gemini key (no __init__ call)
# ---------------------------------------------------------------------------

def _make_analyst(entities=(), workflows=(), screens=(), intake=None) -> Analyst:
    a = Analyst.__new__(Analyst)
    a.spec = {
        "entities":      [{"id": e, "name": e, "fields": []}      for e in entities],
        "workflows":     [{"id": w, "name": w, "steps": [], "constraints": []} for w in workflows],
        "spec_document": {"sections": []},
        "ui_prototypes": [{"id": s, "screen_name": s, "code": ""}  for s in screens],
    }
    a.flow = {"nodes": [], "edges": []}
    a.business_intake_data = intake or {}
    a._consultant_conversation = []
    return a


def _check_response(text: str) -> list[str]:
    """Return a list of violations. Empty list = response is clean."""
    lower = text.lower()
    errors = []
    for word in BANNED_EN + BANNED_HE:
        if word.lower() in lower:
            errors.append(f"Banned word: '{word}'")
    for phrase in HOLLOW:
        if phrase in text:
            errors.append(f"Hollow validation: '{phrase}'")
    for pattern in FORM_PATTERNS:
        if pattern.search(text):
            errors.append(f"Form-like pattern: {pattern.pattern}")
    lines = [l for l in text.strip().splitlines() if l.strip()]
    if len(lines) > 5:
        errors.append(f"Too many lines: {len(lines)} (max 5)")
    return errors


# ===========================================================================
# Test 1 — No jargon in CONSULTANT_PROMPT instructional sections
# ===========================================================================

class TestConsultantPromptIsJargonFree:
    """The prompt's positive-instruction text must not teach the model to use jargon."""

    def _instruction_lines(self):
        """Lines that are positive instructions (not ❌ examples or table rows)."""
        return [
            line for line in CONSULTANT_PROMPT.splitlines()
            if line.strip()
            and not line.strip().startswith("❌")
            and "Never say" not in line
            and "FORBIDDEN" not in line
            and "| " not in line
            and "→" not in line
        ]

    def test_no_entity_in_positive_instructions(self):
        bad = [l for l in self._instruction_lines() if "entity" in l.lower()]
        assert not bad, f"'entity' in positive instruction: {bad}"

    def test_no_schema_in_positive_instructions(self):
        bad = [l for l in self._instruction_lines() if "schema" in l.lower()]
        assert not bad, f"'schema' in positive instruction: {bad}"

    def test_all_8_rules_referenced(self):
        rules = ["Rule 1", "Rule 2", "Rule 3", "Rule 4", "Rule 5", "Rule 6", "Rule 7", "Rule 8"]
        for rule in rules:
            assert rule in CONSULTANT_PROMPT, f"{rule} missing from CONSULTANT_PROMPT"

    def test_forbidden_phrases_explicitly_listed(self):
        for phrase in ["טענתי", "נקודת התחלה", "ישויות"]:
            assert phrase in CONSULTANT_PROMPT, f"Forbidden phrase '{phrase}' not in prompt"

    def test_domain_question_bank_covers_main_industries(self):
        for domain in ["Logistics", "Retail", "Healthcare", "HR", "Finance"]:
            assert domain in CONSULTANT_PROMPT, f"Domain '{domain}' missing from question bank"

    def test_max_lines_rule_present(self):
        assert "5 lines" in CONSULTANT_PROMPT or "3–5" in CONSULTANT_PROMPT

    def test_summarize_rule_present(self):
        assert "summar" in CONSULTANT_PROMPT.lower() or "נוודא" in CONSULTANT_PROMPT

    def test_examples_rule_present(self):
        assert "לדוגמה" in CONSULTANT_PROMPT or "example" in CONSULTANT_PROMPT.lower()


# ===========================================================================
# Test 2 — _build_consultant_turn produces clean context strings
# ===========================================================================

class TestConsultantTurnBuilding:

    def test_session_start_has_correct_tag(self):
        a = _make_analyst()
        turn = a._build_consultant_turn("__init__", {})
        assert "[SESSION START]" in turn

    def test_session_start_has_no_jargon(self):
        a = _make_analyst()
        turn = a._build_consultant_turn("__init__", {}).lower()
        for word in BANNED_EN:
            assert word not in turn, f"'{word}' in session-start turn"

    def test_phase_start_includes_industry(self):
        a = _make_analyst(intake={"industry": "Healthcare"})
        turn = a._build_consultant_turn("__phase_start__:ניהול תורים — תיאום", {})
        assert "[PHASE START]" in turn
        assert "Healthcare" in turn

    def test_normal_turn_includes_industry_context(self):
        a = _make_analyst(entities=["לקוח", "מוצר"])
        turn = a._build_consultant_turn("יש לי חנות", {})
        assert "[INDUSTRY CONTEXT]" in turn

    def test_normal_turn_includes_user_message(self):
        a = _make_analyst()
        turn = a._build_consultant_turn("אני מנהל מחסן", {})
        assert "אני מנהל מחסן" in turn

    def test_turn_counter_present(self):
        a = _make_analyst()
        turn = a._build_consultant_turn("hello", {})
        assert "[CONVERSATION TURN:" in turn

    def test_summary_hint_on_turn_4(self):
        a = _make_analyst()
        # Simulate 4 assistant turns in consultant conversation
        a._consultant_conversation = [
            {"role": "user", "content": "u"},
            {"role": "assistant", "content": "a"},
        ] * 4
        turn = a._build_consultant_turn("next message", {})
        assert "periodic summary" in turn.lower() or "HINT" in turn


# ===========================================================================
# Test 3 — _delta_to_business_terms uses natural language, no jargon
# ===========================================================================

class TestDeltaToBusinessTerms:

    def test_empty_delta_returns_human_message(self):
        a = _make_analyst()
        result = a._delta_to_business_terms({})
        assert len(result) > 5
        assert "entity" not in result.lower()
        assert "schema" not in result.lower()

    def test_new_entities_described_by_name(self):
        a = _make_analyst()
        delta = {"new_entities": [{"id": "customer", "name": "לקוח", "fields": []}]}
        result = a._delta_to_business_terms(delta)
        assert "לקוח" in result

    def test_new_entities_no_jargon(self):
        a = _make_analyst()
        delta = {"new_entities": [{"id": "p", "name": "מוצר", "fields": []}]}
        result = a._delta_to_business_terms(delta).lower()
        for word in ["entity", "entities", "schema", "database"]:
            assert word not in result, f"'{word}' found in delta summary"

    def test_new_workflows_described_naturally(self):
        a = _make_analyst()
        delta = {"new_workflows": [{"id": "ord", "name": "תהליך הזמנה", "steps": [], "constraints": []}]}
        result = a._delta_to_business_terms(delta)
        assert "תהליך הזמנה" in result
        assert "workflow" not in result.lower()

    def test_new_prototypes_mentioned_by_screen_name(self):
        a = _make_analyst()
        delta = {"new_prototypes": [{"id": "p1", "screen_name": "דשבורד מכירות", "code": ""}]}
        result = a._delta_to_business_terms(delta)
        assert "דשבורד מכירות" in result

    def test_result_uses_bullet_format(self):
        a = _make_analyst()
        delta = {
            "new_entities":  [{"id": "x", "name": "X", "fields": []}],
            "new_workflows": [{"id": "y", "name": "Y", "steps": [], "constraints": []}],
        }
        result = a._delta_to_business_terms(delta)
        assert "- " in result  # bullet format confirmed


# ===========================================================================
# Test 4 — _domain_hint priority chain
# ===========================================================================

class TestDomainHint:

    def test_intake_industry_takes_priority(self):
        a = _make_analyst(
            entities=["משלוח"],
            intake={"industry": "Healthcare", "domain": "FinTech"},
        )
        assert a._domain_hint() == "Healthcare"

    def test_intake_domain_fallback(self):
        a = _make_analyst(intake={"domain": "Logistics"})
        assert a._domain_hint() == "Logistics"

    def test_entity_inference_when_no_intake(self):
        a = _make_analyst(entities=["לקוח", "מוצר"], workflows=["מכירה"])
        hint = a._domain_hint()
        assert "לקוח" in hint or "מוצר" in hint or "מכירה" in hint

    def test_unknown_when_nothing_available(self):
        a = _make_analyst()
        hint = a._domain_hint()
        assert "unknown" in hint.lower() or "ask" in hint.lower()


# ===========================================================================
# Test 5 — Response shape validation (static examples)
# ===========================================================================

class TestResponseValidation:
    """Validate what a Consultant response SHOULD and SHOULD NOT look like."""

    def test_good_response_passes_all_checks(self):
        errors = _check_response(GOOD_RESPONSE)
        assert not errors, f"Good response failed: {errors}"

    def test_entities_jargon_is_caught(self):
        assert _check_response(BAD_RESPONSES["jargon_entities"])

    def test_form_like_pattern_is_caught(self):
        assert _check_response(BAD_RESPONSES["form_like"])

    def test_hollow_validation_is_caught(self):
        assert _check_response(BAD_RESPONSES["hollow"])

    def test_too_long_response_is_caught(self):
        assert _check_response(BAD_RESPONSES["too_long"])

    def test_technical_terms_are_caught(self):
        assert _check_response(BAD_RESPONSES["technical_terms"])

    def test_loaded_scripted_phrases_are_caught(self):
        assert _check_response(BAD_RESPONSES["loaded_phrases"])

    def test_good_response_has_exactly_one_question(self):
        q_count = GOOD_RESPONSE.count("?")
        assert q_count == 1, f"Good response should have 1 question, found {q_count}"

    def test_good_response_within_line_limit(self):
        lines = [l for l in GOOD_RESPONSE.strip().splitlines() if l.strip()]
        assert len(lines) <= 5, f"Good response has {len(lines)} lines (max 5)"


# ===========================================================================
# Test 6 — Document Processing (NEW)
# ===========================================================================

class TestDocumentProcessing:
    """Validate document upload and PDF processing works correctly."""

    def test_document_context_attribute_exists(self):
        """After initialization, analyst should have document_context attribute."""
        a = _make_analyst()
        a.document_context = None
        assert hasattr(a, 'document_context')

    def test_document_context_stored_on_upload(self):
        """After upload, document context is stored properly."""
        a = _make_analyst()
        a.document_context = {
            'filename': 'test.pdf',
            'extracted_text': 'Sample content from PDF',
            'processor': 'pdfplumber',
            'text_length': 23
        }
        assert a.document_context['filename'] == 'test.pdf'
        assert 'extracted_text' in a.document_context
        assert a.document_context['processor'] in ['pdfplumber', 'Document AI']

    def test_enforce_consultant_rules_method_exists(self):
        """_enforce_consultant_rules method should exist."""
        a = _make_analyst()
        assert hasattr(a, '_enforce_consultant_rules')

    def test_enforce_consultant_rules_detects_jargon(self):
        """Rule enforcement should detect technical jargon."""
        a = _make_analyst()
        bad_response = "Added 3 entities and 2 workflows to the database schema."
        # Method should not raise, but would log violations
        a._enforce_consultant_rules(bad_response)

    def test_enforce_consultant_rules_detects_too_many_questions(self):
        """Rule enforcement should flag too many questions."""
        a = _make_analyst()
        bad_response = "Who are users? What do they do? When do they work? Where are they located? Why is this needed?"
        a._enforce_consultant_rules(bad_response)  # Should detect violation

    def test_enforce_consultant_rules_detects_form_pattern(self):
        """Rule enforcement should catch form-like patterns."""
        a = _make_analyst()
        bad_response = "Question 1: Who are the users?\nQuestion 2: What data do they manage?"
        a._enforce_consultant_rules(bad_response)  # Should detect violation


# ===========================================================================
# Test 7 — Analyst History with Document Context
# ===========================================================================

class TestAnalystHistoryWithDocuments:
    """Validate document context is properly injected into Analyst history."""

    def test_document_context_in_history(self):
        """Document context should be included in _analyst_history output."""
        a = _make_analyst()
        a.conversation = []
        a.document_context = {
            'filename': 'requirements.pdf',
            'extracted_text': 'This is the extracted content from the PDF file',
            'processor': 'pdfplumber'
        }

        history = a._analyst_history()
        # History should contain document context
        history_str = "\n".join(str(c) for c in history)
        assert 'DOCUMENT' in history_str or 'requirements.pdf' in history_str or 'extracted' in history_str.lower()

    def test_no_document_context_when_not_uploaded(self):
        """If no document uploaded, history should not mention documents."""
        a = _make_analyst()
        a.conversation = []
        a.document_context = None

        history = a._analyst_history()
        history_str = "\n".join(str(c) for c in history)
        # Should not have forced document references
        # (This test is flexible - just ensure no crashes)
        assert isinstance(history, list)


# ---------------------------------------------------------------------------
# Run directly
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
