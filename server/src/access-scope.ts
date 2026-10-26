// Versioned scopes distinguish an explicit patient choice from historical grants.
export const ACCESS_SECTIONS = ['record', 'allergies', 'family_history', 'medications', 'diary', 'vitals', 'documents', 'insurance'] as const;
export type AccessSection = typeof ACCESS_SECTIONS[number];
export function validateSections(value: unknown): AccessSection[] | null {
  if (!Array.isArray(value) || !value.length || value.length > ACCESS_SECTIONS.length || value.some(v => typeof v !== 'string' || !ACCESS_SECTIONS.includes(v as AccessSection))) return null;
  return ACCESS_SECTIONS.filter(s => value.includes(s));
}
export function grantedSections(scope: unknown): AccessSection[] {
  if (scope && typeof scope === 'object' && !Array.isArray(scope)) {
    const data = scope as { version?: unknown; sections?: unknown };
    return data.version === 2 ? validateSections(data.sections) ?? [] : [];
  }
  // Existing null/array grants predate selection by section. Preserve their previous
  // access until the patient edits/revokes them; never expand explicit version 2.
  if (scope == null) return [...ACCESS_SECTIONS];
  if (!Array.isArray(scope)) return [];
  const sections = ACCESS_SECTIONS.filter(s => scope.includes(s));
  if (sections.includes('record')) for (const s of ['allergies', 'family_history', 'medications', 'diary'] as const) if (!sections.includes(s)) sections.push(s);
  return sections;
}
export function explicitScope(sections: AccessSection[]) { return { version: 2, sections }; }
export function eventSection(type: string): AccessSection | null {
  if (type === 'family_history') return 'family_history';
  if (type === 'wellbeing_diary') return 'diary';
  if (type === 'vital') return 'vitals';
  if (type === 'insurance') return 'insurance';
  if (type === 'prescription') return 'medications';
  return ['consultation', 'exam', 'hospitalization', 'procedure', 'therapy', 'vaccine', 'other'].includes(type) ? 'record' : null;
}
export function canReadEvent(scope: unknown, type: string) {
  const section = eventSection(type);
  return section !== null && grantedSections(scope).includes(section);
}
export function scopedRecord(data: Record<string, unknown>, scope: unknown) {
  const sections = grantedSections(scope);
  const keys = [ ...(sections.includes('allergies') ? ['bloodType', 'allergies', 'intolerances', 'conditions', 'specialCare', 'emergencyNotes'] : []), ...(sections.includes('medications') ? ['medications'] : []) ];
  return Object.fromEntries(keys.map(key => [key, data[key] ?? null]));
}
