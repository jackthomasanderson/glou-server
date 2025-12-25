# Script pour démarrer/arrêter Docker facilement
# Usage: .\docker-dev.ps1 [up|down|logs|restart|rebuild]

param(
    [Parameter(Position=0)]
    [ValidateSet('up','down','logs','restart','rebuild','status')]
    [string]$Command = 'up'
)

$ComposeFile = "docker-compose.dev.yml"

switch ($Command) {
    'up' {
        Write-Host "Demarrage du serveur Glou..." -ForegroundColor Green
        docker-compose -f $ComposeFile up -d
        Start-Sleep -Seconds 2
        Write-Host "`nServeur demarre!" -ForegroundColor Green
        Write-Host "Interface: http://localhost:8080" -ForegroundColor Cyan
        Write-Host "Health: http://localhost:8080/health" -ForegroundColor Cyan
        Write-Host "`nVoir les logs: .\docker-dev.ps1 logs" -ForegroundColor Yellow
    }
    'down' {
        Write-Host "Arret du serveur Glou..." -ForegroundColor Red
        docker-compose -f $ComposeFile down
        Write-Host "Serveur arrete" -ForegroundColor Green
    }
    'logs' {
        Write-Host "Logs du serveur (Ctrl+C pour quitter)..." -ForegroundColor Cyan
        docker logs -f glou-server-dev
    }
    'restart' {
        Write-Host "Redemarrage du serveur..." -ForegroundColor Yellow
        docker-compose -f $ComposeFile restart
        Write-Host "Serveur redemarre" -ForegroundColor Green
    }
    'rebuild' {
        Write-Host "Reconstruction de l'image..." -ForegroundColor Yellow
        docker-compose -f $ComposeFile down
        docker-compose -f $ComposeFile build
        docker-compose -f $ComposeFile up -d
        Start-Sleep -Seconds 2
        Write-Host "Serveur reconstruit et demarre" -ForegroundColor Green
    }
    'status' {
        Write-Host "Statut du conteneur:" -ForegroundColor Cyan
        docker ps --filter "name=glou-server-dev" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        Write-Host "`nHealth check:" -ForegroundColor Cyan
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -ErrorAction Stop
            Write-Host "Serveur accessible: $($response.Content)" -ForegroundColor Green
        } catch {
            Write-Host "Serveur non accessible" -ForegroundColor Red
        }
    }
}
