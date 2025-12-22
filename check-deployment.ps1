#!/usr/bin/env pwsh
# Script de vérification pré-déploiement
# Usage: .\check-deployment.ps1

$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Vérification Pré-Déploiement" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Fonction pour afficher les résultats
function Show-Result {
    param(
        [string]$Message,
        [bool]$Success
    )
    if ($Success) {
        Write-Host "  ✓ $Message" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $Message" -ForegroundColor Red
        $script:allGood = $false
    }
}

# 1. Vérifier Docker
Write-Host "[1/8] Vérification de Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>$null
    Show-Result "Docker installé : $dockerVersion" $true
} catch {
    Show-Result "Docker n'est pas installé" $false
}
Write-Host ""

# 2. Vérifier Docker Compose
Write-Host "[2/8] Vérification de Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker compose version 2>$null
    Show-Result "Docker Compose installé : $composeVersion" $true
} catch {
    Show-Result "Docker Compose n'est pas installé" $false
}
Write-Host ""

# 3. Vérifier les fichiers de configuration
Write-Host "[3/8] Vérification des fichiers de configuration..." -ForegroundColor Yellow
$requiredFiles = @(
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.prod.yml",
    ".env.example",
    ".dockerignore"
)
foreach ($file in $requiredFiles) {
    $exists = Test-Path $file
    Show-Result "$file présent" $exists
}
Write-Host ""

# 4. Vérifier le fichier .env
Write-Host "[4/8] Vérification du fichier .env..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Show-Result "Fichier .env existe" $true
    
    # Vérifier les variables critiques
    $envContent = Get-Content ".env" -Raw
    $criticalVars = @(
        "ENCRYPTION_PASSPHRASE",
        "ENCRYPTION_SALT",
        "SESSION_SECRET"
    )
    
    foreach ($var in $criticalVars) {
        if ($envContent -match "$var=.+") {
            $value = ($envContent | Select-String "$var=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
            if ($value -and $value.Length -ge 32 -and $value -notmatch "(change|example|default|todo)") {
                Show-Result "$var configured ($($value.Length) chars)" $true
            } else {
                Show-Result "$var must be changed (minimum 32 chars)" $false
            }
        } else {
            Show-Result "$var missing in .env" $false
        }
    }
} else {
    Show-Result "Fichier .env n'existe pas (copiez .env.example)" $false
}
Write-Host ""

# 5. Vérifier les dossiers
Write-Host "[5/8] Vérification des dossiers..." -ForegroundColor Yellow
$requiredDirs = @("data", "backups", "assets")
foreach ($dir in $requiredDirs) {
    $exists = Test-Path $dir
    if ($exists) {
        Show-Result "Dossier $dir existe" $true
    } else {
        Write-Host "  ⚠ Dossier $dir sera créé automatiquement" -ForegroundColor Yellow
    }
}
Write-Host ""

# 6. Vérifier le port 8080
Write-Host "[6/8] Vérification du port 8080..." -ForegroundColor Yellow
try {
    $portInUse = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue 2>$null
    if ($portInUse) {
        Show-Result "Port 8080 est libre" $false
        Write-Host "    → Un service utilise déjà le port 8080" -ForegroundColor Yellow
    } else {
        Show-Result "Port 8080 est libre" $true
    }
} catch {
    Show-Host "  ⚠ Impossible de vérifier le port (Windows uniquement)" -ForegroundColor Yellow
}
Write-Host ""

# 7. Vérifier la configuration réseau Docker
Write-Host "[7/8] Vérification du réseau Docker..." -ForegroundColor Yellow
try {
    $networks = docker network ls 2>$null
    if ($networks) {
        Show-Result "Docker réseau accessible" $true
    } else {
        Show-Result "Docker réseau non accessible" $false
    }
} catch {
    Show-Result "Impossible de vérifier le réseau Docker" $false
}
Write-Host ""

# 8. Vérifier l'image Docker (si elle existe)
Write-Host "[8/8] Verification de l'image Docker..." -ForegroundColor Yellow
try {
    $localImage = docker images -q glou-server:alpha 2>$null
    if ($localImage) {
        Show-Result "Image locale glou-server:alpha trouvée" $true
    } else {
        Write-Host "  ℹ Image Docker sera téléchargée/buildée au démarrage" -ForegroundColor Cyan
    }
} catch {
    Write-Host "  ℹ Image Docker sera téléchargée/buildée au démarrage" -ForegroundColor Cyan
}
Write-Host ""

# Résumé final
Write-Host "=========================================" -ForegroundColor Cyan
if ($allGood) {
    Write-Host "   ✓ Tout est prêt pour le déploiement !" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Prochaines étapes:" -ForegroundColor Yellow
    Write-Host "  1. Lancez le déploiement:" -ForegroundColor White
    Write-Host "     .\deploy-windows.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Ou manuellement:" -ForegroundColor White
    Write-Host "     docker compose -f docker-compose.prod.yml up -d" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "   ⚠ Des problèmes ont été détectés" -ForegroundColor Yellow
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Actions recommandées:" -ForegroundColor Yellow
    Write-Host "  1. Installez Docker Desktop si nécessaire" -ForegroundColor White
    Write-Host "  2. Copiez .env.example vers .env" -ForegroundColor White
    Write-Host "  3. Éditez .env avec vos valeurs" -ForegroundColor White
    Write-Host "  4. Relancez ce script pour vérifier" -ForegroundColor White
    Write-Host ""
}

Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  • Guide rapide    : QUICKSTART.md" -ForegroundColor Gray
Write-Host "  • Guide complet   : DEPLOY.md" -ForegroundColor Gray
Write-Host "  • Guide Docker    : DOCKER.md" -ForegroundColor Gray
Write-Host ""
