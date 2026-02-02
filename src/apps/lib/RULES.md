# Calculator Regeln - NIEMALS LÖSCHEN

**WICHTIG: Diese Datei vor JEDER Code-Änderung lesen!**

---

## 1. Erlaubte Zeichen
Nur diese Zeichen sind erlaubt: `0-9 + - * / ( ) . , : Space`

Alles andere wird automatisch entfernt.

---

## 2. Trennzeichen (. , :)

### Eingabe-Filterung (beim Tippen - React) - BLOCKIERT
- Kein Trennzeichen am Anfang: `,7` → Taste wird ignoriert
- Keine doppelten Trennzeichen: `7,,` → zweites `,` wird ignoriert
- Kein Trennzeichen nach Operator: `+,` → `,` wird ignoriert
- **Erste Ziffer nach Trennzeichen nur 0-5**: `6,[6]` → `6` wird ignoriert (wäre 60+)
- **Max 2 Ziffern nach Trennzeichen**: `6,33[3]` → dritte Ziffer wird ignoriert
- **Minuten max 59**: `6,5[9]` ✓ | zweite Ziffer die >59 ergibt wird ignoriert

### Autokorrektur (Fallback für Paste)
- Mehrfache Trennzeichen werden zu einem: `7,,,` → `7:`
- Trennzeichen am Rand werden entfernt
- Zu viele Ziffern → Fehler (sollte beim Tippen nicht passieren)
- Minuten > 59 → Fehler (sollte beim Tippen nicht passieren)

### Interpretation
- Einstellig = Zehnerstelle: `2.3` → `2:30`
- Zweistellig = direkt: `2.33` → `2:33`
- `.` und `,` werden zu `:` konvertiert

---

## 3. Operatoren (+ - * /)

### Eingabe-Filterung (beim Tippen - React) - ERSETZT
- Am Anfang nur `-` erlaubt (Vorzeichen)
- Nach `(` nur `-` erlaubt (Vorzeichen)
- **Operator nach Operator: IMMER ersetzen** (letzter gewinnt)
  - User tippt `+` → sieht `+`
  - User tippt dann `-` → sieht `-` (nicht `+-`!)
- **AUSNAHME: Unäres Minus wird NICHT ersetzt!**
  - `-` am Anfang oder nach `(` ist unär (Vorzeichen)
  - User tippt `-` am Anfang → sieht `-`
  - User tippt dann `+` → bleibt `-` (`+` wird blockiert)
- Für negative Zahlen nach `*` oder `/`: Klammern benutzen → `5*(-3)`

### Autokorrektur (Fallback)
- Doppelte Operatoren werden reduziert

---

## 4. Klammern ( )

### Eingabe-Filterung (beim Tippen - React)
- `)` nur wenn offene `(` existiert
- `)` nicht direkt nach `(`
- `)` nicht direkt nach Operator

### Autokorrektur
- `(((3)))` → `3` (überflüssige Klammern entfernen)
- `()` wird entfernt
- Unbalancierte `)` am Anfang werden entfernt
- Unbalancierte `(` am Ende werden entfernt

### Validierung
- Klammern müssen balanciert sein

---

## 5. Implizite Multiplikation

Wird automatisch eingefügt **beim Tippen**:
- `5(` → `5*(`
- `(2)(` → `(2)*(`
- `(3)5` → `(3)*5`

User sieht sofort das `*` - es wird nicht erst bei Berechnung eingefügt.

---

## 6. Crash-Sicherheit

Die `calculate()` Funktion darf NIEMALS einen unbehandelten Fehler werfen.
Alles ist in try/catch gewrappt.

---

## 7. Test-Cases (müssen IMMER grün sein)

```
2036/261      → 7:48
8:30 + 1:45   → 10:15
2.3           → 2:30 (einstellig = Zehnerstelle)
6,33          → 6:33
6,333         → NICHT EINGEBBAR (3. Ziffer blockiert)
3,8           → NICHT EINGEBBAR (8 > 5 als erste Ziffer blockiert)
6:60          → NICHT EINGEBBAR (6 > 5 als erste Ziffer blockiert)
7,,,,         → Autokorrektur zu 7:, dann Fehler
(((3)))       → 3
5*(-2)        → -10:00 (negativ mit Klammern)
5*-2          → 3:00 (Doppeloperator: *- wird zu -)
5+-2          → 3:00 (Doppeloperator: +- wird zu -)
5++3          → 8:00 (Doppeloperator: ++ wird zu +)
5(3)          → 5*(3) → 15:00 (implizite Mult. sichtbar beim Tippen)
```

---

## Änderungs-Checkliste

Vor jeder Code-Änderung prüfen:
- [ ] Alle Tests laufen durch
- [ ] Trennzeichen-Regeln intakt (max 2 Ziffern!)
- [ ] Minuten-Validierung intakt (0-59)
- [ ] Klammer-Logik intakt
- [ ] Operator-Logik intakt
- [ ] Keine Abstürze möglich
