<#
PowerShell helper to kill dev ports and launch API + Web dev servers in new PowerShell windows.
Usage (run from repository root):
  .\scripts\dev-restart.ps1 [-CleanNext]

Options:
  -CleanNext : remove the `web/.next` folder before starting (force full rebuild).
#>

param(
    [switch]$CleanNext
)

Write-Host "== Dev restart helper =="

# Resolve repository root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Push-Location $scriptDir\.. | Out-Null
$repoRoot = Get-Location
Write-Host "Repo root: $repoRoot"

# Kill common dev ports
Write-Host "Killing ports 3000,3001,3002 (if in use)..."
try {
    npx kill-port 3000 3001 3002
} catch {
    Write-Warning "kill-port failed or not installed. You can run 'npx kill-port 3000 3001 3002' manually."
}

if ($CleanNext) {
    $nextDir = Join-Path $repoRoot "web" ".next"
    if (Test-Path $nextDir) {
        Write-Host "Removing $nextDir ..."
        Remove-Item -Recurse -Force $nextDir
    }
}

# Helper to start a new PowerShell window and run a command there
function Start-DevWindow($name, $workingDir, $command) {
    $pwArgs = "-NoExit", "-Command", "Set-Location -Path '$workingDir'; $command"
    Write-Host "Starting $name in new PowerShell window (cwd=$workingDir)..."
    Start-Process -FilePath "powershell" -ArgumentList $pwArgs
}

# Start API
$apiDir = Join-Path $repoRoot "api"
Start-DevWindow "API" $apiDir "npm run dev"

# Start Web (force PORT=3000)
$webDir = Join-Path $repoRoot "web"
# Use PowerShell syntax to set env var for child process
$webCmd = "`$env:PORT=3000; npm run dev"
Start-DevWindow "Web" $webDir $webCmd

Write-Host "Launched API and Web dev servers in new windows.\nOpen http://localhost:3000 and check http://127.0.0.1:3001/health"

Pop-Location | Out-Null
