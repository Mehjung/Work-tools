import { useState, useEffect, useCallback } from 'react'

// Core-Logik Import - passe den Pfad an dein Projekt an
// In Next.js: import { calculate, validateAndAutocorrect, type ValidationResult } from '@/lib/calculator-core'
// Oder kopiere die Funktionen direkt in diese Datei

// ============================================================================
// CORE TYPES (von calculator-core.ts)
// ============================================================================

interface ValidationResult {
  isValid: boolean
  error?: string
  sanitized: string
  autocorrections: string[]
}

interface CalculationResult {
  value: number
  formatted: string
  isRounded: boolean
  delta: string
  input: string
}

// ============================================================================
// CORE FUNKTIONEN (von calculator-core.ts)
// ============================================================================

const ALLOWED_CHARS = /^[\d+\-*/().:,\s]+$/
const OPERATORS = ['+', '-', '*', '/']

function validateAndAutocorrect(input: string): ValidationResult {
  const corrections: string[] = []
  let sanitized = input.trim()

  if (!sanitized) {
    return { isValid: false, error: 'Leere Eingabe', sanitized: '', autocorrections: [] }
  }

  if (!ALLOWED_CHARS.test(sanitized)) {
    const invalidChars = sanitized.match(/[^\d+\-*/().:,\s]/g) || []
    const uniqueInvalid = [...new Set(invalidChars)]
    corrections.push('Ungültige Zeichen entfernt: ' + uniqueInvalid.join(', '))
    sanitized = sanitized.replace(/[^\d+\-*/().:,\s]/g, '')
  }

  // Mehrfache Trennzeichen reduzieren (Fallback falls durch Paste etc.)
  if (/[.,:]{2,}/.test(sanitized)) {
    sanitized = sanitized.replace(/[.,:]+/g, ':')
    corrections.push('Mehrfache Trennzeichen korrigiert')
  }
  
  // Trennzeichen am Anfang oder Ende entfernen
  if (/^[.,:]+/.test(sanitized)) {
    sanitized = sanitized.replace(/^[.,:]+/, '')
    corrections.push('Trennzeichen am Anfang entfernt')
  }
  if (/[.,:]+$/.test(sanitized)) {
    sanitized = sanitized.replace(/[.,:]+$/, '')
    corrections.push('Trennzeichen am Ende entfernt')
  }
  
  // Trennzeichen ohne Zahl davor/danach entfernen
  sanitized = sanitized.replace(/([+\-*/(])[.,:]+/g, '$1')
  sanitized = sanitized.replace(/[.,:]+([+\-*/)])/g, '$1')
  
  // Wenn nach Bereinigung leer
  if (!sanitized.trim()) {
    return { isValid: false, error: 'Keine gültige Eingabe', sanitized: '', autocorrections: corrections }
  }

  if (sanitized.includes(',') || sanitized.includes('.')) {
    let changed = false
    
    // Erst: Zu viele Ziffern nach Trennzeichen erkennen (3+)
    if (/\d[.,]\d{3,}/.test(sanitized)) {
      return {
        isValid: false,
        error: 'Ungültige Zeitangabe: maximal 2 Ziffern nach Trennzeichen',
        sanitized,
        autocorrections: corrections
      }
    }
    
    // Einstellige Minuten: 2.3 -> 2:30
    sanitized = sanitized.replace(/(\d)[.,](\d)(?!\d)/g, (_, h, m) => {
      changed = true
      return h + ':' + m + '0'
    })
    
    // Zweistellige Minuten: 2.33 -> 2:33
    sanitized = sanitized.replace(/(\d)[.,](\d{2})/g, (_, h, m) => {
      changed = true
      return h + ':' + m
    })
    
    if (changed) {
      corrections.push('Zeitformat normalisiert')
    }
  }
  
  // 4. Minuten validieren (0-59)
  const timeMatches = sanitized.match(/\d+:(\d{2})/g)
  if (timeMatches) {
    for (const time of timeMatches) {
      const minutes = parseInt(time.split(':')[1], 10)
      if (minutes > 59) {
        return {
          isValid: false,
          error: 'Ungültige Minuten: ' + minutes + ' (max 59)',
          sanitized,
          autocorrections: corrections
        }
      }
    }
  }

  sanitized = sanitized.replace(/\s+/g, ' ')

  let prev = sanitized
  sanitized = autocorrectOperators(sanitized)
  if (prev !== sanitized) corrections.push('Doppelte Operatoren korrigiert')

  prev = sanitized
  sanitized = autocorrectImplicitMultiplication(sanitized)
  if (prev !== sanitized) corrections.push('Implizite Multiplikation (*)')

  prev = sanitized
  sanitized = simplifyBrackets(sanitized)
  if (prev !== sanitized) corrections.push('Klammern vereinfacht')

  // Wenn nach Bereinigung leer
  if (!sanitized.trim()) {
    return { isValid: false, error: 'Keine gültige Eingabe', sanitized: '', autocorrections: corrections }
  }

  let depth = 0
  for (let i = 0; i < sanitized.length; i++) {
    if (sanitized[i] === '(') depth++
    if (sanitized[i] === ')') depth--
    if (depth < 0) {
      return { isValid: false, error: `Schließende Klammer ohne öffnende an Position ${i + 1}`, sanitized, autocorrections: corrections }
    }
  }
  if (depth !== 0) {
    return { isValid: false, error: `${depth} öffnende Klammer(n) nicht geschlossen`, sanitized, autocorrections: corrections }
  }

  const trimmed = sanitized.trim()
  if (/^[+*/]/.test(trimmed)) {
    return { isValid: false, error: 'Ausdruck kann nicht mit Operator beginnen (außer -)', sanitized, autocorrections: corrections }
  }
  if (/[+\-*/]$/.test(trimmed)) {
    return { isValid: false, error: 'Ausdruck kann nicht mit Operator enden', sanitized, autocorrections: corrections }
  }

  return { isValid: true, sanitized, autocorrections: corrections }
}

function autocorrectOperators(expr: string): string {
  let result = expr
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < result.length - 1; i++) {
      const curr = result[i]
      const next = result[i + 1]
      // Zwei Operatoren hintereinander: ersten entfernen (letzter gewinnt)
      if (OPERATORS.includes(curr) && OPERATORS.includes(next)) {
        result = result.slice(0, i) + result.slice(i + 1)
        changed = true
        break
      }
    }
  }
  return result
}

/**
 * Vereinfacht überflüssige Klammern:
 * - (((3))) → 3
 * - ((3+2)) → 3+2
 * - () wird entfernt
 * - Unbalancierte ) am Anfang werden entfernt
 */
function simplifyBrackets(expr: string): string {
  let result = expr
  let changed = true
  
  while (changed) {
    changed = false
    const prev = result
    
    // Leere Klammern entfernen
    result = result.replace(/\(\)/g, '')
    
    // Unbalancierte ) am Anfang entfernen
    while (result.startsWith(')')) {
      result = result.slice(1)
    }
    
    // Unbalancierte ( am Ende entfernen
    while (result.endsWith('(')) {
      result = result.slice(0, -1)
    }
    
    // Überflüssige äußere Klammern um den gesamten Ausdruck entfernen
    // Aber nur wenn sie zusammengehören!
    if (result.startsWith('(') && result.endsWith(')')) {
      // Prüfen ob die Klammern zusammengehören
      let depth = 0
      let matching = true
      for (let i = 0; i < result.length - 1; i++) {
        if (result[i] === '(') depth++
        if (result[i] === ')') depth--
        if (depth === 0) {
          // Wir sind bei depth 0 bevor wir am Ende sind = Klammern gehören nicht zusammen
          matching = false
          break
        }
      }
      if (matching && depth === 1) {
        result = result.slice(1, -1)
      }
    }
    
    if (result !== prev) changed = true
  }
  
  return result
}

function autocorrectImplicitMultiplication(expr: string): string {
  let result = expr
  result = result.replace(/(\d)\s*\(/g, '$1*(')
  result = result.replace(/\)\s*\(/g, ')*(')
  result = result.replace(/\)\s*(\d)/g, ')*$1')
  return result
}

type Token = { type: 'number'; value: number } | { type: 'operator'; value: string }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) { i++; continue }
    if ('+-*/()'.includes(c)) { tokens.push({ type: 'operator', value: c }); i++; continue }
    let num = ''
    while (i < expr.length && /[\d.:]/.test(expr[i])) { num += expr[i]; i++ }
    if (num) {
      let value: number
      if (num.includes(':')) {
        const parts = num.split(':').map(Number)
        if (parts.length === 2) value = parts[0] + parts[1] / 60
        else if (parts.length === 3) value = parts[0] + parts[1] / 60 + parts[2] / 3600
        else value = NaN
      } else {
        value = parseFloat(num)
      }
      if (isNaN(value)) throw new Error('Ungültige Zahl/Zeit: "' + num + '"')
      tokens.push({ type: 'number', value })
    }
  }
  return tokens
}

class Parser {
  private tokens: Token[]
  private pos = 0
  constructor(tokens: Token[]) { this.tokens = tokens }
  parse(): number {
    if (this.tokens.length === 0) throw new Error('Leere Eingabe')
    const result = this.parseExpression()
    if (this.pos < this.tokens.length) throw new Error('Unerwartetes Token: ' + this.current()?.value)
    return result
  }
  private current(): Token | undefined { return this.tokens[this.pos] }
  private consume(): Token { return this.tokens[this.pos++] }
  private parseExpression(): number {
    let left = this.parseTerm()
    while (this.current()?.type === 'operator' && (this.current()?.value === '+' || this.current()?.value === '-')) {
      const op = this.consume().value
      const right = this.parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  private parseTerm(): number {
    let left = this.parseFactor()
    while (this.current()?.type === 'operator' && (this.current()?.value === '*' || this.current()?.value === '/')) {
      const op = this.consume().value
      const right = this.parseFactor()
      if (op === '/') {
        if (right === 0) throw new Error('Division durch Null')
        left = left / right
      } else left = left * right
    }
    return left
  }
  private parseFactor(): number {
    const token = this.current()
    if (!token) throw new Error('Unerwartetes Ende der Eingabe')
    if (token.type === 'operator' && token.value === '(') {
      this.consume()
      const result = this.parseExpression()
      if (this.current()?.value !== ')') throw new Error('Fehlende schließende Klammer')
      this.consume()
      return result
    }
    if (token.type === 'operator' && token.value === '-') { this.consume(); return -this.parseFactor() }
    if (token.type === 'operator' && token.value === '+') { this.consume(); return this.parseFactor() }
    if (token.type === 'number') { this.consume(); return token.value }
    throw new Error('Unerwartetes Token: ' + token.value)
  }
}

function formatTime(hours: number): { hhmm: string; isRounded: boolean; delta: string } {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(Math.abs(totalMinutes) / 60)
  const m = Math.abs(totalMinutes) % 60
  const sign = hours < 0 ? '-' : ''
  const exact = hours * 60
  const isRounded = Math.abs(exact - totalMinutes) > 0.0001
  const delta = isRounded ? (exact - totalMinutes) / 60 : 0
  return { hhmm: `${sign}${h}:${m.toString().padStart(2, '0')}`, isRounded, delta: delta.toFixed(4) + 'h' }
}

function calculate(input: string): CalculationResult | { error: string; autocorrections: string[] } {
  try {
    const validation = validateAndAutocorrect(input)
    if (!validation.isValid) return { error: validation.error || 'Ungültige Eingabe', autocorrections: validation.autocorrections }
    
    const tokens = tokenize(validation.sanitized)
    const value = new Parser(tokens).parse()
    
    // NaN/Infinity abfangen
    if (!isFinite(value)) {
      return { error: 'Ungültige Berechnung', autocorrections: validation.autocorrections }
    }
    
    const formatted = formatTime(value)
    return { value, formatted: formatted.hhmm, isRounded: formatted.isRounded, delta: formatted.delta, input: validation.sanitized }
  } catch (e) {
    // Fallback - sollte nie passieren
    return { error: (e as Error).message || 'Unbekannter Fehler', autocorrections: [] }
  }
}

// Für Next.js: localStorage nur im Browser
const getHistory = (): string[] => {
  if (typeof window === 'undefined') return []
  const s = localStorage.getItem('calc_history')
  return s ? JSON.parse(s) : []
}

const saveHistory = (history: string[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('calc_history', JSON.stringify(history))
  }
}

interface ResultState {
  value: string
  isRounded: boolean
  delta: string
  isError: boolean
}

export function CalculatorApp() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ResultState | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [history, setHistory] = useState<string[]>([])

  // History beim Mount laden
  useEffect(() => {
    setHistory(getHistory())
  }, [])

  // History speichern bei Änderung
  useEffect(() => {
    if (history.length > 0) {
      saveHistory(history)
    }
  }, [history])

  // Erlaubte Zeichen
  const ALLOWED_CHARS_INPUT = /^[\d+\-*/().:,\s]$/
  const SEPARATORS = /[.,:]/
  const OPERATORS_SET = ['+', '-', '*', '/']

  /**
   * Filtert die Eingabe beim Tippen wie ein echter Taschenrechner:
   * - Nur erlaubte Zeichen
   * - Keine doppelten Trennzeichen
   * - Kein Trennzeichen am Anfang
   * - Max 2 Ziffern nach Trennzeichen (6,33 OK, 6,333 NICHT)
   * - Minuten max 59
   * - ) nur wenn es eine offene ( gibt
   * - Keine ungültigen Operator-Kombinationen am Anfang
   */
  const filterInput = (newValue: string, oldValue: string): string => {
    let result = ''
    let openBrackets = 0  // Zählt offene Klammern
    
    for (let i = 0; i < newValue.length; i++) {
      const char = newValue[i]
      const lastChar = result[result.length - 1]
      const isAtStart = result.length === 0
      
      // Nur erlaubte Zeichen
      if (!ALLOWED_CHARS_INPUT.test(char)) continue
      
      // === ZIFFERN-REGELN ===
      if (/\d/.test(char)) {
        // Implizite Multiplikation: )5 wird zu )*5
        if (lastChar === ')') {
          result += '*'
        }
        
        // Prüfen: Wie viele Ziffern sind bereits nach dem letzten Trennzeichen?
        const lastSepIndex = Math.max(
          result.lastIndexOf('.'),
          result.lastIndexOf(','),
          result.lastIndexOf(':')
        )
        
        if (lastSepIndex !== -1) {
          const afterSep = result.slice(lastSepIndex + 1)
          
          // Prüfen ob nach dem Trennzeichen nur Ziffern kommen (kein Operator dazwischen)
          if (/^\d*$/.test(afterSep)) {
            const digitCount = afterSep.length
            
            // Schon 2 Ziffern nach Trennzeichen - keine weitere erlaubt
            if (digitCount >= 2) {
              continue
            }
            
            // Erste Ziffer nach Trennzeichen = Zehnerstelle der Minuten
            // Nur 0-5 erlaubt (weil 60, 70, 80, 90 > 59)
            if (digitCount === 0) {
              const digit = parseInt(char, 10)
              if (digit > 5) {
                continue
              }
            }
            
            // Zweite Ziffer: Prüfen ob Gesamtminuten > 59
            if (digitCount === 1) {
              const potentialMinutes = parseInt(afterSep + char, 10)
              if (potentialMinutes > 59) {
                continue
              }
            }
          }
        }
      }
      
      // === TRENNZEICHEN-REGELN ===
      if (SEPARATORS.test(char)) {
        // Nicht am Anfang
        if (isAtStart) continue
        // Nicht nach Operator oder (
        if (lastChar && (OPERATORS_SET.includes(lastChar) || lastChar === '(')) continue
        // Keine doppelten Trennzeichen
        if (lastChar && SEPARATORS.test(lastChar)) continue
      }
      
      // === KLAMMER-REGELN ===
      if (char === '(') {
        // ( nach Zahl = implizite Multiplikation: füge * ein
        if (lastChar && /\d/.test(lastChar)) {
          result += '*'
        }
        // ( nach ) = implizite Multiplikation: füge * ein
        if (lastChar === ')') {
          result += '*'
        }
        openBrackets++
      }
      
      if (char === ')') {
        // ) nur wenn es offene Klammern gibt
        if (openBrackets <= 0) continue
        // ) nicht direkt nach ( 
        if (lastChar === '(') continue
        // ) nicht direkt nach Operator
        if (lastChar && OPERATORS_SET.includes(lastChar)) continue
        openBrackets--
      }
      
      // === OPERATOR-REGELN ===
      if (OPERATORS_SET.includes(char)) {
        // Am Anfang nur - erlaubt (negatives Vorzeichen)
        if (isAtStart && char !== '-') continue
        
        // Nach ( nur - erlaubt (Vorzeichen)
        if (lastChar === '(' && char !== '-') continue
        
        // Nach Operator: IMMER ersetzen (letzter gewinnt, kein +- sichtbar)
        if (lastChar && OPERATORS_SET.includes(lastChar)) {
          result = result.slice(0, -1)
        }
      }
      
      result += char
    }
    
    return result
  }

  // Live-Validierung bei Eingabe MIT Filterung
  const handleInputChange = useCallback((newValue: string, oldValue: string) => {
    const filtered = filterInput(newValue, oldValue)
    setInput(filtered)
    
    if (filtered.trim()) {
      const v = validateAndAutocorrect(filtered)
      setValidation(v)
    } else {
      setValidation(null)
    }
    
    // Ergebnis zurücksetzen wenn Eingabe geändert wird
    setResult(null)
  }, [])

  const doCalculate = useCallback(() => {
    if (!input.trim()) return
    
    const calcResult = calculate(input)
    
    if ('error' in calcResult) {
      setResult({ 
        value: `Fehler: ${calcResult.error}`, 
        isRounded: false, 
        delta: '',
        isError: true
      })
    } else {
      setResult({ 
        value: calcResult.formatted, 
        isRounded: calcResult.isRounded, 
        delta: calcResult.delta,
        isError: false
      })
      setHistory(prev => [
        `${calcResult.input} = ${calcResult.formatted}`, 
        ...prev.slice(0, 9)
      ])
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      doCalculate()
    }
  }

  const insertFromHistory = (entry: string) => {
    const expr = entry.split(' = ')[0]
    handleInputChange(expr, input)
  }

  const clearHistory = () => {
    setHistory([])
    if (typeof window !== 'undefined') {
      localStorage.removeItem('calc_history')
    }
  }

  // Status-Farben basierend auf Validierung
  const getInputBorderClass = () => {
    if (!input.trim()) return 'border-subtle focus:border-accent'
    if (!validation) return 'border-subtle focus:border-accent'
    if (!validation.isValid) return 'border-red-500 focus:border-red-500'
    if (validation.autocorrections.length > 0) return 'border-yellow-500 focus:border-yellow-500'
    return 'border-green-500 focus:border-green-500'
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Stunden/Minuten-Rechner</h2>
        <p className="text-sm text-text-secondary mb-4">
          Eingabe: hh:mm oder Dezimalstunden. Operatoren: + - * / ()
        </p>
        
        {/* Eingabefeld */}
        <div className="flex gap-2">
          <input 
            value={input} 
            onChange={e => handleInputChange(e.target.value, input)} 
            onKeyDown={handleKeyDown}
            placeholder="z.B. 2036/261 oder 8:30 + 1:45"
            className={`flex-1 px-4 py-3 bg-surface border rounded-lg font-mono text-lg focus:outline-none transition-colors ${getInputBorderClass()}`}
            autoComplete="off"
            spellCheck={false}
          />
          <button 
            onClick={doCalculate} 
            disabled={!input.trim() || (validation && !validation.isValid)}
            className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent-hover font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            =
          </button>
        </div>

        {/* Live-Validierung Feedback */}
        {validation && input.trim() && (
          <div className="mt-2 text-sm">
            {!validation.isValid ? (
              <div className="text-red-500 flex items-center gap-2">
                <span>⚠️</span>
                <span>{validation.error}</span>
              </div>
            ) : validation.autocorrections.length > 0 ? (
              <div className="text-yellow-600 dark:text-yellow-400">
                <div className="flex items-center gap-2">
                  <span>✨</span>
                  <span>Autokorrektur: {validation.autocorrections.join(', ')}</span>
                </div>
                {validation.sanitized !== input && (
                  <div className="font-mono text-xs mt-1 opacity-75">
                    → {validation.sanitized}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-green-600 dark:text-green-400 flex items-center gap-2">
                <span>✓</span>
                <span>Gültige Eingabe</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ergebnis */}
      {result && (
        <div className={`p-4 rounded-lg mb-4 ${
          result.isError 
            ? 'bg-red-500/10 border border-red-500' 
            : result.isRounded 
              ? 'bg-yellow-500/10 border border-yellow-500' 
              : 'bg-green-500/10 border border-green-500'
        }`}>
          <div className={`text-3xl font-mono font-bold ${
            result.isError 
              ? 'text-red-500' 
              : result.isRounded 
                ? 'text-yellow-600 dark:text-yellow-400' 
                : 'text-green-600 dark:text-green-400'
          }`}>
            {result.value}
          </div>
          {result.isRounded && !result.isError && (
            <div className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
              ⚡ Gerundet (Delta: {result.delta})
            </div>
          )}
        </div>
      )}

      {/* Verlauf */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-secondary">Verlauf</h3>
          {history.length > 0 && (
            <button 
              onClick={clearHistory}
              className="text-xs text-text-secondary hover:text-red-500 transition-colors"
            >
              Löschen
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-text-secondary opacity-50">Noch keine Berechnungen</p>
        ) : (
          <div className="space-y-1">
            {history.map((h, i) => (
              <div 
                key={i} 
                onClick={() => insertFromHistory(h)}
                className="text-sm font-mono text-text-secondary hover:text-accent cursor-pointer transition-colors"
                title="Klicken zum Einfügen"
              >
                {h}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CalculatorApp
