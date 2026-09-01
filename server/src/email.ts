import nodemailer from 'nodemailer';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SmtpAttempt = { port: number; secure: boolean; requireTLS?: boolean };

async function sendWithResend(apiKey: string, message: EmailMessage): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: 'category', value: 'login_mfa' }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend API ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function sendWithSmtp(params: {
  host: string;
  user: string;
  pass: string;
  message: EmailMessage;
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

  await transporter.sendMail(params.message);
}

async function sendWithHostingerFallback(message: EmailMessage): Promise<void> {
  const host = process.env.SMTP_HOST?.trim() || 'smtp.hostinger.com';
  const configuredPort = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error('SMTP de contingência não configurado.');
  }

  const attempts: SmtpAttempt[] = configuredPort === 587
    ? [{ port: 587, secure: false, requireTLS: true }, { port: 465, secure: true }]
    : [{ port: configuredPort, secure: configuredPort === 465 }, { port: 587, secure: false, requireTLS: true }];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      await sendWithSmtp({ host, user, pass, message, attempt });
      return;
    } catch (error) {
      lastError = error;
      console.error(`MyDoctor SMTP fallback failure on port ${attempt.port}`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha ao enviar e-mail pelo SMTP de contingência.');
}

export async function sendLoginVerificationEmail(params: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): Promise<void> {
  // O smoke/local continua independente de serviços externos.
  if (process.env.NODE_ENV !== 'production') return;

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const from = process.env.RESEND_FROM?.trim()
    || process.env.MAIL_FROM?.trim()
    || (smtpUser ? `MyDoctor <${smtpUser}>` : '');

  if (!from) {
    throw new Error('E-mail transacional não configurado: defina RESEND_FROM ou MAIL_FROM.');
  }

  const code = escapeHtml(params.code);
  const message: EmailMessage = {
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

  if (resendApiKey) {
    try {
      await sendWithResend(resendApiKey, message);
      return;
    } catch (error) {
      console.error('MyDoctor Resend delivery failure', error);
      // Mantemos o SMTP como contingência enquanto a migração para Resend é concluída.
      await sendWithHostingerFallback(message);
      return;
    }
  }

  await sendWithHostingerFallback(message);
}
