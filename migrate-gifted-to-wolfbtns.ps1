<#
.SYNOPSIS
    Adds a real "Open GitHub" interactive button to the connection-success
    message (currently hardcoded to plain text, and was never wired to
    attempt buttons at all). Falls back to plain text automatically if the
    button send fails for any reason.
    Idempotent: safe to re-run.

.USAGE
    From the repo root:
        .\add-connection-button.ps1
#>

param(
    [string]$RepoRoot = "."
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "    $msg" -ForegroundColor Yellow }

$targetFile = Join-Path $RepoRoot "index.js"
if (-not (Test-Path $targetFile)) {
    Write-Host "ERROR: $targetFile not found. Run from the bot's repo root." -ForegroundColor Red
    exit 1
}

$marker = "sendInteractiveMessage(sock, targetJid, {"

$text = Get-Content -Path $targetFile -Raw
if ($text -match [regex]::Escape($marker)) {
    Write-Ok "index.js already patched -- connection message button already added"
    exit 0
}

$old = @"
                        const targetJid = (ownerInfo && ownerInfo.ownerJid) ? ownerInfo.ownerJid : sock.user.id;
                        // Always use plain text for the connection message — it goes to the owner's DM,
                        // and wolfbtns interactive messages fail silently in DMs on modern WhatsApp.
                        let sendPromise;
                        sendPromise = originalSendMessage(targetJid, { text: successMessage });
"@

$new = @"
                        const targetJid = (ownerInfo && ownerInfo.ownerJid) ? ownerInfo.ownerJid : sock.user.id;
                        let sendPromise;
                        if (_wolfBtns?.sendInteractiveMessage) {
                            sendPromise = _wolfBtns.sendInteractiveMessage(sock, targetJid, {
                                text: successMessage,
                                interactiveButtons: [
                                    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🔗 Open GitHub', url: PROFILE_URL, merchant_url: PROFILE_URL }) }
                                ]
                            }).catch(() => originalSendMessage(targetJid, { text: successMessage }));
                        } else {
                            sendPromise = originalSendMessage(targetJid, { text: successMessage });
                        }
"@

if ($text -notmatch [regex]::Escape($old)) {
    Write-Host "ERROR: expected block not found -- file may have drifted from what this script expects." -ForegroundColor Red
    Write-Host "Patch manually: find the connection-success-message block (search for 'THE ONLY SUCCESS MESSAGE')" -ForegroundColor Red
    Write-Host "and wrap the originalSendMessage(targetJid, { text: successMessage }) call with a" -ForegroundColor Red
    Write-Host "_wolfBtns.sendInteractiveMessage attempt first, falling back to the plain text send." -ForegroundColor Red
    exit 1
}

$backupDir = Join-Path $RepoRoot "_wolf_backups\pre-connection-button"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item -Path $targetFile -Destination (Join-Path $backupDir "index.js") -Force

$newText = $text -replace ([regex]::Escape($old)), $new
Set-Content -Path $targetFile -Value $newText -NoNewline

Write-Ok "index.js patched -- connection message now sends a real 'Open GitHub' button"

Write-Step "Verifying"
& node --check $targetFile
if ($LASTEXITCODE -eq 0) {
    Write-Ok "syntax OK"
} else {
    Write-Warn2 "syntax check failed -- review the change, backup is at $backupDir\index.js"
}
