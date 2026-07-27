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

export function resolveCurrencyToken(token: string | null, defaultCurrency: string): string {
  const fallback = defaultCurrency.toUpperCase();
  if (!token) return fallback;
  const trimmed = token.trim();
  if (trimmed in SYMBOL_TO_CODE) return SYMBOL_TO_CODE[trimmed]!;
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper) && KNOWN_CURRENCIES.has(upper)) return upper;
  return fallback;
}

// handles EU 1.234,56 vs US 1,234.56: with both separators, the last one is the decimal
export function normalizeAmount(raw: string): string {
  let s = raw.trim();
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    const frac = parts[parts.length - 1]!;
    if (parts.length === 2 && frac.length >= 1 && frac.length <= 2) {
      s = `${parts[0]!}.${frac}`;
    } else {
      s = s.replace(/,/g, '');
    }
  }

  return s;
}

function todayInTz(timezone: string, now: Date): string {
  // en-CA locale yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// UTC math keeps day-shifting DST-safe
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-');
  const base = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const shifted = new Date(base + deltaDays * 86_400_000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

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
