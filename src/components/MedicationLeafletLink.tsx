import { BookOpen } from 'lucide-react';

export const ANVISA_LEAFLET_DIRECTORY = 'https://consultas.anvisa.gov.br/#/bulario/';

export default function MedicationLeafletLink({ registration, name }: { registration?: string | null; name: string }) {
  // Only accept a product number from the linked catalog, never a name or internal code.
  if (!registration || !/^\d{9}$/.test(registration)) return null;
  const href = ANVISA_LEAFLET_DIRECTORY + 'q/?numeroRegistro=' + registration;
  return <a href={href} target="_blank" rel="noopener noreferrer"
    aria-label={`Bula digital de ${name} (Anvisa, nova aba)`}
    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-moss-800 hover:bg-moss-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-moss-700">
    <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" /> Bula digital
  </a>;
}
