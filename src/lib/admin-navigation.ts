import type { AdminCatalogKind } from './api-v1';

export const adminCatalogs = {
  'admin-insurers': 'insurers',
  'admin-medications': 'medications',
  'admin-professionals': 'professionals',
  'admin-facilities': 'facilities',
} as const satisfies Record<string, AdminCatalogKind>;

export const adminDestinations = {
  'admin-insurers': 'Administradoras de saúde',
  'admin-medications': 'Medicamentos',
  'admin-professionals': 'Profissionais',
  'admin-facilities': 'Estabelecimentos de saúde',
  'admin-integrations': 'Integrações',
  'admin-verification': 'Validação de profissionais',
  'admin-tutorship': 'Solicitações de tutoria',
  'admin-storage': 'Planos de armazenamento',
  'admin-identification': 'Auditoria de identificação',
} as const;

export type AdminDestination = keyof typeof adminDestinations;
export function isAdminDestination(view: string): view is AdminDestination {
  return Object.prototype.hasOwnProperty.call(adminDestinations, view);
}

export function isAdminCatalog(view: AdminDestination): view is keyof typeof adminCatalogs {
  return Object.prototype.hasOwnProperty.call(adminCatalogs, view);
}
