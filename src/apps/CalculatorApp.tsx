import { useState, useEffect } from 'react'

// Safe math parser - no eval/Function
function tokenize(expr: string): (string | number)[] {
  const tokens: (string | number)[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) { i++; continue }
    if ('+-*/()'.includes(c)) { tokens.push(c); i++; continue }
    // Number or time (hh:mm)
    let num = ''
    while (i < expr.length && /[\d.:]/.test(expr[i])) { num += expr[i]; i++ }
    if (num) {
      if (num.includes(':')) {
        const [h, m] = num.split(':').map(Number)
        tokens.push(h + m / 60)
      } else {
        tokens.push(parseFloat(num))
      }
    }
  }
  return tokens
}

function parseExpr(tokens: (string | number)[], pos: { i: number }): number {
  let left = parseTerm(tokens, pos)
  while (pos.i < tokens.length && (tokens[pos.i] === '+' || tokens[pos.i] === '-')) {
    const op = tokens[pos.i++]
    const right = parseTerm(tokens, pos)
    left = op === '+' ? left + right : left - right
  }
  return left
}

function parseTerm(tokens: (string | number)[], pos: { i: number }): number {
  let left = parseFactor(tokens, pos)
  while (pos.i < tokens.length && (tokens[pos.i] === '*' || tokens[pos.i] === '/')) {
    const op = tokens[pos.i++]
    const right = parseFactor(tokens, pos)
    left = op === '*' ? left * right : left / right
  }
  return left
}

function parseFactor(tokens: (string | number)[], pos: { i: number }): number {
  if (tokens[pos.i] === '(') {
    pos.i++ // skip (
    const result = parseExpr(tokens, pos)
    pos.i++ // skip )
    return result
  }
  if (tokens[pos.i] === '-') {
    pos.i++
    return -parseFactor(tokens, pos)
  }
  return tokens[pos.i++] as number
}

function safeEvaluate(expr: string): number {
  const tokens = tokenize(expr)
  if (tokens.length === 0) throw new Error('Leere Eingabe')
  return parseExpr(tokens, { i: 0 })
}

export function CalculatorApp() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<{value: string; isRounded: boolean; delta: string} | null>(null)
  const [history, setHistory] = useState<string[]>(() => {
    const s = localStorage.getItem('calc_history'); return s ? JSON.parse(s) : []
  })

  useEffect(() => { localStorage.setItem('calc_history', JSON.stringify(history)) }, [history])

  const formatTime = (hours: number): {hhmm: string; isRounded: boolean; delta: string} => {
    const totalMinutes = Math.round(hours * 60)
    const h = Math.floor(Math.abs(totalMinutes) / 60)
    const m = Math.abs(totalMinutes) % 60
    const sign = hours < 0 ? '-' : ''
    const exact = hours * 60
    const isRounded = Math.abs(exact - totalMinutes) > 0.0001
    const delta = isRounded ? (exact - totalMinutes) / 60 : 0
    return { hhmm: `${sign}${h}:${m.toString().padStart(2, '0')}`, isRounded, delta: delta.toFixed(4) + 'h' }
  }

  const calculate = () => {
    try {
      const evaluated = safeEvaluate(input)
      const formatted = formatTime(evaluated)
      setResult({ value: formatted.hhmm, isRounded: formatted.isRounded, delta: formatted.delta })
      setHistory([`${input} = ${formatted.hhmm}`, ...history.slice(0, 9)])
    } catch (e) {
      setResult({ value: 'Fehler: ' + (e as Error).message, isRounded: false, delta: '' })
    }
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Stunden/Minuten-Rechner</h2>
        <p className="text-sm text-text-secondary mb-4">Eingabe: hh:mm oder Dezimalstunden. Operatoren: + - * / ()</p>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && calculate()}
            placeholder="z.B. 2036/261 oder 8:30 + 1:45"
            className="flex-1 px-4 py-3 bg-surface border border-subtle rounded-lg font-mono text-lg focus:border-accent focus:outline-none" />
          <button onClick={calculate} className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover font-semibold">=</button>
        </div>
      </div>
      {result && (
        <div className={`p-4 rounded-lg mb-4 ${result.isRounded ? 'bg-red-500/10 border border-red-500' : 'bg-green-500/10 border border-green-500'}`}>
          <div className={`text-3xl font-mono font-bold ${result.isRounded ? 'text-red-500' : 'text-green-500'}`}>{result.value}</div>
          {result.isRounded && <div className="text-sm text-red-500 mt-1">Delta: {result.delta}</div>}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <h3 className="text-sm font-semibold text-text-secondary mb-2">Verlauf</h3>
        <div className="space-y-1">
          {history.map((h, i) => <div key={i} className="text-sm font-mono text-text-secondary">{h}</div>)}
        </div>
      </div>
    </div>
  )
}
