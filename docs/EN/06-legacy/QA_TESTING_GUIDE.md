# 🧪 QA TESTING GUIDE - Glou

**Objectif:** Guide complet de test avant production  
**Coverage Goal:** 70%+ code coverage + complete feature validation

---

## 📋 TEST PYRAMID

```
         🎯 E2E Tests (5%)
         - Full user workflows
         
      🟦🟦 Integration Tests (25%)
      - API endpoints
      - Database operations
      
   🟩🟩🟩 Unit Tests (70%)
   - Domain logic
   - Utilities
   - Middleware
```

---

## 🔄 TYPES DE TESTS

### 1. Unit Tests
**Cible:** Functions, methods, business logic  
**Framework:** Go testing (builtin)  
**Coverage:** ≥70%

```bash
# Exécuter tous les tests
go test ./...

# Avec verbose
go test -v ./...

# Avec coverage
go test -cover ./...

# Générer report HTML
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html
```

### 2. Integration Tests
**Cible:** API endpoints, database operations  
**Setup:** Test database (SQLite in-memory)  
**Isolation:** Each test gets clean DB

### 3. E2E Tests
**Cible:** Complete user workflows  
**Tools:** Browser automation (Selenium, Playwright)  
**Environment:** Staging server

### 4. Performance Tests
**Cible:** Response times, throughput  
**Tools:** `vegeta`, `wrk`, `ab`

### 5. Security Tests
**Cible:** Auth, injection, CORS  
**Tools:** `curl`, `burp suite` (commercial)

---

## 🏃 UNIT TESTS

### Example: Domain Model Tests

```go
// internal/domain/wine_test.go
package domain

import (
    "testing"
    "time"
)

func TestWineCreation(t *testing.T) {
    wine := &Wine{
        ID:        1,
        Name:      "Château Lafite",
        Type:      "rouge",
        Vintage:   2015,
        Quantity:  3,
        Rating:    95,
    }

    if wine.Name != "Château Lafite" {
        t.Errorf("Expected name Château Lafite, got %s", wine.Name)
    }

    if wine.Quantity != 3 {
        t.Errorf("Expected quantity 3, got %d", wine.Quantity)
    }
}

func TestWineValidation(t *testing.T) {
    tests := []struct {
        name    string
        wine    *Wine
        wantErr bool
    }{
        {
            name: "Valid wine",
            wine: &Wine{
                Name:     "Lafite",
                Type:     "rouge",
                Vintage:  2015,
                Quantity: 1,
            },
            wantErr: false,
        },
        {
            name: "Invalid type",
            wine: &Wine{
                Name:     "Lafite",
                Type:     "invalid",
                Quantity: 1,
            },
            wantErr: true,
        },
        {
            name: "Zero quantity",
            wine: &Wine{
                Name:     "Lafite",
                Quantity: 0,
            },
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := tt.wine.Validate()
            if (err != nil) != tt.wantErr {
                t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}

func TestConsumptionHistoryReason(t *testing.T) {
    validReasons := []string{"vente", "dégustation", "cadeau", "perte"}
    
    for _, reason := range validReasons {
        ch := &ConsumptionHistory{
            WineID: 1,
            Reason: reason,
            Date:   time.Now(),
        }
        
        if err := ch.Validate(); err != nil {
            t.Errorf("Valid reason %q failed: %v", reason, err)
        }
    }
    
    invalid := &ConsumptionHistory{
        WineID: 1,
        Reason: "invalid_reason",
    }
    
    if err := invalid.Validate(); err == nil {
        t.Error("Invalid reason should fail validation")
    }
}
```

---

## 🌐 INTEGRATION TESTS

### Example: API Endpoints

```go
// cmd/api/handlers_test.go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestGetWines(t *testing.T) {
    // Setup
    server := setupTestServer(t)
    defer server.Close()

    // Execute
    resp, err := http.Get(server.URL + "/api/wines")
    if err != nil {
        t.Fatalf("Request failed: %v", err)
    }
    defer resp.Body.Close()

    // Assert
    if resp.StatusCode != http.StatusOK {
        t.Errorf("Expected status 200, got %d", resp.StatusCode)
    }

    var wines []Wine
    if err := json.NewDecoder(resp.Body).Decode(&wines); err != nil {
        t.Fatalf("Failed to decode response: %v", err)
    }
}

func TestCreateWine(t *testing.T) {
    server := setupTestServer(t)
    defer server.Close()

    payload := map[string]interface{}{
        "name":      "Test Wine",
        "type":      "rouge",
        "vintage":   2020,
        "quantity":  1,
        "cave_id":   1,
    }

    body, _ := json.Marshal(payload)
    resp, _ := http.Post(
        server.URL+"/api/wines",
        "application/json",
        bytes.NewBuffer(body),
    )

    if resp.StatusCode != http.StatusCreated {
        t.Errorf("Expected 201, got %d", resp.StatusCode)
    }
}

func TestCORSHeaders(t *testing.T) {
    server := setupTestServer(t)
    defer server.Close()

    req, _ := http.NewRequest("GET", server.URL+"/api/wines", nil)
    req.Header.Set("Origin", "http://localhost:8080")

    resp, _ := http.DefaultClient.Do(req)

    // Check CORS headers
    if corsOrigin := resp.Header.Get("Access-Control-Allow-Origin"); corsOrigin == "" {
        t.Error("Missing CORS header")
    }
}

func TestRateLimiting(t *testing.T) {
    server := setupTestServer(t)
    defer server.Close()

    // Make many requests rapidly
    for i := 0; i < 150; i++ {
        resp, _ := http.Get(server.URL + "/api/wines")
        
        if i >= 100 {
            // Should be rate limited after 100 requests
            if resp.StatusCode != http.StatusTooManyRequests {
                t.Errorf("Request %d: expected 429, got %d", i, resp.StatusCode)
            }
        }
    }
}
```

---

## 📊 PERFORMANCE TESTS

### Test Setup
```bash
# Install vegeta (load testing)
go install github.com/tsenart/vegeta@latest

# Or wrk
brew install wrk  # macOS
apt-get install wrk  # Linux
```

### Baseline Performance
```bash
# Test GET /api/wines
echo "GET http://localhost:8080/api/wines" | \
  vegeta attack -duration=30s -rate=100 | \
  vegeta report

# Output example:
# 50th percentile:   45ms
# 95th percentile:   120ms
# 99th percentile:   350ms
# Max:               1500ms

# Expected for production:
# p50: < 100ms
# p95: < 300ms
# p99: < 500ms
```

### Stress Test
```bash
# Simulate spike traffic
echo "GET http://localhost:8080/api/wines" | \
  vegeta attack -duration=10s -rate=1000 | \
  vegeta report

# Check for:
# - Status 429 (rate limiting activated)
# - No 500 errors (crashes)
# - Response time degradation acceptable
```

---

## 🔐 SECURITY TESTS

### SQL Injection Prevention
```bash
# Try injection payloads
curl "http://localhost:8080/api/wines?appellation='; DROP TABLE wines; --"
curl "http://localhost:8080/api/wines?vintage=1' OR '1'='1"

# Expected: No error, query should be safe (prepared statements)
```

### CORS Validation
```bash
# Valid origin
curl -H "Origin: http://localhost:8080" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS http://localhost:8080/api/wines

# Invalid origin
curl -H "Origin: http://evil.com" \
     -X OPTIONS http://localhost:8080/api/wines

# Expected for invalid: No CORS headers returned or 403
```

### Authentication Bypass (Phase 2)
```bash
# Missing token should fail
curl http://localhost:8080/api/admin/backup

# Expected: 401 Unauthorized
```

### XSS Prevention
```bash
curl -X POST http://localhost:8080/api/wines \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<script>alert(\"XSS\")</script>",
    "type": "rouge",
    "quantity": 1
  }'

# Verify response escapes HTML
curl http://localhost:8080/api/wines/1 | grep -i script
# Should be URL-encoded or safe
```

---

## 🎯 E2E TEST SCENARIOS

### Scenario 1: Create Wine and Check Alert
```gherkin
Given I'm on the Glou home page
When I click "Ajouter un vin"
And I fill the form:
  - Name: "Château X 2015"
  - Type: "rouge"
  - Min Apogee: 2026
  - Max Apogee: 2040
  - Quantity: 2
And I click "Créer"
Then I should see "Vin créé avec succès"
And I should see the wine in the list
And an alert should be created if apogee is < 2 years
```

### Scenario 2: Search and Journal Entry
```gherkin
Given I have 10 wines in the database
When I search for "Lafite"
Then I should see 1 result
When I click "À boire maintenant"
Then I should only see wines ready to drink
When I click "Dégusté" on a wine
And I fill the tasting notes
And I click "Enregistrer"
Then the wine should appear in the journal
And the quantity should decrease by 1
```

### Scenario 3: Dark Mode Toggle
```gherkin
Given I'm on the home page
When I click the dark mode toggle
Then the background should change to dark
And text should remain readable (contrast ≥ 4.5:1)
And the setting should persist after refresh
```

---

## 🗂️ TEST FILE STRUCTURE

```
glou-server/
├── internal/
│   ├── domain/
│   │   ├── wine.go
│   │   └── wine_test.go         # Unit tests
│   ├── store/
│   │   ├── sqlite.go
│   │   └── sqlite_test.go       # Integration tests
│   └── util/
│       ├── helpers.go
│       └── helpers_test.go
├── cmd/api/
│   ├── main.go
│   ├── handlers.go
│   ├── handlers_test.go         # API endpoint tests
│   ├── middleware.go
│   └── middleware_test.go       # Middleware tests
├── tests/
│   ├── e2e/
│   │   ├── e2e_test.go
│   │   └── fixtures.go
│   └── performance/
│       └── perf_test.go
└── testdata/
    └── sample_wines.json        # Test fixtures
```

---

## ⚙️ TEST UTILITIES

### Helper Functions
```go
// tests/helpers.go
package tests

import (
    "testing"
    "glou/internal/store"
)

func SetupTestDB(t *testing.T) *store.Store {
    // Create in-memory SQLite
    db, err := store.NewStore(":memory:")
    if err != nil {
        t.Fatalf("Failed to create test DB: %v", err)
    }
    
    // Run migrations
    if err := db.RunMigrations(); err != nil {
        t.Fatalf("Failed to run migrations: %v", err)
    }
    
    return db
}

func SeedTestData(t *testing.T, db *store.Store) {
    // Add test wines
    testWines := []map[string]interface{}{
        {
            "name":      "Lafite",
            "type":      "rouge",
            "vintage":   2015,
            "quantity":  3,
            "cave_id":   1,
        },
        // ... more wines
    }
    
    for _, wine := range testWines {
        // Add to DB
    }
}
```

---

## 📊 CODE COVERAGE

### Generate Coverage Report
```bash
# All packages
go test -coverprofile=coverage.out ./...

# Specific package
go test -coverprofile=coverage.out ./internal/domain

# View in browser
go tool cover -html=coverage.out

# Print to terminal
go tool cover -func=coverage.out | tail -10
# output:
# glou/cmd/api/handlers.go:45:    GetWines    100.0%
# glou/cmd/api/handlers.go:70:    CreateWine   85.0%
# total:                          (statements) 72.5%
```

### Coverage Targets by Package
| Package | Target |
|---------|--------|
| domain | 90% |
| store | 85% |
| middleware | 80% |
| handlers | 75% |
| config | 70% |
| **Total** | **≥70%** |

---

## 🚀 CI/CD TESTING

### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: 1.24
      
      - name: Run tests
        run: go test -v -coverprofile=coverage.out ./...
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.out
      
      - name: Check coverage threshold
        run: |
          COVERAGE=$(go tool cover -func=coverage.out | tail -1 | awk '{print $3}' | sed 's/%//')
          if (( $(echo "$COVERAGE < 70" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 70% threshold"
            exit 1
          fi
      
      - name: Run vet
        run: go vet ./...
      
      - name: Run lint
        uses: golangci/golangci-lint-action@v3
```

---

## ✅ MANUAL TEST CHECKLIST

### Functional Tests (Before Production)
- [ ] Create wine (all fields)
- [ ] Edit wine (modify fields)
- [ ] Delete wine (remove from list)
- [ ] Search wines (by type, appellation, rating)
- [ ] Create cave
- [ ] Create cell in cave
- [ ] Assign wine to cell
- [ ] View "À boire maintenant"
- [ ] Record journal entry (all reasons)
- [ ] View journal history
- [ ] Toggle dark mode
- [ ] Check responsive design (mobile, tablet, desktop)

### Security Tests
- [ ] SSL certificate valid (https only)
- [ ] CORS headers present
- [ ] Rate limiting works (429 after limit)
- [ ] No secrets in logs
- [ ] No SQL injection vulnerability
- [ ] No XSS in form inputs

### Performance Tests
- [ ] Page load < 2 seconds
- [ ] API response < 200ms (p95)
- [ ] Can handle 100 wines without lag
- [ ] Search works with 1000+ wines

### Browser Compatibility
- [ ] Chrome latest
- [ ] Firefox latest
- [ ] Safari latest
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## 🐛 BUG REPORTING TEMPLATE

```markdown
## Bug Report

**Title:** [SEVERITY] Brief description

**Severity:** Critical | High | Medium | Low

**Environment:**
- OS: macOS / Linux / Windows
- Browser: Chrome 120 / Firefox 121
- App Version: 1.0.0

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Result:**
...

**Actual Result:**
...

**Screenshots/Logs:**
[Attach if available]

**Workaround:**
[If known]
```

---

## 📞 TEST SUPPORT

**QA Lead:** qa@glou.dev  
**Test Results:** GitHub Actions  
**Coverage Dashboard:** Codecov  
**Bug Tracker:** GitHub Issues

---

**Version:** 1.0  
**Status:** ✅ Ready for Testing  
**Last Updated:** 2025-01-21
