import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function RecentRow({ project, onResume, loading }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl" dir="rtl">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{project.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {project.entity_count} ישויות · {project.workflow_count} תהליכים · {formatDate(project.updated_at)}
        </p>
      </div>
      <button
        onClick={() => onResume(project.session_id)}
        disabled={loading}
        className="shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
      >
        {loading ? '...' : 'פתח'}
      </button>
    </div>
  )
}

function BlueprintRow({ bp, onLoad, loading }) {
  const entityCount   = Array.isArray(bp.entities)  ? bp.entities.length  : (bp.entities  || 0)
  const workflowCount = Array.isArray(bp.workflows) ? bp.workflows.length : (bp.workflows || 0)
  return (
    <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:border-slate-300 transition-all" dir="rtl">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{bp.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {entityCount} ישויות · {workflowCount} תהליכים · {formatDate(bp.created_at)}
        </p>
      </div>
      <button
        onClick={() => onLoad(bp.id)}
        disabled={loading}
        className="shrink-0 px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors"
      >
        {loading ? '...' : 'טען'}
      </button>
    </div>
  )
}

export default function HistoryModal({ sessionId, onLoad, onResume, onClose }) {
  const [recent, setRecent]       = useState([])
  const [blueprints, setBlueprints] = useState([])
  const [fetching, setFetching]   = useState(true)
  const [loadingId, setLoadingId] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/projects/recent`).then(r => r.json()).catch(() => ({ projects: [] })),
      fetch(`${API_BASE}/blueprints`).then(r => r.json()).catch(() => ({ blueprints: [] })),
    ]).then(([r, b]) => {
      setRecent(r.projects || [])
      setBlueprints(b.blueprints || [])
    }).finally(() => setFetching(false))
  }, [])

  const handleResume = async (sid) => {
    setLoadingId(sid)
    await onResume(sid)
    setLoadingId(null)
  }

  const handleLoad = async (id) => {
    setLoadingId(id)
    await onLoad(id)
    setLoadingId(null)
  }

  const isEmpty = !fetching && recent.length === 0 && blueprints.length === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">

        <div className="px-6 py-5 border-b border-slate-200 text-right">
          <h2 className="text-base font-bold text-slate-800">פרויקטים</h2>
          <p className="text-xs text-slate-500 mt-0.5">פתח פרויקט קודם או טען Blueprint שמור</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {fetching && (
            <div className="text-center text-slate-400 py-10 text-sm">טוען...</div>
          )}

          {isEmpty && (
            <div className="text-center text-slate-400 py-10 text-sm" dir="rtl">
              אין פרויקטים שמורים עדיין.
            </div>
          )}

          {recent.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 text-right">
                3 פרויקטים אחרונים
              </p>
              <div className="space-y-2">
                {recent.map(p => (
                  <RecentRow
                    key={p.session_id}
                    project={p}
                    onResume={handleResume}
                    loading={loadingId === p.session_id}
                  />
                ))}
              </div>
            </div>
          )}

          {blueprints.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 text-right">
                שמורים ידנית
              </p>
              <div className="space-y-2">
                {blueprints.map(bp => (
                  <BlueprintRow
                    key={bp.id}
                    bp={bp}
                    onLoad={handleLoad}
                    loading={loadingId === bp.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 text-center">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
