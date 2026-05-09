export default function PhaseProgressBar({ allPhases, currentPhase, completedPhases, onCompletePhase }) {
  const done = completedPhases.length
  const total = allPhases.length

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-4" dir="rtl">
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
        {allPhases.map((phase, i) => {
          const isCompleted = completedPhases.includes(phase.id)
          const isActive = phase.id === currentPhase
          return (
            <div key={phase.id} className="flex items-center gap-1.5 shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                isCompleted ? 'bg-emerald-100 text-emerald-700' :
                isActive    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' :
                              'bg-slate-100 text-slate-400'
              }`}>
                {isCompleted ? '✓' : isActive ? '▶' : String(i + 1)}
                <span>{phase.name}</span>
              </div>
              {i < allPhases.length - 1 && (
                <span className="text-slate-300 text-xs">—</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-slate-400">{done}/{total}</span>
        <button
          onClick={onCompletePhase}
          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
        >
          סיימתי Phase זה ✓
        </button>
      </div>
    </div>
  )
}
