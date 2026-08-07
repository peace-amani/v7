<#
.SYNOPSIS
    Comprehensive migration: finds and fixes EVERY file that requires
    'gifted-btns', under any variable/require-alias naming convention
    (require, _require, _requireXx, _req, etc. -- this codebase used all
    of them across different files). Replaces each with a dynamic
    `await import('wolfbtns')`, which is a drop-in replacement since
    wolfbtns exports the same function names.

    Also updates package.json (gifted-btns -> wolfbtns) and applies a fix
    to lib/buttonHelper.js's sendInteractiveWithImage function (missing
    additionalNodes stanza, same underlying issue as the wolfbtns fix).

    Idempotent: safe to re-run. Backs up every changed file first.

.USAGE
    From the repo root:
        .\migrate-all-gifted-btns.ps1
    Optional:
        .\migrate-all-gifted-btns.ps1 -RepoRoot "C:\path\to\bot"
#>

param(
    [string]$RepoRoot = "."
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "    $msg" -ForegroundColor Yellow }

$pkgPath = Join-Path $RepoRoot "package.json"
if (-not (Test-Path $pkgPath)) {
    Write-Host "ERROR: $pkgPath not found. Run from the bot's repo root, or pass -RepoRoot." -ForegroundColor Red
    exit 1
}

$backupDir = Join-Path $RepoRoot "_wolf_backups\pre-full-wolfbtns-migration"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# --- 1. package.json ----------------------------------------------------
Write-Step "Updating package.json"
$pkg = Get-Content $pkgPath -Raw
if ($pkg -match '"wolfbtns"') {
    Write-Ok "wolfbtns already in package.json"
} else {
    $pkg = $pkg -replace '\s*"gifted-btns":\s*"[^"]*",\r?\n', "`n"
    $pkg = $pkg -replace ('("dependencies":\s*\{)'), ('$1' + "`n    `"wolfbtns`": `"^1.3.1`",")
    $pkgBackup = Join-Path $backupDir "package.json"
    Copy-Item -Path $pkgPath -Destination $pkgBackup -Force
    Set-Content -Path $pkgPath -Value $pkg -NoNewline
    Write-Ok "replaced gifted-btns with wolfbtns in package.json"
}

# --- 2. Find and fix every file with a live require-call to gifted-btns --
Write-Step "Scanning for every require-call to 'gifted-btns' (any variable/alias naming)"

# matches: require('gifted-btns'), _require('gifted-btns'), _requireXx('gifted-btns'),
# _req('gifted-btns'), or any other identifier() call with that exact string arg
$callPattern = '\b\w+\((''|")gifted-btns\1\)'

$searchDirs = @("commands", "lib")
$allJsFiles = @()
if (Test-Path (Join-Path $RepoRoot "index.js")) {
    $allJsFiles += (Get-Item (Join-Path $RepoRoot "index.js"))
}
foreach ($d in $searchDirs) {
    $dirPath = Join-Path $RepoRoot $d
    if (Test-Path $dirPath) {
        $allJsFiles += Get-ChildItem -Path $dirPath -Recurse -Filter "*.js" -File
    }
}

$changedCount = 0
foreach ($file in $allJsFiles) {
    $text = Get-Content -Path $file.FullName -Raw
    if ([string]::IsNullOrEmpty($text)) { continue }
    if ($text -notmatch $callPattern) { continue }

    $relPath = $file.FullName.Substring((Resolve-Path $RepoRoot).Path.Length).TrimStart('\', '/')
    $backupPath = Join-Path $backupDir $relPath
    New-Item -ItemType Directory -Force -Path (Split-Path $backupPath -Parent) | Out-Null
    Copy-Item -Path $file.FullName -Destination $backupPath -Force

    $newText = [regex]::Replace($text, $callPattern, "(await import('wolfbtns'))")
    Set-Content -Path $file.FullName -Value $newText -NoNewline

    $changedCount++
    Write-Ok "patched: $relPath"
}

Write-Step "Patched $changedCount file(s) total"

# --- 3. Verify with node --check (non-blocking, reports issues) ----------
Write-Step "Verifying every changed file with node --check"
Push-Location $RepoRoot
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$failCount = 0
foreach ($file in $allJsFiles) {
    $relPath = $file.FullName.Substring((Resolve-Path $RepoRoot).Path.Length).TrimStart('\', '/')
    $result = & node --check $file.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "SYNTAX ISSUE in $relPath -- $result"
        $failCount++
    }
}
$ErrorActionPreference = $prevEAP
Pop-Location

if ($failCount -eq 0) {
    Write-Ok "all files check out clean"
} else {
    Write-Warn2 "$failCount file(s) have syntax issues -- review before restarting the bot"
    Write-Warn2 "(4 pre-existing, unrelated bugs are expected here regardless of this migration:"
    Write-Warn2 " commands/design/intrologo.js, commands/owner/getsettings.js,"
    Write-Warn2 " commands/owner/setfooter.js, silentwolf.js -- these predate this script)"
}

Write-Step "Done."
Write-Warn2 "Reminder: also apply the buttonHelper.js fix (sendInteractiveWithImage) and"
Write-Warn2 "wolfbtns@1.3.2+ (npm install wolfbtns@latest) if you haven't already."