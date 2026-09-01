import nodemailer from 'nodemailer';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

type SmtpAttempt = { port: number; secure: boolean; requireTLS?: boolean };

async function sendWithTransport(params: {
  host: string;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attempt: SmtpAttempt;
}) {
  const transporter = nodemailer.createTransport({
    host: params.host,
    port: params.attempt.port,
    secure: params.attempt.secure,
    requireTLS: params.attempt.requireTLS,
    auth: { user: params.user, pass: params.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

export async function sendLoginVerificationEmail(params: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  // O smoke/local continua independente do SMTP externo.
  if (process.env.NODE_ENV !== 'production') return;

  const host = process.env.SMTP_HOST?.trim() || 'smtp.hostinger.com';
  const configuredPort = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.MAIL_FROM?.trim() || (user ? `MyDoctor <${user}>` : '');

  if (!user || !pass || !from) {
    throw new Error('E-mail transacional não configurado: SMTP_USER e SMTP_PASSWORD são obrigatórios em produção.');
  }

  const code = escapeHtml(params.code);
  const message = {
    host,
    user,
    pass,
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
  };

  const attempts: SmtpAttempt[] = configuredPort === 587
    ? [{ port: 587, secure: false, requireTLS: true }, { port: 465, secure: true }]
    : [{ port: configuredPort, secure: configuredPort === 465 }, { port: 587, secure: false, requireTLS: true }];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      await sendWithTransport({ ...message, attempt });
      return;
    } catch (error) {
      lastError = error;
      console.error(`MyDoctor SMTP failure on port ${attempt.port}`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha ao enviar e-mail pelo SMTP da Hostinger.');
}
