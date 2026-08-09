import nodemailer, { type Transporter } from 'nodemailer';
import { env, smtpConfigured } from '../env.js';

/**
 * Outgoing email. Runs on the server with SMTP credentials from the
 * environment, so a customer never needs to be signed in to anything for their
 * confirmation to be sent.
 *
 * When SMTP is not configured the message is logged rather than sent, and the
 * request that triggered it still succeeds — a mail outage must never lose an
 * order.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!smtpConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    console.info(`[email not sent — SMTP not configured] to=${mail.to} subject="${mail.subject}"`);
    return false;
  }
  try {
    await transport.sendMail({
      from: env.smtp.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      replyTo: mail.replyTo ?? env.notifyEmail,
    });
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${mail.to}:`, (error as Error).message);
    return false;
  }
}

/**
 * Fire-and-forget send. Used on request paths where the customer should not
 * wait for the mail server, and a failure must not fail their order.
 */
export function sendMailInBackground(mail: Mail): void {
  void sendMail(mail).catch((error) => {
    console.error('Background email error:', (error as Error).message);
  });
}
