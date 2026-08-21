import type { Patient } from './types';
import { ageFromBirth } from './biometrics';

export const DISCLAIMER =
  'O Consultor My Doctor é um apoio informativo que cruza seus sintomas com o prontuário e com referências públicas. Ele NÃO substitui avaliação profissional: sempre procure um médico ou especialista antes de se medicar. Em sinais de gravidade, procure uma emergência imediatamente.';

export interface MedOption {
  name: string;
  contra: string[];
  caution: string[];
  note: string;
}

export interface KbEntry {
  id: string;
  keys: string[];
  label: string;
  causes: string[];
  options: MedOption[];
  redFlags: string[];
  sources: string[];
}

export const KB: KbEntry[] = [
  {
    id: 'febre', keys: ['febre', 'febril', 'temperatura alta', 'calafrio'], label: 'Febre',
    causes: ['Infecções virais (gripes e resfriados)', 'Infecções bacterianas', 'Processos inflamatórios'],
    options: [
      { name: 'Paracetamol 750 mg', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Antitérmico de primeira linha. Respeitar intervalo de 6–8 h.' },
      { name: 'Dipirona 500 mg', contra: ['dipirona', 'asma-sensivel'], caution: ['renal'], note: 'Antitérmico eficaz; evitar em alergia conhecida a dipirona.' },
      { name: 'Ibuprofeno 400 mg', contra: ['nsaid', 'ulcera', 'anticoagulante', 'renal', 'hepatopatia'], caution: ['cardiopatia', 'hipertensao', 'asma', 'idoso'], note: 'Anti-inflamatório com ação antitérmica. Tomar após alimentação.' },
    ],
    redFlags: ['Febre acima de 39,5 °C por mais de 48 h', 'Rigidez de nuca, manchas na pele ou confusão mental', 'Febre em menores de 3 meses — emergência imediata'],
    sources: ['Bula — Paracetamol/Dipirona (ANVISA)', 'Caderno de Atenção Básica — Febre (Min. Saúde)', 'MedlinePlus — Fever (NIH)'],
  },
  {
    id: 'cefaleia', keys: ['dor de cabeca', 'dor na cabeca', 'cefaleia', 'enxaqueca', 'cabeca doendo'], label: 'Dor de cabeça',
    causes: ['Cefaleia tensional (estresse, postura)', 'Enxaqueca', 'Desidratação ou jejum prolongado'],
    options: [
      { name: 'Paracetamol 750 mg', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Analgesia simples para crises leves a moderadas.' },
      { name: 'Dipirona 500 mg', contra: ['dipirona', 'asma-sensivel'], caution: ['renal'], note: 'Boa resposta em cefaleia tensional.' },
      { name: 'Ibuprofeno 400 mg', contra: ['nsaid', 'ulcera', 'anticoagulante', 'renal'], caution: ['cardiopatia', 'hipertensao', 'idoso'], note: 'Útil em enxaqueca leve; evitar uso frequente.' },
    ],
    redFlags: ['A pior dor de cabeça da vida, súbita', 'Febre + rigidez de nuca', 'Alteração de fala, força ou visão — emergência'],
    sources: ['Protocolo Clínico — Cefaleias (Min. Saúde)', 'Bula — analgésicos (ANVISA)', 'IHS — classificação de cefaleias'],
  },
  {
    id: 'estomago', keys: ['estomago', 'azia', 'queimacao', 'gastrite', 'enjoo', 'nausea', 'digestao'], label: 'Desconforto gástrico / azia',
    causes: ['Gastrite ou dispepsia', 'Refluxo gastroesofágico', 'Alimentação inadequada'],
    options: [
      { name: 'Antiácido (hidróxido de alumínio)', contra: [], caution: ['renal'], note: 'Alívio rápido e pontual. Evitar uso diário contínuo.' },
      { name: 'Omeprazol 20 mg', contra: [], caution: ['idoso'], note: 'Uso em crises recorrentes, antes do café, por curto período.' },
      { name: 'Paracetamol 750 mg (se dor associada)', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Evite anti-inflamatórios: eles agridem o estômago.' },
    ],
    redFlags: ['Vômito com sangue ou fezes escuras', 'Dor intensa que irradia para peito/braço', 'Perda de peso não intencional'],
    sources: ['Bula — Omeprazol (ANVISA)', 'Caderno de Atenção Básica (MS)', 'ACG — diretrizes de refluxo'],
  },
  {
    id: 'alergia-pele', keys: ['coceira', 'urticaria', 'alergia na pele', 'manchas vermelhas', 'prurido'], label: 'Reação alérgica de pele',
    causes: ['Urticária aguda (alimento, medicamento, contato)', 'Dermatite de contato', 'Picadas de inseto'],
    options: [
      { name: 'Loratadina 10 mg', contra: [], caution: [], note: 'Anti-histamínico que não dá sono. 1x/dia até melhora.' },
      { name: 'Dexclorfeniramina 2 mg', contra: [], caution: ['idoso', 'cardiopatia'], note: 'Eficaz, mas causa sonolência — não dirigir.' },
    ],
    redFlags: ['Inchaço de lábios, língua ou rosto', 'Falta de ar ou chiado — epinefrina se prescrita e SAMU 192', 'Lesões com pus ou febre associada'],
    sources: ['Bula — Loratadina (ANVISA)', 'ASBAI — orientações de urticária', 'Manual de Alergia e Imunologia'],
  },
  {
    id: 'gripe', keys: ['gripe', 'resfriado', 'tosse', 'coriza', 'nariz entupido', 'dor de garganta'], label: 'Gripe / resfriado',
    causes: ['Infecção viral de vias aéreas superiores', 'Rinite aguda', 'Faringite viral'],
    options: [
      { name: 'Paracetamol 750 mg (dor/febre)', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Para dor no corpo e febre.' },
      { name: 'Loratadina 10 mg (coriza)', contra: [], caution: [], note: 'Reduz coriza e espirros sem sonolência.' },
      { name: 'Soro fisiológico nasal + hidratação', contra: [], caution: [], note: 'Medida segura para todas as idades; base do tratamento.' },
    ],
    redFlags: ['Falta de ar ou dor no peito', 'Febre alta por mais de 3 dias', 'Idosos, gestantes e bebês: avaliação médica precoce'],
    sources: ['Caderno de Atenção Básica — Gripes (MS)', 'Bula — Loratadina (ANVISA)', 'CDC — cuidados com resfriados'],
  },
  {
    id: 'muscular', keys: ['dor muscular', 'dor no corpo', 'inflamacao', 'torcao', 'lombar', 'articulacao', 'dor nas costas'], label: 'Dor muscular / articular',
    causes: ['Tensão ou esforço muscular', 'Entorse leve', 'Crise de dor lombar inespecífica'],
    options: [
      { name: 'Paracetamol 750 mg', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Primeira opção de analgesia.' },
      { name: 'Dipirona 500 mg', contra: ['dipirona', 'asma-sensivel'], caution: ['renal'], note: 'Alternativa para dor moderada.' },
      { name: 'Ibuprofeno 400 mg', contra: ['nsaid', 'ulcera', 'anticoagulante', 'renal', 'hepatopatia'], caution: ['cardiopatia', 'hipertensao', 'asma', 'idoso'], note: 'Anti-inflamatório para dor com componente inflamatório, por poucos dias.' },
    ],
    redFlags: ['Inchaço articular súbito com febre', 'Dor lombar com formigamento/perda de força nas pernas', 'Dor após trauma intenso'],
    sources: ['Bula — Ibuprofeno (ANVISA)', 'Guia de dor lombar (The Lancet)', 'Protocolo de analgesia (MS)'],
  },
  {
    id: 'sono', keys: ['insonia', 'nao consigo dormir', 'ansiedade', 'sono'], label: 'Insônia / ansiedade leve',
    causes: ['Higiene do sono inadequada', 'Ansiedade situacional', 'Rotina irregular'],
    options: [
      { name: 'Melatonina 1–3 mg', contra: [], caution: ['crianca'], note: 'Cronorregulador; usar 1–2 h antes de dormir, por curto período.' },
      { name: 'Passiflora (comprimido ou chá)', contra: [], caution: [], note: 'Fitoterápico de efeito leve. Não combina com sedativos.' },
    ],
    redFlags: ['Insônia crônica (> 3 semanas) — procure um especialista', 'Palpitações, falta de ar ou angústia intensa', 'Nunca se automedicar com calmantes tarja preta'],
    sources: ['Bula — Melatonina/Passiflora (ANVISA)', 'Instituto do Sono — higiene do sono', 'MS — saúde mental'],
  },
  {
    id: 'diarreia', keys: ['diarreia', 'desinteria', 'intestino solto'], label: 'Diarreia aguda',
    causes: ['Virose intestinal', 'Intoxicação alimentar leve', 'Mudança alimentar'],
    options: [
      { name: 'Soro de reidratação oral', contra: [], caution: [], note: 'Medida mais importante: prevenir desidratação.' },
      { name: 'Probióticos (S. boulardii)', contra: [], caution: [], note: 'Podem reduzir a duração do quadro.' },
    ],
    redFlags: ['Sangue nas fezes', 'Sinais de desidratação (boca seca, tontura, pouca urina)', 'Mais de 3 dias ou febre alta — crianças e idosos: médico logo'],
    sources: ['Caderno de Atenção Básica — Diarreia (MS)', 'OMS — reidratação oral', 'Bula — probióticos (ANVISA)'],
  },
  {
    id: 'abdominal', keys: ['dor de barriga', 'dor abdominal', 'colica', 'barriga doendo', 'gas', 'mal estar estomaco'], label: 'Dor abdominal / cólica',
    causes: ['Gases e má digestão', 'Cólica intestinal', 'Constipação'],
    options: [
      { name: 'Simeticona (gotas/comprimido)', contra: [], caution: [], note: 'Ajuda a eliminar gases. Dose conforme bula.' },
      { name: 'Escopolamina (Buscopan)', contra: [], caution: ['idoso', 'cardiopatia'], note: 'Antiespasmódico para cólica. Evitar uso contínuo.' },
      { name: 'Calor local + hidratação', contra: [], caution: [], note: 'Bolsa morna na região alivia cólicas leves.' },
    ],
    redFlags: ['Dor intensa e súbita que piora', 'Febre + dor abdominal', 'Vômito persistente ou sangue — emergência'],
    sources: ['Caderno de Atenção Básica — Dor abdominal (MS)', 'Bula — Simeticona/Escopolamina (ANVISA)'],
  },
  {
    id: 'vomito', keys: ['vomito', 'vomitando', 'enjoo forte', 'nausea forte'], label: 'Náusea / vômito',
    causes: ['Virose gastrointestinal', 'Intoxicação alimentar', 'Cinetose (enjoo de movimento)'],
    options: [
      { name: 'Ondansetrona 4 mg', contra: [], caution: ['cardiopatia'], note: 'Antiemético eficaz. Dose conforme orientação.' },
      { name: 'Metoclopramida 10 mg', contra: [], caution: ['idoso', 'crianca'], note: 'Usar por curto período; evitar em idosos.' },
      { name: 'Hidratação em pequenos goles', contra: [], caution: [], note: 'Soro ou água aos poucos para não desidratar.' },
    ],
    redFlags: ['Vômito com sangue ou aspecto de borra de café', 'Incapacidade de reter líquidos por horas', 'Febre alta ou dor abdominal intensa'],
    sources: ['Caderno de Atenção Básica — Náusea (MS)', 'Bula — Ondansetrona (ANVISA)'],
  },
  {
    id: 'ouvido', keys: ['dor de ouvido', 'ouvido doendo', 'otite'], label: 'Dor de ouvido',
    causes: ['Otite externa (após piscina/banho)', 'Otite média (pós-resfriado)', 'Acúmulo de cera'],
    options: [
      { name: 'Paracetamol 750 mg (dor)', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Alívio da dor enquanto aguarda avaliação.' },
      { name: 'Compressa morna', contra: [], caution: [], note: 'Alívio local; não introduzir objetos no ouvido.' },
    ],
    redFlags: ['Secreção com pus ou sangue', 'Febre + dor intensa', 'Perda de audição súbita — avaliação médica'],
    sources: ['Caderno de Atenção Básica — Otite (MS)', 'Bula — Paracetamol (ANVISA)'],
  },
  {
    id: 'olho', keys: ['olho vermelho', 'conjuntivite', 'olho coçando', 'olho ardendo'], label: 'Irritação ocular / conjuntivite',
    causes: ['Conjuntivite viral ou alérgica', 'Irritação por poeira/fumaça', 'Olho seco'],
    options: [
      { name: 'Lágrima artificial (colírio lubrificante)', contra: [], caution: [], note: 'Alivia ardência e secura; uso livre.' },
      { name: 'Compressa fria + higiene', contra: [], caution: [], note: 'Limpar com soro fisiológico; não coçar.' },
    ],
    redFlags: ['Dor ocular intensa ou perda de visão', 'Secreção amarelada abundante', 'Trauma ou produto químico no olho — emergência'],
    sources: ['Caderno de Atenção Básica — Conjuntivite (MS)', 'CBO — orientações oculares'],
  },
  {
    id: 'dente', keys: ['dor de dente', 'dente doendo', 'gengiva inflamada'], label: 'Dor de dente / gengiva',
    causes: ['Cárie profunda', 'Gengivite', 'Sensibilidade dentária'],
    options: [
      { name: 'Paracetamol 750 mg', contra: ['alergia-paracetamol', 'hepatopatia'], caution: ['hepatico'], note: 'Alívio temporário da dor.' },
      { name: 'Ibuprofeno 400 mg', contra: ['nsaid', 'ulcera', 'anticoagulante', 'renal'], caution: ['cardiopatia', 'hipertensao', 'idoso'], note: 'Ajuda se houver inflamação, por poucos dias.' },
    ],
    redFlags: ['Inchaço no rosto ou febre', 'Dor que impede de dormir por dias — procure um dentista', 'Sangramento gengival persistente'],
    sources: ['Bula — Paracetamol/Ibuprofeno (ANVISA)', 'CFO — saúde bucal'],
  },
  {
    id: 'pressao', keys: ['pressao alta', 'hipertensao', 'pressao subiu'], label: 'Pressão arterial elevada',
    causes: ['Hipertensão em acompanhamento', 'Pico tensional (estresse/dor)', 'Uso incorreto de anti-hipertensivo'],
    options: [
      { name: 'Repouso e reavaliação em 15 min', contra: [], caution: [], note: 'Medir em repouso, sentado, sem café/cigarro antes.' },
      { name: 'Manter medicação habitual', contra: [], caution: [], note: 'Não dobrar dose por conta própria; seguir o prescrito.' },
    ],
    redFlags: ['Pressão ≥ 180/120 mmHg', 'Dor no peito, falta de ar ou visão turva — emergência (SAMU 192)', 'Fraqueza em um lado do corpo ou fala enrolada'],
    sources: ['Diretriz Brasileira de Hipertensão (SBC)', 'Caderno de Atenção Básica — HAS (MS)'],
  },
  {
    id: 'respiratorio', keys: ['falta de ar', 'chiado', 'asma', 'respiracao dificil'], label: 'Falta de ar / chiado',
    causes: ['Crise de asma', 'Bronquite', 'Ansiedade (respiração ofegante)'],
    options: [
      { name: 'Broncodilatador de resgate (se já prescrito)', contra: [], caution: ['cardiopatia'], note: 'Usar conforme plano de ação do médico.' },
      { name: 'Posição sentada + respiração lenta', contra: [], caution: [], note: 'Acalmar e respirar devagar ajuda se for ansiedade.' },
    ],
    redFlags: ['Lábios arroxeados ou cansaço extremo — SAMU 192', 'Falta de ar em repouso que não melhora', 'Primeira crise ou sem medicação de resgate'],
    sources: ['Diretriz de Asma (SBPT)', 'Caderno de Atenção Básica — Asma (MS)'],
  },
];

/* --------------------- saudações / conversa livre ------------------------ */

export const GREETING_KEYS = [
  'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'obrigad', 'valeu', 'como funciona', 'me ajuda', 'help',
];

/** Retorna uma resposta de texto livre (saudação) ou null se for um sintoma a analisar. */
export function greetingResponse(question: string, patientName: string): string | null {
  const q = norm(question);
  const isGreet = GREETING_KEYS.some((k) => q.includes(norm(k))) && q.length < 40;
  if (!isGreet) return null;
  return (
    `Olá! Eu sou o Consultor do My Doctor e estou analisando o prontuário de ${patientName}.\n\n` +
    'Descreva o sintoma — por exemplo “febre”, “dor de cabeça”, “azia”, “dor de garganta”, “dor de ouvido”, ' +
    '“dor de barriga”, “pressão alta”, “falta de ar”, “dor de dente” ou “não consigo dormir”. ' +
    'Vou cruzar com as alergias, medicações e condições registradas e indicar opções compatíveis.\n\n' +
    'Lembre-se: eu organizo informações, mas quem confirma o tratamento é sempre um médico ou especialista.'
  );
}

/* ------------------------- IA externa (opcional) ------------------------ */

export interface AiConfig {
  provider: 'local' | 'openai';
  baseUrl: string; // compatível com OpenAI — ex.: https://api.openai.com/v1
  apiKey: string;
  model: string; // ex.: gpt-4o-mini
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'local',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

const AI_KEY = 'mydoctor.ai.config';

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (raw) return { ...DEFAULT_AI_CONFIG, ...(JSON.parse(raw) as Partial<AiConfig>) };
  } catch {
    /* ignora */
  }
  return { ...DEFAULT_AI_CONFIG };
}

export function saveAiConfig(cfg: AiConfig) {
  localStorage.setItem(AI_KEY, JSON.stringify(cfg));
}

/** Resumo textual do prontuário para contextualizar a IA externa. */
export function buildRecordContext(p: Patient): string {
  const meds = p.medications.map((m) => `${m.name} ${m.dose} (${m.frequency})${m.reason ? ` — ${m.reason}` : ''}`).join('; ');
  const vitals = p.vitals.slice(-5).map((v) => `${v.metric}=${v.value}`).join('; ');
  return [
    `Paciente: ${p.name}, ${ageFromBirth(p.birthDate) ?? '?'} anos, sexo ${p.sex}.`,
    p.bloodType ? `Tipo sanguíneo: ${p.bloodType}.` : '',
    p.allergies.length ? `ALERGIAS: ${p.allergies.join(', ')}.` : 'Sem alergias registradas.',
    p.intolerances.length ? `Intolerâncias: ${p.intolerances.join(', ')}.` : '',
    p.conditions.length ? `Condições crônicas: ${p.conditions.join(', ')}.` : '',
    meds ? `Medicações em uso contínuo: ${meds}.` : '',
    p.specialCare.length ? `Cuidados especiais: ${p.specialCare.join(', ')}.` : '',
    p.emergencyNotes ? `Orientações de emergência: ${p.emergencyNotes}` : '',
    vitals ? `Últimos sinais vitais: ${vitals}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Chama um modelo de IA compatível com a API da OpenAI, enviando o prontuário
 * como contexto. Retorna a resposta em texto. Requer chave própria do usuário.
 */
export async function analyzeWithRemoteAI(
  question: string,
  p: Patient,
  cfg: AiConfig,
): Promise<string> {
  const system =
    'Você é um assistente de orientação em saúde do aplicativo My Doctor. ' +
    'Responda em português, de forma clara e acolhedora. ' +
    'Analise a pergunta SEMPRE à luz do prontuário fornecido (alergias, medicações, condições). ' +
    'Nunca prescreva: apresente opções gerais, alerte sobre interações com o prontuário e reforce que o usuário ' +
    'deve procurar um médico ou especialista antes de se medicar. Em sinais de gravidade, oriente buscar emergência (SAMU 192). ' +
    'Seja conciso (máx. ~200 palavras).';
  const user = `PRONTUÁRIO:\n${buildRecordContext(p)}\n\nPERGUNTA DO USUÁRIO: ${question}`;

  const base = cfg.baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`A IA retornou erro ${res.status}. ${body.slice(0, 160)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('A IA não devolveu resposta.');
  return text;
}

export interface OptionAssessment {
  option: MedOption;
  status: 'ok' | 'caution' | 'contra';
  reasons: string[];
}

export interface Consultation {
  entry: KbEntry | null;
  question: string;
  assessments: OptionAssessment[];
  recordAlerts: string[];
  sources: string[];
}

const TAG_LABEL: Record<string, string> = {
  dipirona: 'alergia a dipirona registrada no prontuário',
  nsaid: 'alergia/sensibilidade a anti-inflamatórios registrada',
  'alergia-paracetamol': 'alergia a paracetamol registrada',
  renal: 'doença renal registrada — sobrecarga renal',
  hepatopatia: 'doença hepática registrada — sobrecarga do fígado',
  hepatico: 'condição hepática registrada',
  ulcera: 'úlcera/gastrite registrada — irrita a mucosa gástrica',
  asma: 'asma registrada',
  'asma-sensivel': 'asma — risco de broncoespasmo',
  cardiopatia: 'cardiopatia registrada — pode elevar a pressão',
  hipertensao: 'hipertensão registrada — pode elevar a pressão',
  anticoagulante: 'uso de anticoagulante — risco de sangramento',
  idoso: 'idoso — usar a menor dose efetiva',
  crianca: 'criança — dose pediátrica por peso, orientada por pediatra',
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function analyze(question: string, p: Patient): Consultation {
  const q = norm(question);
  const entry = KB.find((e) => e.keys.some((k) => q.includes(norm(k)))) ?? null;

  const tags = new Set<string>();
  const recordAlerts: string[] = [];

  const allergyText = norm(p.allergies.join(' '));
  if (p.allergies.length > 0) recordAlerts.push(`Alergias registradas: ${p.allergies.join(', ')}.`);
  if (p.intolerances.length > 0) recordAlerts.push(`Intolerâncias alimentares: ${p.intolerances.join(', ')}.`);
  if (allergyText.includes('dipirona')) tags.add('dipirona');
  if (/(aspirina|aas|ibuprofeno|diclofenaco|antiinflam|nimesulida)/.test(allergyText)) tags.add('nsaid');
  if (allergyText.includes('paracetamol')) tags.add('alergia-paracetamol');
  if (allergyText.includes('penicilina') || allergyText.includes('amoxicilina')) {
    recordAlerts.push('Atenção: alergia a penicílicos — evitar antibióticos desse grupo sem avaliação médica.');
  }

  const condText = norm(p.conditions.join(' '));
  if (/renal|rim/.test(condText)) tags.add('renal');
  if (/hepat|figado|cirrose/.test(condText)) { tags.add('hepatico'); tags.add('hepatopatia'); }
  if (/ulcera|gastrite/.test(condText)) tags.add('ulcera');
  if (/asma|bronqu/.test(condText)) { tags.add('asma'); tags.add('asma-sensivel'); }
  if (/cardiopatia|coracao|infarto|arritmia|marca-passo|marcapasso/.test(condText)) tags.add('cardiopatia');
  if (/hipertens|pressao alta/.test(condText)) tags.add('hipertensao');
  if (/diabet/.test(condText)) recordAlerts.push('Diabetes registrada — atenção a xaropes e fórmulas com açúcar.');

  if (p.specialCare.includes('alzheimer')) {
    recordAlerts.push('Alzheimer/demência: um cuidador deve supervisionar qualquer medicação e anotar horários.');
  }
  if (p.specialCare.includes('epilepsia')) recordAlerts.push('Epilepsia: não interromper nem combinar medicações sem o neurologista.');

  const medsText = norm(p.medications.map((m) => [m.name, m.dose, m.frequency, m.reason].join(' ')).join(' '));
  if (p.medications.length > 0) {
    recordAlerts.push(
      `Medicamentos de uso contínuo: ${p.medications
        .map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? ` — ${m.frequency}` : ''}`)
        .join('; ')}.`,
    );
  }
  if (/(anticoagul|varfarina|xarelto|rivaroxabana|marevan)/.test(medsText)) tags.add('anticoagulante');
  if (/(donepezila|memantina)/.test(medsText)) {
    recordAlerts.push('Medicação cognitiva em uso — qualquer novo remédio deve ser validado pelo geriatra/neurologista.');
  }

  const age = ageFromBirth(p.birthDate);
  if (age !== null && age < 12) tags.add('crianca');
  if (age !== null && age >= 65) tags.add('idoso');

  const assessments: OptionAssessment[] = (entry?.options ?? []).map((o) => {
    const reasons: string[] = [];
    let status: OptionAssessment['status'] = 'ok';
    for (const t of o.contra) {
      if (tags.has(t)) { status = 'contra'; reasons.push(TAG_LABEL[t] ?? t); }
    }
    if (status !== 'contra') {
      for (const t of o.caution) {
        if (tags.has(t)) { status = 'caution'; reasons.push(TAG_LABEL[t] ?? t); }
      }
      if (tags.has('crianca')) { status = 'caution'; reasons.push(TAG_LABEL.crianca); }
    }
    if (reasons.length === 0) reasons.push('Nenhum conflito com o prontuário atual.');
    return { option: o, status, reasons };
  });

  const sources = entry?.sources ?? [
    'Caderno de Atenção Básica (Ministério da Saúde)',
    'Bulário eletrônico (ANVISA)',
    'MedlinePlus (NIH)',
  ];

  return { entry, question, assessments, recordAlerts, sources };
}

export const ANALYSIS_STEPS = [
  'Lendo o prontuário ativo…',
  'Cruzando alergias, intolerâncias e medicações…',
  'Consultando referências de saúde…',
];
