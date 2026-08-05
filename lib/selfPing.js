/**
 * lib/selfPing.js  —  Self-ping / keep-alive for free-tier hosting
 *
 * Platforms like Render, Replit, Koyeb, Glitch, and Cyclic spin down idle
 * services after ~15 minutes of inactivity.  This module pings the bot's own
 * /health endpoint on a regular interval to prevent that.
 *
 * ─── Configuration (all via environment variables) ─────────────────────────
 *
 *   SELF_PING            "true"  → force-enable  (any platform)
 *                        "false" → force-disable (overrides auto-detect)
 *
 *   SELF_PING_URL        Full URL to ping — auto-detected if omitted.
 *                        Example: https://mybot.onrender.com
 *
 *   SELF_PING_INTERVAL   Minutes between pings (default: 14).
 *                        Keep below the platform's idle timeout (usually 15 min).
 *
 *   SELF_PING_PATH       Path to request (default: /health).
 *
 * ─── Auto-detected platforms ───────────────────────────────────────────────
 *   Render · Replit · Koyeb · Glitch · Cyclic · Railway · Heroku
 *   On these, self-ping is ON automatically unless SELF_PING=false.
 *
 * ─── URL auto-detection ────────────────────────────────────────────────────
 *   The module reads well-known env vars for each platform.
 *   Set SELF_PING_URL to override on any platform.
 */

import { getPlatformInfo } from './platformDetect.js';

/* ── Platforms that spin down on inactivity (auto-enable self-ping) ── */
const SPIN_DOWN_PLATFORMS = new Set([
    'Render', 'Replit', 'Koyeb', 'Glitch', 'Cyclic', 'Railway', 'Heroku',
]);

/* ── Resolve public URL from well-known env vars ── */
function resolvePublicUrl() {
    // Explicit override always wins
    if (process.env.SELF_PING_URL) return process.env.SELF_PING_URL;

    // Generic fallbacks (user-set on any platform)
    if (process.env.APP_URL)    return process.env.APP_URL;
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;

    // ── Platform-specific ──

    // Render  (RENDER_EXTERNAL_URL is set automatically)
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;

    // Replit  (REPLIT_DEV_DOMAIN is set automatically in dev; deployed uses REPLIT_DOMAINS)
    if (process.env.REPLIT_DOMAINS) {
        // REPLIT_DOMAINS is a comma-separated list; take the first
        const domain = process.env.REPLIT_DOMAINS.split(',')[0].trim();
        if (domain) return `https://${domain}`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;

    // Koyeb  (no standard env var — user must set SELF_PING_URL or APP_URL)
    if (process.env.KOYEB_PUBLIC_DOMAIN) return `https://${process.env.KOYEB_PUBLIC_DOMAIN}`;

    // Glitch  (PROJECT_DOMAIN is set automatically)
    if (process.env.PROJECT_DOMAIN) return `https://${process.env.PROJECT_DOMAIN}.glitch.me`;

    // Cyclic
    if (process.env.CYCLIC_URL) return process.env.CYCLIC_URL;

    // Railway  (RAILWAY_PUBLIC_DOMAIN is set on Railway v2+)
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    if (process.env.RAILWAY_STATIC_URL)    return process.env.RAILWAY_STATIC_URL;

    // Heroku  (no built-in URL env var — user must set HEROKU_URL or APP_URL)
    if (process.env.HEROKU_URL) return process.env.HEROKU_URL;
    if (process.env.HEROKU_APP_NAME) return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;

    return null;
}

/* ── Should self-ping be enabled? ── */
function shouldEnable(platformName) {
    const explicit = (process.env.SELF_PING || '').toLowerCase();
    if (explicit === 'false' || explicit === '0') return false;
    if (explicit === 'true'  || explicit === '1') return true;
    return SPIN_DOWN_PLATFORMS.has(platformName);
}

/* ── ANSI helpers (matches wolfLogger style) ── */
const N  = '\x1b[38;2;0;255;156m';
const NB = '\x1b[1m\x1b[38;2;0;255;156m';
const Y  = '\x1b[38;2;250;204;21m';
const W  = '\x1b[38;2;200;215;225m';
const D  = '\x1b[2m\x1b[38;2;100;120;130m';
const R  = '\x1b[0m';

let _pingInterval = null;

/**
 * Start the self-ping loop.
 * Safe to call multiple times — only one loop runs at a time.
 */
export function setupSelfPing() {
    if (_pingInterval) return; // already running

    const { name: platformName } = getPlatformInfo();

    if (!shouldEnable(platformName)) return;

    const url      = resolvePublicUrl();
    const path     = process.env.SELF_PING_PATH     || '/health';
    const minutes  = parseFloat(process.env.SELF_PING_INTERVAL || '14');
    const intervalMs = Math.max(1, minutes) * 60 * 1000;

    if (!url) {
        process.stdout.write(
            `${Y}[SELF-PING]${R} ${W}Auto-ping enabled but no public URL found.${R}\n` +
            `${D}  → Set SELF_PING_URL=https://your-app-url to activate keep-alive.${R}\n`
        );
        return;
    }

    const target = url.replace(/\/$/, '') + path;

    process.stdout.write(
        `\n${NB}╭─⌈ 🏓 SELF-PING KEEP-ALIVE ⌋${R}\n` +
        `${NB}» ${R}${Y}Platform:${R} ${W}${platformName}${R}\n` +
        `${NB}» ${R}${Y}Target  :${R} ${W}${target}${R}\n` +
        `${NB}» ${R}${Y}Interval:${R} ${W}every ${minutes} min${R}\n` +
        `${NB}╰⊷${R}\n\n`
    );

    // Ping helper
    async function doPing() {
        const start = Date.now();
        try {
            const res = await fetch(target, {
                method: 'GET',
                signal: AbortSignal.timeout(15_000),
                headers: { 'User-Agent': 'WolfBot-SelfPing/1.0' },
            });
            const ms = Date.now() - start;
            if (res.ok) {
                process.stdout.write(
                    `${N}[SELF-PING]${R} ${W}✓ ${res.status} — ${ms}ms${R} ${D}(${new Date().toLocaleTimeString()})${R}\n`
                );
            } else {
                process.stdout.write(
                    `${Y}[SELF-PING]${R} ${W}⚠ HTTP ${res.status} — ${ms}ms${R}\n`
                );
            }
        } catch (err) {
            const ms = Date.now() - start;
            process.stdout.write(
                `\x1b[31m[SELF-PING]\x1b[0m ${W}✗ failed after ${ms}ms — ${err.message}${R}\n`
            );
        }
    }

    // Fire once after 10 s to confirm the URL works, then on the regular interval
    setTimeout(doPing, 10_000);
    _pingInterval = setInterval(doPing, intervalMs);
}

/**
 * Stop the self-ping loop (useful for graceful shutdown / tests).
 */
export function stopSelfPing() {
    if (_pingInterval) {
        clearInterval(_pingInterval);
        _pingInterval = null;
    }
}
