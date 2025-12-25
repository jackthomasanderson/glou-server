# Script pour démarrer le système complet (Backend + Frontend)
# Usage: .\start-dev.ps1

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  GLOU - DEMARRAGE COMPLET" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Etape 1: Verifier que Docker est accessible..." -ForegroundColor Cyan
try {
    docker ps > $null
    Write-Host "  OK - Docker accessible`n" -ForegroundColor Green
} catch {
    Write-Host "  ERREUR - Docker Desktop n'est pas lance!" -ForegroundColor Red
    Write-Host "  Ouvrez Docker Desktop et relancez ce script.`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "Etape 2: Demarrer le backend API..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
docker-compose -f docker-compose.dev.yml up -d
Start-Sleep -Seconds 2

# Verifier que le backend est up
$health = try {
    Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -ErrorAction Stop
    "healthy"
} catch {
    "down"
}

if ($health -eq "healthy") {
    Write-Host "  OK - Backend accessible sur http://localhost:8080`n" -ForegroundColor Green
} else {
    Write-Host "  ERREUR - Backend non repondant!" -ForegroundColor Red
    Write-Host "  Verifiez les logs: docker logs -f glou-server-dev`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "Etape 3: Compiler et lancer le frontend React..." -ForegroundColor Cyan
Write-Host "  (Une nouvelle fenetre PowerShell va s'ouvrir)`n" -ForegroundColor Yellow

Push-Location .\web

# Verifier que node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installation des dependances npm..." -ForegroundColor Yellow
    npm install
    Write-Host "  OK - Dependances installes`n" -ForegroundColor Green
}

# Ouvrir une nouvelle fenetre pour npm run dev
$npmCommand = "npm run dev"
Start-Process PowerShell -ArgumentList "-NoExit", "-Command", "cd '$($PWD.Path)'; $npmCommand"

Pop-Location
Pop-Location

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  DEMARRAGE COMPLETE !" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Acces:" -ForegroundColor Yellow
Write-Host "  Frontend (React):  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend (API):     http://localhost:8080" -ForegroundColor Cyan
Write-Host "  Health Check:      http://localhost:8080/health" -ForegroundColor Cyan
Write-Host "`nNotes:" -ForegroundColor Yellow
Write-Host "  - Le frontend s'ouvre dans une nouvelle fenetre" -ForegroundColor White
Write-Host "  - Premiers lancement peut prendre 30-60s" -ForegroundColor White
Write-Host "  - Les modifications au code React se rechargent automatiquement" -ForegroundColor White
Write-Host "  - Pour arreter: Ctrl+C dans les deux fenetres`n" -ForegroundColor White
