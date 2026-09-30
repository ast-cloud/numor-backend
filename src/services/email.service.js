const { Resend } = require('resend');
const appLogger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { RESEND_API_KEY, EMAIL_FROM } = require('../config/env');

const resend = new Resend(RESEND_API_KEY);

if (!EMAIL_FROM) {
  throw new Error('EMAIL_FROM is not set in env');
}

/**
 * EMAIL_FROM with its display name swapped for `name`.
 *
 * Only the name changes. The address has to stay on the verified domain, or DKIM
 * and DMARC fail and the mail is filtered as a forgery - which is why we cannot
 * simply send as the seller.
 *
 * Newlines are stripped before quoting: a header value carrying CR or LF is how
 * header injection works, and a company name is user input.
 */
function fromWithDisplayName(name) {
  const trimmed = String(name ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!trimmed) return EMAIL_FROM;

  const address = /<([^>]+)>/.exec(EMAIL_FROM)?.[1] ?? EMAIL_FROM.trim();
  const quoted = trimmed.replace(/["\\]/g, '\\$&');

  return `"${quoted}" <${address}>`;
}

exports.fromWithDisplayName = fromWithDisplayName;

exports.sendEmail = async ({ to, subject, html }) => {
  try {
    const response = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html
    });
    // console.log("Resend response:", response);
    return response;
  } catch (error) {
    throw new Error("Email service failed", error);
  }
};

exports.sendBookingEmails = async (booking) => {
  try {
    const templatePath = path.join(
      __dirname,
      '../templates/booking-confirmation.html'
    );

    let template = fs.readFileSync(templatePath, 'utf8');

    const meetingStart = booking.slot?.startTime ?? booking.scheduledAt;

    const date = dayjs(meetingStart).format('DD MMM YYYY');
    const time = dayjs(meetingStart).format('hh:mm A');

    const baseHtml = template
      .replace(/{{date}}/g, date)
      .replace(/{{time}}/g, time)
      .replace(/{{mode}}/g, booking.consultationMode)
      .replace(/{{meetingLink}}/g, booking.meetingLink || 'Will be shared soon');

    // User email
    const userEmailResponse = await exports.sendEmail({
      to: booking.user.email,
      subject: 'Your consultation is confirmed',
      html: baseHtml.replace('{{name}}', booking.user.name)
    });

    // CA email
    const caEmailResponse = await exports.sendEmail({
      to: booking.caProfile.user.email,
      subject: 'New consultation booked',
      html: baseHtml.replace('{{name}}', booking.caProfile.user.name)
    });

    return { userEmailResponse, caEmailResponse };
  } catch (err) {
    throw new Error("Email service failed", err);
  }
};

exports.sendEmailWithAttachment = async ({to, subject, html, text, attachments, replyTo, fromName}) => {
  try {
    if (!to) throw new Error("Recipient email missing");

    const response = await resend.emails.send({
      // The seller is who the recipient recognises, so they become the display
      // name; the address stays ours, because ours is the verified domain.
      from: fromWithDisplayName(fromName),
      to,
      // Mail sent to an external party (a billed client, say) needs replies to
      // reach the person who issued it, not the shared EMAIL_FROM address.
      ...(replyTo ? { replyTo } : {}),
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ""), // fallback
      attachments,
    });

    return response;
  } catch (error) {
    console.error("Resend actual error:", error);
    throw new Error("Email service failed");
  }
};