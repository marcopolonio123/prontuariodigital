/** Never expose a provider's raw message: it may include credentials or clinical input. */
export async function consultantProviderFailure(response: Response, hasImages: boolean) {
  const status = response.status;
  let code = '', type = '';
  try {
    const body = await response.json() as { error?: { code?: unknown; type?: unknown } };
    code = typeof body.error?.code === 'string' ? body.error.code : '';
    type = typeof body.error?.type === 'string' ? body.error.type : '';
  } catch { /* HTML and empty error responses are handled by HTTP status. */ }
  const reasons: Record<string, string> = {
    credit_balance_exhausted: 'O provedor de IA informou que os créditos da API acabaram. O responsável pela conexão precisa verificar o faturamento da API.',
    organization_spend_limit_exceeded: 'O limite de gastos da organização no provedor de IA foi atingido. O responsável precisa verificar esse limite.',
    project_spend_limit_exceeded: 'O limite de gastos do projeto no provedor de IA foi atingido. O responsável precisa verificar esse limite.',
    organization_usage_limit_exceeded: 'O limite de uso da organização no provedor de IA foi atingido. O responsável precisa verificar a cota da API.',
    insufficient_quota: 'O provedor de IA informou falta de cota disponível. O responsável precisa verificar créditos, faturamento e limites da API. A assinatura do chat não inclui esses créditos.',
    invalid_api_key: 'O provedor de IA recusou a chave de API. O responsável precisa conferir se ela está correta e ativa.',
    model_not_found: 'O modelo configurado não existe ou não está disponível para esta chave. O responsável precisa conferir o modelo e seu acesso.',
  };
  let reason = reasons[code];
  if (!reason && type === 'insufficient_quota') reason = reasons.insufficient_quota;
  if (!reason && status === 401) reason = reasons.invalid_api_key;
  if (!reason && status === 403) reason = 'O provedor de IA negou acesso. O responsável precisa verificar as permissões da chave e da conta.';
  if (!reason && status === 404) reason = 'O provedor de IA não encontrou o serviço ou modelo configurado. O responsável precisa verificar a URL da API e o modelo.';
  if (!reason && status === 429) reason = 'O provedor de IA está temporariamente no limite de solicitações. Aguarde e tente novamente.';
  if (!reason && status >= 500) reason = 'O provedor de IA está temporariamente indisponível. Tente novamente mais tarde.';
  if (!reason && hasImages && [400,415,422].includes(status)) reason = 'O modelo de IA configurado não aceitou as imagens. Tente sem anexos ou contate o administrador para ativar um modelo com visão.';
  if (!reason && status === 400) reason = 'O provedor de IA recusou o formato da solicitação. O suporte precisa verificar a compatibilidade do modelo e da integração.';
  return { status: status === 429 || status >= 500 ? 503 : 502,
    message: `${reason || 'O provedor de IA recusou a solicitação.'} Nenhum uso foi descontado. Referência: IA-${status}.` };
}
