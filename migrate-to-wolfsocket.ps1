<#
.SYNOPSIS
    Migrates the silentwolf bot from @whiskeysockets/baileys (+ the redundant
    unscoped "baileys" dep) to wolfsocket. Rewrites every import across
    index.js, lib/, and commands/ (recursively, including folder names with
    spaces). Explicitly skips kip.js and wolf.js -- neither is wired into
    any deploy entrypoint, so they're left untouched.
    Idempotent: safe to re-run.

.USAGE
    From the repo root (where package.json lives):
        .\migrate-to-wolfsocket.ps1
    Optional:
        .\migrate-to-wolfsocket.ps1 -RepoRoot "C:\path\to\bot"
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

# --- 1. package.json: swap dependencies -------------------------------------
Write-Step "Updating package.json dependencies"
$pkg = Get-Content $pkgPath -Raw

if ($pkg -match '"wolfsocket"') {
    Write-Ok "wolfsocket already in package.json"
} else {
    $pkg = $pkg -replace '\s*"@whiskeysockets/baileys":\s*"[^"]*",\n', "`n"
    $pkg = $pkg -replace '\s*"baileys":\s*"[^"]*",\n', "`n"
    $pkg = $pkg -replace ('("dependencies":\s*\{)'), ('$1' + "`n    `"wolfsocket`": `"^1.0.0`",")
    Set-Content -Path $pkgPath -Value $pkg -NoNewline
    Write-Ok "replaced @whiskeysockets/baileys + baileys with wolfsocket in package.json"
}

# --- 2. Rewrite imports across the active codebase ---------------------------
Write-Step "Rewriting imports across index.js, lib/, and commands/"

$skipFiles = @(
    (Resolve-Path (Join-Path $RepoRoot "kip.js") -ErrorAction SilentlyContinue),
    (Resolve-Path (Join-Path $RepoRoot "wolf.js") -ErrorAction SilentlyContinue)
) | Where-Object { $_ } | ForEach-Object { $_.Path }

$targets = @()
$indexFile = Join-Path $RepoRoot "index.js"
if (Test-Path $indexFile) { $targets += (Resolve-Path $indexFile).Path }

foreach ($dir in @("lib", "commands")) {
    $dirPath = Join-Path $RepoRoot $dir
    if (Test-Path $dirPath) {
        $targets += Get-ChildItem -Path $dirPath -Recurse -Filter "*.js" -File |
            ForEach-Object { $_.FullName }
    }
}

$changedCount = 0
$backupDir = Join-Path $RepoRoot "_wolf_backups\pre-wolfsocket-migration"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

foreach ($file in $targets) {
    if ($skipFiles -contains $file) {
        continue
    }

    $text = Get-Content -Path $file -Raw
    if ($text -notmatch "@whiskeysockets/baileys") {
        continue
    }

    # backup before touching, preserving relative path structure
    $relPath = $file.Substring((Resolve-Path $RepoRoot).Path.Length).TrimStart('\', '/')
    $backupPath = Join-Path $backupDir $relPath
    New-Item -ItemType Directory -Force -Path (Split-Path $backupPath -Parent) | Out-Null
    Copy-Item -Path $file -Destination $backupPath -Force

    $newText = $text -replace "@whiskeysockets/baileys", "wolfsocket"
    Set-Content -Path $file -Value $newText -NoNewline

    $changedCount++
    Write-Ok "updated: $relPath"
}

Write-Step "Done. $changedCount file(s) updated, backups saved under _wolf_backups\pre-wolfsocket-migration\"
Write-Warn2 "kip.js and wolf.js were left untouched (not part of any deploy entrypoint)."
Write-Step "Next: npm install, then npm run dev (or your usual start command) to verify."