export default function PhaseDetectionPanel({ domain, phases, onSelectPhase, loading }) {
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-1">בחר Phase להתחיל</h2>
          <p className="text-sm text-slate-500">
            זיהיתי את הדומיין: <span className="font-semibold text-blue-600">{domain}</span>.
            בחר Phase ראשון — תוכל להוסיף פאזים נוספים אחרי שתסיים כל אחד.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {phases.map((phase, i) => (
            <button
              key={phase.id}
              onClick={() => onSelectPhase(phase.id)}
              disabled={loading}
              className="flex items-start gap-4 p-4 bg-white border-2 border-slate-200 rounded-xl text-right hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 group"
            >
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-100 group-hover:text-blue-600">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">{phase.name}</span>
                  <span className="text-xs text-slate-400 shrink-0">~{phase.estimated_entities} ישויות</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{phase.description}</p>
              </div>
              <span className="text-blue-400 text-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">←</span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-xs text-center text-slate-400">
          כל Phase ייענה על שאלות ממוקדות בלבד — ללא הצפת מידע
        </p>
      </div>
    </div>
  )
}
