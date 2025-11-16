const nodemailer = require('nodemailer');

// Crée un transporteur SMTP basé sur les variables d'environnement
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465, // true pour 465 (SSL), false pour 587 (STARTTLS)
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        // Permet d'éviter certaines erreurs de certificat en environnement de test
        rejectUnauthorized: false
    }
});

/**
 * Envoie un e-mail via le transporteur configuré
 * @param {Object} params
 * @param {string|string[]} params.to - Destinataire(s)
 * @param {string} params.subject - Sujet de l'e-mail
 * @param {string} [params.text] - Corps texte
 * @param {string} [params.html] - Corps HTML
 * @param {string} [params.fromEmail] - Email expéditeur (par défaut MAIL_FROM_EMAIL)
 * @param {string} [params.fromName] - Nom expéditeur (par défaut MAIL_FROM_NAME)
 * @param {string} [params.replyTo] - Adresse de réponse (par défaut MAIL_REPLY_TO ou MAIL_FROM_EMAIL)
 */
async function sendEmail({
    to,
    subject,
    text,
    html,
    attachments = [],
    fromEmail = process.env.MAIL_FROM_EMAIL,
    fromName = process.env.MAIL_FROM_NAME,
    replyTo = process.env.MAIL_REPLY_TO || process.env.MAIL_FROM_EMAIL
}) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('Configuration SMTP manquante: vérifiez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env');
    }

    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        replyTo,
        attachments
    });

    console.log('E-mail envoyé, messageId:', info.messageId);
    return info;
}

module.exports = { sendEmail };