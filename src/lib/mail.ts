import { appUrl, isProd } from "./env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** In-process outbox – used by tests and by the dev "no SMTP configured" mode. */
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<{ delivered: boolean; mode: "smtp" | "console" }> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    if (!isProd() || process.env.NODE_ENV !== "test") {
      console.info(`[mail:console] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n`);
    }
    return { delivered: false, mode: "console" };
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM ?? "SoundSense <no-reply@localhost>", ...mail });
  return { delivered: true, mode: "smtp" };
}

export const verifyLink = (token: string) => `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
export const resetLink = (token: string) => `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;

export const mailVerify = (to: string, name: string, token: string): Mail => ({
  to,
  subject: "Verify your SoundSense account",
  text: `Hi ${name},\n\nConfirm your e-mail address to start your acoustic assessment:\n${verifyLink(token)}\n\nThe link works for 24 hours. If you did not create an account you can ignore this message.\n\nSoundSense – Making Every Sound Count.`,
});

export const mailReset = (to: string, name: string, token: string): Mail => ({
  to,
  subject: "Reset your SoundSense password",
  text: `Hi ${name},\n\nUse this link to choose a new password:\n${resetLink(token)}\n\nIt works once and expires in 60 minutes. If you did not ask for this, you can ignore it – your password has not changed.\n\nSoundSense`,
});
