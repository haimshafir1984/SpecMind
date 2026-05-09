const IMPACT_CONFIG = {
  HIGH:   { label: 'גבוה',   color: 'text-red-600',    badge: 'bg-red-100 text-red-700' },
  MEDIUM: { label: 'בינוני', color: 'text-amber-600',  badge: 'bg-amber-100 text-amber-700' },
  LOW:    { label: 'נמוך',   color: 'text-slate-500',  badge: 'bg-slate-100 text-slate-600' },
}

function ComplexityBar({ score }) {
  const pct   = ((score || 1) / 10) * 100
  const color = score <= 3 ? 'bg-emerald-500' : score <= 6 ? 'bg-amber-500' : 'bg-red-500'
  const label = score <= 3 ? 'פשוט' : score <= 6 ? 'בינוני' : score <= 8 ? 'מורכב' : 'מורכב מאוד'
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>רמת מורכבות</span>
        <span className="font-semibold">{score}/10 — {label}</span>
      </div>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CostBand({ estimate }) {
  const { min, max, currency, notes } = estimate
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n)
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4" dir="rtl">
      <p className="text-xs text-slate-500 mb-1">הערכת עלות</p>
      <p className="text-2xl font-bold text-blue-700">{fmt(min)} – {fmt(max)}</p>
      {notes && <p className="text-xs text-slate-500 mt-1">{notes}</p>}
    </div>
  )
}

function DurationCard({ duration }) {
  if (!duration) return null
  const rows = Object.entries(duration).filter(([k]) => k !== 'total')
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4" dir="rtl">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">לוח זמנים</h4>
      <div className="space-y-1.5">
        {rows.map(([key, val]) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="text-slate-500">{PHASE_LABELS[key] || key}</span>
            <span className="font-medium text-slate-700">{val}</span>
          </div>
        ))}
        {duration.total && (
          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-slate-100 mt-2">
            <span className="text-slate-700">סה"כ</span>
            <span className="text-blue-600">{duration.total}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const PHASE_LABELS = { backend: 'Backend', frontend: 'Frontend', testing: 'בדיקות', infrastructure: 'תשתית' }

function TeamCard({ teamSize, breakdown }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4" dir="rtl">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">צוות נדרש</h4>
      <p className="text-lg font-bold text-slate-700 mb-2">{teamSize}</p>
      {breakdown && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(breakdown).map(([role, count]) => (
            <span key={role} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {role}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function RiskCard({ risk }) {
  const cfg = IMPACT_CONFIG[risk.impact] || IMPACT_CONFIG.LOW
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
        {risk.additional_cost > 0 && (
          <span className="text-xs text-slate-400 mr-auto">+${risk.additional_cost.toLocaleString()}</span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-700">{risk.risk}</p>
      <p className="text-xs text-slate-500 mt-0.5">{risk.mitigation}</p>
    </div>
  )
}

export default function CostEstimatorPanel({ result, isLoading, onEstimate, hasBlueprint }) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">מחשב עלויות ולוח זמנים...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-xs" dir="rtl">
          <div className="text-4xl mb-4">💰</div>
          <h3 className="text-base font-semibold text-slate-700 mb-2">הערכת עלות</h3>
          <p className="text-sm text-slate-500 mb-4">
            קבל הערכת עלות, לוח זמנים וגורמי סיכון לפרויקט שלך.
          </p>
          <button
            onClick={onEstimate}
            disabled={!hasBlueprint}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors"
          >
            חשב הערכה
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Re-run button */}
      <div className="flex justify-end">
        <button
          onClick={onEstimate}
          className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-2.5 py-1 rounded-lg hover:bg-violet-50 transition-colors"
        >
          חשב מחדש
        </button>
      </div>

      {/* Complexity */}
      <div className="bg-white border border-slate-200 rounded-xl p-4" dir="rtl">
        <ComplexityBar score={result.complexity_score} />
      </div>

      {/* Cost band */}
      {result.cost_estimate && <CostBand estimate={result.cost_estimate} />}

      {/* Duration + Team side by side */}
      <div className="grid grid-cols-2 gap-3">
        <DurationCard duration={result.estimated_duration} />
        <TeamCard teamSize={result.team_size} breakdown={result.team_breakdown} />
      </div>

      {/* Cost breakdown */}
      {result.breakdown && (
        <div className="bg-white border border-slate-200 rounded-xl p-4" dir="rtl">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">פירוט עלויות</h4>
          <div className="space-y-2">
            {Object.entries(result.breakdown).map(([key, pct]) => (
              <div key={key}>
                <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                  <span>{key}</span><span>{pct}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full" style={{ width: pct }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks */}
      {result.risk_factors?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2" dir="rtl">גורמי סיכון</h4>
          <div className="space-y-2">
            {result.risk_factors.map((r, i) => <RiskCard key={i} risk={r} />)}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations?.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3" dir="rtl">
          <h4 className="text-xs font-semibold text-violet-700 mb-2">המלצות</h4>
          <ul className="space-y-1">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-violet-800 flex gap-2">
                <span>→</span><span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
