import nodemailer from 'nodemailer';

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
  // O smoke/local continua independente do SMTP externo.
  if (process.env.NODE_ENV !== 'production') return;

  const host = process.env.SMTP_HOST?.trim() || 'smtp.hostinger.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.MAIL_FROM?.trim() || (user ? `MyDoctor <${user}>` : '');

  if (!user || !pass || !from) {
    throw new Error('E-mail transacional não configurado: SMTP_USER e SMTP_PASSWORD são obrigatórios em produção.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const code = escapeHtml(params.code);
  await transporter.sendMail({
    from,
    to: params.to,
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
  });
}
