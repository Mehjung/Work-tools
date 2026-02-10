import { useState, useMemo, useCallback, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
  FilterFn,
} from '@tanstack/react-table'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'

// ====== Berechnungslogik (exakt aus Original uebernommen) ======

function getThresholds(maxMinutes: number): number[] {
  const t: number[] = []
  const baseMins = [80 * 60, 160 * 60, 240 * 60, 320 * 60, 410 * 60, 500 * 60]
  for (const m of baseMins) {
    t.push(m)
    if (m > maxMinutes + 90 * 60) break
  }
  let last = 500 * 60
  while (last < maxMinutes + 90 * 60) {
    last += 90 * 60
    t.push(last)
  }
  return t
}

function parseTime(str: string | undefined): number {
  if (!str || str.trim() === '') return 0
  str = str.trim().replace(/[\[\]]/g, '')
  const m = str.match(/^(-?)(\d+):(\d{2})$/)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
}

function formatTime(totalMins: number): string {
  if (totalMins < 0) return '-' + formatTime(-totalMins)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function cleanPNr(pnr: string | undefined): string {
  if (!pnr) return ''
  return pnr.replace(/^'+/, '').trim()
}

function expand2DigitYear(yy: number, bezugsjahr: number): number {
  const year19 = 1900 + yy
  const year20 = 2000 + yy
  const age19 = bezugsjahr - year19
  const age20 = bezugsjahr - year20
  if (age20 < 0) return year19
  const ok19 = age19 >= 19 && age19 <= 67
  const ok20 = age20 >= 19 && age20 <= 67
  if (ok20 && !ok19) return year20
  if (ok19 && !ok20) return year19
  if (ok19 && ok20) return year19
  const dist19 = Math.min(Math.abs(age19 - 19), Math.abs(age19 - 67))
  const dist20 = Math.min(Math.abs(age20 - 19), Math.abs(age20 - 67))
  return dist19 <= dist20 ? year19 : year20
}

function isAge50InYear(gebDatum: string | undefined, bezugsjahr: number): boolean {
  if (!gebDatum) return false
  const parts = gebDatum.split('.')
  if (parts.length !== 3) return false
  let yearPart = parseInt(parts[2], 10)
  if (yearPart < 100) yearPart = expand2DigitYear(yearPart, bezugsjahr)
  return bezugsjahr - yearPart >= 50
}

interface CSVRow {
  [key: string]: string
}

function parseCSV(text: string): CSVRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(';').map((h) => h.trim())
  const rows: CSVRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(';')
    if (vals.length < 2) continue
    const row: CSVRow = {}
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] || '').trim()
    })
    rows.push(row)
  }
  return rows
}

interface DetectionResult {
  dec: CSVRow[]
  feb: CSVRow[]
  decName: string
  febName: string
  autoDetected: boolean
}

function detectDecFeb(
  dataA: CSVRow[],
  dataB: CSVRow[],
  fileNameA: string,
  fileNameB: string
): DetectionResult {
  const mapA = new Map<string, CSVRow>()
  const mapB = new Map<string, CSVRow>()
  dataA.forEach((r) => mapA.set(cleanPNr(r['PNr']), r))
  dataB.forEach((r) => mapB.set(cleanPNr(r['PNr']), r))
  let sumA = 0,
    sumB = 0,
    count = 0
  for (const [pnr, rA] of mapA) {
    const rB = mapB.get(pnr)
    if (!rB) continue
    const vA = parseTime(rA['US1']),
      vB = parseTime(rB['US1'])
    if (vA !== vB) {
      sumA += vA
      sumB += vB
      count++
    }
  }
  if (count === 0)
    return { dec: dataA, feb: dataB, decName: fileNameA, febName: fileNameB, autoDetected: false }
  if (sumA >= sumB)
    return { dec: dataA, feb: dataB, decName: fileNameA, febName: fileNameB, autoDetected: true }
  return { dec: dataB, feb: dataA, decName: fileNameB, febName: fileNameA, autoDetected: true }
}

interface ResultRow {
  pnr: string
  name: string
  gebDatum: string
  age50: boolean
  abtlDec: string
  abtlFeb: string
  sregDec: string
  sregFeb: string
  us1Dec: number
  daysDec: number
  age50Bonus: number
  surplus: number
  us1Feb: number
  nextThreshold: number | null
  lastThreshold: number
  vorgiffMoeglich: boolean
  vorgrifftage: number
  verbrauchtFeb: number
  restFeb: number
  gesamtZus: number
}

function calculate(decData: CSVRow[], febData: CSVRow[], bezugsjahr: number): ResultRow[] {
  const febMap = new Map<string, CSVRow>()
  febData.forEach((r) => febMap.set(cleanPNr(r['PNr']), r))
  const MAX_FEB_MINS = 79 * 60 + 59
  const output: ResultRow[] = []

  for (const decRow of decData) {
    const pnr = cleanPNr(decRow['PNr'])
    if (!pnr) continue
    const febRow = febMap.get(pnr)
    const us1Dec = parseTime(decRow['US1'])
    const us1Feb = febRow ? parseTime(febRow['US1']) : 0
    const gebDatum = decRow['Geb.-Datum'] || (febRow ? febRow['Geb.-Datum'] : '')
    const age50 = isAge50InYear(gebDatum, bezugsjahr)
    const abtlDec = decRow['Abtl.'] || ''
    const abtlFeb = febRow ? febRow['Abtl.'] || '' : abtlDec
    const sregDec = decRow['S-Reg.'] || ''
    const sregFeb = febRow ? febRow['S-Reg.'] || '' : sregDec
    const thresholds = getThresholds(us1Dec + us1Feb)

    let daysDec = 0,
      lastThreshold = 0
    for (const t of thresholds) {
      if (us1Dec >= t) {
        daysDec++
        lastThreshold = t
      } else break
    }
    const age50Bonus = age50 && daysDec >= 1 ? 1 : 0
    daysDec += age50Bonus
    const surplus = us1Dec - lastThreshold
    const nextThresholdIdx = thresholds.findIndex((t) => t > us1Dec)
    const nextThreshold = nextThresholdIdx >= 0 ? thresholds[nextThresholdIdx] : null

    let vorgrifftage = 0,
      verbrauchtFeb = 0,
      vorgiffMoeglich = false
    if (nextThreshold !== null && us1Feb > 0) {
      const needed = nextThreshold - us1Dec
      const availableFeb = Math.min(us1Feb, MAX_FEB_MINS)
      if (availableFeb >= needed && needed > 0) {
        vorgiffMoeglich = true
        verbrauchtFeb = needed
        const reachedCount = thresholds.filter((t) => t <= us1Dec).length
        vorgrifftage = reachedCount === 0 && age50 ? 2 : 1
      }
    }
    const restFeb = us1Feb - verbrauchtFeb
    const gesamtZus = daysDec + vorgrifftage

    output.push({
      pnr,
      name: decRow['Name, Vorname'] || (febRow ? febRow['Name, Vorname'] : ''),
      gebDatum,
      age50,
      abtlDec,
      abtlFeb,
      sregDec,
      sregFeb,
      us1Dec,
      daysDec,
      age50Bonus,
      surplus,
      us1Feb,
      nextThreshold,
      lastThreshold,
      vorgiffMoeglich,
      vorgrifftage,
      verbrauchtFeb,
      restFeb,
      gesamtZus,
    })
  }

  for (const febRow of febData) {
    const pnr = cleanPNr(febRow['PNr'])
    if (!pnr || output.find((r) => r.pnr === pnr)) continue
    const us1Feb = parseTime(febRow['US1'])
    const gebDatum = febRow['Geb.-Datum'] || ''
    const age50 = isAge50InYear(gebDatum, bezugsjahr)
    output.push({
      pnr,
      name: febRow['Name, Vorname'] || '',
      gebDatum,
      age50,
      abtlDec: '',
      abtlFeb: febRow['Abtl.'] || '',
      sregDec: '',
      sregFeb: febRow['S-Reg.'] || '',
      us1Dec: 0,
      daysDec: 0,
      age50Bonus: 0,
      surplus: 0,
      us1Feb,
      nextThreshold: 80 * 60,
      lastThreshold: 0,
      vorgiffMoeglich: false,
      vorgrifftage: 0,
      verbrauchtFeb: 0,
      restFeb: us1Feb,
      gesamtZus: 0,
    })
  }
  return output
}

// ====== Icons ======
const Icons = {
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ChevronUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Filter: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  PDF: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Excel: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="10" y1="12" x2="14" y2="16" />
      <line x1="14" y1="12" x2="10" y2="16" />
    </svg>
  ),
  Info: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Warning: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
}

// ====== Set Filter Dropdown Komponente ======
interface SetFilterDropdownProps {
  column: {
    id: string
    getFilterValue: () => unknown
    setFilterValue: (val: unknown) => void
  }
  uniqueValues: string[]
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
}

function SetFilterDropdown({ column, uniqueValues, isOpen, onToggle, onClose }: SetFilterDropdownProps) {
  const filterValue = (column.getFilterValue() as string[] | undefined) ?? []
  const dropdownRef = useRef<HTMLDivElement>(null)

  const toggleValue = (val: string) => {
    const newFilter = filterValue.includes(val)
      ? filterValue.filter((v) => v !== val)
      : [...filterValue, val]
    column.setFilterValue(newFilter.length ? newFilter : undefined)
  }

  const selectAll = () => {
    column.setFilterValue(undefined)
  }

  const clearAll = () => {
    column.setFilterValue([])
  }

  const activeCount = filterValue.length

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`p-1 rounded hover:bg-white/10 ${activeCount > 0 && activeCount < uniqueValues.length ? 'text-amber-400' : ''}`}
        title="Filter"
      >
        <Icons.Filter />
        {activeCount > 0 && activeCount < uniqueValues.length && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full text-[8px] text-slate-900 flex items-center justify-center font-bold">
            {activeCount}
          </span>
        )}
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-subtle rounded-lg shadow-xl min-w-[200px] max-h-[300px] overflow-hidden">
            <div className="p-2 border-b border-subtle flex gap-2">
              <button
                onClick={selectAll}
                className="flex-1 px-2 py-1 text-xs bg-base hover:bg-surface-hover rounded border border-subtle"
              >
                Alle
              </button>
              <button
                onClick={clearAll}
                className="flex-1 px-2 py-1 text-xs bg-base hover:bg-surface-hover rounded border border-subtle"
              >
                Keine
              </button>
            </div>
            <div className="max-h-[220px] overflow-y-auto p-2 space-y-1">
              {uniqueValues.map((val) => (
                <label
                  key={val}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-hover rounded cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={filterValue.length === 0 || filterValue.includes(val)}
                    onChange={() => toggleValue(val)}
                    className="w-4 h-4 rounded border-subtle accent-accent"
                  />
                  <span className="truncate">{val || '(leer)'}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ====== Custom Filter Funktion fuer Set-Filter ======
const setFilterFn: FilterFn<ResultRow> = (row, columnId, filterValue: string[] | undefined) => {
  if (!filterValue || filterValue.length === 0) return false
  const value = row.getValue(columnId) as string
  return filterValue.includes(value)
}

// ====== Hauptkomponente ======
export function VorgriffsApp() {
  const [rawA, setRawA] = useState<CSVRow[] | null>(null)
  const [rawB, setRawB] = useState<CSVRow[] | null>(null)
  const [fileNameA, setFileNameA] = useState('')
  const [fileNameB, setFileNameB] = useState('')
  const [bezugsjahr, setBezugsjahr] = useState(new Date().getFullYear()-1)
  const [results, setResults] = useState<ResultRow[]>([])
  const [detectionInfo, setDetectionInfo] = useState<{ message: string; warning: boolean } | null>(null)
  const [quickFilter, setQuickFilter] = useState<'all' | 'vorgriff' | 'age50'>('all')
  const [searchText, setSearchText] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [openFilterId, setOpenFilterId] = useState<string | null>(null)

  const fileInputARef = useRef<HTMLInputElement>(null)
  const fileInputBRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File, which: 'A' | 'B') => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (which === 'A') {
        setRawA(parsed)
        setFileNameA(file.name)
      } else {
        setRawB(parsed)
        setFileNameB(file.name)
      }
    }
    reader.readAsText(file, 'windows-1252')
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, which: 'A' | 'B') => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file, which)
    },
    [handleFile]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, which: 'A' | 'B') => {
      const file = e.target.files?.[0]
      if (file) handleFile(file, which)
    },
    [handleFile]
  )

  const runCalculation = useCallback(() => {
    if (!rawA || !rawB) return
    const detected = detectDecFeb(rawA, rawB, fileNameA, fileNameB)
    if (detected.autoDetected) {
      setDetectionInfo({
        message: `Automatische Erkennung: ${detected.decName} = 31.12. | ${detected.febName} = Feb.`,
        warning: false,
      })
    } else {
      setDetectionInfo({
        message: 'Automatische Erkennung nicht moeglich. Annahme: Datei 1 = 31.12., Datei 2 = Feb.',
        warning: true,
      })
    }
    const calc = calculate(detected.dec, detected.feb, bezugsjahr)
    setResults(calc)
    setQuickFilter('all')
    setSearchText('')
    setColumnFilters([])
  }, [rawA, rawB, fileNameA, fileNameB, bezugsjahr])

  // Gefilterte Daten basierend auf Quick-Filter und Suche
  const filteredData = useMemo(() => {
    let data = results
    if (quickFilter === 'vorgriff') data = data.filter((r) => r.vorgiffMoeglich)
    else if (quickFilter === 'age50') data = data.filter((r) => r.age50)
    if (searchText) {
      const s = searchText.toLowerCase()
      data = data.filter((r) => r.pnr.toLowerCase().includes(s) || r.name.toLowerCase().includes(s))
    }
    return data
  }, [results, quickFilter, searchText])

  // Unique Values fuer Set-Filter berechnen
  const uniqueValues = useMemo(() => {
    const pnrs = [...new Set(filteredData.map((r) => r.pnr))].sort()
    const names = [...new Set(filteredData.map((r) => r.name))].sort()
    const abtls = [...new Set(filteredData.map((r) => r.abtlDec || r.abtlFeb))].sort()
    const sregs = [...new Set(filteredData.map((r) => r.sregDec || r.sregFeb))].sort()
    const age50s = ['Ja', 'Nein']
    const vorgriffs = ['Ja', 'Nein']
    return { pnrs, names, abtls, sregs, age50s, vorgriffs }
  }, [filteredData])

  // TanStack Table Column Definitionen
  const columnHelper = createColumnHelper<ResultRow>()

  const columns = useMemo(
    () => [
      columnHelper.accessor('pnr', {
        header: 'PNr',
        cell: (info) => <span className="font-mono">{info.getValue()}</span>,
        filterFn: setFilterFn,
      }),
      columnHelper.accessor('name', {
        header: 'Name, Vorname',
        filterFn: setFilterFn,
      }),
      columnHelper.accessor('gebDatum', {
        header: 'Geb.-Datum',
        cell: (info) => <span className="font-mono">{info.getValue()}</span>,
        enableColumnFilter: false,
      }),
      columnHelper.accessor((row) => (row.age50 ? 'Ja' : 'Nein'), {
        id: 'age50Display',
        header: '>=50',
        cell: (info) => {
          const val = info.getValue()
          return val === 'Ja' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Ja
            </span>
          ) : (
            <span className="text-text-secondary">-</span>
          )
        },
        filterFn: setFilterFn,
      }),
      columnHelper.accessor((row) => row.abtlDec || row.abtlFeb, {
        id: 'abtl',
        header: 'Abtl.',
        cell: (info) => {
          const row = info.row.original
          if (row.abtlDec && row.abtlFeb && row.abtlDec !== row.abtlFeb) {
            return (
              <div>
                {row.abtlDec}
                <span className="block text-xs text-text-secondary">
                  <span className="text-amber-500">-&gt;</span> {row.abtlFeb}
                </span>
              </div>
            )
          }
          return info.getValue()
        },
        filterFn: setFilterFn,
      }),
      columnHelper.accessor((row) => row.sregDec || row.sregFeb, {
        id: 'sreg',
        header: 'S-Reg.',
        cell: (info) => {
          const row = info.row.original
          if (row.sregDec && row.sregFeb && row.sregDec !== row.sregFeb) {
            return (
              <div>
                {row.sregDec}
                <span className="block text-xs text-text-secondary">
                  <span className="text-amber-500">-&gt;</span> {row.sregFeb}
                </span>
              </div>
            )
          }
          return info.getValue()
        },
        filterFn: setFilterFn,
      }),
      columnHelper.accessor('us1Dec', {
        header: 'US1 (31.12.)',
        cell: (info) => <span className="font-mono text-right block">{formatTime(info.getValue())}</span>,
        enableColumnFilter: false,
      }),
      columnHelper.accessor('daysDec', {
        header: 'ZUS 31.12.',
        cell: (info) => {
          const row = info.row.original
          return (
            <span className="font-semibold">
              {info.getValue()}
              {row.age50Bonus > 0 && (
                <span className="text-red-500 text-xs ml-1" title="davon +1 Alter>=50">
                  (+1)
                </span>
              )}
            </span>
          )
        },
        enableColumnFilter: false,
      }),
      columnHelper.accessor('surplus', {
        header: 'Ueberschuss',
        cell: (info) => <span className="font-mono text-right block">{formatTime(info.getValue())}</span>,
        enableColumnFilter: false,
      }),
      columnHelper.accessor('us1Feb', {
        header: 'US1 (Feb)',
        cell: (info) => <span className="font-mono text-right block">{formatTime(info.getValue())}</span>,
        enableColumnFilter: false,
      }),
      columnHelper.accessor((row) => (row.vorgiffMoeglich ? 'Ja' : 'Nein'), {
        id: 'vorgiffDisplay',
        header: 'Vorgriff',
        cell: (info) => {
          const val = info.getValue()
          return val === 'Ja' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Icons.Check />
              Ja
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Nein
            </span>
          )
        },
        filterFn: setFilterFn,
      }),
      columnHelper.accessor('vorgrifftage', {
        header: '+ Tage',
        cell: (info) => {
          const val = info.getValue()
          return val > 0 ? (
            <span className="font-mono font-bold text-green-600 dark:text-green-400">+{val}</span>
          ) : (
            <span className="text-text-secondary">-</span>
          )
        },
        enableColumnFilter: false,
      }),
      columnHelper.accessor('verbrauchtFeb', {
        header: 'Verbr. (Feb)',
        cell: (info) => {
          const val = info.getValue()
          return val > 0 ? (
            <span className="font-mono font-bold text-red-600 dark:text-red-400">{formatTime(val)}</span>
          ) : (
            <span className="text-text-secondary">-</span>
          )
        },
        enableColumnFilter: false,
      }),
      columnHelper.accessor('restFeb', {
        header: 'Rest (Feb)',
        cell: (info) => <span className="font-mono text-right block">{formatTime(info.getValue())}</span>,
        enableColumnFilter: false,
      }),
      columnHelper.accessor('gesamtZus', {
        header: 'Gesamt ZUS',
        cell: (info) => {
          const val = info.getValue()
          const row = info.row.original
          if (val > 0) {
            return (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                  row.vorgiffMoeglich
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}
              >
                {val}
              </span>
            )
          }
          return <span className="text-text-secondary">0</span>
        },
        enableColumnFilter: false,
      }),
    ],
    [columnHelper]
  )

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  })

  // Statistiken
  const stats = useMemo(() => {
    const tableData = table.getFilteredRowModel().rows.map((r) => r.original)
    return {
      total: tableData.length,
      vorgriff: tableData.filter((r) => r.vorgiffMoeglich).length,
      gesamtZus: tableData.reduce((s, r) => s + r.gesamtZus, 0),
    }
  }, [table.getFilteredRowModel().rows])

  // Export Funktionen
  const getExportHeaders = () => [
    'PNr',
    'Name, Vorname',
    'Geb.-Datum',
    '>=50',
    'Abtl.',
    'S-Reg.',
    'US1 (31.12.)',
    'ZUS 31.12.',
    'Ueberschuss',
    'US1 (Feb)',
    'Vorgriff',
    '+ Tage',
    'Verbr. (Feb)',
    'Rest (Feb)',
    'Gesamt ZUS',
  ]

  const getExportRow = (r: ResultRow) => {
    let abtl = r.abtlDec || r.abtlFeb
    if (r.abtlDec && r.abtlFeb && r.abtlDec !== r.abtlFeb) abtl = `${r.abtlDec} -> ${r.abtlFeb}`
    let sreg = r.sregDec || r.sregFeb
    if (r.sregDec && r.sregFeb && r.sregDec !== r.sregFeb) sreg = `${r.sregDec} -> ${r.sregFeb}`
    return [
      r.pnr,
      r.name,
      r.gebDatum,
      r.age50 ? 'Ja' : 'Nein',
      abtl,
      sreg,
      formatTime(r.us1Dec),
      r.daysDec + (r.age50Bonus ? ' (+1)' : ''),
      formatTime(r.surplus),
      formatTime(r.us1Feb),
      r.vorgiffMoeglich ? 'Ja' : 'Nein',
      r.vorgrifftage > 0 ? `+${r.vorgrifftage}` : '-',
      r.verbrauchtFeb > 0 ? formatTime(r.verbrauchtFeb) : '-',
      formatTime(r.restFeb),
      r.gesamtZus,
    ]
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const exportData = table.getFilteredRowModel().rows.map((r) => r.original)
    const filterLabel =
      quickFilter === 'all' ? 'Alle Mitarbeiter' : quickFilter === 'vorgriff' ? 'Nur Vorgriff' : 'Alter >= 50'

    doc.setFontSize(14)
    doc.text('Zusatzurlaub FGR TV - Vorgriffsregelung', 14, 14)
    doc.setFontSize(10)
    doc.text(`Bezugsjahr: ${bezugsjahr}  |  Filter: ${filterLabel}  |  ${exportData.length} Mitarbeiter`, 14, 21)

    autoTable(doc, {
      head: [getExportHeaders()],
      body: exportData.map(getExportRow),
      startY: 26,
      styles: { fontSize: 7, cellPadding: 1.5, font: 'helvetica' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 16 },
        10: { fillColor: [255, 251, 235] },
        11: { fillColor: [255, 251, 235] },
        12: { fillColor: [255, 251, 235] },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 8, right: 8 },
      didParseCell: function (data) {
        if (data.section === 'body') {
          const r = exportData[data.row.index]
          if (r && r.vorgiffMoeglich) {
            data.cell.styles.fillColor = [254, 243, 199]
          }
        }
      },
    })
    doc.save(`Zusatzurlaub_Vorgriff_${bezugsjahr}.pdf`)
  }

  const exportXLS = async () => {
    const exportData = table.getFilteredRowModel().rows.map((r) => r.original)
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Zusatzurlaub')

    // Header
    const headers = getExportHeaders()
    worksheet.addRow(headers)
    
    // Header-Styling
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    // Datenzeilen
    exportData.forEach((r) => {
      const row = worksheet.addRow(getExportRow(r))
      // Vorgriff-Zeilen hervorheben
      if (r.vorgiffMoeglich) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
      }
    })

    // Spaltenbreiten
    worksheet.columns = [
      { width: 12 }, { width: 28 }, { width: 12 }, { width: 6 }, { width: 10 },
      { width: 10 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 14 },
      { width: 10 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 10 },
    ]

    // Ergebnis-Spalten hervorheben (Vorgriff, +Tage, Verbr.)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        ;[11, 12, 13].forEach((colIdx) => {
          const cell = row.getCell(colIdx)
          if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb !== 'FFFEF3C7') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
          }
        })
      }
    })

    // Download
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Zusatzurlaub_Vorgriff_${bezugsjahr}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Ergebnis-Spalten IDs (fuer Highlight)
  const resultColumnIds = ['vorgiffDisplay', 'vorgrifftage', 'verbrauchtFeb']

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header Stats */}
      {results.length > 0 && (
        <div className="bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1 h-8 bg-red-500 rounded" />
            <div>
              <h2 className="font-semibold text-sm">tariflicher Zusatzurlaub</h2>
              <span className="text-slate-400 text-xs">Vorgriffsregelung</span>
            </div>
          </div>
          <div className="ml-auto flex gap-6">
            <div className="text-center">
              <div className="font-mono font-bold text-xl">{stats.total}</div>
              <div className="text-xs text-slate-400 uppercase">Mitarbeiter</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-xl text-amber-400">{stats.vorgriff}</div>
              <div className="text-xs text-slate-400 uppercase">mit Vorgriff</div>
            </div>
            <div className="text-center">
              <div className="font-mono font-bold text-xl text-green-400">{stats.gesamtZus}</div>
              <div className="text-xs text-slate-400 uppercase">ZUS Tage ges.</div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      {results.length === 0 && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Upload Card A */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'A')}
              onClick={() => fileInputARef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                rawA
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-subtle hover:border-accent hover:bg-accent/5'
              }`}
            >
              <input
                ref={fileInputARef}
                type="file"
                accept=".csv,.txt"
                onChange={(e) => handleFileInput(e, 'A')}
                className="hidden"
              />
              <div className={`flex justify-center mb-3 ${rawA ? 'text-green-600' : 'text-text-secondary'}`}>
                {rawA ? <Icons.Check /> : <Icons.Upload />}
              </div>
              <div className="font-semibold mb-1">CSV Datei 1</div>
              <div className="text-sm text-text-secondary">Erste Berechnungsdatei laden</div>
              {rawA && (
                <div className="mt-2 font-mono text-sm text-green-600 dark:text-green-400">
                  {fileNameA} ({rawA.length} Zeilen)
                </div>
              )}
            </div>

            {/* Upload Card B */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'B')}
              onClick={() => fileInputBRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                rawB
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-subtle hover:border-accent hover:bg-accent/5'
              }`}
            >
              <input
                ref={fileInputBRef}
                type="file"
                accept=".csv,.txt"
                onChange={(e) => handleFileInput(e, 'B')}
                className="hidden"
              />
              <div className={`flex justify-center mb-3 ${rawB ? 'text-green-600' : 'text-text-secondary'}`}>
                {rawB ? <Icons.Check /> : <Icons.Upload />}
              </div>
              <div className="font-semibold mb-1">CSV Datei 2</div>
              <div className="text-sm text-text-secondary">Zweite Berechnungsdatei laden</div>
              {rawB && (
                <div className="mt-2 font-mono text-sm text-green-600 dark:text-green-400">
                  {fileNameB} ({rawB.length} Zeilen)
                </div>
              )}
            </div>

            {/* Settings */}
            <div className="bg-surface border border-subtle rounded-lg p-6">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Jahr der Vorgriffsregelung
              </label>
              <div className="text-xs text-text-secondary mb-2">Fuer Altersberechnung (&gt;= 50 J.)</div>
              <input
                type="number"
                value={bezugsjahr}
                onChange={(e) => setBezugsjahr(parseInt(e.target.value) || new Date().getFullYear())}
                min="2000"
                max="2099"
                className="w-full px-3 py-2 bg-base border border-subtle rounded-lg font-mono text-center text-lg focus:border-accent focus:outline-none"
              />
              <button
                onClick={runCalculation}
                disabled={!rawA || !rawB}
                className="w-full mt-4 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-lg font-semibold transition-colors disabled:cursor-not-allowed"
              >
                Berechnen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detection Info */}
      {detectionInfo && results.length > 0 && (
        <div className="px-4 pb-2">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
              detectionInfo.warning
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700'
            }`}
          >
            {detectionInfo.warning ? <Icons.Warning /> : <Icons.Info />}
            {detectionInfo.message}
          </div>
        </div>
      )}

      {/* Toolbar */}
      {results.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            {(['all', 'vorgriff', 'age50'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setQuickFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  quickFilter === f
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                    : 'bg-surface border-subtle hover:border-active'
                }`}
              >
                {f === 'all' ? 'Alle Mitarbeiter' : f === 'vorgriff' ? 'Nur Vorgriff' : 'Alter >= 50'}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Suche PNr / Name..."
              className="pl-8 pr-4 py-2 bg-surface border border-subtle rounded-lg text-sm focus:border-accent focus:outline-none w-48"
              style={{ paddingLeft: '2rem' }}
            />
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary">
              <Icons.Search />
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Export:</span>
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 px-3 py-2 bg-surface border border-subtle rounded-lg text-sm font-medium hover:border-red-500 hover:text-red-500 transition-colors"
            >
              <Icons.PDF />
              PDF
            </button>
            <button
              onClick={exportXLS}
              className="flex items-center gap-2 px-3 py-2 bg-surface border border-subtle rounded-lg text-sm font-medium hover:border-green-500 hover:text-green-500 transition-colors"
            >
              <Icons.Excel />
              Excel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {results.length > 0 && (
        <div className="flex-1 overflow-auto px-4 pb-4">
          <div className="bg-surface border border-subtle rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  {table.getHeaderGroups().map((headerGroup) =>
                    headerGroup.headers.map((header) => {
                      const isResultCol = resultColumnIds.includes(header.id)
                      const canFilter = header.column.getCanFilter()
                      let uniqueVals: string[] = []
                      if (canFilter) {
                        if (header.id === 'pnr') uniqueVals = uniqueValues.pnrs
                        else if (header.id === 'name') uniqueVals = uniqueValues.names
                        else if (header.id === 'abtl') uniqueVals = uniqueValues.abtls
                        else if (header.id === 'sreg') uniqueVals = uniqueValues.sregs
                        else if (header.id === 'age50Display') uniqueVals = uniqueValues.age50s
                        else if (header.id === 'vorgiffDisplay') uniqueVals = uniqueValues.vorgriffs
                      }

                      return (
                        <th
                          key={header.id}
                          className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
                            isResultCol
                              ? 'bg-amber-700 text-white border-b-2 border-amber-500'
                              : 'bg-slate-800 text-white border-b-2 border-red-500'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => header.column.toggleSorting()}
                              className="flex items-center gap-1 hover:opacity-80"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getIsSorted() === 'asc' && <Icons.ChevronUp />}
                              {header.column.getIsSorted() === 'desc' && <Icons.ChevronDown />}
                            </button>
                            {canFilter && uniqueVals.length > 0 && (
                              <SetFilterDropdown
                                column={{
                                  id: header.id,
                                  getFilterValue: () => header.column.getFilterValue(),
                                  setFilterValue: (val) => header.column.setFilterValue(val),
                                }}
                                uniqueValues={uniqueVals}
                                isOpen={openFilterId === header.id}
                                onToggle={() => setOpenFilterId(openFilterId === header.id ? null : header.id)}
                                onClose={() => setOpenFilterId(null)}
                              />
                            )}
                          </div>
                        </th>
                      )
                    })
                  )}
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-4 py-12 text-center text-text-secondary">
                      Keine Ergebnisse gefunden.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const isVorgriff = row.original.vorgiffMoeglich
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-subtle transition-colors ${
                          isVorgriff
                            ? 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20'
                            : 'hover:bg-surface-hover'
                        }`}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const isResultCol = resultColumnIds.includes(cell.column.id)
                          return (
                            <td
                              key={cell.id}
                              className={`px-3 py-2.5 ${
                                isResultCol
                                  ? isVorgriff
                                    ? 'bg-amber-100/80 dark:bg-amber-900/30 border-l border-r border-amber-200 dark:border-amber-800'
                                    : 'bg-orange-50 dark:bg-orange-900/10 border-l border-r border-orange-100 dark:border-orange-900/30'
                                  : ''
                              } ${cell.column.id === 'vorgiffDisplay' ? 'border-l-2 border-l-amber-400' : ''} ${
                                cell.column.id === 'verbrauchtFeb' ? 'border-r-2 border-r-amber-400' : ''
                              }`}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm">
            <div className="text-text-secondary">
              Zeige {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} bis{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{' '}
              von {table.getFilteredRowModel().rows.length} Eintraegen
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-2 bg-surface border border-subtle rounded-lg hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icons.ChevronLeft />
              </button>
              <span className="px-3 py-1 bg-surface border border-subtle rounded-lg font-medium">
                Seite {table.getState().pagination.pageIndex + 1} von {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-2 bg-surface border border-subtle rounded-lg hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icons.ChevronRight />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
