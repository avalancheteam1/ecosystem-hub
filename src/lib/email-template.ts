// team1 branded email template - source of truth: team1/common/email/.
// Copied from team1/common/email/team1-email.ts - change it there first, then copy here.
//
// Usage (nodemailer):
//   const html = brandedShell({ preheader: 'Your code', body: `<tr><td class="m-px" style="${CELL}"><p style="${PARA}">Hey,</p></td></tr>` })
//   transporter.sendMail({ to, subject, html, attachments: [logoAttachment()] })
import path from 'node:path'

export const BRAND = '#e6212f'

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`

/** Inline styles for building `body` rows. */
export const CELL = 'padding:36px 40px 8px 40px'
export const PARA = `margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#52525b;font-family:${FONT}`
export const SMALL = `margin:0 0 14px 0;font-size:12px;line-height:1.5;color:#a1a1aa;word-break:break-all;font-family:${FONT}`
export const LINK = `color:${BRAND};text-decoration:underline;font-weight:600`
export const BUTTON = `display:inline-block;padding:14px 32px;background:${BRAND};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;font-family:${FONT}`

/** Header style: 'dark' = white+AvaRed logo on near-black (default), 'red' = white logo on brand red. */
export type HeaderVariant = 'red' | 'dark'
const HEADER_BG: Record<HeaderVariant, string> = { red: BRAND, dark: '#18181b' }
const HEADER_LOGO: Record<HeaderVariant, string> = { red: 'Team1_Text_White.png', dark: 'Team1_Text_Main.png' }

/** Inline logo attachment, referenced in the shell as `cid:logo`. `dir` = where the assets/*.png were copied to. */
export function logoAttachment(variant: HeaderVariant = 'dark', dir = path.join(process.cwd(), 'public', 'email')) {
  return { filename: 'team1-logo.png', path: path.join(dir, HEADER_LOGO[variant]), cid: 'logo' }
}

/** A centered call-to-action button. Put it INSIDE a body `<td>` - outside a cell, mail clients hoist it above the card. */
export function button(href: string, label: string): string {
  return `<p style="margin:24px 0;text-align:center"><a href="${esc(href)}" style="${BUTTON}">${esc(label)}</a></p>`
}

/**
 * Email shell with the team1 logo header and footer.
 * `body` is the inner `<tr>` rows of the white card; `preheader` is the
 * hidden preview line shown by Gmail/Outlook below the subject.
 */
export function brandedShell({ body, preheader, variant = 'dark' }: { body: string; preheader: string; variant?: HeaderVariant }): string {
  const headerBg = HEADER_BG[variant]
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>team1</title>
    <style>
      @media only screen and (max-width: 480px) {
        .m-outer { padding: 16px 8px !important; }
        .m-px { padding-left: 20px !important; padding-right: 20px !important; }
        .m-h1 { font-size: 22px !important; }
        .m-logo-cell { padding: 18px 20px !important; }
        .m-footer-cell { padding: 20px 20px 24px 20px !important; }
        .m-label {
          display: block !important;
          width: auto !important;
          padding: 14px 0 2px 0 !important;
          font-size: 11px !important;
          letter-spacing: 0.06em !important;
          text-transform: uppercase !important;
          border-bottom: 0 !important;
        }
        .m-value {
          display: block !important;
          width: auto !important;
          padding: 0 0 14px 0 !important;
          border-bottom: 1px solid #f1f1f3 !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f6;color:#18181b;-webkit-font-smoothing:antialiased">
    <span style="display:none;font-size:1px;color:#f4f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f6">
      <tr>
        <td align="center" class="m-outer" style="padding:32px 16px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04),0 8px 24px rgba(0,0,0,0.06)">
            <tr>
              <td class="m-logo-cell" align="left" bgcolor="${headerBg}" style="padding:22px 40px;background:${headerBg}">
                <img src="cid:logo" alt="team1" width="142" height="40" style="display:block;border:0;outline:none;text-decoration:none;max-width:142px;height:auto" />
              </td>
            </tr>
            ${body}
            <tr>
              <td class="m-footer-cell" style="padding:24px 40px 32px 40px;border-top:1px solid #f1f1f3">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;font-family:${FONT}">
                  Team1 &middot; a global network of builders pushing Avalanche forward<br/>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Escape HTML - run every interpolated value through this. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
