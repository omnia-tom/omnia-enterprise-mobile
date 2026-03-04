/**
 * Dakkota Meta Catalyst Grant — deployment configuration
 * @see SCOPE_DACKOTA_META_CATALYST.md
 */

export const DAKKOTA_CONFIG = {
  /** Enable Dakkota assembly flow (workstation QR, audio consent, etc.) */
  enabled: true,

  /** Dakkota assembly domains — match grant Section 1.2 */
  assemblyDomains: [
    'front-bumper-grille',
    'front-rear-fascia',
    'front-suspension',
    'rear-suspension',
    'overhead-systems',
    'tire-wheel',
  ] as const,

  /** QR payload format: DAKKOTA-{domain}-{stationId} e.g. DAKKOTA-FBG-001 */
  qrPrefix: 'DAKKOTA-',
} as const;

export type DakkotaAssemblyDomain = (typeof DAKKOTA_CONFIG.assemblyDomains)[number];

/** Extract Dakkota/SOP payload from raw scan data (handles URLs, lowercase, whitespace, encoding) */
function extractDakkotaPayload(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let data = raw.trim().replace(/\s+/g, '-'); // Normalize spaces to hyphens
  if (!data) return null;
  // If it's a URL, try to extract DAKKOTA-... or procedure-station from path
  try {
    if (data.startsWith('http://') || data.startsWith('https://')) {
      const url = new URL(data);
      const path = url.pathname;
      const segment = path.split('/').filter(Boolean).pop() || path;
      const match = segment.match(/(?:DAKKOTA-|DAK-SOP-)?[\w-]+/i);
      if (match) data = match[0];
    }
  } catch {
    // Not a valid URL, use as-is
  }
  return data;
}

/** Parse workstation or SOP procedure QR payload into station and procedure IDs */
export function parseWorkstationQR(data: string): { stationId: string; procedureId: string } | null {
  const raw = extractDakkotaPayload(data);
  if (!raw) return null;
  const upper = raw.toUpperCase();

  // Format 1: DAKKOTA-{procedure}-{station} e.g. DAKKOTA-FBG-001
  const dakkotaPrefix = DAKKOTA_CONFIG.qrPrefix;
  const dakkotaIdx = upper.indexOf(dakkotaPrefix);
  if (dakkotaIdx >= 0) {
    const rest = raw.slice(dakkotaIdx + dakkotaPrefix.length).trim();
    const parts = rest.split('-').filter(Boolean);
    if (parts.length >= 2) {
      return { procedureId: parts[0].toUpperCase(), stationId: parts.slice(1).join('-') || parts[1] };
    }
    if (parts.length === 1) return { procedureId: parts[0].toUpperCase(), stationId: '001' };
  }

  // Format 2: DAK-SOP-{procedure}-{station} (mock SOP procedure for glasses AI demo)
  const sopPrefix = 'DAK-SOP-';
  const sopIdx = upper.indexOf(sopPrefix);
  if (sopIdx >= 0) {
    const rest = raw.slice(sopIdx + sopPrefix.length).trim();
    const parts = rest.split('-').filter(Boolean);
    if (parts.length >= 2) {
      return { procedureId: parts[0].toUpperCase(), stationId: parts.slice(1).join('-') || parts[1] };
    }
    if (parts.length === 1) return { procedureId: parts[0].toUpperCase(), stationId: '001' };
  }

  // Format 3: {procedure}-{station} e.g. FBG-001 or FBG-A12 (minimal, no prefix)
  const hyphenMatch = raw.match(/^([A-Za-z]+)-([\w-]+)$/);
  if (hyphenMatch) {
    return { procedureId: hyphenMatch[1].toUpperCase(), stationId: hyphenMatch[2] };
  }

  // Format 4: {procedure}{station} concatenated e.g. FBG001, FBG 001 (space already normalized to -)
  const concatMatch = raw.match(/^([A-Za-z]+)(\d[\w-]*)$/i);
  if (concatMatch) {
    return { procedureId: concatMatch[1].toUpperCase(), stationId: concatMatch[2] };
  }

  // Format 5: Single procedure code e.g. FBG → use default station 001
  if (/^[A-Za-z]+$/.test(raw)) {
    return { procedureId: raw.toUpperCase(), stationId: '001' };
  }

  return null;
}
