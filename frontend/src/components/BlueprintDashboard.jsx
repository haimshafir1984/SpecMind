import { useState } from 'react'
import FlowCanvas from './FlowCanvas'
import SchemaTree from './SchemaTree'
import SpecDocument from './SpecDocument'
import PrototypeViewer from './PrototypeViewer'
import RequirementsPanel from './RequirementsPanel'
import CostEstimatorPanel from './CostEstimatorPanel'

const TABS = [
  { id: 'flow',     label: 'זרימה ויזואלית' },
  { id: 'schema',   label: 'סכמה טכנית' },
  { id: 'doc',      label: 'מסמך איפיון' },
  { id: 'proto',    label: 'אב-טיפוס UI' },
  { id: 'validate', label: 'בדיקת דרישות' },
  { id: 'estimate', label: 'הערכת עלות' },
]

export default function BlueprintDashboard({
  blueprint, flowData, isStreaming, activeProvider,
  sessionId, onOpenTemplates, onSave, onOpenHistory, onNewConversation,
  validationResult, isValidating, onValidate,
  costEstimate, isEstimating, onEstimate,
}) {
  const [activeTab, setActiveTab] = useState('flow')
  const [exporting, setExporting] = useState(null)

  const entityCount   = blueprint?.entities?.length || 0
  const workflowCount = blueprint?.workflows?.length || 0
  const nodeCount     = flowData?.nodes?.length || 0
  const protoCount    = blueprint?.ui_prototypes?.length || 0

  const handleExport = async (type) => {
    if (!sessionId || exporting) return
    setExporting(type)
    try {
      const res = await fetch(`http://localhost:8001/export/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `specmind.${type === 'word' ? 'docx' : 'pdf'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`שגיאה בייצוא: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-3">

          {/* Left: stats + badges */}
          <div className="flex items-center gap-4 flex-wrap">
            <Stat value={entityCount}   label="ישויות"  color="text-blue-600" />
            <Divider />
            <Stat value={workflowCount} label="תהליכים" color="text-emerald-600" />
            <Divider />
            <Stat value={nodeCount}     label="צמתים"   color="text-violet-600" />
            <Divider />
            <Stat value={protoCount}    label="מסכים"   color="text-amber-600" />

            {activeProvider && !isStreaming && (
              <>
                <Divider />
                <ProviderBadge />
              </>
            )}
            {isStreaming && (
              <>
                <Divider />
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs text-emerald-600 font-semibold">LIVE</span>
                </div>
              </>
            )}
          </div>

          {/* Right: title + actions */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="text-right">
              <h2 className="text-sm font-semibold text-slate-800">SpecMind — לוח בקרה</h2>
              <p className="text-xs text-slate-400">מפרט פונקציונלי חי</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onNewConversation}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              >
                + חדש
              </button>
              <ExportButton label="Word" icon="📄" loading={exporting === 'word'} onClick={() => handleExport('word')} />
              <ExportButton label="PDF"  icon="📕" loading={exporting === 'pdf'}  onClick={() => handleExport('pdf')} />
              <button
                onClick={onSave}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              >
                שמור
              </button>
              <button
                onClick={onOpenHistory}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              >
                היסטוריה
              </button>
              <button
                onClick={onOpenTemplates}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              >
                תבניות
              </button>
            </div>
          </div>
        </div>

        {/* Tabs — two rows of 3 */}
        <div className="bg-slate-100 rounded-lg p-1 space-y-1">
          {[TABS.slice(0, 4), TABS.slice(4)].map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
        {activeTab === 'flow'     && <FlowCanvas flowData={flowData} />}
        {activeTab === 'schema'   && <SchemaTree blueprint={blueprint} />}
        {activeTab === 'doc'      && <SpecDocument specDocument={blueprint?.spec_document} />}
        {activeTab === 'proto'    && <PrototypeViewer prototypes={blueprint?.ui_prototypes} />}
        {activeTab === 'validate' && (
          <RequirementsPanel
            result={validationResult}
            isLoading={isValidating}
            onValidate={onValidate}
            hasBlueprint={(blueprint?.entities?.length || 0) > 0}
          />
        )}
        {activeTab === 'estimate' && (
          <CostEstimatorPanel
            result={costEstimate}
            isLoading={isEstimating}
            onEstimate={onEstimate}
            hasBlueprint={(blueprint?.entities?.length || 0) > 0}
          />
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, color }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-7 bg-slate-200" />
}

function ProviderBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
      <span className="text-xs">✦</span>
      Gemini 2.5 Flash
    </div>
  )
}

function ExportButton({ label, icon, loading, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
    >
      <span>{icon}</span>
      {loading ? '...' : label}
    </button>
  )
}
