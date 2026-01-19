import { useState, useEffect } from 'react'

const Icons = {
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M20 6L9 17l-5-5"/></svg>,
  Repeat: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
}

interface TodoItem {
  id: string; text: string; done: boolean; priority: 1|2|3|4; 
  dueDate?: string; project?: string; labels: string[]; 
  subtasks: {id:string;text:string;done:boolean}[];
  recurring?: 'daily'|'weekly'|'monthly'|'yearly';
  lastCompleted?: string;
}

export function TodoApp() {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    const s = localStorage.getItem('todos'); return s ? JSON.parse(s) : []
  })
  const [input, setInput] = useState('')
  const [priority, setPriority] = useState<1|2|3|4>(4)
  const [project, setProject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recurring, setRecurring] = useState<''|'daily'|'weekly'|'monthly'|'yearly'>('')
  const [dragId, setDragId] = useState<string|null>(null)

  useEffect(() => { localStorage.setItem('todos', JSON.stringify(todos)) }, [todos])

  // Check recurring tasks on load
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setTodos(prev => prev.map(t => {
      if (!t.recurring || !t.done || !t.lastCompleted) return t
      const last = new Date(t.lastCompleted)
      const now = new Date()
      let shouldReset = false
      switch (t.recurring) {
        case 'daily': shouldReset = now.getDate() !== last.getDate() || now.getMonth() !== last.getMonth(); break
        case 'weekly': shouldReset = (now.getTime() - last.getTime()) >= 7 * 24 * 60 * 60 * 1000; break
        case 'monthly': shouldReset = now.getMonth() !== last.getMonth(); break
        case 'yearly': shouldReset = now.getFullYear() !== last.getFullYear(); break
      }
      return shouldReset ? {...t, done: false} : t
    }))
  }, [])

  const addTodo = () => {
    if (!input.trim()) return
    const labels = input.match(/@\w+/g)?.map(l => l.slice(1)) || []
    const text = input.replace(/@\w+/g, '').trim()
    setTodos([...todos, { 
      id: Date.now().toString(), text, done: false, priority, project, dueDate, labels, subtasks: [],
      recurring: recurring || undefined
    }])
    setInput(''); setPriority(4); setProject(''); setDueDate(''); setRecurring('')
  }

  const toggle = (id: string) => {
    setTodos(todos.map(t => {
      if (t.id !== id) return t
      const newDone = !t.done
      return {...t, done: newDone, lastCompleted: newDone ? new Date().toISOString() : t.lastCompleted}
    }))
  }
  const remove = (id: string) => setTodos(todos.filter(t => t.id !== id))
  const addSubtask = (id: string, text: string) => {
    if (!text.trim()) return
    setTodos(todos.map(t => t.id === id ? {...t, subtasks: [...t.subtasks, {id: Date.now().toString(), text, done: false}]} : t))
  }
  const toggleSubtask = (todoId: string, subId: string) => {
    setTodos(todos.map(t => t.id === todoId ? {...t, subtasks: t.subtasks.map(s => s.id === subId ? {...s, done: !s.done} : s)} : t))
  }

  const handleDragStart = (id: string) => setDragId(id)
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const newTodos = [...todos]
    const dragIdx = newTodos.findIndex(t => t.id === dragId)
    const targetIdx = newTodos.findIndex(t => t.id === targetId)
    const [item] = newTodos.splice(dragIdx, 1)
    newTodos.splice(targetIdx, 0, item)
    setTodos(newTodos)
    setDragId(null)
  }

  const priorityColors = { 1: 'text-red-500', 2: 'text-orange-500', 3: 'text-blue-500', 4: 'text-gray-500' }
  const projects = [...new Set(todos.map(t => t.project).filter(Boolean))]
  const recurringLabels = { daily: 'Taeglich', weekly: 'Woechentlich', monthly: 'Monatlich', yearly: 'Jaehrlich' }

  return (
    <div className="h-full flex flex-col p-4 overflow-auto">
      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Neue Aufgabe... (@label fuer Labels)"
          className="flex-1 min-w-[200px] px-3 py-2 bg-surface border border-subtle rounded-md focus:border-accent focus:outline-none" />
        <select value={priority} onChange={e => setPriority(Number(e.target.value) as 1|2|3|4)}
          className="px-2 py-2 bg-surface border border-subtle rounded-md">
          <option value={1}>P1</option><option value={2}>P2</option><option value={3}>P3</option><option value={4}>P4</option>
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="px-2 py-2 bg-surface border border-subtle rounded-md" />
        <select value={recurring} onChange={e => setRecurring(e.target.value as any)}
          className="px-2 py-2 bg-surface border border-subtle rounded-md">
          <option value="">Einmalig</option>
          <option value="daily">Taeglich</option>
          <option value="weekly">Woechentlich</option>
          <option value="monthly">Monatlich</option>
          <option value="yearly">Jaehrlich</option>
        </select>
        <input value={project} onChange={e => setProject(e.target.value)} placeholder="Projekt"
          className="w-28 px-2 py-2 bg-surface border border-subtle rounded-md" list="projects" />
        <datalist id="projects">{projects.map(p => <option key={p} value={p}/>)}</datalist>
        <button onClick={addTodo} className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover flex items-center gap-1">
          <Icons.Plus /> Hinzufuegen
        </button>
      </div>
      <div className="flex-1 space-y-2">
        {todos.map(t => (
          <div key={t.id} draggable onDragStart={() => handleDragStart(t.id)} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(t.id)}
            className="p-3 bg-surface border border-subtle rounded-lg cursor-move hover:border-active">
            <div className="flex items-start gap-3">
              <button onClick={() => toggle(t.id)} className={`mt-1 w-5 h-5 rounded border flex items-center justify-center ${t.done ? 'bg-accent border-accent' : 'border-subtle'}`}>
                {t.done && <Icons.Check />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${priorityColors[t.priority]} ${t.done ? 'line-through opacity-50' : ''}`}>P{t.priority}</span>
                  <span className={t.done ? 'line-through opacity-50' : ''}>{t.text}</span>
                  {t.recurring && (
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">
                      <Icons.Repeat /> {recurringLabels[t.recurring]}
                    </span>
                  )}
                  {t.labels.map(l => <span key={l} className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded-full">{l}</span>)}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-text-secondary">
                  {t.project && <span>Projekt: {t.project}</span>}
                  {t.dueDate && <span>Faellig: {new Date(t.dueDate).toLocaleDateString('de-DE')}</span>}
                </div>
                {t.subtasks.length > 0 && (
                  <div className="mt-2 pl-4 space-y-1">
                    {t.subtasks.map(s => (
                      <div key={s.id} className="flex items-center gap-2">
                        <button onClick={() => toggleSubtask(t.id, s.id)} className={`w-4 h-4 rounded border flex items-center justify-center ${s.done ? 'bg-accent border-accent' : 'border-subtle'}`}>
                          {s.done && <Icons.Check />}
                        </button>
                        <span className={s.done ? 'line-through opacity-50 text-sm' : 'text-sm'}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <input placeholder="Unteraufgabe hinzufuegen..." onKeyDown={e => { if (e.key === 'Enter') { addSubtask(t.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' }}}
                  className="mt-2 w-full text-sm px-2 py-1 bg-transparent border-b border-subtle focus:border-accent focus:outline-none" />
              </div>
              <button onClick={() => remove(t.id)} className="text-text-secondary hover:text-red-500"><Icons.Trash /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
