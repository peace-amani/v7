// ====== lib/mongoAdapter.js ======
// Optional MongoDB layer for WOLFBOT.
//
// If MONGODB_URI is set in the environment, this module opens a Mongoose
// connection and creates the standard bot collections.
// If MONGODB_URI is NOT set, every exported function is a safe no-op so the
// rest of the bot (which uses SQLite via database.js) is completely unaffected.
//
// Usage in other modules:
//   import mongo from './mongoAdapter.js';
//
//   if (mongo.isReady) {
//       await mongo.upsertConfig(botId, 'prefix_config', JSON.stringify({ prefix: '.' }));
//   }
//
// Supported MONGODB_URI formats:
//   mongodb://user:password@host:27017/dbname
//   mongodb+srv://user:password@cluster.mongodb.net/dbname   (Atlas)

// ── State ──────────────────────────────────────────────────────────────────

let mongoose    = null;   // mongoose module, loaded dynamically
let _ready      = false;  // true once connection + index setup is verified
let _collCount  = 0;      // number of collections confirmed at startup
let _lastError  = null;   // last connection error message

// ── Schemas ────────────────────────────────────────────────────────────────

let BotConfig     = null;
let Sudoer        = null;
let Warning       = null;
let GroupFeature  = null;
let LidMap        = null;
let BotLog        = null;
let SessionCred   = null;
let SessionKey    = null;

// ── Boot ───────────────────────────────────────────────────────────────────

async function init() {
    // Load .env in case this runs before index.js body
    try {
        const _dotenv = (await import('dotenv')).default ?? (await import('dotenv'));
        _dotenv.config();
    } catch {}

    const uri = process.env.MONGODB_URI;
    if (!uri) return; // MongoDB is optional — silently skip

    // Load mongoose via dynamic import
    try {
        const mod = await import('mongoose');
        mongoose = mod.default ?? mod;
    } catch (_firstErr) {
        _lastError = 'mongoose not installed — add "mongoose" to package.json';
        console.log('[Mongo] mongoose not found — run: npm install mongoose');
        return;
    }

    // Suppress Mongoose deprecation warnings
    mongoose.set('strictQuery', false);

    // Normalise the URI: ensure a database name and Atlas-recommended query params
    // are present so the connection works on any hosting platform.
    let normUri = uri.trim();
    // If it's an SRV URI with no database name, inject the default db before '?'
    if (/^mongodb(\+srv)?:\/\/[^/]+\/(\?|$)/.test(normUri) ||
        /^mongodb(\+srv)?:\/\/[^/]+$/.test(normUri)) {
        // no db path segment — add /wolfbot
        normUri = normUri.replace(
            /^(mongodb(?:\+srv)?:\/\/[^/?#]*)(\??[^#]*)$/,
            (_, host, qs) => `${host}/wolfbot${qs || '?retryWrites=true&w=majority'}`
        );
    }

    const opts = {
        // Atlas / SRV requires TLS; harmless on direct connections
        tls:                      true,
        // Force IPv4 — many cloud platforms (Render, Railway, Heroku) don't
        // route IPv6 properly to Atlas, causing silent timeouts
        family:                   4,
        serverSelectionTimeoutMS: 20000,
        socketTimeoutMS:          45000,
        connectTimeoutMS:         20000,
        heartbeatFrequencyMS:     10000,
        maxPoolSize:              5,
        retryWrites:              true,
        retryReads:               true,
        w:                        'majority',
    };

    try {
        await mongoose.connect(normUri, opts);
        _buildModels();
        await _ensureIndexes();
        _ready = true;
        console.log('[Mongo] ✅ MongoDB connected and collections verified');
    } catch (err) {
        _lastError = (err.message || String(err)).split('\n')[0].trim();
        console.log(`[Mongo] ❌ MongoDB connection failed: ${_lastError}`);
        console.log('[Mongo] Falling back to SQLite only');
        mongoose = null;
    }
}

// ── Model definitions ──────────────────────────────────────────────────────

function _buildModels() {
    const { Schema, model, models } = mongoose;

    // bot_configs — mirrors PostgreSQL bot_configs table
    const botConfigSchema = new Schema({
        bot_id:     { type: String, required: true },
        key:        { type: String, required: true },
        value:      { type: String, default: null },
        updated_at: { type: Date,   default: Date.now },
    }, { collection: 'bot_configs' });
    botConfigSchema.index({ bot_id: 1, key: 1 }, { unique: true });

    // sudoers
    const sudoerSchema = new Schema({
        bot_id:   { type: String, required: true },
        phone:    { type: String, required: true },
        added_at: { type: Date,   default: Date.now },
    }, { collection: 'sudoers' });
    sudoerSchema.index({ bot_id: 1, phone: 1 }, { unique: true });

    // warnings
    const warningSchema = new Schema({
        bot_id:     { type: String, required: true },
        chat_id:    { type: String, required: true },
        phone:      { type: String, required: true },
        count:      { type: Number, default: 0 },
        updated_at: { type: Date,   default: Date.now },
    }, { collection: 'warnings' });
    warningSchema.index({ bot_id: 1, chat_id: 1, phone: 1 }, { unique: true });

    // group_features
    const groupFeatureSchema = new Schema({
        bot_id:     { type: String, required: true },
        chat_id:    { type: String, required: true },
        feature:    { type: String, required: true },
        enabled:    { type: Boolean, default: false },
        updated_at: { type: Date,    default: Date.now },
    }, { collection: 'group_features' });
    groupFeatureSchema.index({ bot_id: 1, chat_id: 1, feature: 1 }, { unique: true });

    // lid_map
    const lidMapSchema = new Schema({
        lid:        { type: String, required: true, unique: true },
        phone:      { type: String, required: true },
        updated_at: { type: Date,   default: Date.now },
    }, { collection: 'lid_map' });

    // bot_logs
    const botLogSchema = new Schema({
        bot_id:     { type: String },
        event:      { type: String, required: true },
        detail:     { type: String },
        created_at: { type: Date, default: Date.now },
    }, { collection: 'bot_logs' });

    // session_creds — WhatsApp auth credentials
    const sessionCredSchema = new Schema({
        key:        { type: String, required: true, unique: true },
        value:      { type: String, required: true },
        updated_at: { type: Date,   default: Date.now },
    }, { collection: 'session_creds' });

    // session_keys — WhatsApp Signal pre-keys / sender-keys
    const sessionKeySchema = new Schema({
        type:       { type: String, required: true },
        id:         { type: String, required: true },
        value:      { type: String, required: true },
        updated_at: { type: Date,   default: Date.now },
    }, { collection: 'session_keys' });
    sessionKeySchema.index({ type: 1, id: 1 }, { unique: true });

    // Re-use existing models across hot-reloads
    BotConfig    = models.bot_configs    || model('bot_configs',    botConfigSchema);
    Sudoer       = models.sudoers        || model('sudoers',        sudoerSchema);
    Warning      = models.warnings       || model('warnings',       warningSchema);
    GroupFeature = models.group_features || model('group_features', groupFeatureSchema);
    LidMap       = models.lid_map        || model('lid_map',        lidMapSchema);
    BotLog       = models.bot_logs       || model('bot_logs',       botLogSchema);
    SessionCred  = models.session_creds  || model('session_creds',  sessionCredSchema);
    SessionKey   = models.session_keys   || model('session_keys',   sessionKeySchema);
}

async function _ensureIndexes() {
    const colls = [BotConfig, Sudoer, Warning, GroupFeature, LidMap, BotLog, SessionCred, SessionKey];
    for (const m of colls) {
        try { await m.createIndexes(); } catch {}
    }
    try {
        const db    = mongoose.connection.db;
        const names = await db.listCollections().toArray();
        _collCount  = names.length;
        console.log(`[Mongo] 🗄️  Collections: ${names.map(c => c.name).join(', ') || '(none yet)'}`);
    } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Upsert a bot config value into MongoDB (mirrors pg bot_configs).
 * No-op when MongoDB is disabled.
 */
async function upsertConfig(botId, key, value) {
    if (!_ready || !BotConfig) return null;
    try {
        return await BotConfig.findOneAndUpdate(
            { bot_id: botId, key },
            { $set: { value, updated_at: new Date() } },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.log(`[Mongo] upsertConfig error: ${err.message}`);
        return null;
    }
}

/**
 * Read a bot config value from MongoDB.
 * Returns null when not found or MongoDB is disabled.
 */
async function getConfigValue(botId, key) {
    if (!_ready || !BotConfig) return null;
    try {
        const doc = await BotConfig.findOne({ bot_id: botId, key }).lean();
        return doc ? doc.value : null;
    } catch { return null; }
}

/**
 * Restore all bot_configs rows into SQLite (called on cold restart).
 * Returns { restored: number }.
 */
async function restoreConfigs(sqliteSetConfig) {
    if (!_ready || !BotConfig || typeof sqliteSetConfig !== 'function') {
        return { restored: 0 };
    }
    let restored = 0;
    try {
        const docs = await BotConfig.find({}).lean();
        for (const doc of docs) {
            try {
                // sqliteSetConfig is called with (key, value, botId) — wrap to
                // match the database.js upsert signature used in restoreFromPg
                await sqliteSetConfig(doc.key, doc.value, doc.bot_id);
                restored++;
            } catch {}
        }
    } catch (err) {
        console.log(`[Mongo] restoreConfigs error: ${err.message}`);
    }
    return { restored };
}

/**
 * Log an event to the bot_logs collection (fire-and-forget).
 */
function log(botId, event, detail = null) {
    if (!_ready || !BotLog) return;
    BotLog.create({ bot_id: botId, event, detail }).catch(() => {});
}

/**
 * Gracefully close the Mongoose connection.
 */
async function close() {
    if (mongoose) {
        await mongoose.disconnect().catch(() => {});
        _ready = false;
    }
}

/**
 * Block until MongoDB is ready (or timeout elapses).
 */
async function waitForReady(timeoutMs = 12000) {
    if (_ready) return true;
    const deadline = Date.now() + timeoutMs;
    while (!_ready && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 300));
    }
    return _ready;
}

// ── Start ──────────────────────────────────────────────────────────────────

init().catch(() => {});

process.on('exit',    () => { close(); });
process.on('SIGTERM', () => { close(); });

// ── Exports ────────────────────────────────────────────────────────────────

export default {
    get isReady()     { return _ready; },
    get collCount()   { return _collCount; },
    get lastError()   { return _lastError; },
    get models()      { return { BotConfig, Sudoer, Warning, GroupFeature, LidMap, BotLog, SessionCred, SessionKey }; },

    upsertConfig,
    getConfigValue,
    restoreConfigs,
    log,
    close,
    waitForReady,

    /** The raw mongoose instance — use only if you need low-level access */
    get mongoose() { return mongoose; },
};
