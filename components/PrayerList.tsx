'use client'

import { useEffect, useState } from 'react'
import PrayerCard from './PrayerCard'
import { PrayerRequestWithState } from '@/types'

type Status = PrayerRequestWithState['status']

const TABS: { label: string; value: Status }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
  { label: 'Spam', value: 'spam' },
]

type Props = {
  initialPrayers: PrayerRequestWithState[]
  initialStatus: Status
}

export default function PrayerList({ initialPrayers, initialStatus }: Props) {
  const [activeTab, setActiveTab] = useState<Status>(initialStatus)
  const [prayers, setPrayers] = useState<PrayerRequestWithState[]>(initialPrayers)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Reload the feed whenever the tab or (debounced) search term changes.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ status: activeTab })
        if (search.trim()) params.set('q', search.trim())
        const res = await fetch(`/api/prayers?${params}`, { signal: controller.signal })
        if (res.ok) setPrayers(await res.json())
      } catch {
        // Aborted or network error — ignore; a later keystroke will retry.
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => { clearTimeout(timer); controller.abort() }
  }, [activeTab, search])

  function handleStatusChange(id: string) {
    // Moved to a different tab — drop it from the current view.
    setPrayers(prev => prev.filter(p => p.id !== id))
  }

  function handleDelete(id: string) {
    setPrayers(prev => prev.filter(p => p.id !== id))
  }

  function handleLocalChange(id: string, patch: Partial<PrayerRequestWithState>) {
    setPrayers(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 bg-mist-100 rounded-full p-1">
          {TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-5 py-1.5 rounded-full text-sm transition-all duration-300 ${
                activeTab === tab.value
                  ? 'bg-white text-ink-700 shadow-sm'
                  : 'text-ink-400 hover:text-ink-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="input flex-1 min-w-[10rem] max-w-55 rounded-full py-1.5"
        />
      </div>

      {loading ? (
        <p className="text-sm text-ink-300 py-10 text-center animate-breathe">
          One moment…
        </p>
      ) : prayers.length === 0 ? (
        <div className="py-16 text-center animate-breathe">
          <p className="font-display text-lg font-light text-ink-500">
            {search.trim() ? 'Nothing matches your search' : 'All is quiet'}
          </p>
          <p className="text-sm text-ink-300 mt-1.5">
            {search.trim()
              ? 'Try a different word or clear the search.'
              : `No ${activeTab} prayer requests right now.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {prayers.map((prayer, i) => (
            <PrayerCard
              key={prayer.id}
              prayer={prayer}
              index={i}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLocalChange={handleLocalChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
