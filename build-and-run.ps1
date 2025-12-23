# Script de build et démarrage de Glou
# Usage: .\build-and-run.ps1

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "   Glou - Build & Run Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier Node.js
Write-Host "[1/5] Vérification de Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "  ✓ Node.js $nodeVersion installé" -ForegroundColor Green
    Write-Host "  ✓ npm $npmVersion installé" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js n'est pas installé!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Téléchargez et installez Node.js depuis:" -ForegroundColor Yellow
    Write-Host "https://nodejs.org/" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host ""

# Installer les dépendances npm si nécessaire
Write-Host "[2/5] Vérification des dépendances npm..." -ForegroundColor Yellow
$nodeModulesPath = "web\node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Write-Host "  → Installation des dépendances (première fois)..." -ForegroundColor Yellow
    Push-Location web
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Erreur lors de l'installation des dépendances" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "  ✓ Dépendances installées" -ForegroundColor Green
} else {
    Write-Host "  ✓ Dépendances déjà installées" -ForegroundColor Green
}

Write-Host ""

# Build de l'application React
Write-Host "[3/5] Build de l'application React..." -ForegroundColor Yellow
Push-Location web
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Erreur lors du build React" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  ✓ Application React buildée dans web/dist/" -ForegroundColor Green

Write-Host ""

# Build du serveur Go
Write-Host "[4/5] Compilation du serveur Go..." -ForegroundColor Yellow
go build ./cmd/api
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Erreur lors de la compilation Go" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Serveur Go compilé (api.exe)" -ForegroundColor Green

Write-Host ""

# Arrêter l'ancien processus si existant
Write-Host "[5/5] Préparation du démarrage..." -ForegroundColor Yellow
Stop-Process -Name api -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "  ✓ Ancien processus arrêté" -ForegroundColor Green

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "   Build terminé avec succès!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pour démarrer le serveur:" -ForegroundColor Yellow
Write-Host "  .\api.exe" -ForegroundColor Cyan
Write-Host ""
Write-Host "Puis ouvrez:" -ForegroundColor Yellow
Write-Host "  http://localhost:8080" -ForegroundColor Cyan
Write-Host ""

# Demander si on démarre maintenant
$response = Read-Host "Demarrer le serveur maintenant? (O/n)"
if ($response -eq "" -or $response -eq "O" -or $response -eq "o") {
    Write-Host ""
    Write-Host "Demarrage du serveur..." -ForegroundColor Yellow
    Write-Host "Appuyez sur Ctrl+C pour arreter" -ForegroundColor Gray
    Write-Host ""
    .\api.exe
}
