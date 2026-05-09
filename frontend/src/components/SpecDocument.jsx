import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const mdComponents = {
  strong:     ({ children }) => <strong className="text-slate-900 font-semibold">{children}</strong>,
  h3:         ({ children }) => <h3 className="text-sm font-semibold text-blue-700 mt-4 mb-1.5">{children}</h3>,
  ul:         ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
  li:         ({ children }) => <li className="text-slate-600 leading-relaxed text-sm">{children}</li>,
  p:          ({ children }) => <p className="text-slate-600 leading-relaxed text-sm mb-2 last:mb-0">{children}</p>,
  hr:         ()             => <hr className="border-slate-200 my-3" />,
  code:       ({ children }) => <code className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-xs font-mono text-blue-700">{children}</code>,
  blockquote: ({ children }) => <blockquote className="border-r-4 border-blue-300 pr-3 my-2 text-slate-500 italic bg-blue-50 py-2 rounded-r">{children}</blockquote>,
}

function SectionCard({ section, index }) {
  return (
    <div className="schema-item">
      <div className="flex items-baseline gap-3 mb-3 justify-end">
        <h2 className="text-base font-bold text-slate-800">{section.title}</h2>
        <span className="text-slate-300 font-mono text-sm">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="border-r-2 border-slate-200 pr-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {section.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default function SpecDocument({ specDocument }) {
  const sections = specDocument?.sections || []

  if (sections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-sm font-medium">מסמך האיפיון יבנה כאן</p>
          <p className="text-xs mt-1">מתעדכן אוטומטית תוך כדי השיחה</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Document header */}
      <div className="px-8 pt-6 pb-5 border-b border-slate-200 text-right bg-white">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">מסמך איפיון פונקציונלי</h1>
        <p className="text-xs text-slate-400 mt-1">נוצר אוטומטית · מתעדכן בזמן אמת</p>
      </div>

      {/* Table of contents */}
      {sections.length > 1 && (
        <div className="mx-8 mt-5 mb-1 bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 mb-3 text-right uppercase tracking-wider">תוכן עניינים</p>
          <ol className="space-y-1.5 text-right">
            {sections.map((s, i) => (
              <li key={s.id} className="flex items-center justify-end gap-3">
                <span className="text-sm text-slate-600">{s.title}</span>
                <span className="text-slate-300 font-mono text-xs w-6 text-left">{String(i + 1).padStart(2, '0')}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Sections */}
      <div className="px-8 py-5 space-y-8 divide-y divide-slate-100">
        {sections.map((section, i) => (
          <div key={section.id} className={i > 0 ? 'pt-7' : ''}>
            <SectionCard section={section} index={i} />
          </div>
        ))}
      </div>
    </div>
  )
}
