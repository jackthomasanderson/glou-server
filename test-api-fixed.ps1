# Script de test des endpoints API Glou Server
# Usage: .\test-api.ps1

$baseUrl = "http://localhost:8080"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  GLOU SERVER - API TESTS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "[1/6] Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -ErrorAction Stop
    if ($health.StatusCode -eq 200) {
        Write-Host "  ? Health OK: $($health.Content)" -ForegroundColor Green
    }
} catch {
    Write-Host "  ? Health FAILED: $_" -ForegroundColor Red
}

# Test 2: Setup Status
Write-Host "`n[2/6] Setup Status..." -ForegroundColor Yellow
try {
    $setup = Invoke-WebRequest -Uri "$baseUrl/api/setup/check" -UseBasicParsing -ErrorAction Stop
    $setupData = $setup.Content | ConvertFrom-Json
    Write-Host "  ? Setup Status:" -ForegroundColor Green
    Write-Host "    - Has Admin: $($setupData.has_admin)" -ForegroundColor White
    Write-Host "    - Needs Setup: $($setupData.needs_setup)" -ForegroundColor White
    Write-Host "    - Setup Complete: $($setupData.setup_complete)" -ForegroundColor White
} catch {
    Write-Host "  ? Setup Check FAILED: $_" -ForegroundColor Red
}

# Test 3: SMTP Config
Write-Host "`n[3/6] SMTP Configuration..." -ForegroundColor Yellow
try {
    $smtp = Invoke-WebRequest -Uri "$baseUrl/api/setup/smtp-config" -UseBasicParsing -ErrorAction Stop
    $smtpData = $smtp.Content | ConvertFrom-Json
    Write-Host "  ? SMTP Configured: $($smtpData.smtp_configured)" -ForegroundColor Green
} catch {
    Write-Host "  ? SMTP Check FAILED: $_" -ForegroundColor Red
}

# Test 4: Docker Container Status
Write-Host "`n[4/6] Docker Container Status..." -ForegroundColor Yellow
$container = docker ps --filter "name=glou-server-dev" --format "{{.Status}}"
if ($container) {
    Write-Host "  Container Status: $container" -ForegroundColor Green
} else {
    Write-Host "  Container not running" -ForegroundColor Red
}

# Test 5: Database File
Write-Host "`n[5/6] Database File..." -ForegroundColor Yellow
if (Test-Path "./data/glou.db") {
    $dbSize = (Get-Item "./data/glou.db").Length
    Write-Host "  ? Database exists: $([math]::Round($dbSize/1KB, 2)) KB" -ForegroundColor Green
} else {
    Write-Host "  ? Database not found" -ForegroundColor Red
}

# Test 6: Static Assets
Write-Host "`n[6/6] Static Assets..." -ForegroundColor Yellow
$requiredAssets = @("login.html", "setup.html", "admin.html", "style.css")
$missingAssets = @()
foreach ($asset in $requiredAssets) {
    if (-not (Test-Path "./assets/$asset")) {
        $missingAssets += $asset
    }
}
if ($missingAssets.Count -eq 0) {
    Write-Host "  ? All static assets present" -ForegroundColor Green
} else {
    Write-Host "  ? Missing assets: $($missingAssets -join ', ')" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n? Server is running on $baseUrl" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Open http://localhost:8080/setup in browser" -ForegroundColor White
Write-Host "  2. Create admin account" -ForegroundColor White
Write-Host "  3. Start adding wines, caves, and tobacco products!" -ForegroundColor White
Write-Host "`nUseful commands:" -ForegroundColor Yellow
Write-Host "  - View logs:    .\docker-dev.ps1 logs" -ForegroundColor White
Write-Host "  - Stop server:  .\docker-dev.ps1 down" -ForegroundColor White
Write-Host "  - Restart:      .\docker-dev.ps1 restart" -ForegroundColor White
Write-Host ""
