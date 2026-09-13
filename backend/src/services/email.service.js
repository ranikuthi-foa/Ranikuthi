/**
 * RANIKUTHI V5 — email.service.js
 * L-36: OTP delivery is EMAIL only — never SMS/WhatsApp API.
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(toEmail, otp, purpose) {
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your Ranikuthi verification code',
    text: `Your one-time verification code is: ${otp}\n\nPurpose: ${purpose}\nThis code expires in 10 minutes. If you did not request this, contact an Admin immediately.`,
  });
}

async function sendGenericEmail(toEmail, subject, bodyText) {
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    text: bodyText,
  });
}

module.exports = { sendOtpEmail, sendGenericEmail };