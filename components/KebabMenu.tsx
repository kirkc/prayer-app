'use client'

import { useEffect, useRef, useState } from 'react'

// Small vertical-ellipsis (⋮) dropdown. No UI kit / icon lib in the app, so the
// trigger icon is an inline SVG and open/close is a local useState that closes
// on outside click. `children` is a render prop receiving `close` so each item
// can dismiss the menu after firing its action.
export default function KebabMenu({
  label = 'Account actions',
  disabled = false,
  children,
}: {
  label?: string
  disabled?: boolean
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:text-ink-600 hover:bg-mist-100 transition-colors duration-200 disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-2xl border border-mist-200 bg-white p-1 shadow-lg animate-breathe"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// Styled menu item. Pass `danger` for destructive actions.
export function KebabItem({
  onClick,
  disabled = false,
  danger = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 disabled:opacity-40 ${
        danger ? 'text-red-500 hover:bg-red-50' : 'text-ink-600 hover:bg-mist-100'
      }`}
    >
      {children}
    </button>
  )
}
