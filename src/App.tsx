import { useState, useEffect, useCallback } from 'react'
import './index.css'
import { TodoApp } from './apps/TodoApp'
import { NotepadApp } from './apps/NotepadApp'
import { CalculatorApp } from './apps/CalculatorApp'
import { HolidayApp } from './apps/HolidayApp'
import { SickdaysApp } from './apps/SickdaysApp'

// Icons
const Icons = {
  Todo: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  Notepad: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  Calculator: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h2M14 14h2M8 18h2M14 18h2"/></svg>,
  Calendar: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  Medical: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M12 6v12M6 12h12"/><circle cx="12" cy="12" r="10"/></svg>,
  Close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Menu: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Sun: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  Moon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
}

const APPS = [
  { id: 'todo', name: 'ToDoList', icon: Icons.Todo },
  { id: 'notepad', name: 'Notepad', icon: Icons.Notepad },
  { id: 'calculator', name: 'Stundenrechner', icon: Icons.Calculator },
  { id: 'holidays', name: 'Feiertagsrechner', icon: Icons.Calendar },
  { id: 'sickdays', name: 'Dauerkrank-Rechner', icon: Icons.Medical },
]

interface Tab { id: string; appId: string; title: string }

function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [dragTabId, setDragTabId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const openApp = useCallback((appId: string) => {
    const app = APPS.find(a => a.id === appId)
    if (!app) return
    const newTab: Tab = { id: Date.now().toString(), appId, title: app.name }
    setTabs(t => [...t, newTab])
    setActiveTabId(newTab.id)
    setShowMenu(false)
    setSearch('')
  }, [])

  const closeTab = (id: string) => {
    setTabs(t => {
      const newTabs = t.filter(tab => tab.id !== id)
      if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1]?.id || null)
      return newTabs
    })
  }

  const handleTabDragStart = (id: string) => setDragTabId(id)
  const handleTabDrop = (targetId: string) => {
    if (!dragTabId || dragTabId === targetId) return
    setTabs(t => {
      const newTabs = [...t]
      const dragIdx = newTabs.findIndex(tab => tab.id === dragTabId)
      const targetIdx = newTabs.findIndex(tab => tab.id === targetId)
      const [item] = newTabs.splice(dragIdx, 1)
      newTabs.splice(targetIdx, 0, item)
      return newTabs
    })
    setDragTabId(null)
  }

  const fuzzyMatch = (query: string, text: string) => {
    query = query.toLowerCase()
    text = text.toLowerCase()
    let qi = 0
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++
    }
    return qi === query.length
  }

  const filteredApps = APPS.filter(app => fuzzyMatch(search, app.name))

  const renderApp = (appId: string) => {
    switch (appId) {
      case 'todo': return <TodoApp />
      case 'notepad': return <NotepadApp />
      case 'calculator': return <CalculatorApp />
      case 'holidays': return <HolidayApp />
      case 'sickdays': return <SickdaysApp />
      default: return null
    }
  }

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div className="h-full flex flex-col bg-base text-text-primary">
      {/* Header */}
      <div className="flex items-center h-12 bg-surface border-b border-subtle px-2 gap-2">
        <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-surface-hover rounded-md" title="Apps">
          <Icons.Menu />
        </button>
        {/* Tabs */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <div key={tab.id} draggable onDragStart={() => handleTabDragStart(tab.id)} onDragOver={e => e.preventDefault()} onDrop={() => handleTabDrop(tab.id)}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer max-w-[200px] ${activeTabId === tab.id ? 'bg-base border border-subtle' : 'hover:bg-surface-hover'}`}>
              {APPS.find(a => a.id === tab.appId)?.icon()}
              <span className="truncate text-sm">{tab.title}</span>
              <button onClick={e => {e.stopPropagation(); closeTab(tab.id)}} className="ml-1 hover:text-red-500"><Icons.Close /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setDark(!dark)} className="p-2 hover:bg-surface-hover rounded-md" title={dark ? 'Hell' : 'Dunkel'}>
          {dark ? <Icons.Sun /> : <Icons.Moon />}
        </button>
      </div>

      {/* Menu Overlay */}
      {showMenu && (
        <div className="absolute inset-0 z-50 bg-base/90 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowMenu(false)}>
          <div className="bg-surface border border-subtle rounded-xl p-6 w-[500px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <div className="relative mb-4">
              <input value={search} onChange={e => setSearch(e.target.value)} autoFocus placeholder="App suchen..."
                className="w-full pl-10 pr-4 py-3 bg-base border border-subtle rounded-lg focus:border-accent focus:outline-none" />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"><Icons.Search /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredApps.map(app => (
                <button key={app.id} onClick={() => openApp(app.id)}
                  className="flex flex-col items-center gap-2 p-4 bg-base border border-subtle rounded-lg hover:border-active hover:bg-surface-hover transition-colors">
                  <div className="w-12 h-12 flex items-center justify-center bg-accent/10 text-accent rounded-lg">
                    <app.icon />
                  </div>
                  <span className="text-sm font-medium">{app.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? renderApp(activeTab.appId) : (
          <div className="h-full flex items-center justify-center text-text-secondary">
            <div className="text-center">
              <p className="text-lg mb-4">Willkommen</p>
              <button onClick={() => setShowMenu(true)} className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover">
                Apps oeffnen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
