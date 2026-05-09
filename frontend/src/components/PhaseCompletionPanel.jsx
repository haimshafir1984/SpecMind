import { useState } from 'react'

export default function PhaseCompletionPanel({ phaseName, remainingPhases, onAddPhase, onFinish, loading }) {
  const [selected, setSelected] = useState(null)

  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-8 bg-slate-50" dir="rtl">
      <div className="w-full max-w-lg">
        {/* Completion badge */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800">סיימנו את {phaseName}!</h2>
          <p className="text-sm text-slate-500 mt-1">ה-Blueprint ל-Phase זה נשמר</p>
        </div>

        {remainingPhases.length > 0 ? (
          <>
            <p className="text-sm font-semibold text-slate-700 mb-3">רוצה להוסיף Phase נוסף?</p>
            <div className="space-y-2 mb-5">
              {remainingPhases.map(phase => (
                <button
                  key={phase.id}
                  onClick={() => setSelected(phase.id)}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-right transition-all ${
                    selected === phase.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                    selected === phase.id ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                  }`}>
                    {selected === phase.id && <span className="text-white text-xs">●</span>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{phase.name}</p>
                    <p className="text-xs text-slate-500">{phase.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => selected && onAddPhase(selected)}
                disabled={!selected || loading}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {loading ? 'טוען...' : `התחל ${selected ? remainingPhases.find(p => p.id === selected)?.name : 'Phase'}`}
              </button>
              <button
                onClick={onFinish}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
              >
                סיים וייצא
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={onFinish}
            className="w-full py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            סיים וייצא את כל ה-Blueprint
          </button>
        )}
      </div>
    </div>
  )
}
