# Focus Hero v8.3 — one-click deploy
# Run from anywhere by double-clicking, or:  powershell -ExecutionPolicy Bypass -File .\__v8.3-deploy.ps1
# What it does:
#   1) Moves into the repo
#   2) Pulls latest origin/main (drops any stale CRLF/working-copy noise)
#   3) Applies the v8.3 patch (safe-area + accurate stopwatch + offline-first)
#   4) Commits and pushes to main -> GitHub Actions deploys via wrangler to Cloudflare Pages
#
# Safe to re-run: if the patch is already applied it will say so and skip.

$ErrorActionPreference = "Stop"

$repo  = "C:\Users\joe4k\Documents\Codex\2026-04-25\redeploy-v4-3-of-focus-hero\focus-hero-pwa"
$patch = Join-Path $repo "__v8.3-deploy.patch"

Set-Location $repo
Write-Host "[1/5] In repo: $repo" -ForegroundColor Cyan

Write-Host "[2/5] git fetch + reset --hard origin/main (clears any local noise) ..." -ForegroundColor Cyan
git fetch origin
git reset --hard origin/main

# If v8.3 already shipped, skip
$head = git log -1 --pretty=%s
if ($head -match "v8\.3") {
    Write-Host "HEAD is already v8.3 ($head). Nothing to do." -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $patch)) {
    Write-Host "ERROR: patch file not found at $patch" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] Applying patch $patch ..." -ForegroundColor Cyan
git apply --check $patch
git apply $patch

Write-Host "[4/5] Commit + push ..." -ForegroundColor Cyan
git add -A
git commit -m "v8.3: safe-area for bottom bars; accurate stopwatch; offline-first sync"
git push origin main

Write-Host "[5/5] Pushed. GitHub Actions will deploy via wrangler to Cloudflare Pages." -ForegroundColor Green
Write-Host "Watch: https://github.com/JoelMekonnenOfficial/focus-hero-pwa/actions" -ForegroundColor Green
Write-Host "After ~1-2 min, verify live with:" -ForegroundColor Green
Write-Host "  (Invoke-WebRequest https://focus.joelmekonnen.com/sw.js).Content | Select-String BUILD_ID" -ForegroundColor Green
