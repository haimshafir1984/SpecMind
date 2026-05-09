const SEVERITY_CONFIG = {
  CRITICAL: { label: 'קריטי',   bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700' },
  HIGH:     { label: 'גבוה',    bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  MEDIUM:   { label: 'בינוני',  bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700' },
  LOW:      { label: 'נמוך',    bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
}

const CATEGORY_LABELS = {
  missing_nonfunctional: 'דרישות לא-פונקציונליות',
  contradiction:         'סתירה',
  unused_entity:         'ישות לא בשימוש',
  edge_case:             'מקרה קצה',
  integration:           'אינטגרציה חסרה',
  compliance:            'תאימות',
}

function ScoreRing({ score }) {
  const pct   = Math.round((score || 0) * 100)
  const color = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="flex flex-col items-center">
      <span className={`text-4xl font-bold ${color}`}>{pct}%</span>
      <span className="text-xs text-slate-400 mt-0.5">כיסוי דרישות</span>
    </div>
  )
}

function IssueCard({ issue }) {
  const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.LOW
  return (
    <div className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border}`} dir="rtl">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
        <span className="text-xs text-slate-500">{CATEGORY_LABELS[issue.category] || issue.category}</span>
        {issue.affected_items?.length > 0 && (
          <span className="text-xs text-slate-400 mr-auto">{issue.affected_items.join(', ')}</span>
        )}
      </div>
      <p className={`text-sm font-medium ${cfg.text} mb-1`}>{issue.issue}</p>
      <p className="text-xs text-slate-600">{issue.suggestion}</p>
    </div>
  )
}

export default function RequirementsPanel({ result, isLoading, onValidate, hasBlueprint }) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">מנתח את הדרישות...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-xs" dir="rtl">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-base font-semibold text-slate-700 mb-2">בדיקת דרישות</h3>
          <p className="text-sm text-slate-500 mb-4">
            בדוק פערים, סתירות ודרישות חסרות ב-Blueprint שלך.
          </p>
          <button
            onClick={onValidate}
            disabled={!hasBlueprint}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            הפעל בדיקה
          </button>
        </div>
      </div>
    )
  }

  const criticals = result.issues?.filter(i => i.severity === 'CRITICAL') || []
  const highs     = result.issues?.filter(i => i.severity === 'HIGH')     || []
  const others    = result.issues?.filter(i => i.severity !== 'CRITICAL' && i.severity !== 'HIGH') || []

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4" dir="rtl">
      {/* Summary row */}
      <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200">
        <ScoreRing score={result.coverage_score} />
        <div className="flex-1">
          <p className="text-sm text-slate-700 leading-relaxed">{result.summary}</p>
          <div className="flex gap-3 mt-2">
            <Pill count={criticals.length} label="קריטי"  color="bg-red-100 text-red-700" />
            <Pill count={highs.length}     label="גבוה"   color="bg-orange-100 text-orange-700" />
            <Pill count={others.length}    label="אחר"    color="bg-slate-100 text-slate-600" />
          </div>
        </div>
        <button
          onClick={onValidate}
          className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
        >
          הרץ שוב
        </button>
      </div>

      {/* Quick fixes */}
      {result.quick_fixes?.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <h4 className="text-xs font-semibold text-emerald-700 mb-2">תיקונים מהירים</h4>
          <ul className="space-y-1">
            {result.quick_fixes.map((fix, i) => (
              <li key={i} className="text-xs text-emerald-800 flex gap-2">
                <span>✓</span><span>{fix}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issues */}
      {result.issues?.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">ממצאים ({result.issues.length})</h4>
          {[...criticals, ...highs, ...others].map((issue, i) => (
            <IssueCard key={i} issue={issue} />
          ))}
        </div>
      )}

      {result.issues?.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">לא נמצאו בעיות — Blueprint נראה תקין!</div>
      )}
    </div>
  )
}

function Pill({ count, label, color }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {count} {label}
    </span>
  )
}
