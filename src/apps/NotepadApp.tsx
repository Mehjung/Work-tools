import { useState, useEffect, useRef } from 'react'

const Icons = {
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>,
  Close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>,
}

interface NoteTab { id: string; name: string; content: string; cursorPos: number }

export function NotepadApp() {
  const [tabs, setTabs] = useState<NoteTab[]>(() => {
    const s = localStorage.getItem('notepad'); return s ? JSON.parse(s) : [{id: '1', name: 'Unbenannt.txt', content: '', cursorPos: 0}]
  })
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '1')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { localStorage.setItem('notepad', JSON.stringify(tabs)) }, [tabs])
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTab)
    if (textareaRef.current && tab) {
      textareaRef.current.setSelectionRange(tab.cursorPos, tab.cursorPos)
      textareaRef.current.focus()
    }
  }, [activeTab])

  const updateContent = (content: string) => {
    const cursorPos = textareaRef.current?.selectionStart || 0
    setTabs(tabs.map(t => t.id === activeTab ? {...t, content, cursorPos} : t))
  }
  const addTab = () => {
    const newTab = {id: Date.now().toString(), name: 'Unbenannt.txt', content: '', cursorPos: 0}
    setTabs([...tabs, newTab]); setActiveTab(newTab.id)
  }
  const closeTab = (id: string) => {
    if (tabs.length === 1) return
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    if (activeTab === id) setActiveTab(newTabs[0].id)
  }
  const renameTab = (id: string, name: string) => setTabs(tabs.map(t => t.id === id ? {...t, name} : t))

  const exportTxt = () => {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return
    const blob = new Blob([tab.content], {type: 'text/plain'})
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = tab.name; a.click()
  }
  const importTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const newTab = {id: Date.now().toString(), name: file.name, content: reader.result as string, cursorPos: 0}
      setTabs([...tabs, newTab]); setActiveTab(newTab.id)
    }
    reader.readAsText(file)
  }
  const exportPdf = async () => {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(`<html><head><title>${tab.name}</title><style>body{font-family:monospace;white-space:pre-wrap;padding:40px;}</style></head><body>${tab.content.replace(/</g,'&lt;')}</body></html>`)
      win.document.close(); win.print()
    }
  }

  const currentTab = tabs.find(t => t.id === activeTab)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center border-b border-subtle bg-surface">
        <div className="flex-1 flex overflow-x-auto">
          {tabs.map(t => (
            <div key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-subtle ${activeTab === t.id ? 'bg-base' : 'hover:bg-surface-hover'}`}>
              <input value={t.name} onChange={e => renameTab(t.id, e.target.value)} onClick={e => e.stopPropagation()}
                className="bg-transparent w-32 focus:outline-none text-sm" />
              {tabs.length > 1 && <button onClick={e => {e.stopPropagation(); closeTab(t.id)}} className="text-text-secondary hover:text-red-500"><Icons.Close /></button>}
            </div>
          ))}
          <button onClick={addTab} className="px-3 py-2 text-text-secondary hover:text-text-primary"><Icons.Plus /></button>
        </div>
        <div className="flex gap-2 px-3">
          <label className="px-2 py-1 text-xs bg-accent/20 text-accent rounded cursor-pointer hover:bg-accent/30">
            Importieren <input type="file" accept=".txt" onChange={importTxt} className="hidden" />
          </label>
          <button onClick={exportTxt} className="px-2 py-1 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30">TXT Export</button>
          <button onClick={exportPdf} className="px-2 py-1 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30">PDF Drucken</button>
        </div>
      </div>
      <textarea ref={textareaRef} value={currentTab?.content || ''} onChange={e => updateContent(e.target.value)}
        spellCheck="true" lang="de"
        className="flex-1 p-4 bg-base resize-none focus:outline-none font-mono text-sm leading-relaxed"
        placeholder="Schreiben Sie hier..." />
    </div>
  )
}
