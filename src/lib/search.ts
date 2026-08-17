import type { Category, Locale, MenuItem } from './types';

/**
 * Menu search — name, category, and ingredients, in all three languages at once.
 *
 * Runs entirely on the client against the already-downloaded catalog, so
 * typing costs zero network round trips and zero Sheets quota.
 *
 * Thai does not put spaces between words, so a tokenising matcher is the wrong
 * tool: "ต้มยำกุ้ง" is one run of characters containing "ยำ" and "กุ้ง". A
 * scored substring match over a normalised index handles Thai, English and
 * Chinese with the same code path.
 */

/** Thai tone marks and above/below vowels, stripped for fuzzy matching. */
const THAI_DIACRITICS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

export function normalise(input: string): string {
  return input.normalize('NFC').toLowerCase().trim();
}

/** Looser form: same text with Thai diacritics removed, to survive typos. */
export function loosen(input: string): string {
  return normalise(input).replace(THAI_DIACRITICS, '');
}

export interface SearchDoc {
  id: string;
  name: string;
  nameLoose: string;
  tags: string;
  ingredients: string;
  ingredientsLoose: string;
  category: string;
  description: string;
  haystack: string;
  haystackLoose: string;
}

/** Built once per catalog version and reused for every keystroke. */
export function buildIndex(
  items: MenuItem[],
  categories: Category[],
): Map<string, SearchDoc> {
  const catName = new Map(
    categories.map((c) => [c.id, [c.name.th, c.name.en, c.name.zh].join(' ')]),
  );

  const index = new Map<string, SearchDoc>();
  for (const item of items) {
    const name = normalise([item.name.th, item.name.en, item.name.zh].join(' '));
    const tags = normalise(item.tags.join(' '));
    const ingredients = normalise(
      [item.ingredients.th, item.ingredients.en, item.ingredients.zh].join(' '),
    );
    const category = normalise(catName.get(item.categoryId) ?? '');
    const description = normalise(
      [item.description.th, item.description.en, item.description.zh].join(' '),
    );
    const haystack = [name, tags, ingredients, category, description].join(' ');

    index.set(item.id, {
      id: item.id,
      name,
      nameLoose: loosen(name),
      tags,
      ingredients,
      ingredientsLoose: loosen(ingredients),
      category,
      description,
      haystack,
      haystackLoose: loosen(haystack),
    });
  }
  return index;
}

export interface SearchHit {
  id: string;
  score: number;
  /** Which field produced the best match — drives the "found in…" hint. */
  field: 'name' | 'tag' | 'ingredient' | 'category' | 'description';
}

const WEIGHTS = {
  name: 100,
  tag: 60,
  ingredient: 45,
  category: 40,
  description: 25,
} as const;

function fieldScore(haystack: string, needle: string): number {
  const at = haystack.indexOf(needle);
  if (at === -1) return 0;
  if (at === 0) return 1;
  // A match right after a space reads as a word start even in mixed scripts.
  return haystack[at - 1] === ' ' ? 0.85 : 0.6;
}

/**
 * Scores one item against a query. Every whitespace-separated term must match
 * somewhere, so "ผัด กุ้ง" narrows rather than widens.
 */
export function scoreDoc(doc: SearchDoc, terms: string[]): SearchHit | null {
  let total = 0;
  let best: SearchHit['field'] = 'description';
  let bestWeight = 0;

  for (const term of terms) {
    const loose = loosen(term);

    const candidates: [SearchHit['field'], number, number][] = [
      ['name', WEIGHTS.name, fieldScore(doc.name, term)],
      ['tag', WEIGHTS.tag, fieldScore(doc.tags, term)],
      ['ingredient', WEIGHTS.ingredient, fieldScore(doc.ingredients, term)],
      ['category', WEIGHTS.category, fieldScore(doc.category, term)],
      ['description', WEIGHTS.description, fieldScore(doc.description, term)],
    ];

    let termBest = 0;
    for (const [field, weight, hit] of candidates) {
      if (hit === 0) continue;
      const value = weight * hit;
      if (value > termBest) termBest = value;
      if (weight > bestWeight) {
        bestWeight = weight;
        best = field;
      }
    }

    if (termBest === 0) {
      // Fall back to the diacritic-stripped index. Half credit: it is a
      // typo-tolerant match, not an exact one.
      const looseHit =
        fieldScore(doc.nameLoose, loose) * WEIGHTS.name ||
        fieldScore(doc.ingredientsLoose, loose) * WEIGHTS.ingredient ||
        fieldScore(doc.haystackLoose, loose) * WEIGHTS.description;
      if (looseHit === 0) return null;
      termBest = looseHit * 0.5;
    }

    total += termBest;
  }

  return { id: doc.id, score: total, field: best };
}

export function search(
  query: string,
  index: Map<string, SearchDoc>,
  limit = 60,
): SearchHit[] {
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const doc of index.values()) {
    const hit = scoreDoc(doc, terms);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Highlight ranges for rendering. Returns [before, match, after] segments. */
export function highlight(text: string, query: string): string[] {
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [text];
  const lower = normalise(text);

  let at = -1;
  let matched = '';
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (at === -1 || idx < at)) {
      at = idx;
      matched = term;
    }
  }
  if (at === -1) return [text];
  return [text.slice(0, at), text.slice(at, at + matched.length), text.slice(at + matched.length)];
}

/** Filters applied alongside the text query. */
export interface MenuFilters {
  categoryId?: string;
  /** Allergen ids the guest declared — matching dishes are flagged, not hidden. */
  hideAllergens?: string[];
  vegetarianOnly?: boolean;
  maxSpicy?: number;
  availableOnly?: boolean;
}

export function applyFilters(items: MenuItem[], f: MenuFilters): MenuItem[] {
  return items.filter((item) => {
    if (f.availableOnly !== false && !item.isAvailable) return false;
    if (f.categoryId && item.categoryId !== f.categoryId) return false;
    if (f.vegetarianOnly && !item.isVegetarian) return false;
    if (f.maxSpicy !== undefined && item.spicyLevel > f.maxSpicy) return false;
    if (f.hideAllergens?.length) {
      const bad = f.hideAllergens.some((a) => item.allergens.includes(a));
      if (bad) return false;
    }
    return true;
  });
}

/** Allergen ids on this dish that the guest declared. Empty means safe. */
export function allergenConflicts(
  item: MenuItem,
  profile: string[],
): { certain: string[]; possible: string[] } {
  if (profile.length === 0) return { certain: [], possible: [] };
  const set = new Set(profile);
  return {
    certain: item.allergens.filter((a) => set.has(a)),
    possible: item.mayContain.filter((a) => set.has(a)),
  };
}

export function localizedName(
  value: { th: string; en: string; zh: string },
  locale: Locale,
): string {
  return value[locale] || value.th || value.en || value.zh || '';
}
