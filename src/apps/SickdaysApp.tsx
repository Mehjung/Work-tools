import { useState, useEffect } from 'react'

const WOCHENTAGE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const MONATE = ['Januar','Februar','Maerz','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}

export function SickdaysApp() {
  const [startDate, setStartDate] = useState('')
  const [result, setResult] = useState<{day183: Date; calendar: Date[]} | null>(null)

  useEffect(() => {
    if (startDate) {
      const start = new Date(startDate)
      const day183 = addDays(start, 182)
      const calendar: Date[] = []
      for (let i = 0; i <= 182; i++) calendar.push(addDays(start, i))
      setResult({day183, calendar})
    } else {
      setResult(null)
    }
  }, [startDate])

  const getMonthDays = (year: number, month: number) => {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const days: (Date|null)[] = []
    for (let i = 0; i < first.getDay(); i++) days.push(null)
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
    return days
  }

  const isInRange = (d: Date) => result?.calendar.some(c => c.toDateString() === d.toDateString())
  const isDay183 = (d: Date) => result?.day183.toDateString() === d.toDateString()

  const months = result ? (() => {
    const start = new Date(startDate)
    const end = result.day183
    const m: {year:number;month:number}[] = []
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      m.push({year: cur.getFullYear(), month: cur.getMonth()})
      cur.setMonth(cur.getMonth() + 1)
    }
    return m
  })() : []

  return (
    <div className="h-full flex flex-col p-4 overflow-auto">
      <h2 className="text-lg font-semibold mb-4">Dauerkrank-Rechner</h2>
      <p className="text-sm text-text-secondary mb-4">Berechnet den 183. Tag (1. Tag Dauerkrankheit) nach Krankheitsbeginn.</p>
      <div className="mb-4">
        <label className="block text-sm text-text-secondary mb-1">Startdatum der Krankheit</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="px-3 py-2 bg-surface border border-subtle rounded-md" />
      </div>
      {result && (
        <>
          <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg mb-4">
            <div className="text-sm text-text-secondary">1. Tag Dauerkrankheit (183. Tag):</div>
            <div className="text-2xl font-bold text-red-500">{result.day183.toLocaleDateString('de-DE')} ({WOCHENTAGE[result.day183.getDay()]})</div>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {months.map(({year, month}) => (
              <div key={`${year}-${month}`} className="border border-subtle rounded-lg p-3">
                <div className="text-center font-semibold mb-2">{MONATE[month]} {year}</div>
                <div className="grid grid-cols-7 gap-1 text-xs">
                  {['So','Mo','Di','Mi','Do','Fr','Sa'].map(d => <div key={d} className="text-center text-text-secondary font-medium">{d}</div>)}
                  {getMonthDays(year, month).map((d, i) => (
                    <div key={i} className={`text-center py-1 rounded ${!d ? '' : isDay183(d) ? 'bg-red-500 text-white font-bold' : isInRange(d) ? 'bg-orange-500/30' : ''}`}>
                      {d?.getDate() || ''}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
