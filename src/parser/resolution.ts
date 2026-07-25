// Pure resolution helpers shared by the rules parser and the LLM path.

/** ~40 common ISO-4217 codes we treat as "known" when sniffing a currency token. */
export const KNOWN_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'AUD', 'CAD',
  'CHF', 'SEK', 'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'KRW',
  'TRY', 'RUB', 'BRL', 'ZAR', 'AED', 'SAR', 'PLN', 'THB',
  'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'DKK', 'KWD',
  'BHD', 'OMR', 'QAR', 'EGP', 'VND', 'NGN', 'TWD', 'MYR',
  'RON', 'ISK',
]);

const SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
};

/**
 * Resolve a currency token to a 3-letter ISO code.
 * - A `$/€/£/¥` symbol → USD/EUR/GBP/JPY.
 * - A known 3-letter code (any case) → the code, uppercased.
 * - Anything else (null, unknown code, junk) → `defaultCurrency`, uppercased.
 */
export function resolveCurrencyToken(token: string | null, defaultCurrency: string): string {
  const fallback = defaultCurrency.toUpperCase();
  if (!token) return fallback;
  const trimmed = token.trim();
  if (trimmed in SYMBOL_TO_CODE) return SYMBOL_TO_CODE[trimmed]!;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper) && KNOWN_CURRENCIES.has(upper)) return upper;
  return fallback;
}

/**
 * Normalize a raw numeric string to a plain `1234.56`-style decimal.
 * Handles EU `1.234,56` vs US `1,234.56`:
 * - both separators present → the LAST one is the decimal, the other is thousands.
 * - only comma present → decimal when exactly 1-2 digits follow, else thousands.
 * - dot-only / no separators → returned unchanged.
 */
export function normalizeAmount(raw: string): string {
  let s = raw.trim();
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // comma is the decimal separator
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // dot is the decimal separator
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    const frac = parts[parts.length - 1]!;
    if (parts.length === 2 && frac.length >= 1 && frac.length <= 2) {
      // treat as decimal: "1,50" -> "1.50"
      s = `${parts[0]!}.${frac}`;
    } else {
      // treat as thousands: "1,234" / "1,234,567" -> strip
      s = s.replace(/,/g, '');
    }
  }

  return s;
}

function todayInTz(timezone: string, now: Date): string {
  // en-CA yields YYYY-MM-DD; the timeZone option shifts to the user's local date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Shift a YYYY-MM-DD string by whole days using UTC math (DST-safe). */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-');
  const base = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const shifted = new Date(base + deltaDays * 86_400_000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Resolve a date hint to a YYYY-MM-DD in the user's IANA `timezone`.
 * Supports: null/'today' → today; 'yesterday' → -1; 'N days ago'; an explicit
 * YYYY-MM-DD passthrough. Anything else falls back to today.
 */
export function resolveDate(hint: string | null, timezone: string, now: Date): string {
  const today = todayInTz(timezone, now);
  if (!hint) return today;

  const h = hint.trim().toLowerCase();
  if (h === '' || h === 'today') return today;
  if (h === 'yesterday') return shiftYmd(today, -1);

  const daysAgo = h.match(/^(\d+)\s+days?\s+ago$/);
  if (daysAgo) return shiftYmd(today, -Number(daysAgo[1]));

  if (/^\d{4}-\d{2}-\d{2}$/.test(h)) return h;

  return today;
}
