export type AdminLinkKind = 'profiles' | 'dependents' | 'received' | 'granted';
export interface AdminPage<T> { items: T[]; total: number; page: number; size: number; }
export interface AdminAccountIdentity { userNumber: number; name: string; }
export interface AdminAccountRow extends AdminAccountIdentity {
  email: string;
  limitBytes: number;
  cartGb: number | null;
  profiles: number;
  dependents: number;
  received: number;
  granted: number;
}
interface PatientIdentity { recordNumber: number; name: string; }
export type AdminRelationship = (PatientIdentity & { owner: AdminAccountIdentity; tutor: AdminAccountIdentity | null }) | {
  id: string;
  patient: PatientIdentity;
  account: AdminAccountIdentity;
  grantedByUser: AdminAccountIdentity | null;
  permission: string;
  status: 'revoked' | 'archived' | 'scheduled' | 'expired' | 'active';
  validFrom: string;
  validUntil: string | null;
};
export interface AdminAccountFilters {
  q: string; plan: string; cart: string; dependents: string; received: string; granted: string; sort: 'name-asc' | 'name-desc';
}
export interface AdminStoragePlans {
  checkoutEnabled: boolean;
  plans: { gb: number; priceCents: number; currency: string; period: 'unlimited' | 'month'; purchasable: boolean }[];
}
export interface AdminOverview {
  observedAt: string;
  api: 'responding';
  database: 'responding';
  storageMode: 's3' | 'default';
  checkoutEnabled: boolean;
  personalBytes: number;
  totals: {
    accounts: number; profiles: number; dependents: number; tutors: number; accesses: number;
    professionals: number; storageAccounts: number;
  };
}
