// backend/services/mailService.js
const nodemailer = require('nodemailer');

// ─── Transporter Singleton ────────────────────────────────────────────────────
// CRITICAL PERFORMANCE FIX: Previously, every email call created a brand-new
// transporter AND called transporter.verify() (a full SMTP handshake) BEFORE
// sending.  On A2 Hosting that added 200–800 ms of blocking SMTP latency to
// every request that triggered an email.
//
// Solution:
//  1. Create the transporter once and reuse it (connection pooling).
//  2. Remove transporter.verify() from the send path entirely – it is only
//     useful during startup diagnostics, not on every send.
//  3. Disable nodemailer's verbose logger/debug flags in production – they
//     write to stdout on every send which hammers the shared-hosting log I/O.
// ─────────────────────────────────────────────────────────────────────────────
let _transporter = null;

function getTransporter() {
    if (_transporter) return _transporter;

    const isProd = process.env.NODE_ENV === 'production';

    if (!process.env.MAIL_HOST) {
        // Dev/test: Ethereal – do NOT create a test account on every call.
        // Ethereal accounts are only valid for a session; use env vars instead.
        console.warn('[Email Service] MAIL_HOST not set. Emails will silently drop in production.');
        // Return a no-op transport so the server never crashes on missing config.
        _transporter = nodemailer.createTransport({ jsonTransport: true });
        return _transporter;
    }

    _transporter = nodemailer.createTransport({
        host:   process.env.MAIL_HOST,
        port:   Number(process.env.MAIL_PORT) || 465,
        secure: process.env.MAIL_SECURE === 'true',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
        // Connection pool: reuse connections instead of opening a new TCP
        // connection + TLS handshake on every email.
        pool: true,
        maxConnections: 3,
        maxMessages:    50,
        // Reduce I/O overhead on A2 shared hosting in production.
        logger: !isProd,
        debug:  !isProd,
    });

    return _transporter;
}

const sendEmail = async ({ to, subject, text, html, isHREmail = false, attachments }) => {
    if (process.env.DISABLE_ALL_EMAILS === 'true') {
        return; // silently skip – no log spam needed
    }
    if (isHREmail && process.env.DISABLE_HR_EMAILS === 'true') {
        return;
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log(`[Email Service] Sending email to: "${to}", Subject: "${subject}"`);
    }

    try {
        const transporter = getTransporter();

        // ── DO NOT call transporter.verify() here ──
        // verify() opens a new SMTP connection just to ping the server and
        // adds 200-800 ms per email on every request.  Errors surface naturally
        // from sendMail() and are caught below.

        const mailOptions = {
            from: `"AMS Portal" <${process.env.MAIL_USER}>`,
            to,
            subject,
            text,
            html,
        };

        // attachments is an optional array of nodemailer attachment objects
        // e.g. [{ filename: 'doc.pdf', content: Buffer, contentType: 'application/pdf' }]
        if (attachments && attachments.length > 0) {
            mailOptions.attachments = attachments;
        }

        const info = await transporter.sendMail(mailOptions);

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Email Service] Sent: ${info.messageId}`);
        }
    } catch (error) {
        console.error(`[Email Service] Failed to send email to "${to}": ${error.message}`);
        // Reset transporter on fatal errors so it re-creates on next attempt
        if (['ECONNECTION', 'EAUTH', 'ETIMEDOUT'].includes(error.code)) {
            _transporter = null;
        }
        throw error;
    }
};

module.exports = { sendEmail };
