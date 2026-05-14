const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'FlipForm <no-reply@flipform.app>';

const isProdLike = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'staging';

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) {
    if (isProdLike) throw new Error('email_provider_not_configured');
    return { mocked: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });

  if (!res.ok) throw new Error('email_provider_failed');
  return res.json();
}

export async function sendOtpEmail({ to, code }: { to: string; code: string }) {
  const subject = 'Seu código de acesso ao FlipForm';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2>FlipForm</h2>
      <p>Seu código de acesso é:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
      <p>Validade: 10 minutos.</p>
      <p>Se você não solicitou este código, ignore este e-mail.</p>
    </div>
  `;
  return sendEmail({ to, subject, html });
}

export async function sendOnboardingEmail(_: { to: string }) { return { queued: true }; }
export async function sendPasswordResetEmail(_: { to: string }) { return { queued: true }; }
