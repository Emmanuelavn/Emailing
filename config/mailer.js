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
    // Augmente les timeouts pour éviter les erreurs de connexion en environnements lents
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 30000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 30000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    tls: {
        // Permet d'éviter certaines erreurs de certificat en environnement de test
        rejectUnauthorized: false
    }
});

// Vérifie la connexion SMTP au démarrage (utile pour diagnostiquer les erreurs de production)
transporter.verify().then(() => {
    console.log('Transporteur SMTP prêt — connexion OK');
}).catch(err => {
    console.warn('Impossible de vérifier le transporteur SMTP au démarrage:', err && err.message ? err.message : err);
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
    const mailOptions = {
        from,
        to,
        subject,
        text,
        html,
        replyTo,
        attachments
    };

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`E-mail envoyé (tentative ${attempt}), messageId:`, info.messageId);
            return info;
        } catch (err) {
            lastError = err;
            console.error(`Erreur envoi mail (tentative ${attempt}):`, err && err.message ? err.message : err);
            if (err && err.stack) console.error('Stack:', err.stack);
            // Attendre avant retry (backoff exponentiel)
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
    }
    throw new Error(`Echec envoi mail après 3 tentatives: ${lastError && lastError.message ? lastError.message : lastError}`);
}

module.exports = { sendEmail };