export const CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Housing',
  'Utilities',
  'Entertainment',
  'Shopping',
  'Health',
  'Travel',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Keyword → category. Extend freely; unknown words fall through to 'Other'.
const KEYWORDS: Record<string, Category> = {
  food: 'Food', lunch: 'Food', dinner: 'Food', breakfast: 'Food', coffee: 'Food',
  restaurant: 'Food', snack: 'Food', meal: 'Food',
  groceries: 'Groceries', grocery: 'Groceries', supermarket: 'Groceries',
  gas: 'Transport', fuel: 'Transport', uber: 'Transport', taxi: 'Transport',
  bus: 'Transport', train: 'Transport', transport: 'Transport', parking: 'Transport', metro: 'Transport',
  rent: 'Housing', mortgage: 'Housing', housing: 'Housing',
  electricity: 'Utilities', water: 'Utilities', internet: 'Utilities', phone: 'Utilities',
  utilities: 'Utilities', utility: 'Utilities',
  movie: 'Entertainment', game: 'Entertainment', entertainment: 'Entertainment',
  netflix: 'Entertainment', concert: 'Entertainment',
  clothes: 'Shopping', shopping: 'Shopping', amazon: 'Shopping', shoes: 'Shopping',
  doctor: 'Health', pharmacy: 'Health', health: 'Health', gym: 'Health', medicine: 'Health',
  flight: 'Travel', hotel: 'Travel', travel: 'Travel', airbnb: 'Travel',
};

/** Map free text to a fixed category. Off-list input resolves to 'Other'. */
export function coerceCategory(text: string): Category {
  const lowered = text.toLowerCase();
  for (const word of lowered.split(/\s+/)) {
    const cat = KEYWORDS[word];
    if (cat) return cat;
  }
  const direct = CATEGORIES.find((c) => c.toLowerCase() === lowered.trim());
  return direct ?? 'Other';
}
