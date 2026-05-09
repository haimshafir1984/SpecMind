import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const mdComponents = {
  strong: ({ children }) => <strong className="text-slate-900 font-semibold">{children}</strong>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-slate-800 mt-3 mb-1 pb-1 border-b border-slate-200">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-blue-700 mt-2 mb-1">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
  li: ({ children }) => <li className="text-slate-700 leading-relaxed text-sm">{children}</li>,
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-sm text-slate-700">{children}</p>,
  hr: () => <hr className="border-slate-200 my-3" />,
  code: ({ children }) => (
    <code className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-xs font-mono text-blue-700">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-r-2 border-blue-400 pr-3 my-2 text-slate-500 italic">
      {children}
    </blockquote>
  ),
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3 bg-white rounded-xl border border-slate-200 mr-auto w-fit shadow-sm">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="ml-auto max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-right leading-relaxed shadow-sm whitespace-pre-line">
        {msg.isFile ? (
          <span className="flex items-center gap-1.5 justify-end flex-wrap">
            <span className="opacity-80">📎</span>
            <span className="font-medium underline underline-offset-2">{msg.content.split('\n')[0].replace('📎 ', '')}</span>
            {msg.content.includes('\n') && (
              <span className="w-full text-right opacity-90 mt-1">{msg.content.split('\n').slice(1).join('\n').trim()}</span>
            )}
          </span>
        ) : (
          msg.content
        )}
      </div>
    )
  }

  return (
    <div className="mr-auto max-w-[92%] bg-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-right border border-slate-200 shadow-sm">
      {msg.content ? (
        <>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {msg.content}
          </ReactMarkdown>
          {msg.streaming && (
            <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
          )}
        </>
      ) : (
        <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse align-middle" />
      )}
    </div>
  )
}

export default function ChatPanel({ messages, isLoading, onSend, onUpload, appStage, phaseLoading, onDetectPhases }) {
  const [input, setInput] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
    e.target.value = ''
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLoading) return
    const text = input.trim()
    if (selectedFile) {
      setInput('')
      setSelectedFile(null)
      onUpload(selectedFile, text || undefined)
    } else {
      if (!text) return
      setInput('')
      onSend(text)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) }
  }

  const handleDetect = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content
    if (lastUserMsg) onDetectPhases(lastUserMsg)
  }

  const lastIsStreaming = messages.at(-1)?.streaming
  const showTyping = isLoading && !lastIsStreaming && messages.at(-1)?.role !== 'assistant'
  const canDetect = appStage === 'chat' && messages.some(m => m.role === 'user') && !isLoading
  const canSend = !isLoading && (!!selectedFile || !!input.trim())

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
        {canDetect && (
          <button
            onClick={handleDetect}
            disabled={phaseLoading}
            className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {phaseLoading ? '...' : '⚡ זהה Phases'}
          </button>
        )}
        <div className="flex items-center gap-3 mr-auto">
          <div className="text-right">
            <h2 className="text-sm font-semibold text-slate-800">SpecMind — אנליסט פונקציונלי</h2>
            <p className="text-xs text-slate-400">מנוע ניתוח דרישות חכם</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
            S
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
        {messages.map((msg, i) => <Message key={msg.id || i} msg={msg} />)}
        {showTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-4 pt-3 pb-4 border-t border-slate-200 bg-white">
        {/* File badge */}
        {selectedFile && (
          <div className="mb-2 flex justify-end">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-blue-700 font-medium truncate max-w-[200px]">📎 {selectedFile.name}</span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-blue-400 hover:text-blue-700 text-base leading-none"
                aria-label="הסר קובץ"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Send button */}
          <button
            type="submit"
            disabled={!canSend}
            className="shrink-0 h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition-colors shadow-sm"
          >
            <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>

          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="העלה מסמך PDF או Word"
            className="shrink-0 h-10 w-10 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedFile ? 'הוסף הערה לקובץ (אופציונלי)...' : 'הקלד את תשובתך כאן...'}
            rows={2}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:border-blue-400 focus:bg-white transition-colors text-right"
          />
        </div>
      </form>
    </div>
  )
}
