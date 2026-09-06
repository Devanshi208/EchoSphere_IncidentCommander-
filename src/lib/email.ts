import { Resend } from "resend";
import { IncidentSummary } from "./types";
import { getConsentedEmails } from "./registrations";

function summaryToEmailHtml(s: IncidentSummary): string {
  const section = (title: string, items: string[]) =>
    items.length
      ? `<h3 style="margin:16px 0 6px;font-size:14px;">${title}</h3><ul style="margin:0;padding-left:18px;">${items
          .map((i) => `<li style="margin-bottom:4px;">${escapeHtml(i)}</li>`)
          .join("")}</ul>`
      : "";

  return `
    <div style="font-family:sans-serif;color:#111;max-width:600px;">
      <p style="font-size:12px;letter-spacing:0.05em;color:#888;margin:0 0 4px;">ECHOSPHERE / INCIDENT SUMMARY</p>
      <h2 style="margin:0 0 12px;">Incident Summary</h2>
      <p>${escapeHtml(s.impact)}</p>
      ${section("What we know", s.confirmedFacts)}
      ${section("What we suspect", s.hypotheses)}
      ${section("Conflicting evidence", s.conflictingEvidence)}
      ${section("Actions taken", s.actionsTaken)}
      ${section("Decisions", s.decisions)}
      ${section("Unresolved / still unknown", s.unresolvedRisks)}
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendSummaryEmails(
  summary: IncidentSummary
): Promise<{ sent: string[]; failed: string[]; skipped: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error(
      "RESEND_API_KEY / RESEND_FROM_EMAIL not set. Add them to .env.local (see README)."
    );
  }

    const recipients = await getConsentedEmails();
  if (recipients.length === 0) {
    return { sent: [], failed: [], skipped: true };
  }

  const resend = new Resend(apiKey);
  const html = summaryToEmailHtml(summary);

  const sent: string[] = [];
  const failed: string[] = [];

  // Send one at a time rather than a single multi-recipient email, so
  // recipients don't see each other's addresses and one bad address
  // doesn't fail the whole batch.
  for (const r of recipients) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: r.email,
        subject: "Incident Summary — EchoSphere",
        html: `<p>Hi ${escapeHtml(r.name)},</p>${html}`,
      });
      sent.push(r.email);
    } catch (err) {
      console.error(`Failed to email ${r.email}`, err);
      failed.push(r.email);
    }
  }

  return { sent, failed, skipped: false };
}
