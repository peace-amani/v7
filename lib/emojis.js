/**
 * lib/emojis.js
 *
 * Central registry for decorative/UI emojis used across the codebase.
 * Import from here instead of hardcoding emoji characters directly, so
 * branding and status indicators can be changed in one place.
 *
 * NOT for functional/data emojis -- those stay inline where they are:
 *   - commands/automation/autoreact.js, autoreactstatus.js  (reaction pools)
 *   - commands/games/emojimix.js                            (game feature data)
 *   - commands/channel/channelreact.js                      (reaction data)
 *   - commands/games/ttt.js                                 (game board symbols)
 *   - commands/tools/country.js, lib/phoneTimezone.js        (flag lookup tables)
 *   - commands/tools/couple.js                               (feature data)
 *
 * Usage:
 *   import { STATUS, UI, MEDIA, BRAND } from '../../lib/emojis.js'
 *   console.log(`${STATUS.SUCCESS} Done!`)
 *   console.log(`${STATUS.ERROR} Failed: ${err.message}`)
 */

export const STATUS = {
	SUCCESS: '✅',
	ERROR: '❌',
	WARNING: '⚠️',
	INFO: '💡',
	LOADING: '⏳',
	ONLINE: '🟢',
	OFFLINE: '🔴',
	PENDING: '🟡',
	MUTED: '🔇',
	LOCKED: '🔒',
	UNLOCKED: '🔐',
	BLOCKED: '🚫',
	FIRE: '🔥',
	STAR: '⭐',
	SPARKLE: '✨',
	NEW: '🌟'
}

export const UI = {
	ARROW_RIGHT: '→',
	HOME: '🏠',
	SEARCH: '🔍',
	NOTE: '📝',
	CLIPBOARD: '📋',
	REFRESH: '🔄',
	LINK: '🔗',
	SETTINGS: '⚙️',
	TOOL: '🔧',
	TARGET: '🎯',
	PIN: '📌',
	FOLDER: '📁',
	FILE: '📄',
	SAVE: '💾',
	KEY: '🔑',
	TRASH: '🗑️',
	CALENDAR: '📅',
	DOWNLOAD: '⬇️',
	UPLOAD: '📤',
	INBOX: '📥',
	CHART: '📊',
	BRAIN: '🧠',
	CHAT: '💬',
	MASK: '🎭',
	CELEBRATE: '🎉',
	ROCKET: '🚀'
}

export const MEDIA = {
	IMAGE: '🖼️',
	VIDEO: '🎬',
	MUSIC: '🎵',
	MIC: '🎤',
	DESIGN: '🎨',
	SCREEN: '🖥️',
	PHONE: '📱',
	SIGNAL: '📡',
	PACKAGE: '📦'
}

export const SOCIAL = {
	PEOPLE: '👥',
	PERSON: '👤',
	CROWN: '👑',
	SHIELD: '🛡️',
	BOT: '🤖',
	GLOBE: '🌐',
	WORLD: '🌍'
}

export const BRAND = {
	WOLF: '🐺',
	PAW: '🐾',
	LIGHTNING: '⚡',
	DECORATIVE_STAR: '✧'
}

// Flat export for cases where a single import is more convenient than
// picking a category -- same values, one object.
export const EMOJI = {
	...STATUS,
	...UI,
	...MEDIA,
	...SOCIAL,
	...BRAND
}

export default EMOJI