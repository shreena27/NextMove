/** Ports the prototype's `renderLog` (design/nextmove-v1-prototype.html,
 *  lines 2807-2829, tag v1-design-lock-2) — the journey log: milestones
 *  apart from checks, consecutive no-change checks collapsed into one line,
 *  entries labeled by author, never presented as an official record.
 *
 *  THE COLLAPSE ALGORITHM (transcribed): walk `c.log` in order; an entry is
 *  collapsible when `kind === 'checked'` AND (`noChange === true` OR
 *  (`noChange === undefined` AND `/no change/.test(text)`)). The prose test
 *  is a LEGACY FALLBACK for migrated entries only, written before the typed
 *  flag existed — kept, not "cleaned up", for exactly that reason.
 *  Consecutive collapsibles fold into one run `{ n, from, to }`; any
 *  non-collapsible flushes the run first.
 *
 *  DESIGN NOTE 4 — DOM ORDER: the "Show all {n} entries" button renders
 *  BEFORE the entries, in the JSX below, exactly as the prototype's own
 *  template literal does (2825 precedes 2826) — not where a reader would
 *  guess a "show more" control goes. Do not reorder this "for readability";
 *  JourneyLog.test.tsx asserts the DOM position directly. The button counts
 *  COLLAPSED entries (`entries.length`), not raw log rows, and only shows
 *  when `entries.length > 3 && !logOpen[c.id]`.
 *
 *  A run renders as `Checked {n} time(s), {from}[ – {to}] — no change
 *  reported`, where the ` – {to}` half exists ONLY in the plural form's own
 *  registered copy (`UI.log.collapsedMany`) — never built by concatenating
 *  a shared prefix with a conditionally-appended suffix, so the singular
 *  form (`UI.log.collapsedOne`) can never accidentally grow one.
 *
 *  A normal entry renders `.log-e` with `.log-mile` when kind is
 *  `diagnosed`/`closed`/`reopened`, else `.log-check`; `.log-d` is
 *  `fmtDay(t)`; `.log-who` is `UI.log.whoReported` for `reported`,
 *  `UI.log.whoDiagnosed` for `diagnosed`, empty for `closed`/`reopened`,
 *  `UI.log.whoOther` ('—') otherwise. Always ends with `.log-note`. */
import type { Casefile, JourneyEntry } from '../domain/casefile'
import { fmtDay } from '../ui/dates'
import { UI } from '../screens/screenCopy'

interface CollapsedRun {
  collapse: true
  n: number
  from: number
  to: number
}

type LogRow = JourneyEntry | CollapsedRun

function isCollapsedRun(row: LogRow): row is CollapsedRun {
  return 'collapse' in row
}

function isCollapsible(e: JourneyEntry): boolean {
  return e.kind === 'checked' && (e.noChange === true || (e.noChange === undefined && /no change/.test(e.text)))
}

function collapseEntries(log: JourneyEntry[]): LogRow[] {
  const entries: LogRow[] = []
  let run: CollapsedRun | null = null
  for (const e of log) {
    if (isCollapsible(e)) {
      if (run) {
        run.n++
        run.to = e.t
      } else {
        run = { collapse: true, n: 1, from: e.t, to: e.t }
      }
    } else {
      if (run) {
        entries.push(run)
        run = null
      }
      entries.push(e)
    }
  }
  if (run) entries.push(run)
  return entries
}

function whoFor(kind: JourneyEntry['kind']): string {
  if (kind === 'reported') return UI.log.whoReported
  if (kind === 'diagnosed') return UI.log.whoDiagnosed
  if (kind === 'closed' || kind === 'reopened') return ''
  return UI.log.whoOther
}

function LogLine({ row }: { row: LogRow }) {
  if (isCollapsedRun(row)) {
    const text = row.n > 1
      ? UI.log.collapsedMany.replace('{n}', String(row.n)).replace('{from}', fmtDay(row.from)).replace('{to}', fmtDay(row.to))
      : UI.log.collapsedOne.replace('{n}', String(row.n)).replace('{from}', fmtDay(row.from))
    return <div className="log-e log-check">{text}</div>
  }
  const kindCls = row.kind === 'diagnosed' || row.kind === 'closed' || row.kind === 'reopened' ? 'log-mile' : 'log-check'
  return (
    <div className={`log-e ${kindCls}`}>
      <span className="log-d">{fmtDay(row.t)}</span> <span className="log-who">{whoFor(row.kind)}</span> {row.text}
    </div>
  )
}

export interface JourneyLogProps {
  case: Casefile
  logOpen: Record<string, boolean>
  onShowAll: () => void
}

export function JourneyLog({ case: c, logOpen, onShowAll }: JourneyLogProps) {
  const entries = collapseEntries(c.log)
  const open = !!logOpen[c.id]
  const shown = open ? entries : entries.slice(-3)
  return (
    <div className="journey">
      {entries.length > 3 && !open ? (
        <button className="read-change" onClick={onShowAll}>
          {UI.log.showAll.replace('{n}', String(entries.length))}
        </button>
      ) : null}
      {shown.map((row, i) => <LogLine row={row} key={i} />)}
      <div className="log-note">{UI.log.note}</div>
    </div>
  )
}
