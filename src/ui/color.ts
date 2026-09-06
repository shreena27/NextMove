/** Colour maths for the ΔE perceptual-floor guardrail and WCAG contrast
 *  checks. Pure, no dependencies — standard CIEDE2000 (CIE 1976 L*a*b*,
 *  D65 white point) and the WCAG 2.x relative-luminance contrast formula.
 *  This is textbook maths, not a NextMove design decision; see
 *  src/ui/tokens.ts and tokens.test.ts for how it's used and why. */

type RGB = [number, number, number]
type Lab = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

// sRGB companding: 8-bit channel -> linear-light [0,1].
function srgbToLinear(c8: number): number {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

// D65 reference white, CIE 1931 2-degree observer (sRGB's own primaries).
const WHITE_X = 95.047
const WHITE_Y = 100.0
const WHITE_Z = 108.883

// linear sRGB -> CIE XYZ (D65), via the standard sRGB/XYZ matrix.
function rgbToXyz([r8, g8, b8]: RGB): [number, number, number] {
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) * 100
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) * 100
  return [x, y, z]
}

function fLab(t: number): number {
  const delta = 6 / 29
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29
}

// CIE XYZ (D65) -> CIE L*a*b*.
function xyzToLab([x, y, z]: [number, number, number]): Lab {
  const fx = fLab(x / WHITE_X)
  const fy = fLab(y / WHITE_Y)
  const fz = fLab(z / WHITE_Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function hexToLab(hex: string): Lab {
  return xyzToLab(rgbToXyz(hexToRgb(hex)))
}

/** CIEDE2000 colour difference between two sRGB hex colours (e.g. "#FAF7EF").
 *  Returns 0 for identical colours; ~100 for black vs white. Implements the
 *  standard CIE 2000 formula (Sharma, Wu & Dalal), term names kept close to
 *  the reference paper so this can be checked against it line by line. */
export function deltaE2000(hexA: string, hexB: string): number {
  const [L1, a1, b1] = hexToLab(hexA)
  const [L2, a2, b2] = hexToLab(hexB)

  const kL = 1
  const kC = 1
  const kH = 1

  // Step 1: adjusted a* (G compensates for the CIE94 "grey axis" flaw).
  const C1 = Math.sqrt(a1 * a1 + b1 * b1)
  const C2 = Math.sqrt(a2 * a2 + b2 * b2)
  const CBar = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(CBar, 7) / (Math.pow(CBar, 7) + Math.pow(25, 7))))
  const a1p = a1 * (1 + G)
  const a2p = a2 * (1 + G)

  // Step 2: C'ab, h'ab (chroma and hue angle in the adjusted a'/b' space).
  const C1p = Math.sqrt(a1p * a1p + b1 * b1)
  const C2p = Math.sqrt(a2p * a2p + b2 * b2)
  const hpDeg = (a: number, bv: number) => {
    if (a === 0 && bv === 0) return 0
    const deg = (Math.atan2(bv, a) * 180) / Math.PI
    return deg < 0 ? deg + 360 : deg
  }
  const h1p = hpDeg(a1p, b1)
  const h2p = hpDeg(a2p, b2)

  // Step 3: deltas between the two colours.
  const deltaLp = L2 - L1
  const deltaCp = C2p - C1p
  let deltahp: number
  if (C1p * C2p === 0) {
    deltahp = 0
  } else if (Math.abs(h2p - h1p) <= 180) {
    deltahp = h2p - h1p
  } else if (h2p - h1p > 180) {
    deltahp = h2p - h1p - 360
  } else {
    deltahp = h2p - h1p + 360
  }
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((deltahp * Math.PI) / 180 / 2)

  // Step 4: CIEDE2000 weighting functions (SL, SC, SH) and the RT rotation
  // term that corrects for interaction between chroma and hue in the blue
  // region.
  const LpBar = (L1 + L2) / 2
  const CpBar = (C1p + C2p) / 2
  let hpBarSum: number
  if (C1p * C2p === 0) {
    hpBarSum = h1p + h2p
  } else if (Math.abs(h1p - h2p) <= 180) {
    hpBarSum = h1p + h2p
  } else if (h1p + h2p < 360) {
    hpBarSum = h1p + h2p + 360
  } else {
    hpBarSum = h1p + h2p - 360
  }
  const hpBar = C1p * C2p === 0 ? h1p + h2p : hpBarSum / 2

  const T =
    1 -
    0.17 * Math.cos(((hpBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hpBar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hpBar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hpBar - 63) * Math.PI) / 180)

  const deltaTheta = 30 * Math.exp(-Math.pow((hpBar - 275) / 25, 2))
  const RC = 2 * Math.sqrt(Math.pow(CpBar, 7) / (Math.pow(CpBar, 7) + Math.pow(25, 7)))
  const SL = 1 + (0.015 * Math.pow(LpBar - 50, 2)) / Math.sqrt(20 + Math.pow(LpBar - 50, 2))
  const SC = 1 + 0.045 * CpBar
  const SH = 1 + 0.015 * CpBar * T
  const RT = -Math.sin((2 * deltaTheta * Math.PI) / 180) * RC

  const termL = deltaLp / (kL * SL)
  const termC = deltaCp / (kC * SC)
  const termH = deltaHp / (kH * SH)

  return Math.sqrt(termL * termL + termC * termC + termH * termH + RT * termC * termH)
}

// WCAG relative luminance: linear-light channels weighted by the CIE Y
// coefficients used in the sRGB/XYZ matrix above.
function relativeLuminance(hex: string): number {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two sRGB hex colours, in the range [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const L1 = relativeLuminance(hexA)
  const L2 = relativeLuminance(hexB)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}
