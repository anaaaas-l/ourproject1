// ============================================================
//  server/config.js — Configuration centrale v5
// ============================================================

const config = {

    PORT: 3000,

    DB: {
        host:     'localhost',
        port:     3307,
        user:     'root',
        password: '',
        database: 'helpdesk',
    },

    // ── Session (gardée pour compatibilité) ──────────────────
    SESSION_SECRET: 'helpdesk-secret-key-changez-moi',

    // ── JWT ──────────────────────────────────────────────────
    // Clé secrète pour signer les tokens JWT
    // CHANGEZ cette valeur en production !
    JWT_SECRET: 'helpdesk-jwt-secret-changez-moi-aussi',
    // Durée de validité d'un token : 24 heures
    JWT_EXPIRY:  '24h',

    // ── Upload ───────────────────────────────────────────────
    UPLOAD_DIR:    'public/uploads',
    MAX_FILE_SIZE: 5 * 1024 * 1024,

    // ── Email ────────────────────────────────────────────────
    // Mettez MAIL_ENABLED: true et remplissez vos identifiants
    MAIL_ENABLED: true,
    MAIL: {
        host: 'smtp.gmail.com',
        port: 587,
        user: 'anasmabrouki643@gmail.com',   // ← votre Gmail
        pass: 'wlrp llbi owze lcra',        // ← mot de passe d'application Gmail
        from: 'HelpDesk IT <anasmabrouki643@gmail.com>',
    },

    // ── Domaines disponibles ─────────────────────────────────
    // Utilisés dans l'inscription technicien et la création de ticket
    DOMAINES: ['Réseau', 'Matériel', 'Logiciels', 'Sécurité', 'IA'],

    // ── QCM : score minimum pour valider l'inscription ───────
    // Sur 10 questions, le technicien doit en avoir >= 7 bonnes
    QCM_NB_QUESTIONS:    10,
    QCM_SCORE_MINIMUM:   7,
};

module.exports = config;
