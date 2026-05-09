import json
import uuid
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env FIRST, before any other imports
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Monkey-patch httpx BEFORE importing google-genai to disable proxy detection
import httpx
import httpcore

# Save original AsyncClient init
_original_async_client_init = httpx.AsyncClient.__init__

def _patched_async_client_init(self, *args, **kwargs):
    # Force disable proxies
    kwargs['mounts'] = {
        "https://": httpx.AsyncHTTPTransport(proxy=None),
        "http://": httpx.AsyncHTTPTransport(proxy=None),
    }
    _original_async_client_init(self, *args, **kwargs)

# Apply the monkey-patch
httpx.AsyncClient.__init__ = _patched_async_client_init

# Clear proxy environment variables
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'
for proxy_var in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
                  'ALL_PROXY', 'all_proxy', 'SOCKS_PROXY', 'socks_proxy']:
    if proxy_var in os.environ:
        del os.environ[proxy_var]

# NOW import FastAPI and other modules
import json as _json_lib
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from analyst import Analyst
from export_utils import generate_word, generate_pdf
import supabase_client as supa

_TEMPLATES_PATH = Path(__file__).parent / "templates.json"


def _load_templates() -> list:
    with open(_TEMPLATES_PATH, encoding="utf-8") as f:
        return _json_lib.load(f)["templates"]


def _build_flow(template: dict) -> dict:
    nodes = []
    for i, entity in enumerate(template.get("entities", [])):
        nodes.append({
            "id": f"node_{entity['id']}",
            "type": "entity",
            "data": {"label": entity["name"]},
            "position": {"x": 220 * i, "y": 220},
        })
    for i, wf in enumerate(template.get("workflows", [])):
        nodes.append({
            "id": f"node_{wf['id']}",
            "type": "action",
            "data": {"label": wf["name"]},
            "position": {"x": 220 * i, "y": 390},
        })
    return {"nodes": nodes, "edges": []}

app = FastAPI(title="SpecMind Backend")

# CORS middleware - צריך להיות BEFORE routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "https://specmind-frontend.onrender.com",
        "https://specmind-backend.onrender.com",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

sessions: dict[str, Analyst] = {}


# =============================================================================
# DOCUMENT PROCESSING HELPERS (for optional PDF upload feature)
# =============================================================================

def pdfplumber_process(file_content: bytes) -> str:
    """
    Free, in-process PDF text extraction using pdfplumber.
    Used as default when Document AI is not enabled.
    """
    import pdfplumber
    import io

    try:
        pdf = pdfplumber.open(io.BytesIO(file_content))
        text_parts = []
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        pdf.close()
        return "\n".join(text_parts)
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")


def document_ai_process(file_content: bytes) -> str:
    """
    Google Document AI for advanced PDF processing (optional).
    Only used if ENABLE_DOCUMENT_AI=true and credentials are available.
    """
    try:
        from google.cloud import documentai_v1
    except ImportError:
        raise RuntimeError("google-cloud-documentai not installed. Set ENABLE_DOCUMENT_AI=false or install package.")

    # Note: Full Document AI implementation requires Google Cloud setup
    # For now, fallback to pdfplumber
    # This is a placeholder for future Document AI integration
    return pdfplumber_process(file_content)


# =============================================================================
# REQUEST MODELS
# =============================================================================


class InitRequest(BaseModel):
    session_id: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ExportRequest(BaseModel):
    session_id: str

# reused for validate + estimate (same shape)
SessionRequest = ExportRequest


class SaveBlueprintRequest(BaseModel):
    session_id: str
    name: str


class BusinessIntakeRequest(BaseModel):
    session_id: str
    message: str


class DomainRequest(BaseModel):
    session_id: str
    domain_description: str


class PhaseRequest(BaseModel):
    session_id: str
    phase_id: str


@app.options("/{full_path:path}")
async def preflight_handler(full_path: str):
    return {"status": "ok"}

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/session/init")
async def init_session(request: InitRequest = None):
    try:
        if request is None:
            request = InitRequest()
        session_id = request.session_id

        # 1. Already live in memory
        if session_id and session_id in sessions:
            analyst = sessions[session_id]
            return {"session_id": session_id, "blueprint": analyst.spec, "flow_data": analyst.flow, "resumed": True}

        # 2. Restore from Supabase
        if session_id and supa.enabled():
            try:
                saved = await supa.fetch_session(session_id)
                if saved:
                    analyst = Analyst()
                    response = analyst.restore_from_saved(saved["blueprint"], saved["flow_data"])
                    sessions[session_id] = analyst
                    return {"session_id": session_id, **response, "resumed": True}
            except Exception as e:
                print(f"[SUPABASE] Restore failed: {e}")

        # 3. New session
        new_id = session_id or str(uuid.uuid4())
        analyst = Analyst()
        response = await analyst.initialize()
        sessions[new_id] = analyst
        if supa.enabled():
            try:
                await supa.upsert_session(new_id, analyst.spec, analyst.flow)
            except Exception as e:
                print(f"[SUPABASE] Save new session failed: {e}")
        return {"session_id": new_id, **response}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest, background_tasks: BackgroundTasks):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")

    async def generate():
        async for event in analyst.stream_process(request.message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    async def _auto_save():
        if supa.enabled():
            try:
                await supa.upsert_session(request.session_id, analyst.spec, analyst.flow)
            except Exception as e:
                print(f"[SUPABASE] Auto-save failed: {e}")

    background_tasks.add_task(_auto_save)
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------ Business Intake

@app.post("/session/business-intake")
async def business_intake(request: BusinessIntakeRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")

    async def generate():
        async for event in analyst.stream_business_intake(request.message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/session/{session_id}/skip-intake")
async def skip_intake(session_id: str):
    analyst = sessions.get(session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    analyst.intake_skipped = True
    return {"stage": "template_selection"}


# ------------------------------------------------------------------ Document Upload (Optional)

@app.post("/documents/upload")
async def upload_document(session_id: str, file: UploadFile = File(...)):
    """
    Upload a PDF document for analysis.

    Strategy:
    - If ENABLE_DOCUMENT_AI=true and credentials are available: use Document AI
    - Otherwise: use free pdfplumber (in-process extraction)

    Document text is stored in session.document_context and injected into
    the Analyst's context on next message.
    """
    analyst = sessions.get(session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        # Read file content
        content = await file.read()

        # Choose processor based on environment
        enable_doc_ai = os.getenv("ENABLE_DOCUMENT_AI", "false").lower() == "true"

        if enable_doc_ai:
            try:
                extracted_text = document_ai_process(content)
                processor_used = "Document AI"
            except Exception as e:
                print(f"[DOCUMENT] Document AI failed, falling back to pdfplumber: {e}")
                extracted_text = pdfplumber_process(content)
                processor_used = "pdfplumber (fallback)"
        else:
            # Default: use free pdfplumber
            extracted_text = pdfplumber_process(content)
            processor_used = "pdfplumber"

        # Store in session
        if not hasattr(analyst, 'document_context'):
            analyst.document_context = {}

        analyst.document_context = {
            'filename': file.filename,
            'extracted_text': extracted_text,
            'processor': processor_used,
            'uploaded_at': str(__import__('datetime').datetime.now()),
            'text_length': len(extracted_text)
        }

        return {
            'status': 'success',
            'filename': file.filename,
            'extracted_length': len(extracted_text),
            'processor': processor_used,
            'message': f'Document loaded successfully using {processor_used}'
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {str(e)}")
    except Exception as e:
        print(f"[DOCUMENT] Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Document upload failed: {str(e)}")


# ------------------------------------------------------------------ Phases

@app.post("/session/detect-phases")
async def detect_phases(request: DomainRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return await analyst.detect_phases(request.domain_description)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/session/start-phase")
async def start_phase(request: PhaseRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return await analyst.start_phase(request.phase_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/session/complete-phase")
async def complete_phase(request: SessionRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return analyst.complete_phase()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/add-phase")
async def add_phase(request: PhaseRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        return await analyst.add_phase(request.phase_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/session/{session_id}/phases")
async def get_phases(session_id: str):
    analyst = sessions.get(session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "all_phases": analyst.all_phases,
        "current_phase": analyst.current_phase,
        "completed_phases": analyst.completed_phases,
    }


# ------------------------------------------------------------------ Blueprints (history)

@app.post("/blueprints/save")
async def save_blueprint(request: SaveBlueprintRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not supa.enabled():
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        result = await supa.save_named_blueprint(
            request.session_id, request.name, analyst.spec, analyst.flow
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {e}")


@app.get("/projects/recent")
async def recent_projects():
    if not supa.enabled():
        return {"projects": []}
    try:
        items = await supa.list_recent_sessions()
        return {"projects": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/blueprints")
async def list_blueprints():
    if not supa.enabled():
        return {"blueprints": []}
    try:
        items = await supa.list_named_blueprints()
        return {"blueprints": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"List failed: {e}")


@app.post("/blueprints/{blueprint_id}/load")
async def load_saved_blueprint(blueprint_id: str, request: SessionRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not supa.enabled():
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        saved = await supa.fetch_named_blueprint(blueprint_id)
        if not saved:
            raise HTTPException(status_code=404, detail="Blueprint not found")
        response = analyst.restore_from_saved(saved["blueprint_json"], saved.get("flow_data") or {})
        await supa.upsert_session(request.session_id, analyst.spec, analyst.flow)
        return {**response, "name": saved["name"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Load failed: {e}")


# ------------------------------------------------------------------ Export

@app.post("/chat/validate")
async def validate_requirements(request: SessionRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        result = await analyst.validate_blueprint()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {e}")
    return result


@app.post("/estimate/cost")
async def estimate_cost_endpoint(request: SessionRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        result = await analyst.estimate_cost()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Estimation failed: {e}")
    return result


@app.post("/export/word")
async def export_word(request: ExportRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        data = generate_word(analyst.spec)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Word export failed: {e}")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=specmind.docx"},
    )


@app.post("/export/pdf")
async def export_pdf(request: ExportRequest):
    analyst = sessions.get(request.session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        data = generate_pdf(analyst.spec)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {e}")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=specmind.pdf"},
    )


# ------------------------------------------------------------------ Document Upload

_MAX_DOC_CHARS = 20_000


def _extract_pdf_text(file_bytes: bytes) -> str:
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(p for p in pages if p.strip())


def _extract_docx_text(file_bytes: bytes) -> str:
    from docx import Document
    import io
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


@app.post("/session/upload-document")
async def upload_document(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    file: UploadFile = File(...),
    note: str = Form(default=""),
):
    analyst = sessions.get(session_id)
    if analyst is None:
        raise HTTPException(status_code=404, detail="Session not found")

    filename = file.filename or "document"
    contents = await file.read()

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="הקובץ גדול מדי (מקסימום 10MB).")

    try:
        if filename.lower().endswith(".pdf"):
            extracted = _extract_pdf_text(contents)
        elif filename.lower().endswith((".docx", ".doc")):
            extracted = _extract_docx_text(contents)
        else:
            raise HTTPException(status_code=400, detail="סוג קובץ לא נתמך. השתמש ב-PDF או DOCX.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"לא ניתן לקרוא את הקובץ: {e}")

    if not extracted.strip():
        raise HTTPException(status_code=422, detail="לא נמצא טקסט בקובץ.")

    truncated = len(extracted) > _MAX_DOC_CHARS
    doc_text = extracted[:_MAX_DOC_CHARS]

    note_line = f"\nהערת המשתמש: {note}\n" if note.strip() else ""
    doc_message = (
        f"[DOCUMENT UPLOAD: {filename}]{note_line}\n"
        f"המשתמש העלה מסמך עם דרישות עסקיות. להלן תוכן המסמך:\n\n"
        f"{doc_text}"
        + ("\n\n...[המסמך נחתך עקב אורך]" if truncated else "")
    )

    async def generate():
        async for event in analyst.stream_process(doc_message):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    async def _auto_save():
        if supa.enabled():
            try:
                await supa.upsert_session(session_id, analyst.spec, analyst.flow)
            except Exception as e:
                print(f"[SUPABASE] Auto-save failed: {e}")

    background_tasks.add_task(_auto_save)
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------ Templates

@app.get("/templates")
async def list_templates():
    templates = _load_templates()
    return {
        "templates": [
            {
                "id": t["id"],
                "name": t["name"],
                "domain": t["domain"],
                "description": t["description"],
                "entity_count": len(t.get("entities", [])),
                "workflow_count": len(t.get("workflows", [])),
            }
            for t in templates
        ]
    }


@app.get("/templates/{template_id}/load")
async def load_template(template_id: str):
    templates = _load_templates()
    template = next((t for t in templates if t["id"] == template_id), None)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    blueprint = {
        "entities": template.get("entities", []),
        "workflows": template.get("workflows", []),
        "spec_document": template.get("spec_document", {"sections": []}),
        "ui_prototypes": [],
    }
    return {
        "blueprint": blueprint,
        "flow_data": _build_flow(template),
        "initial_message": (
            f"מעולה — טענתי נקודת התחלה בתחום **{template['domain']}** בשבילך.\n\n"
            f"עכשיו בוא נתאים אותה למציאות שלך: מה הכאב העסקי שהמערכת הזו אמורה לפתור? "
            f"מי הלקוח שלך, ואיך הוא מתנהג היום בלי הכלי הזה?"
        ),
    }
