import nodemailer, { type Transporter } from 'nodemailer'
import { logoAttachment } from '@/lib/email-template'

// SMTP mail. In development without SMTP_HOST the mail is printed to the
// console (so OTP sign-in works locally); in production a missing SMTP config
// is an error — never silently drop a sign-in code. `html` is expected to be
// built with brandedShell() (src/lib/email-template.ts); the logo it references
// as cid:logo is attached here.

let transporter: Transporter | undefined

export async function sendMail(mail: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured (SMTP_HOST missing)')
    console.info(`[mailer] (dev, not sent) to=${mail.to} subject="${mail.subject}"\n${mail.text}`)
    return
  }
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  })
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'team1 Ecosystem Hub <hub@team1.network>',
    ...mail,
    attachments: mail.html ? [logoAttachment()] : undefined,
  })
}
