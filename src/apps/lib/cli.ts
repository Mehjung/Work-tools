// cli.ts - Separater CLI-Einstiegspunkt
// Ausführen mit: npx ts-node cli.ts --test

// @ts-ignore - Import funktioniert in deinem Projekt mit .ts Extension
import { calculate, validateAndAutocorrect } from './calculator-core.ts'

const args = process.argv.slice(2)

// Tests
if (args.includes('--test')) {
  console.log('Stunden/Minuten-Rechner - Tests')
  console.log('='.repeat(50))
  
  let passed = 0, failed = 0
  
  const tests = [
    { name: 'Einfache Division', input: '2036/261', expected: '7:48' },
    { name: 'Zeit-Addition', input: '8:30 + 1:45', expected: '10:15' },
    { name: 'Zeit-Subtraktion', input: '10:00 - 2:30', expected: '7:30' },
    { name: 'Multiplikation', input: '2:30 * 2', expected: '5:00' },
    { name: 'Division', input: '8:00 / 4', expected: '2:00' },
    { name: 'Klammern', input: '(8:00 + 4:00) / 2', expected: '6:00' },
    { name: 'Zeit mit Punkt einstellig', input: '2.3 + 0.3', expected: '3:00' },
    { name: 'Negatives Ergebnis', input: '1:00 - 3:00', expected: '-2:00' },
    { name: 'Komplexer Ausdruck', input: '8:30 + 1:45 - 0:15', expected: '10:00' },
    { name: 'Sekunden', input: '1:30:30', expected: '1:31' },
    { name: 'Doppelter Operator', input: '5++3', expected: '8:00' },
    { name: 'Operator ersetzen', input: '5+-3', expected: '2:00' },
    { name: 'Implizite Mult. Zahl(', input: '5(2)', expected: '10:00' },
    { name: 'Implizite Mult. )(', input: '(2+3)(1+1)', expected: '10:00' },
    { name: 'Implizite Mult. )Zahl', input: '(2+3)2', expected: '10:00' },
    { name: 'Punkt/Komma als Zeit', input: '7,48 + 0,12', expected: '8:00' },
    { name: 'Ungueltige Zeichen', input: '5 + abc3', expected: '8:00' },
    { name: 'Leere Eingabe', input: '', expectError: true },
    { name: 'Nur Leerzeichen', input: '   ', expectError: true },
    { name: 'Division durch Null', input: '5/0', expectError: true },
    { name: 'Fehlende Klammer', input: '(5+3', expectError: true },
    { name: 'Operator am Ende', input: '5+', expectError: true },
    { name: 'Operator am Anfang', input: '*5', expectError: true },
    { name: 'Ungueltige Minuten 60', input: '6:60', expectError: true },
    { name: 'Ungueltige Minuten 66', input: '6.66', expectError: true },
    { name: 'Zu viele Ziffern', input: '2.333', expectError: true },
    { name: 'Mehrfache Trennzeichen', input: '7,,,, + 1', expected: '8:00' },
    { name: 'Nur Trennzeichen', input: '...', expectError: true },
    { name: 'Klammern vereinfachen', input: '(((3)))', expected: '3:00' },
    { name: 'Klammern um Ausdruck', input: '((2+1))', expected: '3:00' },
    { name: 'Minus am Anfang', input: '-5+3', expected: '-2:00' },
    { name: 'Vorzeichen nach Operator', input: '5*(-2)', expected: '-10:00' },
    { name: 'Vorzeichen in Klammer', input: '(-3)+5', expected: '2:00' },
    { name: 'Doppeloperator wird reduziert', input: '5+-2', expected: '3:00' },
  ]
  
  for (const test of tests) {
    const result = calculate(test.input)
    let success = false
    let actual = ''
    
    if ('error' in result) {
      success = (test as any).expectError === true
      actual = 'Fehler: ' + result.error
    } else {
      actual = result.formatted
      success = test.expected === result.formatted
    }
    
    if (success) {
      console.log('[OK] ' + test.name)
      passed++
    } else {
      console.log('[FAIL] ' + test.name)
      console.log('   Eingabe:   "' + test.input + '"')
      console.log('   Erwartet:  ' + (test.expected || 'Fehler'))
      console.log('   Erhalten:  ' + actual)
      failed++
    }
  }
  
  console.log('')
  console.log('='.repeat(50))
  console.log(`Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen`)
  process.exit(failed > 0 ? 1 : 0)
}

// Interaktiv
if (args.includes('--interactive') || args.includes('-i')) {
  import('readline').then((readline) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    
    console.log('Stunden/Minuten-Rechner (interaktiv)')
    console.log('-'.repeat(40))
    console.log('Eingabe: hh:mm oder Dezimalstunden')
    console.log('Operatoren: + - * / ()')
    console.log('Beenden: exit oder Ctrl+C')
    console.log('')
    
    const prompt = () => {
      rl.question('> ', (input: string) => {
        if (!input || input.toLowerCase() === 'exit') { rl.close(); return }
        
        // Zeige Autokorrektur-Feedback
        const validation = validateAndAutocorrect(input)
        if (validation.autocorrections.length > 0) {
          console.log('  Korrektur: ' + validation.autocorrections.join(', '))
          if (validation.sanitized !== input) {
            console.log('  Bereinigt: ' + validation.sanitized)
          }
        }
        
        const result = calculate(input)
        if ('error' in result) {
          console.log('Fehler: ' + result.error)
        } else {
          const rounded = result.isRounded ? ' (Delta ' + result.delta + ')' : ''
          console.log('= ' + result.formatted + rounded)
        }
        console.log('')
        prompt()
      })
    }
    prompt()
  })
} 
// Einzelberechnung
else if (args.length > 0) {
  const input = args.join(' ')
  console.log('Eingabe: ' + input)
  
  const validation = validateAndAutocorrect(input)
  if (validation.autocorrections.length > 0) {
    console.log('Korrekturen: ' + validation.autocorrections.join(', '))
    console.log('Bereinigt: ' + validation.sanitized)
  }
  
  const result = calculate(input)
  
  if ('error' in result) {
    console.error('Fehler: ' + result.error)
    process.exit(1)
  }
  
  const rounded = result.isRounded ? ' (gerundet, Delta ' + result.delta + ')' : ''
  console.log('Ergebnis: ' + result.formatted + rounded)
  console.log('Dezimal:  ' + result.value.toFixed(4) + 'h')
}
// Hilfe
else {
  console.log('Stunden/Minuten-Rechner')
  console.log('-'.repeat(40))
  console.log('Verwendung:')
  console.log('  npx ts-node cli.ts "2036/261"')
  console.log('  npx ts-node cli.ts --test')
  console.log('  npx ts-node cli.ts -i')
}
