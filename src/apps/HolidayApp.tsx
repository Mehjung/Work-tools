import { useState } from 'react'

const BUNDESLAENDER = ['Baden-Wuerttemberg','Bayern','Berlin','Brandenburg','Bremen','Hamburg','Hessen','Mecklenburg-Vorpommern','Niedersachsen','Nordrhein-Westfalen','Rheinland-Pfalz','Saarland','Sachsen','Sachsen-Anhalt','Schleswig-Holstein','Thueringen']
const WOCHENTAGE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']

function getEaster(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}

function getHolidays(year: number, land: string): {name: string; date: Date}[] {
  const easter = getEaster(year)
  const holidays: {name: string; date: Date; lands?: string[]}[] = [
    {name: 'Neujahr', date: new Date(year, 0, 1)},
    {name: 'Karfreitag', date: addDays(easter, -2)},
    {name: 'Ostermontag', date: addDays(easter, 1)},
    {name: 'Tag der Arbeit', date: new Date(year, 4, 1)},
    {name: 'Christi Himmelfahrt', date: addDays(easter, 39)},
    {name: 'Pfingstmontag', date: addDays(easter, 50)},
    {name: 'Tag der Deutschen Einheit', date: new Date(year, 9, 3)},
    {name: 'Weihnachten', date: new Date(year, 11, 25)},
    {name: '2. Weihnachtstag', date: new Date(year, 11, 26)},
    {name: 'Heilige Drei Koenige', date: new Date(year, 0, 6), lands: ['Baden-Wuerttemberg','Bayern','Sachsen-Anhalt']},
    {name: 'Fronleichnam', date: addDays(easter, 60), lands: ['Baden-Wuerttemberg','Bayern','Hessen','Nordrhein-Westfalen','Rheinland-Pfalz','Saarland','Sachsen','Thueringen']},
    {name: 'Mariae Himmelfahrt', date: new Date(year, 7, 15), lands: ['Bayern','Saarland']},
    {name: 'Reformationstag', date: new Date(year, 9, 31), lands: ['Brandenburg','Bremen','Hamburg','Mecklenburg-Vorpommern','Niedersachsen','Sachsen','Sachsen-Anhalt','Schleswig-Holstein','Thueringen']},
    {name: 'Allerheiligen', date: new Date(year, 10, 1), lands: ['Baden-Wuerttemberg','Bayern','Nordrhein-Westfalen','Rheinland-Pfalz','Saarland']},
    {name: 'Buss- und Bettag', date: (() => { const d = new Date(year, 10, 23); while(d.getDay() !== 3) d.setDate(d.getDate()-1); return d })(), lands: ['Sachsen']},
    {name: 'Internationaler Frauentag', date: new Date(year, 2, 8), lands: year >= 2019 ? ['Berlin'] : []},
    {name: 'Weltkindertag', date: new Date(year, 8, 20), lands: year >= 2019 ? ['Thueringen'] : []},
  ]
  return holidays.filter(h => !h.lands || h.lands.includes(land)).map(h => ({name: h.name, date: h.date})).sort((a,b) => a.date.getTime() - b.date.getTime())
}

export function HolidayApp() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [land, setLand] = useState('Bayern')
  const holidays = getHolidays(year, land)

  return (
    <div className="h-full flex flex-col p-4 overflow-auto">
      <h2 className="text-lg font-semibold mb-4">Feiertagsrechner</h2>
      <div className="flex gap-4 mb-4 flex-wrap">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Jahr</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 bg-surface border border-subtle rounded-md w-24" />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Bundesland</label>
          <select value={land} onChange={e => setLand(e.target.value)}
            className="px-3 py-2 bg-surface border border-subtle rounded-md">
            {BUNDESLAENDER.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1">
        <table className="w-full">
          <thead><tr className="border-b border-subtle">
            <th className="text-left py-2 text-text-secondary text-sm">Feiertag</th>
            <th className="text-left py-2 text-text-secondary text-sm">Datum</th>
            <th className="text-left py-2 text-text-secondary text-sm">Wochentag</th>
          </tr></thead>
          <tbody>
            {holidays.map(h => (
              <tr key={h.name} className="border-b border-subtle hover:bg-surface">
                <td className="py-2">{h.name}</td>
                <td className="py-2 font-mono">{h.date.toLocaleDateString('de-DE')}</td>
                <td className="py-2">{WOCHENTAGE[h.date.getDay()]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-sm text-text-secondary">{holidays.length} Feiertage in {land} {year}</p>
      </div>
    </div>
  )
}
