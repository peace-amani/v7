// One-off diagnostic: imports each button-related command file directly and
// prints the REAL error if any of them fail to load, since your bot's own
// loader (index.js -> loadCommandsFromFolder) silently swallows these.
//
// Run from your repo root:
//   node diagnose-commands.mjs

const files = [
	'./lib/buttonHelper.js',
	'./commands/owner/mode.js',
	'./commands/owner/deploy.js',
	'./commands/owner/getapi.js',
	'./commands/owner/replaceapi.js',
	'./commands/github/gitrepos.js',
	'./commands/owner/antiedit.js',
	'./commands/utility/genlyrics.js',
	'./commands/utility/musicprompt.js',
	'./commands/cpanel/createuser.js'
]

let anyFailed = false

for (const f of files) {
	try {
		await import(f)
		console.log(`OK   ${f}`)
	} catch (e) {
		anyFailed = true
		console.log(`FAIL ${f}`)
		console.log(`     ${e.message}`)
		if (e.stack) {
			console.log(e.stack.split('\n').slice(0, 3).map(l => '     ' + l).join('\n'))
		}
	}
}

console.log('')
if (anyFailed) {
	console.log('At least one file failed to import -- that failure is why the')
	console.log('command(s) using it silently vanished from your bot.')
} else {
	console.log('All files imported successfully in isolation.')
	console.log('If buttons still silently do nothing when run from inside the bot,')
	console.log('the issue is likely at the call site itself (e.g. wolfbtns is loading')
	console.log('fine but sendInteractiveMessage is throwing) rather than at import time.')
	console.log('Next step: add a temporary console.error in the catch blocks around')
	console.log('_wolfBtns.sendInteractiveMessage(...) calls (they currently swallow')
	console.log('silently in mode.js -- "// Button send failed -- fall through").')
}
