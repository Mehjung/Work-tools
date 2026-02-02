/**
 * Calculator Core - Stunden/Minuten-Rechner
 * Reine Library - funktioniert in Node.js und Browser/React
 * 
 * Fuer CLI: nutze cli.ts oder calculator-core.js
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  isValid: boolean
  error?: string
  sanitized: string
  autocorrections: string[]
}

export interface CalculationResult {
  value: number
  formatted: string
  isRounded: boolean
  delta: string
  input: string
}

// ============================================================================
// EINGABE-VALIDIERUNG & AUTOKORREKTUR
// ============================================================================

const ALLOWED_CHARS = /^[\d+\-*/().:,\s]+$/
const OPERATORS = ['+', '-', '*', '/']

/**
 * Validiert und korrigiert die Eingabe automatisch
 */
export function validateAndAutocorrect(input: string): ValidationResult {
  const corrections: string[] = []
  let sanitized = input.trim()

  // 1. Leere Eingabe
  if (!sanitized) {
    return { isValid: false, error: 'Leere Eingabe', sanitized: '', autocorrections: [] }
  }

  // 2. Ungueltige Zeichen erkennen und entfernen
  if (!ALLOWED_CHARS.test(sanitized)) {
    const invalidChars = sanitized.match(/[^\d+\-*/().:,\s]/g) || []
    const uniqueInvalid = [...new Set(invalidChars)]
    corrections.push('Ungueltige Zeichen entfernt: ' + uniqueInvalid.join(', '))
    sanitized = sanitized.replace(/[^\d+\-*/().:,\s]/g, '')
  }

  // 3. Mehrfache Trennzeichen reduzieren (Fallback)
  if (/[.,:]{2,}/.test(sanitized)) {
    sanitized = sanitized.replace(/[.,:]+/g, ':')
    corrections.push('Mehrfache Trennzeichen korrigiert')
  }
  
  // 4. Trennzeichen am Anfang oder Ende entfernen
  if (/^[.,:]+/.test(sanitized)) {
    sanitized = sanitized.replace(/^[.,:]+/, '')
    corrections.push('Trennzeichen am Anfang entfernt')
  }
  if (/[.,:]+$/.test(sanitized)) {
    sanitized = sanitized.replace(/[.,:]+$/, '')
    corrections.push('Trennzeichen am Ende entfernt')
  }
  
  // 5. Trennzeichen ohne Zahl davor/danach entfernen
  sanitized = sanitized.replace(/([+\-*/(])[.,:]+/g, '$1')
  sanitized = sanitized.replace(/[.,:]+([+\-*/)])/g, '$1')
  
  // Wenn nach Bereinigung leer
  if (!sanitized.trim()) {
    return { isValid: false, error: 'Keine gueltige Eingabe', sanitized: '', autocorrections: corrections }
  }

  // 3. Punkt und Komma als Zeittrennzeichen normalisieren (zu :)
  // z.B. 7.48 oder 7,48 wird zu 7:48
  // WICHTIG: 2.3 wird zu 2:30 (einstellig = Zehnerstelle)
  if (sanitized.includes(',') || sanitized.includes('.')) {
    let changed = false
    
    // Erst: Zu viele Ziffern nach Trennzeichen erkennen (3+)
    if (/\d[.,]\d{3,}/.test(sanitized)) {
      return {
        isValid: false,
        error: 'Ungueltige Zeitangabe: maximal 2 Ziffern nach Trennzeichen',
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
          error: 'Ungueltige Minuten: ' + minutes + ' (max 59)',
          sanitized,
          autocorrections: corrections
        }
      }
    }
  }

  // 4. Mehrfache Leerzeichen normalisieren
  sanitized = sanitized.replace(/\s+/g, ' ')

  // 5. Autokorrektur: Aufeinanderfolgende Operatoren
  let prev = sanitized
  sanitized = autocorrectOperators(sanitized)
  if (prev !== sanitized) {
    corrections.push('Doppelte Operatoren korrigiert')
  }

  // 6. Autokorrektur: Implizite Multiplikation
  prev = sanitized
  sanitized = autocorrectImplicitMultiplication(sanitized)
  if (prev !== sanitized) {
    corrections.push('Implizite Multiplikation eingefuegt (*)')
  }

  // 7. Klammern vereinfachen
  prev = sanitized
  sanitized = simplifyBrackets(sanitized)
  if (prev !== sanitized) {
    corrections.push('Klammern vereinfacht')
  }

  // Wenn nach Bereinigung leer
  if (!sanitized.trim()) {
    return { isValid: false, error: 'Keine gueltige Eingabe', sanitized: '', autocorrections: corrections }
  }

  // 8. Klammer-Balance pruefen
  const bracketBalance = checkBracketBalance(sanitized)
  if (!bracketBalance.isValid) {
    return { 
      isValid: false, 
      error: bracketBalance.error, 
      sanitized, 
      autocorrections: corrections 
    }
  }

  // 9. Finale Validierung
  const trimmed = sanitized.trim()
  if (/^[+*/]/.test(trimmed)) {
    return { 
      isValid: false, 
      error: 'Ausdruck kann nicht mit Operator beginnen (ausser -)', 
      sanitized, 
      autocorrections: corrections 
    }
  }
  if (/[+\-*/]$/.test(trimmed)) {
    return { 
      isValid: false, 
      error: 'Ausdruck kann nicht mit Operator enden', 
      sanitized, 
      autocorrections: corrections 
    }
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

function autocorrectImplicitMultiplication(expr: string): string {
  let result = expr
  result = result.replace(/(\d)\s*\(/g, '$1*(')
  result = result.replace(/\)\s*\(/g, ')*(')
  result = result.replace(/\)\s*(\d)/g, ')*$1')
  return result
}

/**
 * Vereinfacht ueberflussige Klammern:
 * - (((3))) -> 3
 * - ((3+2)) -> 3+2
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
    
    // Ueberflussige aeussere Klammern um den gesamten Ausdruck entfernen
    if (result.startsWith('(') && result.endsWith(')')) {
      let depth = 0
      let matching = true
      for (let i = 0; i < result.length - 1; i++) {
        if (result[i] === '(') depth++
        if (result[i] === ')') depth--
        if (depth === 0) {
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

function checkBracketBalance(expr: string): { isValid: boolean; error?: string } {
  let depth = 0
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++
    if (expr[i] === ')') depth--
    if (depth < 0) {
      return { isValid: false, error: 'Schliessende Klammer ohne oeffnende an Position ' + (i + 1) }
    }
  }
  if (depth !== 0) {
    return { isValid: false, error: depth + ' oeffnende Klammer(n) nicht geschlossen' }
  }
  return { isValid: true }
}

// ============================================================================
// TOKENIZER
// ============================================================================

type Token = { type: 'number'; value: number } | { type: 'operator'; value: string }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) { i++; continue }
    if ('+-*/()'.includes(c)) { 
      tokens.push({ type: 'operator', value: c })
      i++
      continue 
    }
    
    let num = ''
    while (i < expr.length && /[\d.:]/.test(expr[i])) { 
      num += expr[i]
      i++ 
    }
    
    if (num) {
      const value = parseNumberOrTime(num)
      if (isNaN(value)) {
        throw new Error('Ungueltige Zahl/Zeit: "' + num + '"')
      }
      tokens.push({ type: 'number', value })
    }
  }
  
  return tokens
}

function parseNumberOrTime(str: string): number {
  if (str.includes(':')) {
    const parts = str.split(':').map(Number)
    if (parts.some(isNaN)) return NaN
    if (parts.length === 2) {
      const [h, m] = parts
      return h + m / 60
    } else if (parts.length === 3) {
      const [h, m, s] = parts
      return h + m / 60 + s / 3600
    }
    return NaN
  }
  return parseFloat(str)
}

// ============================================================================
// PARSER (Recursive Descent)
// ============================================================================

class Parser {
  private tokens: Token[]
  private pos: number = 0
  
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }
  
  parse(): number {
    if (this.tokens.length === 0) {
      throw new Error('Leere Eingabe')
    }
    const result = this.parseExpression()
    if (this.pos < this.tokens.length) {
      throw new Error('Unerwartetes Token: ' + this.current()?.value)
    }
    return result
  }
  
  private current(): Token | undefined {
    return this.tokens[this.pos]
  }
  
  private consume(): Token {
    return this.tokens[this.pos++]
  }
  
  private parseExpression(): number {
    let left = this.parseTerm()
    while (this.current()?.type === 'operator' && 
           (this.current()?.value === '+' || this.current()?.value === '-')) {
      const op = this.consume().value
      const right = this.parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  
  private parseTerm(): number {
    let left = this.parseFactor()
    while (this.current()?.type === 'operator' && 
           (this.current()?.value === '*' || this.current()?.value === '/')) {
      const op = this.consume().value
      const right = this.parseFactor()
      if (op === '/') {
        if (right === 0) throw new Error('Division durch Null')
        left = left / right
      } else {
        left = left * right
      }
    }
    return left
  }
  
  private parseFactor(): number {
    const token = this.current()
    if (!token) throw new Error('Unerwartetes Ende der Eingabe')
    
    if (token.type === 'operator' && token.value === '(') {
      this.consume()
      const result = this.parseExpression()
      if (this.current()?.value !== ')') {
        throw new Error('Fehlende schliessende Klammer')
      }
      this.consume()
      return result
    }
    
    if (token.type === 'operator' && token.value === '-') {
      this.consume()
      return -this.parseFactor()
    }
    
    if (token.type === 'operator' && token.value === '+') {
      this.consume()
      return this.parseFactor()
    }
    
    if (token.type === 'number') {
      this.consume()
      return token.value
    }
    
    throw new Error('Unerwartetes Token: ' + token.value)
  }
}

// ============================================================================
// HAUPT-FUNKTIONEN
// ============================================================================

/**
 * Evaluiert einen mathematischen Ausdruck sicher
 */
export function safeEvaluate(expr: string): number {
  const tokens = tokenize(expr)
  const parser = new Parser(tokens)
  return parser.parse()
}

/**
 * Formatiert Dezimalstunden als hh:mm
 */
export function formatTime(hours: number): { hhmm: string; isRounded: boolean; delta: string } {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(Math.abs(totalMinutes) / 60)
  const m = Math.abs(totalMinutes) % 60
  const sign = hours < 0 ? '-' : ''
  
  const exact = hours * 60
  const isRounded = Math.abs(exact - totalMinutes) > 0.0001
  const delta = isRounded ? (exact - totalMinutes) / 60 : 0
  
  return { 
    hhmm: sign + h + ':' + m.toString().padStart(2, '0'), 
    isRounded, 
    delta: delta.toFixed(4) + 'h' 
  }
}

/**
 * Hauptfunktion: Validiert, korrigiert und berechnet
 * NIEMALS wirft diese Funktion einen Fehler - alles wird abgefangen
 */
export function calculate(input: string): CalculationResult | { error: string; autocorrections: string[] } {
  try {
    const validation = validateAndAutocorrect(input)
    
    if (!validation.isValid) {
      return { 
        error: validation.error || 'Ungueltige Eingabe', 
        autocorrections: validation.autocorrections 
      }
    }
    
    const value = safeEvaluate(validation.sanitized)
    
    // NaN/Infinity abfangen
    if (!isFinite(value)) {
      return {
        error: 'Ungueltige Berechnung',
        autocorrections: validation.autocorrections
      }
    }
    
    const formatted = formatTime(value)
    
    return {
      value,
      formatted: formatted.hhmm,
      isRounded: formatted.isRounded,
      delta: formatted.delta,
      input: validation.sanitized
    }
  } catch (e) {
    // Fallback - sollte nie passieren, aber sicher ist sicher
    return { 
      error: (e as Error).message || 'Unbekannter Fehler', 
      autocorrections: [] 
    }
  }
}
