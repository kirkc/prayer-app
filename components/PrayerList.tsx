'use client'

import { useState } from 'react'
import PrayerCard from './PrayerCard'
import { PrayerRequest } from '@/types'

type Status = PrayerRequest['status']

const TABS: { label: string; value: Status }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
  { label: 'Spam', value: 'spam' },
]

type Props = {
  initialPrayers: PrayerRequest[]
  initialStatus: Status
}

export default function PrayerList({ initialPrayers, initialStatus }: Props) {
  const [activeTab, setActiveTab] = useState<Status>(initialStatus)
  const [prayers, setPrayers] = useState<PrayerRequest[]>(initialPrayers)
  const [loading, setLoading] = useState(false)

  async function fetchPrayers(status: Status) {
    setLoading(true)
    const res = await fetch(`/api/prayers?status=${status}`)
    const data = await res.json()
    setPrayers(data)
    setLoading(false)
  }

  function handleTabChange(status: Status) {
    setActiveTab(status)
    fetchPrayers(status)
  }

  function handleUpdate(id: string, _status: Status) {
    // Remove from current list since it moved to a different status
    setPrayers(prev => prev.filter(p => p.id !== id))
  }

  function handleDelete(id: string) {
    setPrayers(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : prayers.length === 0 ? (
        <p className="text-sm text-gray-400">No {activeTab} prayer requests.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {prayers.map(prayer => (
            <PrayerCard
              key={prayer.id}
              prayer={prayer}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
