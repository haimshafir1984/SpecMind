import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'

const TEMPLATE_INFO = {
  ecommerce: { name: 'פלטפורמת E-Commerce', emoji: '🛍️', description: 'מכירת מוצרים עם עגלה ותשלום' },
  saas:      { name: 'פלטפורמת SaaS',       emoji: '☁️', description: 'פלטפורמת מנויים עם משתמשים וחשבונות' },
  healthcare:{ name: 'ניהול מטופלים',        emoji: '⚕️', description: 'קליניקה: תורים, תיעוד, מטופלים' },
  hrm:       { name: 'ניהול משאבי אנוש',     emoji: '👥', description: 'גיוס, עובדים, שכר, ביצוע' },
  logistics: { name: 'ניהול לוגיסטיקה',      emoji: '📦', description: 'משלוחים, מלאי, ספקים' },
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`} dir="rtl">
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-blue-600 text-white rounded-tl-sm'
          : 'bg-white border border-slate-200 text-slate-800 rounded-tr-sm shadow-sm'
      }`}>
        {msg.content}
        {msg.streaming && <span className="inline-block w-0.5 h-4 bg-blue-400 animate-pulse ml-1 align-middle" />}
      </div>
    </div>
  )
}

function IntakeSummary({ data, onSelect, onStartFresh }) {
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const valid = (data.recommended_templates || []).filter(id => TEMPLATE_INFO[id])
    if (valid.length > 0) setSelected(valid[0])
  }, [data])

  const recommended = (data.recommended_templates || []).filter(id => TEMPLATE_INFO[id])
  const others = Object.keys(TEMPLATE_INFO).filter(id => !recommended.includes(id))

  return (
    <div className="flex-1 overflow-y-auto p-6" dir="rtl">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Summary card */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-lg">✓</div>
            <div>
              <h3 className="font-bold text-emerald-900">הבנתי את הצורך שלך!</h3>
              <p className="text-xs text-emerald-700">{data.domain}{data.industry ? ` · ${data.industry}` : ''}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {data.pain_points?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-600 mb-1">בעיות שזיהיתי</p>
                <ul className="space-y-0.5">{data.pain_points.map((p, i) => <li key={i} className="text-red-700">• {p}</li>)}</ul>
              </div>
            )}
            {data.goals?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-600 mb-1">יעדים</p>
                <ul className="space-y-0.5">{data.goals.map((g, i) => <li key={i} className="text-emerald-700">✓ {g}</li>)}</ul>
              </div>
            )}
          </div>
        </div>

        {/* Template selection */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">בחר תבנית התחלתית</p>
          {recommended.length > 0 && (
            <p className="text-xs text-blue-600 mb-2">⚡ מומלץ עבורך</p>
          )}
          <div className="space-y-2">
            {[...recommended, ...others].map(id => {
              const t = TEMPLATE_INFO[id]
              const isRecommended = recommended.includes(id)
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all ${
                    selected === id
                      ? 'border-blue-500 bg-blue-50'
                      : isRecommended
                        ? 'border-blue-200 bg-blue-50/40 hover:border-blue-300'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.description}</p>
                  </div>
                  {selected === id && <span className="text-blue-500 text-lg">✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3 pb-4">
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selected}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            המשך עם {selected ? TEMPLATE_INFO[selected]?.name : '...'}
          </button>
          <button
            onClick={onStartFresh}
            className="px-4 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            בלי תבנית
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BusinessIntakePanel({ sessionId, onIntakeComplete, onSkip }) {
  const [messages, setMessages] = useState([{
    id: 'greeting', role: 'assistant',
    content: 'שלום! 👋\n\nאני כאן לעזור לך לתכנן את המערכת החדשה שלך.\n\nבואו נדבר בשפה פשוטה — ספר לי בקצרה מה אתה עושה ומה המערכת אמורה לפתור?',
  }])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [intakeData, setIntakeData] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')

    const msgId = `stream-${Date.now()}`
    setMessages(prev => [
      ...prev,
      { id: Date.now(), role: 'user', content: text },
      { id: msgId, role: 'assistant', content: '', streaming: true },
    ])
    setIsLoading(true)

    try {
      const res = await fetch(`${API_BASE}/session/business-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'text') {
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: m.content + event.chunk } : m))
              } else if (event.type === 'intake_complete') {
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, streaming: false } : m))
                setIntakeData(event.business_intake)
              }
            } catch (_) {}
          }
        }
      }
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, streaming: false } : m))
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: 'שגיאה — נסה שנית.', streaming: false } : m))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  if (intakeData) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="px-5 py-4 border-b border-slate-200 bg-white">
          <h2 className="text-sm font-semibold text-slate-800 text-right">SpecMind — סיכום הצרכים</h2>
        </div>
        <IntakeSummary
          data={intakeData}
          onSelect={(templateId) => onIntakeComplete(intakeData, templateId)}
          onStartFresh={() => onIntakeComplete(intakeData, null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <button onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          דלג על שלב זה
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <h2 className="text-sm font-semibold text-slate-800">SpecMind — יועץ עסקי</h2>
            <p className="text-xs text-slate-400">5 שאלות קצרות לפני שנתחיל</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">B</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
        {messages.map(msg => <Message key={msg.id} msg={msg} />)}
        {isLoading && !messages.at(-1)?.streaming && (
          <div className="flex justify-end" dir="rtl">
            <div className="flex items-center gap-1.5 px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); handleSend() }} className="px-4 py-4 border-t border-slate-200 flex items-end gap-2 bg-white">
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="shrink-0 h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 text-white flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="תשובתך..."
          rows={2}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:border-blue-400 focus:bg-white transition-colors text-right"
        />
      </form>
    </div>
  )
}
