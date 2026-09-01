const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendLoginVerificationEmail(params: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  // O smoke/local continua independente de provedor externo.
  if (process.env.NODE_ENV !== 'production') return;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error('E-mail transacional não configurado: RESEND_API_KEY e MAIL_FROM são obrigatórios em produção.');
  }

  const code = escapeHtml(params.code);
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: 'Seu código de acesso ao MyDoctor',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033">
          <h2 style="margin-bottom:8px">Código de acesso MyDoctor</h2>
          <p>Use o código abaixo para concluir sua entrada:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</div>
          <p>Este código expira em ${params.expiresInMinutes} minutos.</p>
          <p style="font-size:13px;color:#667085">Se você não tentou entrar no MyDoctor, ignore esta mensagem. Nunca compartilhe este código.</p>
        </div>
      `,
      text: `Seu código de acesso ao MyDoctor é ${params.code}. Ele expira em ${params.expiresInMinutes} minutos. Se você não tentou entrar, ignore esta mensagem.`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar e-mail (${response.status}): ${body.slice(0, 500)}`);
  }
}
