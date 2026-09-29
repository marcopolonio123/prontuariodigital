import { KB } from './consultant';
import type { HealthEventV1 } from './api-v1';

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function answerLocalConsultant(question: string, patientName: string, events: HealthEventV1[]): string {
  const q = normalize(question);
  const matched = KB.filter(topic => topic.keys.some(key => q.includes(normalize(key))));
  const active = events.filter(event => event.status !== 'cancelled');
  const family = active.find(event => event.type === 'family_history');
  const recent = active.filter(event => !['family_history', 'insurance', 'wellbeing_diary'].includes(event.type)).slice(0, 3);
  const context = [
    family?.payload?.text ? 'Histórico familiar registrado: ' + String(family.payload.text) : '',
    ...recent.map(event => 'Registro recente: ' + event.title),
  ].filter(Boolean);
  const greeting = /^(oi|ola|bom dia|boa tarde|boa noite|obrigad[oa])[!?.\s]*$/.test(q);
  if (greeting) return 'Olá, ' + patientName + '! Você pode perguntar sobre sintomas e cuidados. Este modo consulta a base local do MyDoctor, sem enviar dados a um provedor externo. Exemplos: febre, dor de cabeça, azia ou pressão alta. Não faz diagnóstico nem prescreve tratamentos.';
  if (!matched.length) return 'Não encontrei essa pergunta na base local. Posso orientar sobre temas como febre, dor de cabeça, azia, sono, pressão alta e cuidados gerais. Reformule com o sintoma principal ou leve a dúvida a um profissional de saúde. A IA externa é opcional para perguntas mais amplas.\n\n' + (context.length ? 'Dados do seu prontuário para levar à consulta:\n' + context.join('\n') : 'Não há contexto suficiente registrado para personalizar esta orientação.');
  const topics = matched.slice(0, 2).map(topic => topic.label + '\nPossibilidades gerais a discutir com o profissional, não um diagnóstico: ' + topic.causes.join('; ') + '.\nSinais de alerta: ' + topic.redFlags.join('; ') + '.');
  return 'Orientação da base local do MyDoctor:\n\n' + topics.join('\n\n') + (context.length ? '\n\nDados do prontuário para considerar na consulta:\n' + context.join('\n') : '\n\nNão há contexto suficiente registrado para personalizar a orientação.') + '\n\nSe algum sinal de gravidade estiver presente, procure atendimento imediato. Em emergência no Brasil, ligue 192. Não altere medicações ou doses com base nesta resposta.';
}
