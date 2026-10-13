// Models with a documented Gemini free tier; only offer those listed for the configured key.
export const FREE_TEST_MODELS = ['gemini-3.8-flash','gemini-3.6-flash','gemini-3.1-flash-lite','gemini-3.5-flash-lite'] as const;
import { consultantProviderFailure } from './consultant-errors.js';
import { consultantGenerationOptions } from './consultant-provider.js';
type Step = { label: string; ok: boolean; message: string; elapsedMs: number };
export async function testConsultantConnection(base: string, model: string, key: string, request: typeof fetch = fetch) {
  const url = new URL(base);
  const google = url.hostname === 'generativelanguage.googleapis.com';
  const steps: Step[] = [];
  const availableModels: string[] = [];
  let started = Date.now();
  const step = async (label: string, work: () => Promise<string>) => {
    started = Date.now();
    try { steps.push({ label, ok: true, message: await work(), elapsedMs: Date.now() - started }); return true; }
    catch (error) {
      const name = error instanceof Error ? error.name : '';
      const message = error instanceof TestFailure ? error.message : name === 'TimeoutError' || name === 'AbortError'
        ? 'Tempo de espera excedido nesta etapa.' : name === 'SyntaxError' ? 'A API retornou um formato inválido.' : 'Não foi possível concluir esta etapa de conexão.';
      steps.push({ label, ok: false, message, elapsedMs: Date.now() - started }); return false;
    }
  };
  const json = async (response: Response) => {
    if (!response.ok) throw new TestFailure((await consultantProviderFailure(response, false)).message);
    return response.json();
  };
  const modelList = await step('Acesso à API e lista de modelos', async () => {
    const response = await request(google ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' : base.replace(/\/$/, '') + '/models', {
      headers: google ? { 'x-goog-api-key': key } : { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(15000),
    });
    const body = await json(response);
    const rows = google ? body.models : body.data;
    if (!Array.isArray(rows)) throw new TestFailure('A lista de modelos não veio no formato esperado. Confira o endereço da API.');
    for (const row of rows) {
      const id = google ? row.name : row.id;
      if (typeof id === 'string' && /^(models\/)?[a-zA-Z0-9._/-]{1,120}$/.test(id)) availableModels.push(id.replace(/^models\//, ''));
    }
    if (!availableModels.includes(model)) throw new TestFailure('A API respondeu, mas o modelo configurado não apareceu na lista disponível para esta chave. Confira os modelos abaixo.');
    return 'API acessível; o modelo configurado está na lista retornada para esta chave.';
  });
  if (modelList && google) await step('Resposta simples na API nativa do Google', async () => {
    const response = await request('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Responda exclusivamente TESTE_OK.' }] }], generationConfig: { maxOutputTokens: 2048 } }),
    });
    const body = await json(response);
    if (!body.candidates?.some((item: any) => item.content?.parts?.some((part: any) => typeof part.text === 'string' && part.text.trim()))) throw new TestFailure('A API nativa não retornou texto.');
    return 'A API nativa retornou texto para o teste sem prontuário.';
  });
  if (modelList) await step('Resposta na integração usada pelo MyDoctor', async () => {
    const response = await request(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ model, ...consultantGenerationOptions(base, model, true), messages: [{ role: 'user', content: 'Responda exclusivamente TESTE_OK.' }] }),
    });
    const body = await json(response);
    if (typeof body.choices?.[0]?.message?.content !== 'string' || !body.choices[0].message.content.trim()) throw new TestFailure('A integração não retornou texto no formato esperado.');
    return 'A mesma integração do consultor retornou texto para o teste sem prontuário.';
  });
  return { ok: steps.every(item => item.ok), host: url.hostname, model, steps, availableModels: availableModels.slice(0, 50), testableModels: google ? FREE_TEST_MODELS.filter(id=>availableModels.includes(id)) : [] };
}
class TestFailure extends Error {}
