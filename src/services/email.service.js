const { Resend } = require('resend');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const resend = new Resend(process.env.RESEND_API_KEY);

if (!process.env.EMAIL_FROM) {
  throw new Error('EMAIL_FROM is not set in env');
}

exports.sendEmail = async ({ to, subject, html }) => {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html
    });
  } catch (error) {
    logger.error('Email send failed', error);
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
    await exports.sendEmail({
      to: booking.user.email,
      subject: 'Your consultation is confirmed',
      html: baseHtml.replace('{{name}}', booking.user.name)
    });

    // CA email
    await exports.sendEmail({
      to: booking.caProfile.user.email,
      subject: 'New consultation booked',
      html: baseHtml.replace('{{name}}', booking.caProfile.user.name)
    });

  } catch (err) {
    logger.error('Failed to send booking emails', err);
  }
};
