require('dotenv').config(); // Charge les variables d'environnement depuis .env

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const connectDB = require('./config/db'); // Importe la fonction de connexion à la BDD
const User = require('./models/User');
const ejsMate = require('ejs-mate'); // Importe ejs-mate // Importe le modèle User
const { sendEmail } = require('./config/mailer'); // Module d'envoi d'e-mails
const Contact = require('./models/Contact');
const Template = require('./models/Template');
const Campaign = require('./models/Campaign');
const multer = require('multer');
const { parse } = require('csv-parse');
const session = require('express-session');
const MongoStore = require('connect-mongo');
// Connecte à la base de données MongoDB
connectDB();


// --- Configuration EJS ---
app.engine('ejs', ejsMate); // Utilise ejs-mate comme moteur de template pour les fichiers .ejs
app.set('view engine', 'ejs'); // Définit EJS comme moteur de template
app.set('views', 'views');    // Indique où trouver les fichiers .ejs (dans un dossier 'views')

// Middleware pour servir les fichiers statiques (CSS, JS côté client, images)
app.use(express.static('public')); 
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// --- Sessions & Auth ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
    },
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 7 * 24 * 60 * 60
    })
}));

// Expose l'utilisateur courant aux vues EJS
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// Middleware de protection
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Utils simples pour la prévisualisation de templates
function parseVars(str) {
    const obj = {};
    if (!str) return obj;
    str.split(',').map(s => s.trim()).filter(Boolean).forEach(seg => {
        const [k, ...rest] = seg.split(':');
        const v = rest.join(':');
        if (k) obj[k.trim()] = (v || '').trim();
    });
    return obj;
}
function renderWithVariables(text, vars) {
    if (!text) return '';
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] || '') : '';
    });
}

// Fusion utilitaire pour variables de template (inclure le contact)
function buildVarsForContact(contact, extraVars) {
    const base = {
        firstName: contact?.firstName || '',
        lastName: contact?.lastName || '',
        email: contact?.email || ''
    };
    return Object.assign({}, base, extraVars || {});
}

// --- Routes de l'application ---

// Route pour la page d'accueil (tableau de bord)
app.get('/', requireAuth, async (req, res) => {
    // Statistiques simples
    const today = new Date();
    today.setHours(0,0,0,0);
    const SendLog = require('./models/SendLog');
    const sentToday = await SendLog.countDocuments({ status: 'sent', createdAt: { $gte: today } });
    const failedToday = await SendLog.countDocuments({ status: 'failed', createdAt: { $gte: today } });
    const totalContacts = await Contact.countDocuments({});
    const recentLogs = await SendLog.find({}).sort({ createdAt: -1 }).limit(10);

    res.render('dashboard', {
        title: 'Tableau de Bord',
        activePage: 'dashboard',
        message: 'Bienvenue sur votre plateforme d\'e-mails !',
        stats: { sentToday, failedToday, totalContacts },
        recentLogs
    });
});

// --- Auth: pages Connexion / Inscription ---
const bcrypt = require('bcryptjs');

app.get('/login', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/');
    res.render('login', { title: 'Connexion', activePage: 'login' });
});

app.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier = email ou username
        if (!identifier || !password) {
            return res.status(400).render('login', { title: 'Connexion', activePage: 'login', error: 'Identifiants manquants' });
        }
        const user = await User.findOne({
            $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
        });
        if (!user) {
            return res.status(401).render('login', { title: 'Connexion', activePage: 'login', error: 'Utilisateur introuvable' });
        }
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            return res.status(401).render('login', { title: 'Connexion', activePage: 'login', error: 'Mot de passe incorrect' });
        }
        req.session.user = { id: user._id.toString(), username: user.username, email: user.email };
        res.redirect('/');
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(400).render('login', { title: 'Connexion', activePage: 'login', error: 'Erreur de connexion' });
    }
});

app.get('/register', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/');
    res.render('register', { title: 'Inscription', activePage: 'register' });
});

app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).render('register', { title: 'Inscription', activePage: 'register', error: 'Tous les champs sont requis' });
        }
        const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (exists) {
            return res.status(409).render('register', { title: 'Inscription', activePage: 'register', error: 'Utilisateur déjà existant' });
        }
        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email: email.toLowerCase(), password: hashed });
        req.session.user = { id: user._id.toString(), username: user.username, email: user.email };
        res.redirect('/');
    } catch (err) {
        console.error('Erreur register:', err);
        res.status(400).render('register', { title: 'Inscription', activePage: 'register', error: 'Erreur lors de l\'inscription' });
    }
});

// --- Démarrage du serveur ---
// --- Pages de base ---
// Composer & Envoyer
app.get('/compose', requireAuth, async (req, res) => {
    const contacts = await Contact.find({}).sort({ createdAt: -1 }).limit(200);
    const templates = await Template.find({}).sort({ updatedAt: -1 }).limit(100);
    res.render('compose', { title: 'Composer & Envoyer', activePage: 'compose', contacts, templates });
});

app.post('/compose/send', requireAuth, upload.fields([
    { name: 'csv', maxCount: 1 },
    { name: 'attachments', maxCount: 10 }
]), async (req, res) => {
    try {
        const { subject, html, manualEmails, templateId, vars } = req.body;
        let finalSubject = subject;
        let finalHtml = html;

        // Si un template est choisi, on rend avec variables
        if (templateId) {
            const tpl = await Template.findById(templateId);
            if (!tpl) return res.status(400).send('Template introuvable');
            const varsObj = parseVars(vars || '');
            finalSubject = renderWithVariables(tpl.subject || '', varsObj);
            finalHtml = renderWithVariables(tpl.html || '', varsObj);
        }

        if (!finalSubject || !finalHtml) return res.status(400).send('Sujet et contenu HTML requis');

        // Récupérer les emails saisis manuellement
        let emails = [];
        if (manualEmails && manualEmails.trim()) {
            emails = manualEmails
                .split(/[,\n;]/)
                .map(e => e.trim().toLowerCase())
                .filter(Boolean);
        }

        // Récupérer les emails via CSV si fourni
        if (req.files && req.files.csv && req.files.csv[0]) {
            const csvStr = req.files.csv[0].buffer.toString('utf8');
            const rows = await new Promise((resolve, reject) => {
                parse(csvStr, { columns: true, skip_empty_lines: true, trim: true }, (err, recs) => {
                    if (err) return reject(err);
                    resolve(recs);
                });
            });
            for (const r of rows) {
                const em = (r.email || '').toLowerCase().trim();
                if (em) emails.push(em);
            }
        }

        // Récupérer les emails depuis sélection de contacts
        const contactIds = Array.isArray(req.body.contactIds) ? req.body.contactIds : (req.body.contactIds ? [req.body.contactIds] : []);
        if (contactIds.length) {
            const selContacts = await Contact.find({ _id: { $in: contactIds } }, { email: 1 });
            selContacts.forEach(c => emails.push(c.email.toLowerCase()));
        }

        // Déduplication et validation simple
        const uniq = Array.from(new Set(emails)).filter(e => /.+@.+\..+/.test(e));
        if (!uniq.length) return res.status(400).send('Aucun destinataire valide fourni');

        // Préparer les pièces jointes
        let attachments = [];
        if (req.files && req.files.attachments) {
            attachments = req.files.attachments.map(f => ({
                filename: f.originalname,
                content: f.buffer,
                contentType: f.mimetype,
                cid: f.originalname // permet l'usage inline via <img src="cid:nomDuFichier">
            }));
        }

        // Envoi séquentiel avec throttling simple (50ms)
        let sent = 0, failed = 0;
        for (const to of uniq) {
            try {
                const info = await sendEmail({ to, subject: finalSubject, html: finalHtml, attachments });
                sent++;
                await require('./models/SendLog').create({
                    contactEmail: to,
                    messageId: info.messageId,
                    status: 'sent'
                });
            } catch (err) {
                console.error('Erreur envoi vers', to, err.message);
                failed++;
                await require('./models/SendLog').create({
                    contactEmail: to,
                    status: 'failed',
                    error: err.message
                });
            }
            await new Promise(r => setTimeout(r, 50));
        }

        res.render('dashboard', {
            title: 'Tableau de Bord',
            activePage: 'dashboard',
            message: `Envoi terminé: ${sent} envoyé(s), ${failed} échec(s)`
        });
    } catch (err) {
        console.error('Erreur compose/send:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});
// Contacts: liste et création simple
app.get('/contacts', requireAuth, async (req, res) => {
    const contacts = await Contact.find({}).sort({ createdAt: -1 }).limit(100);
    res.render('contacts', { title: 'Contacts', activePage: 'contacts', contacts });
});

app.post('/contacts', requireAuth, async (req, res) => {
    try {
        const { email, firstName, lastName, tags } = req.body;
        const tagList = (tags || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        await Contact.create({ email, firstName, lastName, tags: tagList });
        res.redirect('/contacts');
    } catch (err) {
        console.error('Erreur création contact:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

// Templates: liste et création simple
app.get('/templates', requireAuth, async (req, res) => {
    const templates = await Template.find({}).sort({ updatedAt: -1 }).limit(100);
    res.render('templates', { title: 'Templates', activePage: 'templates', templates });
});

app.post('/templates', requireAuth, async (req, res) => {
    try {
        const { name, subject, html, variables } = req.body;
        const vars = (variables || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
        await Template.create({ name, subject, html, variables: vars });
        res.redirect('/templates');
    } catch (err) {
        console.error('Erreur création template:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

// Campagnes: liste et création simple
app.get('/campaigns', requireAuth, async (req, res) => {
    const campaigns = await Campaign.find({}).sort({ createdAt: -1 }).limit(100).populate('template').lean();
    const templates = await Template.find({}).sort({ name: 1 });
    // Audience estimée
    const totalActive = await Contact.countDocuments({ status: 'active' });
    const audience = {};
    for (const c of campaigns) {
        if (Array.isArray(c.segmentTags) && c.segmentTags.length) {
            audience[c._id] = await Contact.countDocuments({ status: 'active', tags: { $in: c.segmentTags } });
        } else {
            audience[c._id] = totalActive;
        }
    }
    res.render('campaigns', { title: 'Campagnes', activePage: 'campaigns', campaigns, templates, audience });
});

app.post('/campaigns', requireAuth, async (req, res) => {
    try {
        const { name, templateId, segmentTags, scheduledAt } = req.body;
        const tags = (segmentTags || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        const sched = scheduledAt ? new Date(scheduledAt) : undefined;
        await Campaign.create({ name, template: templateId, segmentTags: tags, status: sched ? 'scheduled' : 'draft', scheduledAt: sched });
        res.redirect('/campaigns');
    } catch (err) {
        console.error('Erreur création campagne:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

// Paramètres (placeholder)
app.get('/settings', requireAuth, (req, res) => {
    res.render('settings', { title: 'Paramètres', activePage: 'settings', env: {
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpSecure: process.env.SMTP_SECURE,
        fromName: process.env.MAIL_FROM_NAME,
        fromEmail: process.env.MAIL_FROM_EMAIL,
        replyTo: process.env.MAIL_REPLY_TO
    }});
});

// Domaines (placeholder)
app.get('/domains', requireAuth, (req, res) => {
    res.render('domains', { title: 'Domaines', activePage: 'domains' });
});

// Déconnexion (placeholder)
app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Accédez au tableau de bord via http://localhost:${PORT}`);
});

app.post('/contacts/:id/delete', requireAuth, async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.redirect('/contacts');
    } catch (err) {
        console.error('Erreur suppression contact:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

app.post('/contacts/import', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('Fichier CSV manquant');
        const csv = req.file.buffer.toString('utf8');
        const records = [];
        await new Promise((resolve, reject) => {
            parse(csv, { columns: true, skip_empty_lines: true, trim: true }, (err, rows) => {
                if (err) return reject(err);
                rows.forEach(r => records.push(r));
                resolve();
            });
        });

        let inserted = 0;
        for (const r of records) {
            const email = (r.email || '').toLowerCase().trim();
            if (!email || !/.+@.+\..+/.test(email)) continue;
            const firstName = (r.firstName || '').trim();
            const lastName = (r.lastName || '').trim();
            const tags = (r.tags || '')
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);
            try {
                await Contact.updateOne(
                    { email },
                    { $setOnInsert: { email, firstName, lastName, tags, status: 'active' } },
                    { upsert: true }
                );
                inserted++;
            } catch (e) {
                console.warn('Skip contact', email, e.message);
            }
        }

        res.redirect('/contacts');
    } catch (err) {
        console.error('Erreur import CSV:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

// Prévisualisation d’un template avec variables
app.get('/templates/:id/preview', requireAuth, async (req, res) => {
    try {
        const t = await Template.findById(req.params.id);
        if (!t) return res.status(404).send('Template introuvable');
        const vars = parseVars(req.query.vars || '');
        const renderedSubject = renderWithVariables(t.subject || '', vars);
        const renderedHtml = renderWithVariables(t.html || '', vars);
        res.render('template_preview', {
            activePage: 'templates',
            template: t,
            vars,
            renderedSubject,
            renderedHtml
        });
    } catch (err) {
        console.error('Erreur preview template:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

// --- Scheduler Campagnes ---
const SendLog = require('./models/SendLog');
async function runCampaign(campaignId) {
    const c = await Campaign.findById(campaignId).populate('template');
    if (!c) return;
    if (!c.template) throw new Error('Template manquant pour la campagne');

    // Construire la liste de contacts ciblés
    let query = { status: 'active' };
    if (Array.isArray(c.segmentTags) && c.segmentTags.length) {
        query.tags = { $in: c.segmentTags };
    }
    const recipients = await Contact.find(query, { email: 1, firstName: 1, lastName: 1 }).lean();

    // Exécution
    let sent = 0, failed = 0;
    for (const r of recipients) {
        const vars = buildVarsForContact(r);
        const subject = renderWithVariables(c.template.subject || '', vars);
        const html = renderWithVariables(c.template.html || '', vars);
        try {
            const info = await sendEmail({ to: r.email, subject, html });
            sent++;
            await SendLog.create({
                contact: r._id,
                contactEmail: r.email,
                campaign: c._id,
                messageId: info.messageId,
                status: 'sent'
            });
        } catch (err) {
            console.error('Erreur envoi campagne', c.name, 'vers', r.email, err.message);
            failed++;
            await SendLog.create({
                contact: r._id,
                contactEmail: r.email,
                campaign: c._id,
                status: 'failed',
                error: err.message
            });
        }
        await new Promise(r => setTimeout(r, 50));
    }
    // Mise à jour du statut
    await Campaign.updateOne({ _id: c._id }, { $set: { status: 'completed' } });
    console.log(`Campagne '${c.name}' terminée: ${sent} envoyé(s), ${failed} échec(s)`);
}

// Poller simple toutes les 30s
setInterval(async () => {
    try {
        const now = new Date();
        const toRun = await Campaign.find({ status: 'scheduled', scheduledAt: { $lte: now } }).lean();
        for (const c of toRun) {
            // Marquer running pour éviter double exécution si le poller recoche
            await Campaign.updateOne({ _id: c._id, status: 'scheduled' }, { $set: { status: 'running' } });
            runCampaign(c._id).catch(e => console.error('runCampaign error', e));
        }
    } catch (err) {
        console.error('Erreur scheduler campagnes:', err);
    }
}, 30000);

// Action pour lancer immédiatement une campagne
app.post('/campaigns/:id/run', requireAuth, async (req, res) => {
    try {
        const c = await Campaign.findById(req.params.id);
        if (!c) return res.status(404).send('Campagne introuvable');
        await Campaign.updateOne({ _id: c._id }, { $set: { status: 'running' } });
        runCampaign(c._id).catch(e => console.error('runCampaign error', e));
        res.redirect('/campaigns');
    } catch (err) {
        console.error('Erreur run campagne:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});

// Détails campagne
app.get('/campaigns/:id', requireAuth, async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id).populate('template').lean();
        if (!campaign) return res.status(404).send('Campagne introuvable');
        const logs = await SendLog.find({ campaign: campaign._id }).sort({ createdAt: -1 }).limit(50).lean();
        const statsAgg = await SendLog.aggregate([
            { $match: { campaign: campaign._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const stats = { sent: 0, failed: 0 };
        for (const s of statsAgg) {
            if (s._id === 'sent') stats.sent = s.count;
            if (s._id === 'failed') stats.failed = s.count;
        }
        res.render('campaign_show', { title: campaign.name, activePage: 'campaigns', campaign, logs, stats });
    } catch (err) {
        console.error('Erreur détails campagne:', err);
        res.status(400).send('Erreur: ' + err.message);
    }
});