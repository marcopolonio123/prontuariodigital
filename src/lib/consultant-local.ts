import { KB } from './consultant';
import type { HealthEventV1 } from './api-v1';

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const questions: Record<string, string> = {
  gripe: 'Há quantos dias começou? Você está com febre ou principalmente tosse e nariz entupido?',
  febre: 'Qual foi a temperatura medida e há quanto tempo você está com febre?',
  cefaleia: 'A dor começou de repente ou foi aumentando? É diferente das dores que você costuma ter?',
  estomago: 'A queimação aparece depois de comer ou também em jejum?',
  'alergia-pele': 'A coceira começou depois de algum alimento, medicamento ou produto novo?',
  muscular: 'A dor começou depois de esforço ou de uma lesão? Em qual região?',
  sono: 'Está difícil pegar no sono ou você acorda durante a noite? Há quanto tempo?',
  diarreia: 'Há quanto tempo começou? Você está conseguindo beber líquidos?',
  abdominal: 'Em que parte da barriga dói e quando começou?',
  vomito: 'Há quanto tempo você está vomitando? Consegue manter líquidos no estômago?',
  ouvido: 'A dor é em um ouvido ou nos dois? Você percebeu secreção ou mudança na audição?',
  olho: 'Além da vermelhidão, há dor ou mudança na visão?',
  dente: 'Você percebeu inchaço ou febre junto da dor?',
  pressao: 'Qual foi o valor medido e você está sentindo algum sintoma agora?',
  respiratorio: 'A falta de ar está acontecendo agora, mesmo em repouso?',
  suplementacao: 'Qual suplemento ou mudança de alimentação você quer entender, e com qual objetivo?',
  cuidados: 'Você quer conversar sobre sono, alimentação, atividade física ou alguma condição específica?',
};

export function answerLocalConsultant(question: string, patientName: string, events: HealthEventV1[], record: Record<string, unknown> | null = null,
  messages: Array<{ role: 'user' | 'assistant'; content: string }> = []): string {
  const q = normalize(question).replace(/gripad[oa]/g, 'gripe');
  if (/^(oi|ola|bom dia|boa tarde|boa noite)[!?.\s]*$/.test(q)) return 'Olá, ' + patientName.split(' ')[0] + '! Como você está se sentindo?';
  if (/^(obrigad[oa]|valeu)[!?.\s]*$/.test(q)) return 'Por nada! Se surgir outra dúvida, pode me contar.';
  const active = events.filter(event => !['cancelled', 'inactive', 'rejected_by_patient'].includes(event.status));
  const family = active.find(event => event.type === 'family_history');
  const diary = active.filter(event => event.type === 'wellbeing_diary');
  const clinical = active.filter(event => !['family_history', 'insurance', 'wellbeing_diary'].includes(event.type));
  const text = normalize(JSON.stringify({ family: family?.payload, diary: diary.map(event => event.payload), clinical: clinical.map(event => event.payload), record: record ? Object.values(record) : null }));
  const allergies = Array.isArray(record?.allergies) ? record.allergies.filter(Boolean) : [];
  const intolerances = Array.isArray(record?.intolerances) ? record.intolerances.filter(Boolean) : [];
  const sources = [record || clinical.length ? 'prontuário' : '', family ? 'histórico familiar' : '', diary.length ? 'diário' : ''].filter(Boolean);
  const notice = messages.length ? '' : (sources.length ? 'Consultei os registros disponíveis: ' + sources.join(', ') + '. ' : 'Não encontrei registros clínicos disponíveis. ')
    + (record ? (allergies.length ? 'Há alergias cadastradas. ' : 'Não encontrei registro de alergias. ')
      + (intolerances.length ? 'Há intolerâncias cadastradas.' : 'Não encontrei registro de intolerâncias.')
      : 'Não consegui verificar a ficha de alergias e intolerâncias.') + '\n\n';
  const previous = messages.filter(message => message.role === 'user').map(message => normalize(message.content)).join(' ');
  const conversation = previous + ' ' + q;
  const answers = messages.filter(message => message.role === 'assistant');
  const lastAnswer = answers[answers.length - 1]?.content ?? ''; 
  if (messages.length && (/^(sim|nao|ha |faz |desde |tenho |tive |estou |acho |[0-9])/.test(q) || !KB.some(topic => topic.keys.some(key => q.includes(normalize(key)))))) {
    if (/febre|temperatura/.test(normalize(lastAnswer))) return 'Obrigado por me contar. Além disso, você está com falta de ar ou dor no peito agora?';
    if (/falta de ar|dor no peito/.test(normalize(lastAnswer))) return 'Entendi. Como isso está afetando suas atividades e está melhorando ou piorando? Meu modo local tem respostas limitadas; não consigo concluir uma avaliação clínica.';
    return 'Entendi. O que mudou desde que começou: melhorou, piorou ou continua igual?';
  }
  const scored = KB.map(topic => ({ topic, score: Math.max(0, ...topic.keys.filter(key => conversation.includes(normalize(key))).map(key => key.length)) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return notice + 'Pode me contar qual é sua dúvida ou o sintoma principal? Meu modo local tem respostas limitadas; se eu não conseguir ajudar, vou dizer isso claramente.';
  const topic = scored[0].topic;
  const prompt = questions[topic.id] ?? 'Quando começou e o que mais você está sentindo?';
  const contextQuestion = /alerg|intoler/.test(text) && /medic|remedio/.test(q) ? ' Há registros que podem indicar alergias ou intolerâncias. Qual medicamento você está perguntando sobre?' : '';
  // O prontuário permanece na tela de resumo; não reproduzir dados sensíveis a cada pergunta.
  if (['suplementacao', 'cuidados', 'sono'].includes(topic.id)) return notice + 'Entendi. ' + prompt + contextQuestion;
  const flag = topic.redFlags[0]?.split(' — ')[0];
  return notice + 'Entendi. ' + prompt + contextQuestion + (flag ? '\n\nSe houver ' + flag.charAt(0).toLowerCase() + flag.slice(1) + ', procure atendimento médico.' : '');
}
