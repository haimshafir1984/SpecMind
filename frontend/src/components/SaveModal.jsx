import { useState } from 'react'

export default function SaveModal({ onSave, onClose, isSaving }) {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (name.trim()) onSave(name.trim())
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" dir="rtl">
        <h2 className="text-base font-bold text-slate-800 mb-1">שמור Blueprint</h2>
        <p className="text-xs text-slate-500 mb-4">בחר שם כדי לשמור את המפרט הנוכחי להיסטוריה</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="לדוגמה: מערכת ניהול לקוחות v1"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-right"
          />
          <div className="flex gap-2 justify-start">
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {isSaving ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
