import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'

const DOMAIN_COLORS = {
  Retail:     'bg-emerald-100 text-emerald-700',
  FinTech:    'bg-blue-100 text-blue-700',
  Healthcare: 'bg-red-100 text-red-700',
  HR:         'bg-violet-100 text-violet-700',
  Logistics:  'bg-amber-100 text-amber-700',
}

function TemplateCard({ template, onSelect, loading }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all text-right flex flex-col">
      <div className="flex items-start justify-between mb-2 gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DOMAIN_COLORS[template.domain] || 'bg-slate-100 text-slate-600'}`}>
          {template.domain}
        </span>
        <h3 className="font-semibold text-slate-800 text-sm leading-snug">{template.name}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3 leading-relaxed flex-1">{template.description}</p>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
        <span>{template.workflow_count} תהליכים</span>
        <span>{template.entity_count} ישויות</span>
      </div>
      <button
        onClick={() => onSelect(template.id)}
        disabled={loading}
        className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40"
      >
        {loading ? 'טוען...' : 'טען תבנית'}
      </button>
    </div>
  )
}

export default function TemplateModal({ onSelect, onClose }) {
  const [templates, setTemplates] = useState([])
  const [fetching, setFetching] = useState(true)
  const [selecting, setSelecting] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/templates`)
      .then(r => r.json())
      .then(data => setTemplates(data.templates || []))
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [])

  const handleSelect = async (templateId) => {
    setSelecting(templateId)
    await onSelect(templateId)
    setSelecting(null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 text-right">
          <h2 className="text-lg font-bold text-slate-800">בחר תבנית התחלתית</h2>
          <p className="text-xs text-slate-500 mt-1">תבנית טוענת ישויות ותהליכים בסיסיים — ניתן להמשיך עם SpecMind ולהתאים אישית</p>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {fetching ? (
            <div className="text-center text-slate-400 py-16 text-sm">טוען תבניות...</div>
          ) : templates.length === 0 ? (
            <div className="text-center text-slate-400 py-16 text-sm">לא נמצאו תבניות</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onSelect={handleSelect}
                  loading={selecting === t.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-center">
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            התחל בלי תבנית
          </button>
        </div>
      </div>
    </div>
  )
}
