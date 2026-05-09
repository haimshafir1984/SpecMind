import { useState } from 'react'

const TYPE_COLORS = {
  string:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  number:  'bg-blue-50 text-blue-700 border-blue-200',
  boolean: 'bg-violet-50 text-violet-700 border-violet-200',
  date:    'bg-amber-50 text-amber-700 border-amber-200',
  enum:    'bg-rose-50 text-rose-700 border-rose-200',
}

function EntityCard({ entity }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm schema-item">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">{open ? '▼' : '▶'}</span>
          <span className="text-xs text-slate-400 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
            {entity.fields?.length || 0} שדות
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{entity.name}</span>
          <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs">📋</span>
        </div>
      </button>

      {open && entity.fields?.length > 0 && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {entity.fields.map((field, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <span className={`text-xs px-2 py-0.5 rounded border font-mono shrink-0 ${TYPE_COLORS[field.type] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                {field.type}
              </span>
              <div className="text-right min-w-0">
                <div className="flex items-center justify-end gap-1">
                  {field.required && <span className="text-rose-500 text-xs font-medium">*</span>}
                  <span className="text-sm text-slate-700 font-medium">{field.name}</span>
                </div>
                {field.description && <p className="text-xs text-slate-400 mt-0.5">{field.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ workflow }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm schema-item">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-right hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">{open ? '▼' : '▶'}</span>
          <span className="text-xs text-slate-400 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
            {workflow.steps?.length || 0} שלבים
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{workflow.name}</span>
          <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-xs">⚡</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {workflow.steps?.map((step, i) => (
            <div key={i} className="flex items-start gap-3 text-right">
              <span className="text-emerald-500 font-mono text-xs mt-0.5 shrink-0 w-4 text-left">{i + 1}</span>
              <span className="text-sm text-slate-600 leading-snug">{step}</span>
            </div>
          ))}
          {workflow.constraints?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
              {workflow.constraints.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-right bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="text-amber-500 text-xs shrink-0">⚠</span>
                  <span className="text-xs text-amber-700 leading-snug">{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SchemaTree({ blueprint }) {
  const hasContent = blueprint && (blueprint.entities?.length > 0 || blueprint.workflows?.length > 0)

  if (!hasContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm font-medium">הסכמה הטכנית תופיע כאן</p>
          <p className="text-xs mt-1 text-slate-400">התחל שיחה כדי לבנות את המפרט</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {blueprint.entities?.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 text-right">
            ישויות ({blueprint.entities.length})
          </h3>
          <div className="space-y-2">
            {blueprint.entities.map(e => <EntityCard key={e.id} entity={e} />)}
          </div>
        </section>
      )}
      {blueprint.workflows?.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 text-right">
            תהליכים ({blueprint.workflows.length})
          </h3>
          <div className="space-y-2">
            {blueprint.workflows.map(w => <WorkflowCard key={w.id} workflow={w} />)}
          </div>
        </section>
      )}
    </div>
  )
}
