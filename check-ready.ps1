#!/usr/bin/env pwsh
# Pre-deployment check script
# Usage: .\check-ready.ps1

$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Pre-Deployment Check" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

function Test-Item {
    param(
        [string]$Message,
        [bool]$Success
    )
    if ($Success) {
        Write-Host "  [OK] $Message" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $Message" -ForegroundColor Red
        $script:allGood = $false
    }
}

# 1. Check Docker
Write-Host "[1/6] Docker..." -ForegroundColor Yellow
try {
    $dockerVer = docker --version 2>$null
    Test-Item "Docker installed: $dockerVer" $true
} catch {
    Test-Item "Docker is not installed" $false
}
Write-Host ""

# 2. Check Docker Compose
Write-Host "[2/6] Docker Compose..." -ForegroundColor Yellow
try {
    $composeVer = docker compose version 2>$null
    Test-Item "Docker Compose installed: $composeVer" $true
} catch {
    Test-Item "Docker Compose is not installed" $false
}
Write-Host ""

# 3. Check files
Write-Host "[3/6] Configuration files..." -ForegroundColor Yellow
$files = @("Dockerfile", "docker-compose.prod.yml", ".env.example")
foreach ($file in $files) {
    Test-Item "$file present" (Test-Path $file)
}
Write-Host ""

# 4. Check .env
Write-Host "[4/6] Environment file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Test-Item ".env file exists" $true
    
    $content = Get-Content ".env" -Raw
    $vars = @("ENCRYPTION_PASSPHRASE", "ENCRYPTION_SALT", "SESSION_SECRET")
    
    foreach ($var in $vars) {
        if ($content -match "$var=.+") {
            $val = ($content | Select-String "$var=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
            if ($val -and $val.Length -ge 32 -and $val -notmatch "change|example|default") {
                Test-Item "$var is configured" $true
            } else {
                Test-Item "$var needs to be changed (32+ chars)" $false
            }
        } else {
            Test-Item "$var is missing" $false
        }
    }
} else {
    Test-Item ".env file exists (copy .env.example)" $false
}
Write-Host ""

# 5. Check folders
Write-Host "[5/6] Data folders..." -ForegroundColor Yellow
$dirs = @("data", "backups", "assets")
foreach ($dir in $dirs) {
    if (Test-Path $dir) {
        Test-Item "$dir folder exists" $true
    } else {
        Write-Host "  [INFO] $dir will be created automatically" -ForegroundColor Cyan
    }
}
Write-Host ""

# 6. Check port
Write-Host "[6/6] Port 8080..." -ForegroundColor Yellow
try {
    $port = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue 2>$null
    if ($port) {
        Test-Item "Port 8080 is available" $false
        Write-Host "    Something is using port 8080" -ForegroundColor Yellow
    } else {
        Test-Item "Port 8080 is available" $true
    }
} catch {
    Write-Host "  [INFO] Cannot check port (Windows only)" -ForegroundColor Cyan
}
Write-Host ""

# Summary
Write-Host "=========================================" -ForegroundColor Cyan
if ($allGood) {
    Write-Host "   Ready for deployment!" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Run deployment script:" -ForegroundColor White
    Write-Host "     .\deploy-windows.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Or manually:" -ForegroundColor White
    Write-Host "     docker compose -f docker-compose.prod.yml up -d" -ForegroundColor Cyan
} else {
    Write-Host "   Issues detected" -ForegroundColor Yellow
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Recommended actions:" -ForegroundColor Yellow
    Write-Host "  1. Install Docker Desktop if needed" -ForegroundColor White
    Write-Host "  2. Copy .env.example to .env" -ForegroundColor White
    Write-Host "  3. Edit .env with your values" -ForegroundColor White
    Write-Host "  4. Run this script again" -ForegroundColor White
}
Write-Host ""

Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  Quick Start : QUICKSTART.md" -ForegroundColor Gray
Write-Host "  Full Guide  : DEPLOY.md" -ForegroundColor Gray
Write-Host "  Docker Guide: DOCKER.md" -ForegroundColor Gray
Write-Host ""
