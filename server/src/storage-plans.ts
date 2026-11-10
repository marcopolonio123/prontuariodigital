export const FREE_STORAGE_BYTES = 1_000_000_000n;
export const CHECKOUT_ENABLED = false;

export const paidStoragePlans = [
  { gb: 5, priceCents: 200 },
  { gb: 10, priceCents: 350 },
  { gb: 20, priceCents: 650 },
].map(plan => ({ ...plan, currency: 'BRL', period: 'month' as const, purchasable: CHECKOUT_ENABLED }));

export const storagePlanCatalog = [
  { gb: 1, priceCents: 0, currency: 'BRL', period: 'unlimited' as const, purchasable: false },
  ...paidStoragePlans,
];
