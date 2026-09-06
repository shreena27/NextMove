/** The v2 visual world's colour tokens, transcribed byte-for-byte from the
 *  locked prototype (91ff7a1:design/nextmove-v1-prototype.html, lines 105-143).
 *  index.css is asserted against this map, so the two cannot drift. */
export const TOKENS = {
  paper: '#FAF7EF',
  card: '#FFFFFF',
  ink: '#3D241C',
  'ink-soft': '#5C5044',
  'ink-faint': '#756D5F',
  line: '#EAE4D6',
  'line-strong': '#DCD4C2',
  butter: '#F5D848',
  'butter-deep': '#E8C51F',
  'butter-soft': '#FDF8E3',
  'sq-green': '#2FA866',
  done: '#2FA866',
  'done-bg': '#DFF3E6',
  'done-deep': '#20714A',
  'sq-pink': '#F0679E',
  'sq-blue': '#5FA8E8',
  wait: '#1F6B3D',
  'wait-bg': '#D9F2DF',
  follow: '#8A5A0F',
  'follow-bg': '#FBEFC9',
  escalate: '#9E2F1F',
  'escalate-bg': '#FBDFD6',
  unclassified: '#6B6257',
  'unclassified-bg': '#EFEAE0',
} as const

/** Structurally reserved: no decorative element may reuse these (PRD §16).
 *  This rule was broken twice by passes that believed they were honouring
 *  it, which is why it is enforced by the ΔE floor test, not by attention. */
export const STATUS_FILLS = {
  WAIT: TOKENS['wait-bg'],
  FOLLOW_UP: TOKENS['follow-bg'],
  ESCALATE: TOKENS['escalate-bg'],
  UNCLASSIFIED: TOKENS['unclassified-bg'],
} as const

/** The DECORATIVE FILL tokens — the only ones the ΔE floor scans.
 *
 *  Hand-listed on purpose. A derived "everything that is not a status
 *  token" set is wrong for this guardrail, and measurably so: it drags in
 *  page grounds and hairlines whose closeness to --unclassified-bg (a warm
 *  off-white BY DESIGN) is the palette working, not failing —
 *  --line vs --unclassified-bg is 2.13, --paper vs --unclassified-bg is
 *  2.89 — which bottoms the scanned set out below the just-noticeable
 *  difference and leaves no floor that both passes the locked palette and
 *  catches the historical #FBF0C4 regression (1.75).
 *
 *  The rule this guardrail enforces is narrower than "tokens differ":
 *  no decorative FILL may sit close enough to a reserved status FILL to be
 *  mistaken for one. So:
 *    - grounds (paper, card) and hairlines (line, line-strong) are OUT —
 *      a backdrop and a 1px stroke are not classification chips;
 *    - every ink (ink, ink-soft, ink-faint, butter-deep, done-deep, and the
 *      four status inks) is OUT — ink-on-fill is the contrast test's job;
 *    - done-bg is OUT by a recorded, reasoned exemption: it measures 2.80
 *      from --wait-bg, which is a real collision, pinned by its own test
 *      rather than absorbed by a low floor. C3 mounts it on no
 *      classification surface (its only lifted use, .lrung.done .lr-tag,
 *      ships with the ladder component in C5). C5 must re-open the
 *      question when that component mounts. */
export const NON_STATUS_TOKENS = [
  'butter', 'butter-soft', 'sq-green', 'sq-pink', 'sq-blue',
] as const satisfies readonly (keyof typeof TOKENS)[]
