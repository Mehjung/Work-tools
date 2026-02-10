import { useState, useCallback, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  FilterFn,
} from '@tanstack/react-table'
import Select, { MultiValue } from 'react-select'
import ExcelJS from 'exceljs'

// ============== INTERFACES ==============
interface AccessEntry {
  department: string
  accessType: string
}

interface ProfileData {
  profile: string
  accesses: AccessEntry[]
}

interface SearchResult {
  profile: string
  department: string
  accessType: string
}

interface SelectOption {
  value: string
  label: string
}

interface UserEntry {
  persNr: string
  name: string
  abteilung: string
  benutzerprofil: string
}

// ============== WILDCARD MATCHING ALGORITHMS ==============

function matchWithWildcards(pattern: string, text: string): boolean {
  const m = pattern.length, n = text.length
  const dp: boolean[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(false))
  dp[0][0] = true

  for (let i = 1; i <= m; i++) {
    if (pattern[i - 1] === '*') dp[i][0] = dp[i - 1][0]
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const pChar = pattern[i - 1], tChar = text[j - 1]
      if (pChar === '*') dp[i][j] = dp[i - 1][j] || dp[i][j - 1]
      else if (pChar === '?') dp[i][j] = dp[i - 1][j - 1]
      else dp[i][j] = (pChar === tChar) && dp[i - 1][j - 1]
    }
  }
  return dp[m][n]
}

function patternsCanIntersect(p1: string, p2: string): boolean {
  const memo = new Map<string, boolean>()
  
  function canMatch(i1: number, i2: number): boolean {
    const key = i1 + ',' + i2
    if (memo.has(key)) return memo.get(key)!
    if (i1 === p1.length && i2 === p2.length) return true

    if (i1 === p1.length) {
      for (let k = i2; k < p2.length; k++) if (p2[k] !== '*') { memo.set(key, false); return false }
      memo.set(key, true); return true
    }
    if (i2 === p2.length) {
      for (let k = i1; k < p1.length; k++) if (p1[k] !== '*') { memo.set(key, false); return false }
      memo.set(key, true); return true
    }

    const c1 = p1[i1], c2 = p2[i2]
    let result = false

    if (c1 === '*' && c2 === '*') result = canMatch(i1+1, i2) || canMatch(i1, i2+1) || canMatch(i1+1, i2+1)
    else if (c1 === '*') result = canMatch(i1+1, i2) || canMatch(i1, i2+1)
    else if (c2 === '*') result = canMatch(i1, i2+1) || canMatch(i1+1, i2)
    else if (c1 === '?' || c2 === '?') result = canMatch(i1+1, i2+1)
    else result = (c1 === c2) && canMatch(i1+1, i2+1)

    memo.set(key, result)
    return result
  }
  return canMatch(0, 0)
}

function bidirectionalWildcardMatch(patternA: string, patternB: string): boolean {
  if (matchWithWildcards(patternA, patternB)) return true
  if (matchWithWildcards(patternB, patternA)) return true
  return patternsCanIntersect(patternA, patternB)
}

// ============== CUSTOM FILTER FUNCTION ==============
const multiSelectFilter: FilterFn<SearchResult> = (row, columnId, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true
  const cellValue = row.getValue(columnId) as string
  return filterValue.includes(cellValue)
}

// ============== REACT-SELECT CUSTOM STYLES ==============
const selectStyles = {
  control: (base: any) => ({
    ...base,
    background: 'rgba(0,0,0,0.3)',
    borderColor: 'rgba(255,255,255,0.2)',
    minHeight: '32px',
    '&:hover': { borderColor: 'rgba(79, 195, 247, 0.5)' },
  }),
  menu: (base: any) => ({
    ...base,
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.2)',
    zIndex: 50,
  }),
  option: (base: any, state: any) => ({
    ...base,
    background: state.isFocused ? 'rgba(79, 195, 247, 0.2)' : 'transparent',
    color: '#eee',
    '&:active': { background: 'rgba(79, 195, 247, 0.3)' },
  }),
  multiValue: (base: any) => ({
    ...base,
    background: 'rgba(79, 195, 247, 0.3)',
  }),
  multiValueLabel: (base: any) => ({
    ...base,
    color: '#eee',
  }),
  multiValueRemove: (base: any) => ({
    ...base,
    color: '#eee',
    '&:hover': { background: 'rgba(255,100,100,0.3)', color: '#fff' },
  }),
  input: (base: any) => ({
    ...base,
    color: '#eee',
  }),
  placeholder: (base: any) => ({
    ...base,
    color: '#888',
  }),
  clearIndicator: (base: any) => ({
    ...base,
    color: '#888',
    '&:hover': { color: '#eee' },
  }),
  dropdownIndicator: (base: any) => ({
    ...base,
    color: '#888',
    '&:hover': { color: '#eee' },
  }),
}

// ============== MAIN COMPONENT ==============
export function AccessRightsApp() {
  // Access data state (1st file)
  const [accessData, setAccessData] = useState<ProfileData[]>([])
  const [fileName, setFileName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  
  // User data state (2nd file)
  const [userData, setUserData] = useState<UserEntry[]>([])
  const [userFileName, setUserFileName] = useState('')
  const [isDragOverUser, setIsDragOverUser] = useState(false)

  // Search & table state
  const [searchQuery, setSearchQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null)

  const stats = useMemo(() => ({
    profiles: accessData.length,
    accesses: accessData.reduce((sum, p) => sum + p.accesses.length, 0)
  }), [accessData])

  const userStats = useMemo(() => ({
    users: userData.length
  }), [userData])

  // ============== EXCEL PARSING: ACCESS DATA (1st file) ==============
  const parseAccessData = useCallback((rows: unknown[][]) => {
    const data: ProfileData[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue
      const profileCell = row[0]
      if (profileCell === undefined || profileCell === null || String(profileCell).trim() === '') continue
      
      const profile = String(profileCell).trim()
      const accesses: AccessEntry[] = []
      
      for (let col = 2; col < row.length; col += 3) {
        const deptCell = row[col]
        const accessCell = row[col + 1]
        if (deptCell !== undefined && deptCell !== null && String(deptCell).trim() !== '') {
          accesses.push({
            department: String(deptCell).trim(),
            accessType: accessCell !== undefined && accessCell !== null ? String(accessCell).trim() : ''
          })
        }
      }
      data.push({ profile, accesses })
    }
    setAccessData(data)
  }, [])

  // ============== EXCEL PARSING: USER DATA (2nd file) ==============
  const parseUserData = useCallback((rows: unknown[][]) => {
    const data: UserEntry[] = []
    // Data starts at row 3 (index 2), header is row 1-2
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue
      
      const persNr = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : ''
      const name = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : ''
      const abteilung = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : ''
      const benutzerprofil = row[7] !== undefined && row[7] !== null ? String(row[7]).trim() : '' // Column H = index 7
      
      if (persNr === '' && name === '' && benutzerprofil === '') continue
      
      data.push({ persNr, name, abteilung, benutzerprofil })
    }
    setUserData(data)
  }, [])

  // ============== FILE HANDLERS ==============
  const handleFile = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)
      
      const worksheet = workbook.worksheets[0]
      if (!worksheet) return
      
      const rows: unknown[][] = []
      worksheet.eachRow((row, rowNumber) => {
        const rowData: unknown[] = []
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          while (rowData.length < colNumber - 1) {
            rowData.push(undefined)
          }
          rowData[colNumber - 1] = cell.value
        })
        rows[rowNumber - 1] = rowData
      })
      
      parseAccessData(rows)
      setFileName(file.name)
      setSearchQuery('')
      setColumnFilters([])
      setSorting([])
      setSelectedProfile(null)
    } catch {
      // Silent fail – don't disrupt UX
    }
  }, [parseAccessData])

  const handleUserFile = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)
      
      const worksheet = workbook.worksheets[0]
      if (!worksheet) return
      
      const rows: unknown[][] = []
      worksheet.eachRow((row, rowNumber) => {
        const rowData: unknown[] = []
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          while (rowData.length < colNumber - 1) {
            rowData.push(undefined)
          }
          rowData[colNumber - 1] = cell.value
        })
        rows[rowNumber - 1] = rowData
      })
      
      parseUserData(rows)
      setUserFileName(file.name)
    } catch {
      // Silent fail
    }
  }, [parseUserData])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length) void handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const handleUserDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverUser(false)
    if (e.dataTransfer.files.length) void handleUserFile(e.dataTransfer.files[0])
  }, [handleUserFile])

  // ============== SEARCH RESULTS ==============
  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim()) return []
    const results: SearchResult[] = []
    for (const item of accessData) {
      for (const access of item.accesses) {
        if (bidirectionalWildcardMatch(searchQuery, access.department)) {
          results.push({
            profile: item.profile,
            department: access.department,
            accessType: access.accessType || '(leer)'
          })
        }
      }
    }
    return results
  }, [searchQuery, accessData])

  // ============== USERS FOR SELECTED PROFILE ==============
  const matchedUsers = useMemo((): UserEntry[] => {
    if (!selectedProfile || userData.length === 0) return []
    return userData.filter(u => u.benutzerprofil === selectedProfile)
  }, [selectedProfile, userData])

  // ============== UNIQUE VALUES FOR FILTERS ==============
  const uniqueValues = useMemo(() => ({
    profiles: [...new Set(searchResults.map(r => r.profile))].sort().map(v => ({ value: v, label: v })),
    departments: [...new Set(searchResults.map(r => r.department))].sort().map(v => ({ value: v, label: v })),
    accessTypes: [...new Set(searchResults.map(r => r.accessType))].sort().map(v => ({ value: v, label: v }))
  }), [searchResults])

  // ============== TABLE COLUMNS ==============
  const columns = useMemo<ColumnDef<SearchResult>[]>(() => [
    {
      accessorKey: 'profile',
      header: 'Rechteprofil',
      filterFn: multiSelectFilter,
    },
    {
      accessorKey: 'department',
      header: 'Abteilung (Excel)',
      filterFn: multiSelectFilter,
      cell: ({ getValue }) => (
        <code className="bg-base px-2 py-0.5 rounded text-xs">{getValue() as string}</code>
      ),
    },
    {
      accessorKey: 'accessType',
      header: 'Zugriffsart',
      filterFn: multiSelectFilter,
      cell: ({ getValue }) => {
        const val = getValue() as string
        const cls = val.toLowerCase() === 'l' ? 'bg-green-500/20 text-green-400' :
                    val.toLowerCase() === 'l/s' ? 'bg-orange-500/20 text-orange-400' : 
                    'bg-gray-500/20 text-gray-400'
        return <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${cls}`}>{val}</span>
      },
    },
  ], [])

  // ============== TANSTACK TABLE INSTANCE ==============
  const table = useReactTable({
    data: searchResults,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 50 },
    },
  })

  // ============== FILTER HANDLERS ==============
  const handleFilterChange = (columnId: string, selected: MultiValue<SelectOption>) => {
    const values = selected ? selected.map(s => s.value) : []
    setColumnFilters(prev => {
      const others = prev.filter(f => f.id !== columnId)
      if (values.length === 0) return others
      return [...others, { id: columnId, value: values }]
    })
  }

  const getFilterValue = (columnId: string): SelectOption[] => {
    const filter = columnFilters.find(f => f.id === columnId)
    if (!filter) return []
    const values = filter.value as string[]
    return values.map(v => ({ value: v, label: v }))
  }

  // Show user panel only when user data is loaded AND a profile is selected
  const showUserPanel = userFileName !== '' && selectedProfile !== null

  // ============== RENDER ==============
  return (
    <div className="h-full flex flex-col overflow-auto p-4 bg-base">
      <div className="max-w-[1400px] mx-auto w-full space-y-4">
        
        {/* Upload Cards Row */}
        <div className="flex gap-4 flex-col md:flex-row">
          {/* Upload Card: Access Data */}
          <div className="bg-surface border border-subtle rounded-lg p-4 flex-1">
            <h2 className="text-accent font-semibold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-accent rounded-sm"></span>
              Rechteprofile laden
            </h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input-access')?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                fileName ? 'border-green-500/50 bg-green-500/5' :
                isDragOver ? 'border-accent bg-accent/10' : 'border-subtle hover:border-accent/50'
              }`}
            >
              <p className="text-text-secondary text-sm">Rechteprofile-Datei hier ablegen oder klicken</p>
              <p className="text-text-secondary/60 text-xs mt-1">.xlsx oder .xls</p>
              <input 
                id="file-input-access" 
                type="file" 
                accept=".xlsx,.xls" 
                className="hidden" 
                onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} 
              />
            </div>
            {fileName && (
              <div className="mt-3 p-2.5 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm"><strong>✓</strong> {fileName}</p>
                <div className="flex gap-4 mt-1 text-xs">
                  <span className="text-text-secondary">
                    <strong className="text-accent">{stats.profiles}</strong> Profile
                  </span>
                  <span className="text-text-secondary">
                    <strong className="text-accent">{stats.accesses}</strong> Einträge
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Upload Card: User Data */}
          <div className="bg-surface border border-subtle rounded-lg p-4 flex-1">
            <h2 className="font-semibold mb-3 flex items-center gap-2" style={{ color: '#ce93d8' }}>
              <span className="w-1 h-5 rounded-sm" style={{ background: '#ce93d8' }}></span>
              Benutzerdaten laden
            </h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOverUser(true) }}
              onDragLeave={() => setIsDragOverUser(false)}
              onDrop={handleUserDrop}
              onClick={() => document.getElementById('file-input-user')?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                userFileName ? 'border-green-500/50 bg-green-500/5' :
                isDragOverUser ? 'border-purple-400 bg-purple-400/10' : 'border-subtle hover:border-purple-400/50'
              }`}
            >
              <p className="text-text-secondary text-sm">Benutzerdaten-Datei hier ablegen oder klicken</p>
              <p className="text-text-secondary/60 text-xs mt-1">.xlsx oder .xls</p>
              <input 
                id="file-input-user" 
                type="file" 
                accept=".xlsx,.xls" 
                className="hidden" 
                onChange={(e) => e.target.files?.[0] && void handleUserFile(e.target.files[0])} 
              />
            </div>
            {userFileName && (
              <div className="mt-3 p-2.5 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-400 text-sm"><strong>✓</strong> {userFileName}</p>
                <div className="flex gap-4 mt-1 text-xs">
                  <span className="text-text-secondary">
                    <strong style={{ color: '#ce93d8' }}>{userStats.users}</strong> Benutzer geladen
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Search Card */}
        <div className="bg-surface border border-subtle rounded-lg p-4">
          <h2 className="text-accent font-semibold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-accent rounded-sm"></span>
            Abteilung suchen
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setColumnFilters([])
                setSorting([])
                setSelectedProfile(null)
              }}
              disabled={!fileName}
              placeholder="Abteilungsbezeichnung eingeben (z.B. A*, AB?, *XY)"
              className="flex-1 px-4 py-2.5 bg-base border border-subtle rounded-lg focus:border-accent focus:outline-none disabled:opacity-50 text-text-primary"
            />
            <button
              disabled={!fileName}
              className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Suchen
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            ⚠️ <span className="text-orange-400 font-semibold">Case-Sensitive</span> – Groß-/Kleinschreibung wird beachtet!
          </p>
        </div>

        {/* Results + User Panel Layout */}
        {searchQuery && (
          <div className={`flex gap-4 ${showUserPanel ? 'flex-col lg:flex-row' : ''}`}>
            {/* Results Card */}
            <div className={`bg-surface border border-subtle rounded-lg p-4 ${showUserPanel ? 'flex-1 min-w-0' : 'w-full'}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-accent font-semibold flex items-center gap-2">
                  <span className="w-1 h-5 bg-accent rounded-sm"></span>
                  Suchergebnisse
                </h2>
                <div className="flex items-center gap-3">
                  {userFileName && selectedProfile && (
                    <span className="text-xs text-text-secondary italic">
                      Zeile anklicken → Benutzer anzeigen
                    </span>
                  )}
                  <span className="bg-accent text-white px-3 py-1 rounded-full text-sm font-medium">
                    {table.getFilteredRowModel().rows.length} Treffer
                  </span>
                </div>
              </div>

              {searchResults.length === 0 ? (
                <div className="text-center py-10 text-text-secondary">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="text-lg">Keine Zugriffsrechte gefunden für "{searchQuery}"</p>
                </div>
              ) : (
                <>
                  {/* Multi-Select Filters */}
                  <div className="flex gap-3 mb-4 flex-wrap">
                    <div className="min-w-[200px] flex-1">
                      <label className="text-xs text-text-secondary mb-1 block">Rechteprofil</label>
                      <Select
                        isMulti
                        options={uniqueValues.profiles}
                        value={getFilterValue('profile')}
                        onChange={(selected) => handleFilterChange('profile', selected)}
                        placeholder="Alle Profile"
                        styles={selectStyles}
                        isClearable
                        closeMenuOnSelect={false}
                      />
                    </div>
                    <div className="min-w-[200px] flex-1">
                      <label className="text-xs text-text-secondary mb-1 block">Abteilung</label>
                      <Select
                        isMulti
                        options={uniqueValues.departments}
                        value={getFilterValue('department')}
                        onChange={(selected) => handleFilterChange('department', selected)}
                        placeholder="Alle Abteilungen"
                        styles={selectStyles}
                        isClearable
                        closeMenuOnSelect={false}
                      />
                    </div>
                    <div className="min-w-[200px] flex-1">
                      <label className="text-xs text-text-secondary mb-1 block">Zugriffsart</label>
                      <Select
                        isMulti
                        options={uniqueValues.accessTypes}
                        value={getFilterValue('accessType')}
                        onChange={(selected) => handleFilterChange('accessType', selected)}
                        placeholder="Alle Zugriffsarten"
                        styles={selectStyles}
                        isClearable
                        closeMenuOnSelect={false}
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-lg border border-subtle">
                    <table className="w-full text-sm">
                      <thead className="bg-accent/10 border-b-2 border-accent">
                        {table.getHeaderGroups().map(headerGroup => (
                          <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                              <th 
                                key={header.id}
                                className="text-left px-4 py-3 text-accent font-semibold cursor-pointer select-none hover:bg-accent/20"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                <div className="flex items-center gap-2">
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                  <span className="text-xs">
                                    {{
                                      asc: '↑',
                                      desc: '↓',
                                    }[header.column.getIsSorted() as string] ?? '↕'}
                                  </span>
                                </div>
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody className="divide-y divide-subtle">
                        {table.getRowModel().rows.map(row => {
                          const profile = row.original.profile
                          const isSelected = selectedProfile === profile
                          return (
                            <tr 
                              key={row.id} 
                              className={`cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'bg-purple-500/15 hover:bg-purple-500/20' 
                                  : 'hover:bg-surface-hover'
                              }`}
                              onClick={() => {
                                if (userFileName) {
                                  setSelectedProfile(isSelected ? null : profile)
                                }
                              }}
                            >
                              {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="px-4 py-2.5">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Hint when user data is loaded but nothing selected */}
                  {userFileName && !selectedProfile && (
                    <p className="text-xs text-text-secondary/60 mt-2 text-center italic">
                      Klicke auf eine Zeile, um die zugeordneten Benutzer anzuzeigen
                    </p>
                  )}

                  {/* Pagination */}
                  <div className="flex items-center justify-between mt-4 text-sm text-text-secondary">
                    <div className="flex items-center gap-2">
                      <span>Zeilen pro Seite:</span>
                      <select
                        value={table.getState().pagination.pageSize}
                        onChange={e => table.setPageSize(Number(e.target.value))}
                        className="px-2 py-1 bg-base border border-subtle rounded focus:border-accent focus:outline-none"
                      >
                        {[25, 50, 100, 200].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>
                        Seite {table.getState().pagination.pageIndex + 1} von {table.getPageCount()}
                      </span>
                      <button
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="px-3 py-1 bg-accent/20 rounded hover:bg-accent/40 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ←
                      </button>
                      <button
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="px-3 py-1 bg-accent/20 rounded hover:bg-accent/40 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Panel – only visible when user data loaded AND a row is selected */}
            {showUserPanel && (
              <div className="bg-surface border border-subtle rounded-lg p-4 lg:w-[340px] flex-shrink-0">
                <h2 className="font-semibold mb-3 flex items-center gap-2" style={{ color: '#ce93d8' }}>
                  <span className="w-1 h-5 rounded-sm" style={{ background: '#ce93d8' }}></span>
                  Zugeordnete Benutzer
                </h2>
                <div className="mb-3 p-2.5 rounded-lg border" style={{ borderColor: 'rgba(206,147,216,0.3)', background: 'rgba(206,147,216,0.08)' }}>
                  <p className="text-xs text-text-secondary">Profil:</p>
                  <p className="font-semibold text-sm" style={{ color: '#ce93d8' }}>{selectedProfile}</p>
                </div>

                {matchedUsers.length === 0 ? (
                  <div className="text-center py-6 text-text-secondary">
                    <div className="text-2xl mb-2">👤</div>
                    <p className="text-sm">Keine Benutzer mit diesem Profil gefunden</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-text-secondary">{matchedUsers.length} Benutzer gefunden</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto rounded-lg border border-subtle">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0" style={{ background: 'rgba(206,147,216,0.1)' }}>
                          <tr className="border-b-2" style={{ borderColor: 'rgba(206,147,216,0.4)' }}>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: '#ce93d8' }}>Pers.-Nr.</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: '#ce93d8' }}>Name</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: '#ce93d8' }}>Abteilung</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: '#ce93d8' }}>Profil</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                          {matchedUsers.map((user, idx) => (
                            <tr key={idx} className="hover:bg-surface-hover">
                              <td className="px-3 py-2 font-mono">{user.persNr}</td>
                              <td className="px-3 py-2">{user.name}</td>
                              <td className="px-3 py-2">{user.abteilung}</td>
                              <td className="px-3 py-2">
                                <code className="bg-base px-1.5 py-0.5 rounded text-[10px]">{user.benutzerprofil}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
