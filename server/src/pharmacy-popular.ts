import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
interface Presentation {
  ean: string;
  product: string;
  registration: string | null;
  brand: string | null;
  presentation: string | null;
}
interface Edition {
  edition: string;
  cmedEdition: string;
  rows: Array<{ result: Presentation; search: string }>;
  counts: Map<string, number>;
}
let current: Edition | undefined;

function load() {
  if (current) return current;
  const { edition, cmedEdition, items } = JSON.parse(gunzipSync(readFileSync(
    join(__dirname, '../data/pharmacy-popular.json.gz'),
  ), { maxOutputLength: 1024 * 1024 }).toString('utf8'));
  const date = /^\d{4}-\d\d-\d\d$/;
  if (!date.test(edition) || !date.test(cmedEdition) || !Array.isArray(items) || !items.length || items.length > 10000) {
    throw new Error('Invalid Farmácia Popular edition');
  }
  const counts = new Map<string, number>();
  const rows: Edition['rows'] = [];
  const seen = new Set<string>();
  for (const [ean, product, registration, brand, presentation] of items) {
    if (typeof ean !== 'string' || !/^\d{13}$/.test(ean) || seen.has(ean) ||
      typeof product !== 'string' || !product || (registration !== null && !/^\d{9}$/.test(registration)) ||
      (brand !== null && typeof brand !== 'string') || (presentation !== null && typeof presentation !== 'string')) {
      throw new Error('Invalid Farmácia Popular presentation');
    }
    seen.add(ean);
    if (registration) counts.set(registration, (counts.get(registration) ?? 0) + 1);
    rows.push({ result: { ean, product, registration, brand, presentation },
      search: normalize([product, brand, presentation, registration, ean].filter(Boolean).join(' ')) });
  }
  return current = { edition, cmedEdition, rows, counts };
}

export function pharmacyPopularProductCounts(): ReadonlyMap<string, number> { return load().counts; }

/** A product may have several presentations; the count is only for matched barcodes. */
export function pharmacyPopularCoverage(registration: string): number | undefined {
  try { return load().counts.get(registration) ?? 0; }
  catch { return undefined; } // A missing reference file must not disable the medication agenda.
}

export function listPharmacyPopular(query: string, requestedPage: number, sort: 'asc' | 'desc') {
  const { edition, cmedEdition, rows } = load();
  const term = normalize(query);
  const digits = term.replace(/[ .-]/g, '');
  const terms = term ? term.split(' ') : [];
  const matches = rows.filter(({ result, search }) =>
    /^\d{13}$/.test(digits) ? result.ean === digits
      : /^\d{9}$/.test(digits) ? result.registration === digits
        : terms.every(word => search.includes(word)));
  matches.sort((a, b) => (sort === 'asc' ? 1 : -1) * a.result.product.localeCompare(b.result.product, 'pt-BR') ||
    a.result.ean.localeCompare(b.result.ean));
  const size = 10;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(matches.length / size)));
  return { edition, cmedEdition, page, size, total: matches.length,
    items: matches.slice((page - 1) * size, page * size).map(({ result }) => result) };
}
