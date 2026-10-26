export const ACCESS_SECTIONS = [
  ['record', 'Atendimentos do prontuário'],
  ['allergies', 'Alergias, intolerâncias e cuidados'],
  ['family_history', 'Histórico familiar'],
  ['medications', 'Medicamentos e agenda'],
  ['diary', 'Diário de saúde'],
  ['vitals', 'Sinais vitais'],
  ['documents', 'Documentos e anexos'],
  ['insurance', 'Convênios'],
] as const;
export const ALL_ACCESS_SECTIONS: string[] = ACCESS_SECTIONS.map(([key]) => key);
export const sectionLabels = (sections: string[]) => ACCESS_SECTIONS.filter(([key]) => sections.includes(key)).map(([, label]) => label).join(' · ');
