import { useState, useEffect } from 'react'
import axios from 'axios'
import ChatPanel from './components/ChatPanel'
import BlueprintDashboard from './components/BlueprintDashboard'
import TemplateModal from './components/TemplateModal'
import SaveModal from './components/SaveModal'
import HistoryModal from './components/HistoryModal'
import PhaseDetectionPanel from './components/PhaseDetectionPanel'
import PhaseProgressBar from './components/PhaseProgressBar'
import PhaseCompletionPanel from './components/PhaseCompletionPanel'
import BusinessIntakePanel from './components/BusinessIntakePanel'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'
const SESSION_KEY = 'specmind_session_id'

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [blueprint, setBlueprint] = useState({ entities: [], workflows: [], spec_document: { sections: [] }, ui_prototypes: [] })
  const [flowData, setFlowData] = useState({ nodes: [], edges: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeProvider, setActiveProvider] = useState(null)
  const [error, setError] = useState(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [validationResult, setValidationResult] = useState(null)
  const [isValidating, setIsValidating] = useState(false)
  const [costEstimate, setCostEstimate] = useState(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  // Phase flow
  const [appStage, setAppStage] = useState('business_intake') // 'business_intake' | 'chat' | 'phase_selection' | 'phase_focused' | 'phase_complete'
  const [detectedDomain, setDetectedDomain] = useState('')
  const [allPhases, setAllPhases] = useState([])
  const [currentPhase, setCurrentPhase] = useState(null)
  const [completedPhases, setCompletedPhases] = useState([])
  const [phaseLoading, setPhaseLoading] = useState(false)
  const [phaseCompletionData, setPhaseCompletionData] = useState(null)

  useEffect(() => { initSession() }, [])

  const initSession = async () => {
    try {
      setIsLoading(true)
      const storedId = localStorage.getItem(SESSION_KEY)
      const res = await axios.post(`${API_BASE}/session/init`, { session_id: storedId || undefined })
      const { session_id, resumed, chat_response, blueprint: bp, flow_data } = res.data

      setSessionId(session_id)
      localStorage.setItem(SESSION_KEY, session_id)

      if (bp) setBlueprint(bp)
      if (flow_data) setFlowData(flow_data)

      if (resumed) {
        if (chat_response) setMessages([{ role: 'assistant', content: chat_response }])
        setAppStage('chat')
      } else {
        if (chat_response) setMessages([{ role: 'assistant', content: chat_response }])
        setAppStage('business_intake') // new sessions start with intake
      }
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail?.includes('credit') || detail?.includes('quota')) {
        setError(`שגיאת API: ${detail.slice(0, 120)}`)
      } else if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNREFUSED') {
        setError('לא ניתן להתחבר לשרת. אנא ודא שהשרת פועל על פורט 8001.')
      } else {
        setError(detail ? `שגיאה: ${detail.slice(0, 150)}` : 'שגיאה לא ידועה. בדוק את הטרמינל.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const loadTemplate = async (templateId) => {
    try {
      const res = await fetch(`${API_BASE}/templates/${templateId}/load`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setBlueprint(data.blueprint)
      setFlowData(data.flow_data)
      setMessages(prev => [...prev, { role: 'assistant', content: data.initial_message }])
      setShowTemplateModal(false)
    } catch {
      setShowTemplateModal(false)
    }
  }

  const handleSave = async (name) => {
    if (!sessionId || isSaving) return
    setIsSaving(true)
    try {
      const res = await fetch(`${API_BASE}/blueprints/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, name }),
      })
      if (!res.ok) throw new Error(await res.text())
      setShowSaveModal(false)
    } catch (e) {
      setError(`שגיאה בשמירה: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadFromHistory = (data) => {
    if (data.blueprint) setBlueprint(data.blueprint)
    if (data.flow_data) setFlowData(data.flow_data)
    if (data.chat_response) setMessages(prev => [...prev, { role: 'assistant', content: data.chat_response }])
    setShowHistoryModal(false)
    setValidationResult(null)
    setCostEstimate(null)
  }

  const handleDetectPhases = async (domainDescription) => {
    if (!sessionId || phaseLoading) return
    setPhaseLoading(true)
    try {
      const res = await fetch(`${API_BASE}/session/detect-phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, domain_description: domainDescription }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setDetectedDomain(data.domain)
      setAllPhases(data.phases || [])
      setAppStage('phase_selection')
    } catch (e) {
      setError(`שגיאה בזיהוי Phases: ${e.message}`)
    } finally {
      setPhaseLoading(false)
    }
  }

  const handleSelectPhase = async (phaseId) => {
    if (!sessionId || phaseLoading) return
    setPhaseLoading(true)
    try {
      const res = await fetch(`${API_BASE}/session/start-phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, phase_id: phaseId }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCurrentPhase(phaseId)
      if (data.blueprint) setBlueprint(data.blueprint)
      if (data.flow_data) setFlowData(data.flow_data)
      if (data.message) setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      setAppStage('phase_focused')
    } catch (e) {
      setError(`שגיאה בהתחלת Phase: ${e.message}`)
    } finally {
      setPhaseLoading(false)
    }
  }

  const handleCompletePhase = async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`${API_BASE}/session/complete-phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCompletedPhases(prev => [...prev, data.completed_phase])
      setPhaseCompletionData(data)
      if (data.blueprint) setBlueprint(data.blueprint)
      if (data.flow_data) setFlowData(data.flow_data)
      setAppStage('phase_complete')
    } catch (e) {
      setError(`שגיאה בסיום Phase: ${e.message}`)
    }
  }

  const handleAddPhase = async (phaseId) => {
    await handleSelectPhase(phaseId)
  }

  const handleFinishAllPhases = () => {
    setAppStage('chat')
    setCurrentPhase(null)
  }

  const handleNewConversation = () => {
    if (!window.confirm('להתחיל שיחה חדשה? הסשן הנוכחי יישמר אוטומטית ב-Supabase.')) return
    localStorage.removeItem(SESSION_KEY)
    setSessionId(null)
    setMessages([])
    setBlueprint({ entities: [], workflows: [], spec_document: { sections: [] }, ui_prototypes: [] })
    setFlowData({ nodes: [], edges: [] })
    setValidationResult(null)
    setCostEstimate(null)
    setAllPhases([])
    setCurrentPhase(null)
    setCompletedPhases([])
    setPhaseCompletionData(null)
    setAppStage('business_intake')
    setError(null)
    initSession()
  }

  const handleResumeSession = async (targetSessionId) => {
    localStorage.setItem(SESSION_KEY, targetSessionId)
    setMessages([])
    setBlueprint({ entities: [], workflows: [], spec_document: { sections: [] }, ui_prototypes: [] })
    setFlowData({ nodes: [], edges: [] })
    setValidationResult(null)
    setCostEstimate(null)
    setAllPhases([])
    setCurrentPhase(null)
    setCompletedPhases([])
    setPhaseCompletionData(null)
    setError(null)
    setShowHistoryModal(false)
    await initSession()
  }

  const handleIntakeComplete = async (intakeData, templateId) => {
    setAppStage('chat')
    if (templateId) {
      try {
        const res = await fetch(`${API_BASE}/templates/${templateId}/load`)
        if (res.ok) {
          const data = await res.json()
          setBlueprint(data.blueprint)
          setFlowData(data.flow_data)
          setMessages(prev => [...prev, { role: 'assistant', content: data.initial_message }])
        }
      } catch (_) {}
    } else {
      setShowTemplateModal(true)
    }
  }

  const handleSkipIntake = async () => {
    try {
      await fetch(`${API_BASE}/session/${sessionId}/skip-intake`, { method: 'POST' })
    } catch (_) {}
    setAppStage('chat')
    setShowTemplateModal(true)
  }

  const handleValidate = async () => {
    if (!sessionId || isValidating) return
    setIsValidating(true)
    try {
      const res = await fetch(`${API_BASE}/chat/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setValidationResult(await res.json())
    } catch (e) {
      setError(`שגיאה בבדיקת דרישות: ${e.message}`)
    } finally {
      setIsValidating(false)
    }
  }

  const handleEstimate = async () => {
    if (!sessionId || isEstimating) return
    setIsEstimating(true)
    try {
      const res = await fetch(`${API_BASE}/estimate/cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setCostEstimate(await res.json())
    } catch (e) {
      setError(`שגיאה בהערכת עלות: ${e.message}`)
    } finally {
      setIsEstimating(false)
    }
  }

  const _readSSEStream = async (response, msgId) => {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop()
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'text') {
              setMessages(prev => prev.map(m =>
                m.id === msgId ? { ...m, content: m.content + event.chunk } : m
              ))
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m => {
                if (m.id !== msgId) return m
                let warning = ''
                if (event.truncated) warning = '\n\n> **שים לב:** התגובה נחתכה עקב אורך. נסה לבקש פחות מסכים בבת אחת.'
                else if (event.parse_error) warning = '\n\n> **שים לב:** ה-Blueprint לא התעדכן — ה-JSON היה שבור. נסה שנית.'
                return { ...m, content: m.content + warning, streaming: false }
              }))
              if (event.blueprint) {
                setBlueprint(prev => ({
                  ...prev,
                  ...event.blueprint,
                  ui_prototypes: [
                    ...(prev.ui_prototypes || []),
                    ...(event.blueprint.ui_prototypes || []),
                  ].filter((p, i, arr) => i === arr.findIndex(x => x.id === p.id)),
                }))
              }
              if (event.flow_data) setFlowData(event.flow_data)
              if (event.provider) setActiveProvider(event.provider)
            }
          } catch (_) {}
        }
      }
    }
  }

  const handleSend = async (text) => {
    if (!sessionId || isLoading) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsLoading(true)

    const msgId = `stream-${Date.now()}`
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: msgId, streaming: true }])

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      })
      if (!response.ok) throw new Error()
      setIsStreaming(true)
      await _readSSEStream(response, msgId)
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: 'אירעה שגיאה. אנא נסה שנית.', streaming: false } : m
      ))
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }

  const handleUpload = async (file, note) => {
    if (!sessionId || isLoading) return
    const userContent = `📎 ${file.name}${note ? `\n${note}` : ''}`
    setMessages(prev => [...prev, { role: 'user', content: userContent, isFile: true }])
    setIsLoading(true)

    const msgId = `stream-${Date.now()}`
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: msgId, streaming: true }])

    try {
      const formData = new FormData()
      formData.append('session_id', sessionId)
      formData.append('file', file)
      if (note) formData.append('note', note)

      const response = await fetch(`${API_BASE}/session/upload-document`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || 'שגיאה בהעלאת הקובץ')
      }
      setIsStreaming(true)
      await _readSSEStream(response, msgId)
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: err.message || 'אירעה שגיאה. אנא נסה שנית.', streaming: false } : m
      ))
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }

  return (
    <div className="h-screen w-screen flex bg-slate-100 overflow-hidden">
      {error && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-lg text-sm shadow-lg cursor-pointer"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}

      {showTemplateModal && (
        <TemplateModal
          onSelect={loadTemplate}
          onClose={() => setShowTemplateModal(false)}
        />
      )}

      {showSaveModal && (
        <SaveModal
          onSave={handleSave}
          onClose={() => setShowSaveModal(false)}
          isSaving={isSaving}
        />
      )}

      {showHistoryModal && (
        <HistoryModal
          sessionId={sessionId}
          onLoad={handleLoadFromHistory}
          onResume={handleResumeSession}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {appStage === 'business_intake' && sessionId && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <BusinessIntakePanel
            sessionId={sessionId}
            onIntakeComplete={handleIntakeComplete}
            onSkip={handleSkipIntake}
          />
        </div>
      )}

      {appStage !== 'business_intake' && <div className="flex-1 flex flex-col overflow-hidden">
        {appStage === 'phase_selection' ? (
          <PhaseDetectionPanel
            domain={detectedDomain}
            phases={allPhases}
            onSelectPhase={handleSelectPhase}
            loading={phaseLoading}
          />
        ) : appStage === 'phase_complete' ? (
          <PhaseCompletionPanel
            phaseName={phaseCompletionData?.phase_name || ''}
            remainingPhases={phaseCompletionData?.remaining_phases || []}
            onAddPhase={handleAddPhase}
            onFinish={handleFinishAllPhases}
            loading={phaseLoading}
          />
        ) : (
          <>
            {appStage === 'phase_focused' && (
              <PhaseProgressBar
                allPhases={allPhases}
                currentPhase={currentPhase}
                completedPhases={completedPhases}
                onCompletePhase={handleCompletePhase}
              />
            )}
            <BlueprintDashboard
              blueprint={blueprint}
              flowData={flowData}
              isStreaming={isStreaming}
              activeProvider={activeProvider}
              sessionId={sessionId}
              onOpenTemplates={() => setShowTemplateModal(true)}
              onSave={() => setShowSaveModal(true)}
              onOpenHistory={() => setShowHistoryModal(true)}
              onNewConversation={handleNewConversation}
              validationResult={validationResult}
              isValidating={isValidating}
              onValidate={handleValidate}
              costEstimate={costEstimate}
              isEstimating={isEstimating}
              onEstimate={handleEstimate}
            />
          </>
        )}
      </div>}

      {appStage !== 'business_intake' && (
        <div className="w-2/5 flex flex-col overflow-hidden border-r border-slate-200 shadow-lg">
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSend={handleSend}
            onUpload={handleUpload}
            appStage={appStage}
            phaseLoading={phaseLoading}
            onDetectPhases={handleDetectPhases}
          />
        </div>
      )}
    </div>
  )
}
