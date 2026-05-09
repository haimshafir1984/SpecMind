import { useState } from 'react'

function buildPreviewHTML(code) {
  // Escape </script> inside the code to avoid breaking the HTML
  const safeCode = code.replace(/<\/script>/gi, '<\\/script>')
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"><\/script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; }
  #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #94a3b8; font-size: 13px; }
</style>
</head>
<body>
<div id="loading">טוען תצוגה מקדימה...</div>
<div id="root"></div>
<script type="text/babel">
try {
  ${safeCode}
  document.getElementById('loading').style.display = 'none';
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(Screen));
} catch(e) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('root').innerHTML =
    '<div style="color:#dc2626;padding:20px;font-size:13px;font-family:monospace;white-space:pre-wrap;direction:rtl">' +
    '<strong>שגיאה בהרצת הקומפוננטה:</strong>\\n' + e.message + '</div>';
}
<\/script>
</body>
</html>`
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
      style={copied
        ? { background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0' }
        : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }
      }
    >
      {copied ? (
        <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> הועתק!</>
      ) : (
        <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> העתק קוד</>
      )}
    </button>
  )
}

function PrototypeCard({ proto }) {
  const [showCode, setShowCode] = useState(false)
  const htmlContent = buildPreviewHTML(proto.code)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden schema-item">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CopyButton text={proto.code} />
          <button
            onClick={() => setShowCode(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            {showCode ? 'הסתר קוד' : 'הצג קוד'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{proto.screen_name}</h3>
          <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs">🖥</span>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="border-b border-slate-100" style={{ height: 420 }}>
        <iframe
          srcDoc={htmlContent}
          sandbox="allow-scripts"
          className="w-full h-full"
          title={proto.screen_name}
        />
      </div>

      {/* Code panel (collapsible) */}
      {showCode && (
        <div className="border-t border-slate-100 bg-slate-950 overflow-auto" style={{ maxHeight: 320 }}>
          <pre className="p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-words text-left" dir="ltr">
            {proto.code}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function PrototypeViewer({ prototypes }) {
  if (!prototypes || prototypes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3">🖥️</div>
          <p className="text-sm font-medium">אב-הטיפוס יופיע כאן</p>
          <p className="text-xs mt-1">SpecMind יצור ממשקים עבור המסכים שתתאר</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <p className="text-xs text-slate-400 text-right">
        {prototypes.length} מסך{prototypes.length !== 1 ? 'ים' : ''} · נוצרו אוטומטית על ידי SpecMind
      </p>
      {prototypes.map(proto => (
        <PrototypeCard key={proto.id} proto={proto} />
      ))}
    </div>
  )
}
