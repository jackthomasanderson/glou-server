param([string]$Branch = "main")

$run = gh run list --branch $Branch --limit 1 --json conclusion,status,url | ConvertFrom-Json

if ($run[0].conclusion -eq "success") {
    Write-Host "[OK] GitHub build: $($run[0].status)/$($run[0].conclusion)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] GitHub build: $($run[0].status)/$($run[0].conclusion)" -ForegroundColor Red
    Write-Host "See: $($run[0].url)" -ForegroundColor Yellow
    exit 1
}
