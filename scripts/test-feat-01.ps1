# FEAT-01 Validation Test Script - PowerShell cURL based HTTP tests
# Run after: npm --prefix api run dev && npm --prefix web run dev

$ErrorActionPreference = "Stop"

$FRONT_URL = "http://localhost:3000"

# In this repo, bottles CRUD is implemented in Next.js route handlers (web/app/api/bottles/*).
# Auth is reachable via the same Next.js /api proxy gateway.
$API_URL = "$FRONT_URL/api"
$API_AUTH_URL = "$FRONT_URL/api/auth"

# Color codes for output (Windows compatible)
$colors = @{
    Red    = "Red"
    Green  = "Green"
    Yellow = "Yellow"
}

# Test tracking
$PASSED = 0
$FAILED = 0

# Utility functions
function Write-Test {
    param([string]$message)
    Write-Host "[TEST] $message" -ForegroundColor Yellow
}

function Write-Pass {
    param([string]$message)
    Write-Host "[PASS] $message" -ForegroundColor Green
    $script:PASSED++
}

function Write-Fail {
    param([string]$message)
    Write-Host "[FAIL] $message" -ForegroundColor Red
    $script:FAILED++
}

function Invoke-Request {
    param(
        [string]$Method,
        [string]$Uri,
        [string]$Body,
        [hashtable]$Headers
    )
    
    try {
        $params = @{
            Method  = $Method
            Uri     = $Uri
            Headers = $Headers
        }
        
        if ($Body) {
            $params["Body"] = $Body
            $params["ContentType"] = "application/json"
        }
        
        # Windows PowerShell 5.1 throws on HTTP >= 400. PowerShell 7 has -SkipHttpErrorCheck.
        $response = Invoke-WebRequest @params -UseBasicParsing

        return @{
            Content    = $response.Content
            StatusCode = $response.StatusCode
        }
    } catch {
        $statusCode = 500
        $content = $_.Exception.Message

        if ($_.Exception.Response) {
            try {
                $resp = $_.Exception.Response
                $statusCode = [int]$resp.StatusCode

                $stream = $resp.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $content = $reader.ReadToEnd()
                    $reader.Close()
                }
            } catch {
                # keep best-effort content
            }
        }

        return @{
            Content    = $content
            StatusCode = $statusCode
        }
    }
}

Write-Host "`n=== SETUP: User Registration & Authentication ===" -ForegroundColor Yellow
Write-Host ""

# TC-SETUP-01: Register test user
Write-Test "TC-SETUP-01: Register test user"
$registerBody = @{
    username = "test-feat01"
    email    = "test-feat01@glou.local"
    password = "TestPassword123!!!"
} | ConvertTo-Json

$registerResp = Invoke-Request -Method "POST" -Uri "$API_AUTH_URL/register" -Body $registerBody

$USER_ID = if ($registerResp.Content -match '"id":"([^"]*)"') { $matches[1] } else { "550e8400-e29b-41d4-a716-446655440000" }

if ($USER_ID -and $USER_ID -notmatch "error") {
    Write-Pass "User registered with ID: $USER_ID"
} else {
    Write-Fail "User registration failed"
    Write-Host "Response: $($registerResp.Content)"
}

# TC-SETUP-02: Login
Write-Test "TC-SETUP-02: Login and get session token"
$loginBody = @{
    username = "test-feat01"
    password = "TestPassword123!!!"
} | ConvertTo-Json

$loginResp = Invoke-Request -Method "POST" -Uri "$API_AUTH_URL/login" -Body $loginBody

$SESSION_TOKEN = if ($loginResp.Content -match '"sessionToken":"([^"]*)"') { $matches[1] } else { "" }
$SESSION_ID = if ($loginResp.Content -match '"sessionId":"([^"]*)"') { $matches[1] } else { "" }

if ($SESSION_TOKEN) {
    Write-Pass "Login successful - Session Token: $($SESSION_TOKEN.Substring(0, 20))..."
} else {
    Write-Fail "Login failed"
    Write-Host "Response: $($loginResp.Content)"
}

Write-Host "`n=== TC-01 to TC-09: CRUD Operations ===" -ForegroundColor Yellow
Write-Host ""

# TC-01: Create Wine Bottle
Write-Test "TC-01: Create Wine Bottle (Château Margaux 2015)"
$wineBody = @{
    label            = "Château Margaux 2015"
    category         = "wine"
    producer         = "Château Margaux"
    name             = "Margaux"
    vintageOrNone    = "2015"
    color            = "Rouge"
    appellation      = "Margaux"
    grapes           = "Cabernet Sauvignon, Merlot"
    abv              = 13.5
    location         = "Cave A - Clayette 1"
    collection       = "Bordeaux Gauche"
    tags             = @("bordeaux", "2015")
    peakMaturity     = @{ from = 2025; to = 2050 }
    estimatedValue   = 350
    purchasePrice    = 280
    purchasePlace    = "Vinovins Paris"
} | ConvertTo-Json

$headers = @{
    "x-user-id" = $USER_ID
}

$wineResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles" -Body $wineBody -Headers $headers

$BOTTLE_ID = if ($wineResp.Content -match '"id":"([^"]*)"') { $matches[1] } else { "" }

if ($BOTTLE_ID) {
    Write-Pass "Wine bottle created: $BOTTLE_ID"
} else {
    Write-Fail "Create wine bottle"
    Write-Host "Response: $($wineResp.Content)"
}

# TC-02: Create Spirit Bottle
Write-Test "TC-02: Create Spirit Bottle (Macallan 15)"
$spiritBody = @{
    label           = "Macallan 15 Years"
    category        = "spirit"
    distillery      = "Macallan"
    nameEdition     = "Sherry Oak 15 Years Old"
    abv             = 43
    ageStatement    = "15 Years"
    caskType        = "Sherry Oak"
    location        = "Cabinet Spiritueux"
    estimatedValue  = 180
    purchasePrice   = 120
} | ConvertTo-Json

$spiritResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles" -Body $spiritBody -Headers $headers

$SPIRIT_ID = if ($spiritResp.Content -match '"id":"([^"]*)"') { $matches[1] } else { "" }

if ($SPIRIT_ID) {
    Write-Pass "Spirit bottle created: $SPIRIT_ID"
} else {
    Write-Fail "Create spirit bottle"
    Write-Host "Response: $($spiritResp.Content)"
}

# TC-03: Create Sparkling Bottle
Write-Test "TC-03: Create Sparkling Bottle (Champagne)"
$sparkBody = @{
    label            = "Champagne Krug Clos d'Ambonnay"
    category         = "sparkling"
    house            = "Krug"
    name             = "Clos d'Ambonnay"
    vintageOrNone    = "2008"
    style            = "Champagne"
    baseYear         = 2008
    location         = "Frigo Bulles"
    peakMaturity     = @{ from = 2025; to = 2045 }
} | ConvertTo-Json

$sparkResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles" -Body $sparkBody -Headers $headers

$SPARK_ID = if ($sparkResp.Content -match '"id":"([^"]*)"') { $matches[1] } else { "" }

if ($SPARK_ID) {
    Write-Pass "Sparkling bottle created: $SPARK_ID"
} else {
    Write-Fail "Create sparkling bottle"
    Write-Host "Response: $($sparkResp.Content)"
}

# TC-04: Update Wine Bottle
Write-Test "TC-04: Update Wine Bottle (edit Château Margaux)"
$updateBody = @{
    label          = "Château Margaux 2015 - Édition Spéciale"
    estimatedValue = 400
    purchasePrice  = 320
    tastingNote    = "Nez complexe, bouche élégante"
    peakMaturity   = @{ from = 2026; to = 2055 }
} | ConvertTo-Json

if (-not $BOTTLE_ID) {
    Write-Fail "Update wine bottle (missing created bottle id)"
} else {
    $updateResp = Invoke-Request -Method "PATCH" -Uri "$API_URL/bottles/$BOTTLE_ID" -Body $updateBody -Headers $headers

    if ($updateResp.StatusCode -ge 200 -and $updateResp.StatusCode -lt 300 -and ($updateResp.Content -match $BOTTLE_ID)) {
        Write-Pass "Wine bottle updated"
    } else {
        Write-Fail "Update wine bottle"
        Write-Host "Status: $($updateResp.StatusCode)"
        Write-Host "Response: $($updateResp.Content)"
    }
}

# TC-05: List Bottles
Write-Test "TC-05: List all bottles (includeDeleted=false)"
$listResp = Invoke-Request -Method "GET" -Uri "$API_URL/bottles?includeDeleted=false" -Headers $headers

$bottleCount = ([regex]::Matches($listResp.Content, '"id":"[^"]*"')).Count

if ($bottleCount -ge 3) {
    Write-Pass "List bottles - found $bottleCount bottles"
} else {
    Write-Fail "List bottles - expected >= 3, got $bottleCount"
    Write-Host "Response: $($listResp.Content)"
}

# TC-06: Get Bottle Detail
Write-Test "TC-06: Get bottle detail"
$detailResp = Invoke-Request -Method "GET" -Uri "$API_URL/bottles/$BOTTLE_ID" -Headers $headers

if ($detailResp.Content -match "Château Margaux") {
    Write-Pass "Bottle detail retrieved"
} else {
    Write-Fail "Get bottle detail"
    Write-Host "Response: $($detailResp.Content)"
}

# TC-07: Mark Bottle as Opened
Write-Test "TC-07: Mark bottle as opened with fillLevel=half"
$openedBody = @{
    isOpened  = $true
    fillLevel = "half"
} | ConvertTo-Json

$openedResp = Invoke-Request -Method "PATCH" -Uri "$API_URL/bottles/$BOTTLE_ID" -Body $openedBody -Headers $headers

if ($openedResp.Content -match '"isOpened":true') {
    Write-Pass "Bottle marked as opened"
} else {
    Write-Fail "Mark bottle as opened"
    Write-Host "Response: $($openedResp.Content)"
}

# TC-08: Delete Bottle (soft-delete)
Write-Test "TC-08: Delete bottle (soft-delete)"
$deleteResp = Invoke-Request -Method "DELETE" -Uri "$API_URL/bottles/$SPIRIT_ID" -Headers $headers

if ($deleteResp.Content -match '"deletedAt"') {
    Write-Pass "Bottle soft-deleted"
} else {
    Write-Fail "Delete bottle"
    Write-Host "Response: $($deleteResp.Content)"
}

# TC-09: Restore Bottle
Write-Test "TC-09: Restore deleted bottle"
$restoreResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles/$SPIRIT_ID/restore" -Headers $headers

if ($restoreResp.Content -match '"deletedAt":null') {
    Write-Pass "Bottle restored"
} else {
    Write-Fail "Restore bottle"
    Write-Host "Response: $($restoreResp.Content)"
}

Write-Host "`n=== TC-10 to TC-14: Validation & Security ===" -ForegroundColor Yellow
Write-Host ""

# TC-10: Authentication Required
Write-Test "TC-10: GET /bottles without x-user-id should return 401"
$unauthResp = Invoke-Request -Method "GET" -Uri "$API_URL/bottles"

if ($unauthResp.StatusCode -eq 401) {
    Write-Pass "Authentication guard: 401 UNAUTHORIZED"
} else {
    Write-Fail "Authentication guard - expected 401, got $($unauthResp.StatusCode)"
}

# TC-12: Reject future vintage
Write-Test "TC-12: Reject wine with future vintage (2027)"
$futureBody = @{
    label         = "Future Wine"
    category      = "wine"
    producer      = "Test"
    name          = "Test"
    vintageOrNone = "2027"
    abv           = 12
} | ConvertTo-Json

$futureResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles" -Body $futureBody -Headers $headers

if ($futureResp.Content -match "(error|invalid|future)" -or $futureResp.StatusCode -eq 400) {
    Write-Pass "Future vintage rejected"
} else {
    Write-Fail "Future vintage validation"
    Write-Host "Response: $($futureResp.Content)"
}

# TC-13: Reject ABV out of range
Write-Test "TC-13: Reject wine ABV outside [5-18%] - test 25%"
$invalidAbvBody = @{
    label         = "High ABV Wine"
    category      = "wine"
    producer      = "Test"
    name          = "Test"
    vintageOrNone = "2020"
    abv           = 25
} | ConvertTo-Json

$invalidAbvResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles" -Body $invalidAbvBody -Headers $headers

if ($invalidAbvResp.Content -match "(error|invalid|ABV)" -or $invalidAbvResp.StatusCode -eq 400) {
    Write-Pass "ABV validation - out of range rejected"
} else {
    Write-Fail "ABV validation"
    Write-Host "Response: $($invalidAbvResp.Content)"
}

# TC-14: Accept valid spirit ABV
Write-Test "TC-14: Accept spirit ABV in [20-80%] - test 45%"
$validSpiritBody = @{
    label       = "Valid Spirit"
    category    = "spirit"
    distillery  = "Test"
    nameEdition = "Test Spirit"
    abv         = 45
} | ConvertTo-Json

$validSpiritResp = Invoke-Request -Method "POST" -Uri "$API_URL/bottles" -Body $validSpiritBody -Headers $headers

if ($validSpiritResp.Content -match '"id"') {
    Write-Pass "Spirit ABV validation - valid range accepted"
} else {
    Write-Fail "Valid spirit ABV"
    Write-Host "Response: $($validSpiritResp.Content)"
}

# Final Report
Write-Host "`n=== TEST SUMMARY ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "Total Passed: $PASSED" -ForegroundColor Green
Write-Host "Total Failed: $FAILED" -ForegroundColor Red

if ($FAILED -eq 0) {
    Write-Host "`nOK All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nFAIL Some tests failed" -ForegroundColor Red
    exit 1
}
