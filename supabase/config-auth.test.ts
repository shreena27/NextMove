import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// This is a config-fidelity test over supabase/config.toml, a TOML file.
// There is no TOML parser dependency in this project, and adding one for
// six flat assertions would be more machinery than the job needs, so this
// reads the file as text and extracts the pieces it needs directly. It is
// deliberately narrow: it is not a TOML validator, it pins the specific
// values Task 1 commits to.

const here = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(here, 'config.toml')
const configText = readFileSync(configPath, 'utf-8')

/**
 * Returns the raw text of a top-level `[section]` block: everything after
 * the `[section]` header line up to (but not including) the next
 * top-level `[...]` header, or end of file.
 */
function section(name: string): string {
  const headerRe = new RegExp(`^\\[${name.replace(/\./g, '\\.')}\\]\\s*$`, 'm')
  const match = headerRe.exec(configText)
  if (!match) return ''
  const start = match.index + match[0].length
  const rest = configText.slice(start)
  const nextHeader = /^\[[^\]]+\]\s*$/m.exec(rest)
  return nextHeader ? rest.slice(0, nextHeader.index) : rest
}

function readValue(sectionText: string, key: string): string | undefined {
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(.+)$`, 'm')
  const match = re.exec(sectionText)
  return match?.[1].trim()
}

describe('supabase/config.toml — auth configuration (Task 1)', () => {
  describe('[auth] site_url and additional_redirect_urls', () => {
    const auth = section('auth')

    it('site_url is exactly the Vite dev server origin (a mismatch causes GoTrue to silently redirect to site_url instead of the app, which looks like "OAuth worked but the session vanished")', () => {
      expect(readValue(auth, 'site_url')).toBe('"http://localhost:5173"')
    })

    it('additional_redirect_urls contains both localhost and 127.0.0.1 on port 5173, since redirectTo is window.location.origin and either hostname may be what the developer typed', () => {
      const raw = readValue(auth, 'additional_redirect_urls') ?? ''
      expect(raw).toContain('http://localhost:5173')
      expect(raw).toContain('http://127.0.0.1:5173')
    })

    it('additional_redirect_urls contains no https:// entry (the generated https://127.0.0.1:3000 is a CLI-default artefact this app is never served from)', () => {
      const raw = readValue(auth, 'additional_redirect_urls') ?? ''
      expect(raw).not.toMatch(/https:\/\//)
    })
  })

  describe('[auth.sms] — phone OTP must actually verify', () => {
    const sms = section('auth.sms')

    it('enable_signup is true (phone sign-in needs an account to exist)', () => {
      expect(readValue(sms, 'enable_signup')).toBe('true')
    })

    it('enable_confirmations is true — with it false, GoTrue skips verification and verifyOtp has nothing to verify', () => {
      expect(readValue(sms, 'enable_confirmations')).toBe('true')
    })
  })

  describe('[auth.sms.test_otp] — fixtures for manual verification', () => {
    const testOtp = section('auth.sms.test_otp')

    it('the section is uncommented and present (a commented section provides no fixtures GoTrue can read)', () => {
      expect(testOtp.trim().length).toBeGreaterThan(0)
    })

    it('every key is digits-only with no leading "+" (GoTrue strips the leading "+" from E.164 before lookup)', () => {
      const keyLines = testOtp
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      expect(keyLines.length).toBeGreaterThan(0)
      for (const line of keyLines) {
        const key = line.split('=')[0].trim()
        expect(key).toMatch(/^\d+$/)
      }
    })

    it('at least two distinct numbers are configured (Task 7\'s conflict case and Task 8\'s cross-account-leak case both need two distinct accounts to verify by hand)', () => {
      const keyLines = testOtp
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      const keys = new Set(keyLines.map((l) => l.split('=')[0].trim()))
      expect(keys.size).toBeGreaterThanOrEqual(2)
    })
  })

  describe('[auth.sms.twilio] — the local-only provider-enabled shim (a committed OAuth/SMS secret is a security incident, not a bug)', () => {
    const twilio = section('auth.sms.twilio')

    it('is enabled — the Supabase CLI force-disables all of [auth.sms] unless one of the real SMS provider blocks reports enabled = true, and [auth.sms.test_otp] alone does not satisfy that check', () => {
      expect(readValue(twilio, 'enabled')).toBe('true')
    })

    it('account_sid is an env(...) indirection, never a literal', () => {
      const raw = readValue(twilio, 'account_sid') ?? ''
      expect(raw.replace(/^"|"$/g, '')).toMatch(/^env\(/)
    })

    it('message_service_sid is an env(...) indirection, never a literal', () => {
      const raw = readValue(twilio, 'message_service_sid') ?? ''
      expect(raw.replace(/^"|"$/g, '')).toMatch(/^env\(/)
    })

    it('auth_token is an env(...) indirection, never a literal', () => {
      const raw = readValue(twilio, 'auth_token') ?? ''
      expect(raw.replace(/^"|"$/g, '')).toMatch(/^env\(/)
    })
  })

  describe('[auth.email.template.magic_link] — email OTP must send a code, not a link', () => {
    const template = section('auth.email.template.magic_link')

    it('the section exists with a content_path', () => {
      expect(readValue(template, 'content_path')).toBeTruthy()
    })

    it('the referenced template file exists on disk as a file (content_path is relative to the project root, not to supabase/)', () => {
      const rawPath = readValue(template, 'content_path')
      expect(rawPath, 'content_path is not set').toBeTruthy()
      const cleanPath = (rawPath ?? '').replace(/^"|"$/g, '')
      const projectRoot = resolve(here, '..')
      const resolvedPath = resolve(projectRoot, cleanPath)
      expect(existsSync(resolvedPath) && !statSync(resolvedPath).isDirectory()).toBe(true)
    })

    it('the template contains {{ .Token }} and not {{ .ConfirmationURL }} — the default template sends a link, which signInWithOtp({ email }) would then prefer over a code', () => {
      const rawPath = readValue(template, 'content_path')
      expect(rawPath, 'content_path is not set').toBeTruthy()
      const cleanPath = (rawPath ?? '').replace(/^"|"$/g, '')
      const projectRoot = resolve(here, '..')
      const resolvedPath = resolve(projectRoot, cleanPath)
      const isFile = existsSync(resolvedPath) && !statSync(resolvedPath).isDirectory()
      const html = isFile ? readFileSync(resolvedPath, 'utf-8') : ''
      expect(html).toContain('{{ .Token }}')
      expect(html).not.toContain('{{ .ConfirmationURL }}')
    })
  })

  describe('[auth.external.google] — a committed OAuth secret is a security incident, not a bug', () => {
    const google = section('auth.external.google')

    it('is enabled (empirically verified safe locally with unset env vars — see Task 1 design note 5)', () => {
      expect(readValue(google, 'enabled')).toBe('true')
    })

    it('client_id is an env(...) indirection, never a literal', () => {
      const raw = readValue(google, 'client_id') ?? ''
      expect(raw.replace(/^"|"$/g, '')).toMatch(/^env\(/)
    })

    it('secret is an env(...) indirection, never a literal', () => {
      const raw = readValue(google, 'secret') ?? ''
      expect(raw.replace(/^"|"$/g, '')).toMatch(/^env\(/)
    })
  })

  describe('ports — unchanged from the recorded +10 shift; reverting them breaks the ticklist-foundation stack running alongside this one', () => {
    it('[api] port is 54331', () => {
      expect(readValue(section('api'), 'port')).toBe('54331')
    })

    it('[db] port is 54332', () => {
      expect(readValue(section('db'), 'port')).toBe('54332')
    })

    it('[db] shadow_port is 54330', () => {
      expect(readValue(section('db'), 'shadow_port')).toBe('54330')
    })

    it('[db.pooler] port is 54339', () => {
      expect(readValue(section('db.pooler'), 'port')).toBe('54339')
    })

    it('[studio] port is 54333', () => {
      expect(readValue(section('studio'), 'port')).toBe('54333')
    })

    it('[local_smtp] (Mailpit) port is 54334', () => {
      expect(readValue(section('local_smtp'), 'port')).toBe('54334')
    })

    it('[analytics] port is 54337', () => {
      expect(readValue(section('analytics'), 'port')).toBe('54337')
    })

    it('[edge_runtime] inspector_port is 8093', () => {
      expect(readValue(section('edge_runtime'), 'inspector_port')).toBe('8093')
    })
  })
})
