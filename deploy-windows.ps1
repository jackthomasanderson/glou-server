# Script de déploiement Glou Server pour Windows
# Usage:
#   Interactif: .\deploy-windows.ps1
#   Automatique: .\deploy-windows.ps1 -Mode prod -NonInteractive

param(
    [string]$Mode = "",
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "   Glou Server - Déploiement Windows" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Créer les dossiers nécessaires
Write-Host "[1/6] Création des dossiers..." -ForegroundColor Yellow
$folders = @("data", "backups", "assets")
foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        New-Item -ItemType Directory -Force -Path $folder | Out-Null
        Write-Host "  ✓ Dossier $folder créé" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Dossier $folder existe déjà" -ForegroundColor Green
    }
}
Write-Host ""

# Vérifier le fichier .env
Write-Host "[2/6] Vérification de la configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "  ⚠ Fichier .env non trouvé, copie depuis .env.example" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host ""
        if (-not $NonInteractive) {
            Write-Host "  IMPORTANT: Éditez le fichier .env avec vos valeurs !" -ForegroundColor Red
            Write-Host "  Notamment:" -ForegroundColor Yellow
            Write-Host "    - ENCRYPTION_PASSPHRASE (minimum 32 caractères)" -ForegroundColor Yellow
            Write-Host "    - ENCRYPTION_SALT" -ForegroundColor Yellow
            Write-Host "    - SESSION_SECRET" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  Voulez-vous éditer le fichier maintenant ? (O/N)" -ForegroundColor Cyan
            $response = Read-Host
            if ($response -eq "O" -or $response -eq "o") {
                notepad .env
            }
        } else {
            Write-Host "  (auto) Fichier .env créé à partir de .env.example" -ForegroundColor Green
        }
        Write-Host ""
    } else {
        Write-Host "  ✗ Fichier .env.example non trouvé !" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ✓ Fichier .env trouvé" -ForegroundColor Green
}
Write-Host ""

# Vérifier Docker
Write-Host "[3/6] Vérification de Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "  ✓ Docker installé : $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker n'est pas installé !" -ForegroundColor Red
    Write-Host ""
    Write-Host "Téléchargez et installez Docker Desktop depuis:" -ForegroundColor Yellow
    Write-Host "https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
Write-Host ""

# Vérifier Docker Compose
Write-Host "[4/6] Vérification de Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker compose version
    Write-Host "  ✓ Docker Compose installé : $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Docker Compose n'est pas disponible !" -ForegroundColor Red
    Write-Host "  Assurez-vous que Docker Desktop est à jour (v2+)" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Choix du mode de déploiement
Write-Host "[5/6] Choix du mode de déploiement" -ForegroundColor Yellow
$composeFile = "docker-compose.yml"
if ($Mode -eq "prod") {
    $composeFile = "docker-compose.prod.yml"
    Write-Host "  → Mode Production sélectionné (paramètre)" -ForegroundColor Green
} elseif ($Mode -eq "dev") {
    $composeFile = "docker-compose.yml"
    Write-Host "  → Mode Development sélectionné (paramètre)" -ForegroundColor Green
} else {
    if ($NonInteractive) {
        $composeFile = "docker-compose.prod.yml"
        Write-Host "  → Mode Production sélectionné (auto)" -ForegroundColor Green
    } else {
        Write-Host "  1) Production (docker-compose.prod.yml) - Image depuis GitHub" -ForegroundColor Cyan
        Write-Host "  2) Development (docker-compose.yml) - Build local" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Votre choix (1 ou 2) ?" -ForegroundColor Yellow
        $choice = Read-Host
        if ($choice -eq "1") {
            $composeFile = "docker-compose.prod.yml"
            Write-Host "  → Mode Production sélectionné" -ForegroundColor Green
        } elseif ($choice -eq "2") {
            $composeFile = "docker-compose.yml"
            Write-Host "  → Mode Development sélectionné" -ForegroundColor Green
        } else {
            Write-Host "  Choix invalide, utilisation de docker-compose.yml" -ForegroundColor Yellow
        }
    }
}
Write-Host ""

# Lancer Docker Compose
Write-Host "[6/6] Lancement de Glou Server..." -ForegroundColor Yellow
Write-Host "  → Commande: docker compose -f $composeFile up -d" -ForegroundColor Gray
Write-Host ""

try {
    docker compose -f $composeFile up -d
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "=====================================" -ForegroundColor Green
        Write-Host "   ✓ Glou Server démarré avec succès !" -ForegroundColor Green
        Write-Host "=====================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Interface web disponible sur:" -ForegroundColor Cyan
        Write-Host "  → http://localhost:8080" -ForegroundColor Green
        Write-Host ""
        Write-Host "Commandes utiles:" -ForegroundColor Yellow
        Write-Host "  • Voir les logs     : docker logs -f glou-server" -ForegroundColor Gray
        Write-Host "  • Arrêter le serveur: docker compose -f $composeFile down" -ForegroundColor Gray
        Write-Host "  • Redémarrer        : docker compose -f $composeFile restart" -ForegroundColor Gray
        Write-Host "  • Voir le statut    : docker ps" -ForegroundColor Gray
        Write-Host ""
        
        # Attendre que le serveur soit prêt
        Write-Host "Vérification de la disponibilité du serveur..." -ForegroundColor Yellow
        $maxAttempts = 30
        $attempt = 0
        $serverReady = $false
        
        while ($attempt -lt $maxAttempts -and -not $serverReady) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -Method Get -TimeoutSec 2 -UseBasicParsing 2>$null
                if ($response.StatusCode -eq 200) {
                    $serverReady = $true
                }
            } catch {
                Start-Sleep -Seconds 1
                $attempt++
            }
        }
        
        if ($serverReady) {
            Write-Host "  ✓ Serveur opérationnel et prêt !" -ForegroundColor Green
            Write-Host ""
            if (-not $NonInteractive) {
                Write-Host "  Ouvrir dans le navigateur ? (O/N)" -ForegroundColor Cyan
                $openBrowser = Read-Host
                if ($openBrowser -eq "O" -or $openBrowser -eq "o") {
                    Start-Process "http://localhost:8080"
                }
            }
        } else {
            Write-Host "  ⚠ Le serveur met du temps à démarrer..." -ForegroundColor Yellow
            Write-Host "  Vérifiez les logs avec: docker logs -f glou-server" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "  ✗ Erreur lors du démarrage !" -ForegroundColor Red
        Write-Host "  Vérifiez les logs avec: docker logs glou-server" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "  ✗ Erreur : $_" -ForegroundColor Red
    exit 1
}
