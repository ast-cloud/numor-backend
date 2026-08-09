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

exports.sendEmailWithAttachment = async ({to, subject, html, text, attachments}) => {
  try {
    if (!to) throw new Error("Recipient email missing");

    const response = await resend.emails.send({
      from: EMAIL_FROM,
      to,
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