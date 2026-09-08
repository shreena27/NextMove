import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Casefile } from '../domain/casefile'
import { LOG_COPY } from '../domain/casefile'
import type { Fact } from '../domain/interpret'
import { createSupabaseMock } from '../test/supabaseMock'
import { saveCases } from './caseStore'

// This module bypasses `supabase.ts`'s own lazy-singleton test (that is
// `auth.test.ts`'s job, already covered) and mocks `getClient()` directly —
// simpler, and every call site under test goes through the exact same fake.
const mockClient = createSupabaseMock()
vi.mock('./supabase', () => ({
  getClient: () => mockClient,
}))

// Imported AFTER the vi.mock call above (vi.mock itself is hoisted by
// Vitest regardless of source order, but the import must still follow it
// textually per Vitest's own convention — see auth.test.ts).
import {
  caseToRow, rowToCase, fetchRemoteCases, pushCases, migrateLocalCases, runSignInMigration,
} from './caseSync'
import type { CasefileRow } from './caseSync'

const SESSION_USER_ID = '11111111-1111-1111-1111-111111111111'

function withSession() {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: SESSION_USER_ID } } },
    error: null,
  })
}

function noSession() {
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
}

// select/upsert are stable vi.fn() instances shared across every from()
// call (src/test/supabaseMock.ts's own doc comment) — grabbed once per
// test via a throwaway from() call, then that call is cleared off `from`'s
// own history so it never pollutes a "from called N times" assertion.
let selectSpy: ReturnType<typeof vi.fn>
let upsertSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.clearAuthListeners()
  localStorage.clear()
  const built = mockClient.from('probe')
  selectSpy = built.select
  upsertSpy = built.upsert
  mockClient.from.mockClear()
  noSession() // default: signed out, unless a test opts into withSession()
  selectSpy.mockResolvedValue({ data: [], error: null })
  upsertSpy.mockResolvedValue({ data: null, error: null })
})

function makeCasefile(overrides: Partial<Casefile> = {}): Casefile {
  return {
    engineKey: 'passport',
    serviceLabel: 'Passport',
    returnScreen: 'passport-nextmove',
    answers: { q1: 'adverse', q2: 'informal' },
    prepChecks: { 0: true },
    savedAt: 1_700_000_000_000,
    stateLabel: 'Followed up informally, unresolved',
    rec: 'FOLLOW_UP',
    whatShort: 'Move to a formal Grievance / CPGRAMS filing',
    stepsTotal: 5,
    stepsDone: 1,
    sirPhaseId: null,
    caseFacts: [],
    appliedText: null,
    interpProvenance: null,
    id: 'c1700000000000',
    outcome: 'still_open',
    lastCheck: null,
    remindAt: null,
    log: [{ t: 1_700_000_000_000, kind: 'diagnosed', text: 'Followed up informally, unresolved' }],
    ...overrides,
  }
}

/** Every field a Casefile can carry, all non-default/non-null, per the
 *  brief's own maximal-fixture spec (design note 1): closedAt, a
 *  non-empty log (more than the one diagnosed seed entry), a non-null
 *  remindAt, a sparse prepChecks, and a non-null sirPhaseId.
 *
 *  Task 8, RED item 30: caseFacts carries TWO facts — one `edited: true`
 *  (a citizen-corrected fact) and one `fills: null` (a fact that confirmed
 *  something but filled no draft bracket) — plus a non-null appliedText/
 *  interpProvenance, so the round-trip test below exercises every shape
 *  `Fact` can take, not just the common case. */
function makeMaximalCasefile(): Casefile {
  return makeCasefile({
    engineKey: 'sir',
    serviceLabel: 'Senior citizen grievance',
    returnScreen: 'sir-nextmove',
    answers: { sirState: 'delhi', q2: 'x' },
    prepChecks: { 0: true, 2: false },
    stateLabel: 'S-2',
    rec: 'ESCALATE',
    whatShort: 'File a formal complaint',
    stepsTotal: 4,
    stepsDone: 2,
    sirPhaseId: 'phase-2',
    caseFacts: [
      {
        kind: 'reference_number', refType: 'grievance_no', label: 'Grievance Number',
        value: 'GR1234567890', fills: '[Grievance Number]', edited: true,
      },
      {
        kind: 'note', refType: 'unknown', label: 'A note you mentioned',
        value: 'my elderly mother cannot travel to the office', fills: null,
      },
    ] as Fact[],
    appliedText: 'my elderly mother cannot travel; the grievance number is GR1234567890',
    interpProvenance: 'simulated (local matcher)',
    id: 'a1b2c3d4-1111-2222-3333-444455556666',
    outcome: 'deliverable_received',
    lastCheck: 1_700_000_050_000,
    remindAt: '2026-10-01',
    closedAt: 1_700_000_060_000,
    log: [
      { t: 1_700_000_000_000, kind: 'diagnosed', text: 'S-1' },
      { t: 1_700_000_050_000, kind: 'checked', text: 'Checked in — no change reported', noChange: true },
      { t: 1_700_000_060_000, kind: 'closed', text: 'Case closed — deliverable received' },
    ],
  })
}

// =============================================================================
// caseToRow / rowToCase — the row-shape adapter pair
// =============================================================================
describe('caseToRow / rowToCase', () => {
  it('round-trips a maximal fixture losslessly (toEqual, not a field-by-field spot check)', () => {
    const c = makeMaximalCasefile()
    const row = caseToRow(SESSION_USER_ID, c)
    expect(rowToCase(row)).toEqual(c)
  })

  // Task 8, RED item 30: C7 scope exclusion 5 promised no migration; this
  // is the test that collects on it — caseFacts (including the edited:true
  // and fills:null shapes)/appliedText/interpProvenance ride through the
  // opaque `data` JSONB column for free, with no schema change.
  it('round-trips caseFacts (including an edited fact and a fills:null fact) / appliedText / interpProvenance losslessly', () => {
    const c = makeMaximalCasefile()
    const row = caseToRow(SESSION_USER_ID, c)
    const back = rowToCase(row)
    expect(back.caseFacts).toEqual(c.caseFacts)
    expect(back.caseFacts.some(f => f.edited === true)).toBe(true)
    expect(back.caseFacts.some(f => f.fills === null)).toBe(true)
    expect(back.appliedText).toBe(c.appliedText)
    expect(back.interpProvenance).toBe(c.interpProvenance)
  })

  it('strips unsaved: a row whose data carries unsaved still round-trips without it', () => {
    const c = makeCasefile({ id: 'working-turned-saved', unsaved: true })
    const row = caseToRow(SESSION_USER_ID, c)
    const { unsaved: _unsaved, ...expected } = c
    expect(rowToCase(row)).toEqual(expected)
    expect('unsaved' in row.data).toBe(false)
  })

  it('promotes engineKey -> engine_key and outcome correctly, matching what is inside data', () => {
    const c = makeCasefile({ engineKey: 'voter', outcome: 'closed_unresolved' })
    const row = caseToRow(SESSION_USER_ID, c)
    expect(row.engine_key).toBe('voter')
    expect(row.outcome).toBe('closed_unresolved')
    expect(row.engine_key).toBe(row.data.engineKey)
    expect(row.outcome).toBe(row.data.outcome)
    expect(row.user_id).toBe(SESSION_USER_ID)
    expect(row.id).toBe(c.id)
    expect(typeof row.updated_at).toBe('string')
    expect(Number.isNaN(Date.parse(row.updated_at))).toBe(false)
  })
})

// =============================================================================
// migrateLocalCases — the pure sign-in migration plan
// =============================================================================
describe('migrateLocalCases — the four states (design note 6)', () => {
  it("account has still_open, local has none for that engine ('yes/no'): nothing to upload, the account's case is simply adopted", () => {
    const remoteOpen = makeCasefile({ id: 'remote-passport', engineKey: 'passport', outcome: 'still_open' })
    const plan = migrateLocalCases([], [remoteOpen], 2_000_000_000_000)

    expect(plan.toUpload).toEqual([])
    expect(plan.adopted).toEqual([remoteOpen])
    expect(plan.merged).toEqual([remoteOpen])
  })

  it("account has none, local has still_open ('no/yes'): the local case uploads as-is, unchanged", () => {
    const localOpen = makeCasefile({ id: 'local-passport', engineKey: 'passport', outcome: 'still_open' })
    const plan = migrateLocalCases([localOpen], [], 2_000_000_000_000)

    expect(plan.toUpload).toEqual([localOpen])
    expect(plan.adopted).toEqual([])
    expect(plan.merged).toEqual([localOpen])
  })

  it("neither has still_open for the engine ('no/no'): nothing to do for that engine", () => {
    const plan = migrateLocalCases([], [], 2_000_000_000_000)

    expect(plan.toUpload).toEqual([])
    expect(plan.adopted).toEqual([])
    expect(plan.merged).toEqual([])
  })

  it("both have still_open for the same engine ('yes/yes' — the conflict): account's stays still_open in adopted, local's uploads superseded", () => {
    const now = 2_000_000_000_000
    const remoteOpen = makeCasefile({
      id: 'remote-passport', engineKey: 'passport', outcome: 'still_open', savedAt: 1_900_000_000_000,
    })
    const localOpen = makeCasefile({
      id: 'local-passport', engineKey: 'passport', outcome: 'still_open', savedAt: 1_800_000_000_000,
    })
    const plan = migrateLocalCases([localOpen], [remoteOpen], now)

    expect(plan.adopted).toEqual([remoteOpen])
    expect(plan.toUpload).toHaveLength(1)
    const uploaded = plan.toUpload[0]
    expect(uploaded.id).toBe('local-passport')
    expect(uploaded.outcome).toBe('superseded')
    expect(uploaded.log).toEqual([
      ...localOpen.log,
      { t: now, kind: 'closed', text: LOG_COPY.superseded },
    ])
    expect(plan.merged).toEqual(
      expect.arrayContaining([remoteOpen, uploaded]),
    )
    expect(plan.merged).toHaveLength(2)
  })
})

describe('migrateLocalCases — the first-sign-in case (the one this whole chunk exists for)', () => {
  it('remote: [], local: [passportCase, voterCase] -> adopted is [], toUpload is both, merged is both', () => {
    const passportCase = makeCasefile({ id: 'p1', engineKey: 'passport', savedAt: 1_000 })
    const voterCase = makeCasefile({ id: 'v1', engineKey: 'voter', savedAt: 2_000 })

    const plan = migrateLocalCases([passportCase, voterCase], [], 3_000)

    expect(plan.adopted).toEqual([])
    expect(plan.toUpload).toEqual(expect.arrayContaining([passportCase, voterCase]))
    expect(plan.toUpload).toHaveLength(2)
    // "adopted" is only what the server already held; dispatching it here
    // clears nm_cases, empties savedCases and shows a first-time citizen an
    // empty Home while their cases sit safely on a server they cannot see.
    expect(plan.merged).toEqual(expect.arrayContaining([passportCase, voterCase]))
    expect(plan.merged).toHaveLength(2)
  })
})

describe('migrateLocalCases — merged ordering and disjointness', () => {
  it('merged is sorted newest-first by savedAt across the toUpload/adopted boundary — interleaved, not concatenated blindly', () => {
    const remoteOld = makeCasefile({ id: 'remote-old', engineKey: 'passport', savedAt: 1_000, outcome: 'closed_unresolved' })
    const remoteNewest = makeCasefile({ id: 'remote-newest', engineKey: 'voter', savedAt: 5_000, outcome: 'still_open' })
    const localMid = makeCasefile({ id: 'local-mid', engineKey: 'sir', savedAt: 3_000, outcome: 'closed_unresolved' })

    const plan = migrateLocalCases([localMid], [remoteOld, remoteNewest], 9_999)

    expect(plan.merged.map(c => c.id)).toEqual(['remote-newest', 'local-mid', 'remote-old'])
  })

  it('adopted and toUpload are disjoint by id in every one of the four states', () => {
    const now = 9_000_000
    const cases = [
      // yes/no
      { local: [] as Casefile[], remote: [makeCasefile({ id: 'r-a', engineKey: 'passport' })] },
      // no/yes
      { local: [makeCasefile({ id: 'l-b', engineKey: 'voter' })], remote: [] },
      // no/no
      { local: [], remote: [] },
      // yes/yes
      {
        local: [makeCasefile({ id: 'l-c', engineKey: 'sir' })],
        remote: [makeCasefile({ id: 'r-c', engineKey: 'sir' })],
      },
    ]
    // One assertion per state, unconditionally — an intersection check
    // (not a per-id loop over `toUpload`, which would run zero assertions
    // for the two states above whose `toUpload` happens to be empty and
    // so would silently pass without checking anything for them).
    expect.assertions(cases.length)
    for (const { local, remote } of cases) {
      const plan = migrateLocalCases(local, remote, now)
      const adoptedIds = new Set(plan.adopted.map(c => c.id))
      const uploadIds = new Set(plan.toUpload.map(c => c.id))
      const intersection = [...uploadIds].filter(id => adoptedIds.has(id))
      expect(intersection).toEqual([])
    }
  })
})

describe('migrateLocalCases — rule zero (design note 5)', () => {
  it('a local case whose id matches a remote case is dropped from toUpload; its remote copy is in adopted; it appears exactly once in merged', () => {
    const remoteCopy = makeCasefile({ id: 'shared-id', engineKey: 'passport', outcome: 'closed_unresolved', savedAt: 500 })
    const localCopy = makeCasefile({ id: 'shared-id', engineKey: 'passport', outcome: 'closed_unresolved', savedAt: 500 })

    const plan = migrateLocalCases([localCopy], [remoteCopy], 9_999)

    expect(plan.toUpload.find(c => c.id === 'shared-id')).toBeUndefined()
    expect(plan.adopted).toEqual([remoteCopy])
    expect(plan.merged.filter(c => c.id === 'shared-id')).toHaveLength(1)
  })

  it('the sharp version: same id on both sides, both still_open, same engineKey — is NOT resolved as a conflict', () => {
    const shared = makeCasefile({
      id: 'crash-retry-id', engineKey: 'passport', outcome: 'still_open',
      log: [{ t: 1, kind: 'diagnosed', text: 'S-1' }],
    })
    // Simulates a crash between push and clear, followed by a retry: the
    // exact same case now sits on both sides.
    const plan = migrateLocalCases([shared], [shared], 9_999)

    // a retry after a crash between push and clear would otherwise mark
    // the citizen's own case superseded against itself
    expect(plan.toUpload.find(c => c.id === 'crash-retry-id')).toBeUndefined()
    const adoptedCase = plan.adopted.find(c => c.id === 'crash-retry-id')!
    expect(adoptedCase.outcome).toBe('still_open')
    expect(adoptedCase.log).toEqual(shared.log)
  })
})

describe('migrateLocalCases — the conflict case, in full detail', () => {
  it('account case: unchanged, still_open, log untouched. local case: superseded, one appended LOG_COPY.superseded entry at the injected now, every other field unchanged', () => {
    const now = 5_000_000
    const remoteOpen = makeCasefile({
      id: 'remote-p', engineKey: 'passport', outcome: 'still_open',
      log: [{ t: 1, kind: 'diagnosed', text: 'account state' }],
    })
    const localOpen = makeCasefile({
      id: 'local-p', engineKey: 'passport', outcome: 'still_open', savedAt: 1_234_567,
      answers: { q1: 'adverse' }, prepChecks: { 0: true },
      log: [{ t: 1, kind: 'diagnosed', text: 'local state' }, { t: 2, kind: 'checked', text: 'no change', noChange: true }],
    })

    const plan = migrateLocalCases([localOpen], [remoteOpen], now)

    const adoptedCase = plan.adopted.find(c => c.id === 'remote-p')!
    expect(adoptedCase).toEqual(remoteOpen)
    expect(adoptedCase.outcome).toBe('still_open')
    expect(adoptedCase.log).toEqual(remoteOpen.log)

    const uploadedCase = plan.toUpload.find(c => c.id === 'local-p')!
    expect(uploadedCase.outcome).toBe('superseded')
    expect(uploadedCase.log).toEqual([
      ...localOpen.log,
      { t: now, kind: 'closed', text: LOG_COPY.superseded },
    ])
    // Every other field is unchanged from the local case.
    expect(uploadedCase.id).toBe(localOpen.id)
    expect(uploadedCase.savedAt).toBe(localOpen.savedAt)
    expect(uploadedCase.answers).toEqual(localOpen.answers)
    expect(uploadedCase.prepChecks).toEqual(localOpen.prepChecks)
    expect(uploadedCase.engineKey).toBe(localOpen.engineKey)
    expect(uploadedCase.stateLabel).toBe(localOpen.stateLabel)

    expect(plan.merged).toEqual(expect.arrayContaining([adoptedCase, uploadedCase]))
    expect(plan.merged).toHaveLength(2)
  })
})

describe('migrateLocalCases — the conflict resolution is per service', () => {
  it('a passport conflict and a voter local-only case produce one superseded passport upload and one plain voter upload, in the same plan', () => {
    const now = 7_000_000
    const remotePassport = makeCasefile({ id: 'remote-passport', engineKey: 'passport', outcome: 'still_open' })
    const localPassport = makeCasefile({ id: 'local-passport', engineKey: 'passport', outcome: 'still_open' })
    const localVoter = makeCasefile({ id: 'local-voter', engineKey: 'voter', outcome: 'still_open' })

    const plan = migrateLocalCases([localPassport, localVoter], [remotePassport], now)

    const supersededPassport = plan.toUpload.find(c => c.id === 'local-passport')!
    expect(supersededPassport.outcome).toBe('superseded')
    const uploadedVoter = plan.toUpload.find(c => c.id === 'local-voter')!
    expect(uploadedVoter.outcome).toBe('still_open')
    expect(uploadedVoter).toEqual(localVoter)
    expect(plan.toUpload).toHaveLength(2)
    expect(plan.adopted).toEqual([remotePassport])
  })
})

describe('migrateLocalCases — non-still_open local cases upload unconditionally (design note 7)', () => {
  it.each([
    ['deliverable_received' as const],
    ['closed_unresolved' as const],
    ['superseded' as const],
  ])('a local %s case is in toUpload unmodified, whatever the still_open state of its own engine', (outcome) => {
    const now = 1_234
    // Exercise it inside a conflict context for the SAME engine, to prove
    // the still_open table has no bearing on a non-open case at all.
    const remoteOpen = makeCasefile({ id: 'remote-open', engineKey: 'passport', outcome: 'still_open' })
    const localOpen = makeCasefile({ id: 'local-open', engineKey: 'passport', outcome: 'still_open' })
    const localClosed = makeCasefile({ id: 'local-closed', engineKey: 'passport', outcome, closedAt: 999 })

    const plan = migrateLocalCases([localOpen, localClosed], [remoteOpen], now)

    const found = plan.toUpload.find(c => c.id === 'local-closed')
    expect(found).toEqual(localClosed)
  })
})

describe('migrateLocalCases — purity', () => {
  it('mutates neither input', () => {
    const local = [
      makeCasefile({ id: 'local-passport', engineKey: 'passport', outcome: 'still_open' }),
      makeCasefile({ id: 'local-closed', engineKey: 'voter', outcome: 'closed_unresolved' }),
    ]
    const remote = [makeCasefile({ id: 'remote-passport', engineKey: 'passport', outcome: 'still_open' })]
    const localClone = structuredClone(local)
    const remoteClone = structuredClone(remote)

    migrateLocalCases(local, remote, 8_888_888)

    expect(local).toEqual(localClone)
    expect(remote).toEqual(remoteClone)
    // Identity of the arrays themselves is also untouched (no push/splice).
    expect(local).toBe(local)
    expect(remote).toBe(remote)
  })
})

// =============================================================================
// fetchRemoteCases
// =============================================================================
describe('fetchRemoteCases', () => {
  it('returns { ok: false } with no call attempted when there is no session (the Global Constraint)', async () => {
    expect.assertions(2)
    noSession()
    const result = await fetchRemoteCases()
    // the diagnosis you just got never required signing in
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(mockClient.from).not.toHaveBeenCalled()
  })

  it('sorts newest-first by savedAt and issues no .eq(user_id, ...) filter — RLS is what scopes this; a client-side filter implies otherwise', async () => {
    withSession()
    const rows: CasefileRow[] = [
      { user_id: SESSION_USER_ID, id: 'a', engine_key: 'passport', outcome: 'still_open', data: makeCasefile({ id: 'a', savedAt: 1_000 }), updated_at: 'x' },
      { user_id: SESSION_USER_ID, id: 'b', engine_key: 'voter', outcome: 'still_open', data: makeCasefile({ id: 'b', engineKey: 'voter', savedAt: 3_000 }), updated_at: 'x' },
      { user_id: SESSION_USER_ID, id: 'c', engine_key: 'sir', outcome: 'still_open', data: makeCasefile({ id: 'c', engineKey: 'sir', savedAt: 2_000 }), updated_at: 'x' },
    ]
    selectSpy.mockResolvedValueOnce({ data: rows, error: null })

    const result = await fetchRemoteCases()

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.cases.map(c => c.id)).toEqual(['b', 'c', 'a'])
    expect(selectSpy).toHaveBeenCalledWith('*')
    expect(selectSpy).toHaveBeenCalledTimes(1)
  })

  it('propagates a select error as { ok: false }', async () => {
    withSession()
    selectSpy.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })
    await expect(fetchRemoteCases()).resolves.toEqual({ ok: false, error: 'db down' })
  })

  // A resolved `{ error }` is not the only way a Supabase call can fail —
  // @supabase/auth-js's own internals re-throw anything that isn't itself
  // an AuthError (auth.test.ts's own established precedent for this exact
  // class of test). A genuinely REJECTED promise here must still resolve
  // to { ok: false }, never propagate — this is the highest-risk module in
  // the chunk, so this guard is proven, not assumed.
  it('a rejected getSession() promise still resolves to { ok: false }, never propagates', async () => {
    expect.assertions(1)
    mockClient.auth.getSession.mockRejectedValueOnce(new Error('lock acquisition failed'))
    await expect(fetchRemoteCases()).resolves.toEqual({ ok: false, error: 'lock acquisition failed' })
  })
})

// =============================================================================
// pushCases
// =============================================================================
describe('pushCases', () => {
  it('returns { ok: false } with no call attempted when there is no session', async () => {
    expect.assertions(2)
    noSession()
    const result = await pushCases([makeCasefile()])
    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(mockClient.from).not.toHaveBeenCalled()
  })

  it('issues exactly one upsert call for a 12-case list, with onConflict user_id,id, and every row user_id is the session-read id, not a caller-threaded value', async () => {
    withSession()
    const cases = Array.from({ length: 12 }, (_, i) => makeCasefile({ id: `c${i}`, engineKey: i % 3 === 0 ? 'passport' : i % 3 === 1 ? 'voter' : 'sir' }))
    // 4 fixed assertions + one per row, pinned so a change to `cases`'
    // length above cannot silently reduce coverage without this failing.
    expect.assertions(4 + cases.length)

    const result = await pushCases(cases)

    expect(result).toEqual({ ok: true })
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const [rows, options] = upsertSpy.mock.calls[0]
    expect(rows).toHaveLength(12)
    expect(options).toEqual({ onConflict: 'user_id,id' })
    for (const row of rows) expect(row.user_id).toBe(SESSION_USER_ID)
  })

  it('propagates an upsert error as { ok: false }', async () => {
    withSession()
    upsertSpy.mockResolvedValueOnce({ data: null, error: { message: 'constraint violated' } })
    await expect(pushCases([makeCasefile()])).resolves.toEqual({ ok: false, error: 'constraint violated' })
  })

  it('a rejected upsert() promise still resolves to { ok: false }, never propagates', async () => {
    expect.assertions(1)
    withSession()
    upsertSpy.mockRejectedValueOnce(new Error('storage adapter blocked'))
    await expect(pushCases([makeCasefile()])).resolves.toEqual({ ok: false, error: 'storage adapter blocked' })
  })
})

// =============================================================================
// runSignInMigration — the impure orchestrator
// =============================================================================
describe('runSignInMigration — the clear-order guarantee (design note 9)', () => {
  it('a whole-batch push failure: clearLocalCases is not called, nm_cases is untouched, and the function returns { ok: false } rather than throwing', async () => {
    expect.assertions(3)
    withSession()
    const original = [makeCasefile({ id: 'p1', engineKey: 'passport' })]
    saveCases(original)
    upsertSpy.mockResolvedValueOnce({ data: null, error: { message: 'network dropped' } })

    const result = await runSignInMigration(1_000_000)

    expect(localStorage.getItem('nm_cases')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('nm_cases')!)).toEqual(original)
    expect(result).toEqual({ ok: false, error: expect.any(String) })
  })
})

describe('runSignInMigration — happy path', () => {
  it('calls fetchRemoteCases, then pushCases once, then clearLocalCases once, in that order, and returns { ok: true, cases: merged }, not adopted', async () => {
    withSession()
    const localCase = makeCasefile({ id: 'local-1', engineKey: 'passport', savedAt: 1_000 })
    saveCases([localCase])
    const remoteRow: CasefileRow = {
      user_id: SESSION_USER_ID, id: 'remote-1', engine_key: 'voter', outcome: 'still_open',
      data: makeCasefile({ id: 'remote-1', engineKey: 'voter', savedAt: 2_000 }), updated_at: 'x',
    }
    selectSpy.mockResolvedValueOnce({ data: [remoteRow], error: null })

    const result = await runSignInMigration(3_000)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.cases.map(c => c.id).sort()).toEqual(['local-1', 'remote-1'])
    expect(localStorage.getItem('nm_cases')).toBeNull()

    const selectOrder = selectSpy.mock.invocationCallOrder[0]
    const upsertOrder = upsertSpy.mock.invocationCallOrder[0]
    expect(selectOrder).toBeLessThan(upsertOrder)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
  })

  it('when fetchRemoteCases fails, does not push and does not clear', async () => {
    expect.assertions(3)
    withSession()
    saveCases([makeCasefile({ id: 'p1' })])
    selectSpy.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })

    const result = await runSignInMigration(1_000)

    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(localStorage.getItem('nm_cases')).not.toBeNull()
  })
})

describe('runSignInMigration — idempotence (design note 8)', () => {
  it('a crash-before-clear followed by a retry: the case is not re-uploaded, not duplicated, not superseded on the second run, and the end state is unchanged', async () => {
    withSession()
    const localOpen = makeCasefile({ id: 'local-p', engineKey: 'passport', outcome: 'still_open' })
    saveCases([localOpen])

    // First run: server has nothing yet. Pushes the one row.
    selectSpy.mockResolvedValueOnce({ data: [], error: null })
    const first = await runSignInMigration(1_000)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('unreachable')
    const firstPayload = upsertSpy.mock.calls[0][0]
    expect(firstPayload).toHaveLength(1)
    expect(firstPayload[0].id).toBe('local-p')

    // Simulate the crash-before-clear retry: nm_cases still has the local
    // case (as if the clear never ran), AND the server now genuinely holds
    // what the first run pushed — the exact scenario design note 5 exists
    // for.
    saveCases([localOpen])
    const uploadedRow: CasefileRow = {
      user_id: SESSION_USER_ID, id: 'local-p', engine_key: 'passport', outcome: 'still_open',
      data: localOpen, updated_at: 'x',
    }
    selectSpy.mockResolvedValueOnce({ data: [uploadedRow], error: null })

    const second = await runSignInMigration(2_000)
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error('unreachable')
    const secondPayload = upsertSpy.mock.calls[1][0]

    // Rule zero drops the already-uploaded case from the retry's own
    // toUpload — it is NOT re-sent (no duplication) and, critically, it
    // does not carry a 'superseded' outcome the way a missing-rule-zero
    // implementation would produce (the exact regression design note 5
    // warns about, in its orchestrated form).
    expect(secondPayload.find((r: { id: string }) => r.id === 'local-p')).toBeUndefined()
    expect(second.cases).toHaveLength(1)
    expect(second.cases.find(c => c.id === 'local-p')!.outcome).toBe('still_open')
    // End state is unchanged across the two runs: same one case, same
    // outcome, whether the citizen's browser retried or not.
    expect(second.cases.map(c => ({ id: c.id, outcome: c.outcome }))).toEqual(
      first.cases.map(c => ({ id: c.id, outcome: c.outcome })),
    )
    expect(localStorage.getItem('nm_cases')).toBeNull()
  })
})

describe('runSignInMigration — the signed-out guards', () => {
  it('with no session, fetchRemoteCases and pushCases each return { ok: false } and from() is never called', async () => {
    expect.assertions(3)
    noSession()
    saveCases([makeCasefile()])

    // the diagnosis you just got never required signing in
    const result = await runSignInMigration(1_000)

    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(mockClient.from).not.toHaveBeenCalled()
    expect(localStorage.getItem('nm_cases')).not.toBeNull()
  })
})
