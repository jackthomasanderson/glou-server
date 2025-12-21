# Glou Code Review - Priority Fixes

## 🔴 CRITICAL ISSUES (Block production)

### 1. Wine Field Mapping - INCOMPLETE SELECTS
**File**: `internal/store/sqlite.go`
**Functions Affected**: `CreateWine()`, `GetWines()`, `GetWineByID()`, `SearchWines()`

**Problem**: Only selecting 8 of 17 wine fields causes data loss

**Current CreateWine (Lines 109-133)**:
```go
query := `
INSERT INTO wines (name, region, vintage, type, quantity, cell_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`
// Missing fields in INSERT: producer, alcohol_level, price, rating, comments, 
//                           consumed, min_apogee_date, max_apogee_date, consumption_date
```

**Current GetWines (Lines 135-165)**:
```go
query := `
SELECT id, name, region, vintage, type, quantity, cell_id, created_at
FROM wines
ORDER BY created_at DESC
`
// Missing all extended fields in SELECT
```

**Required Fix**: Update all SELECT/INSERT queries to include all 17 fields:
- `id`, `name`, `region`, `vintage`, `type`, `quantity`, `cell_id`, `created_at`
- `producer`, `alcohol_level`, `price`, `rating`, `comments`, `consumed`
- `min_apogee_date`, `max_apogee_date`, `consumption_date`

**Estimated Time**: 30 minutes

---

### 2. SearchWines Signature Mismatch
**File**: `internal/store/sqlite.go` (Store method)
**Also**: `cmd/api/main.go` (Handler calling it)
**Also**: `web/src/services/apiClient.js` (Frontend calling it)

**Problem**: Three different signatures for same operation

**Store Definition (Line 453)**:
```go
func (s *Store) SearchWines(ctx context.Context, filters map[string]interface{}) ([]*domain.Wine, error)
// Takes map parameter
```

**But handler calls it with**:
```go
// Likely something like:
s.store.SearchWines(ctx, name, producer, region, wineType, minVintage, maxVintage, minPrice, maxPrice)
// Multiple individual parameters - MISMATCH!
```

**Frontend sends**:
```javascript
// Builds query string with URLSearchParams
`/wines/search?name=X&region=Y&type=Z`
```

**Required Fix**: Choose one approach and standardize:

**Option A (Recommended - Query Parameters)**:
```go
func (s *Store) SearchWines(ctx context.Context, filters map[string]interface{}) ([]*domain.Wine, error) {
    // Accepts map from handler which builds it from query params
    // Handler: parseQueryParams() -> map -> SearchWines()
}
```

**Option B (Individual Parameters)**:
```go
func (s *Store) SearchWines(ctx context.Context, name, producer, region, wineType string, 
                           minVintage, maxVintage int, minPrice, maxPrice float32) ([]*domain.Wine, error)
```

**Estimated Time**: 20 minutes

---

### 3. AlertGenerator Race Condition & Goroutine Leak
**File**: `internal/store/alert_generator.go`

**Problem 1**: No synchronization between Start() and Stop()
```go
type AlertGenerator struct {
    store    *Store
    ticker   *time.Ticker
    stopChan chan bool
    // ❌ Missing: sync.Mutex for thread-safe access to ticker
}
```

**Problem 2**: Improper channel handling in Stop()
```go
func (ag *AlertGenerator) Stop() {
    if ag.ticker != nil {
        ag.ticker.Stop()
    }
    ag.stopChan <- true  // ❌ May block if goroutine already exited
}
```

**Problem 3**: Goroutine may not exit cleanly
```go
go func() {
    for {
        select {
        case <-ag.ticker.C:
            // ...
        case <-ag.stopChan:
            return  // Only gets here if Stop() sends on stopChan
        }
    }
}()
// ❌ If Stop() called before first tick, might hang
```

**Required Fix**:
```go
import "sync"

type AlertGenerator struct {
    store    *Store
    ticker   *time.Ticker
    stopChan chan struct{}  // Use empty struct, not bool
    done     chan struct{}  // Signal when goroutine exited
    mu       sync.Mutex     // Protect ticker access
}

func (ag *AlertGenerator) Start(interval time.Duration) {
    ag.ticker = time.NewTicker(interval)
    ag.done = make(chan struct{})
    
    go func() {
        defer close(ag.done)  // Signal completion
        // ... goroutine logic
    }()
}

func (ag *AlertGenerator) Stop() {
    ag.mu.Lock()
    if ag.ticker != nil {
        ag.ticker.Stop()
        ag.ticker = nil
    }
    ag.mu.Unlock()
    
    close(ag.stopChan)  // Use close, not send
    <-ag.done           // Wait for goroutine to finish
}
```

**Estimated Time**: 25 minutes

---

## 🟡 HIGH PRIORITY (Before Production)

### 4. Missing Database Transaction in RecordConsumption
**File**: `internal/store/sqlite.go:440-460`

**Problem**: Two DB operations without transaction = inconsistent state if second fails
```go
func (s *Store) RecordConsumption(ctx context.Context, consumption *domain.ConsumptionHistory) (int64, error) {
    // Insert consumption record
    result, err := s.Db.ExecContext(ctx, query, ...)
    
    // If this fails after insert, wine quantity never updated!
    _, err = s.Db.ExecContext(ctx, updateQuery, ...)
}
```

**Required Fix**: Wrap in transaction
```go
tx, err := s.Db.BeginTx(ctx, nil)
if err != nil {
    return 0, fmt.Errorf("failed to begin transaction: %w", err)
}
defer tx.Rollback()

// Use tx instead of s.Db for both operations
result, err := tx.ExecContext(ctx, insertQuery, ...)
if err != nil {
    return 0, fmt.Errorf("failed to insert: %w", err)
}

_, err = tx.ExecContext(ctx, updateQuery, ...)
if err != nil {
    return 0, fmt.Errorf("failed to update: %w", err)
}

if err := tx.Commit(); err != nil {
    return 0, fmt.Errorf("failed to commit: %w", err)
}
```

**Estimated Time**: 15 minutes

---

### 5. No Input Validation in Handlers
**File**: `cmd/api/main.go`
**Functions Affected**: `handleCreateWine()`, `handleCreateAlert()`, handlers

**Problem**: No validation before database operations
```go
func (s *Server) handleCreateWine(w http.ResponseWriter, r *http.Request) {
    var wine domain.Wine
    json.NewDecoder(r.Body).Decode(&wine)  // No validation!
    s.store.CreateWine(r.Context(), &wine)
}
```

**Required Validations**:
- Name: required, non-empty, max 255 chars
- Region: required, non-empty
- Vintage: required, 1900-2100 range
- WineType: required, must be one of ["Red", "White", "Rosé", "Sparkling"]
- Quantity: >= 0
- Rating: if provided, must be 0-5
- AlcoholLevel: if provided, must be 0-20
- Price: if provided, must be >= 0
- ApogeeDate: if both provided, min <= max

**Create validation helper**:
```go
func validateWine(wine *domain.Wine) error {
    if wine.Name == "" {
        return errors.New("name is required")
    }
    // ... more checks
    return nil
}

// In handler:
if err := validateWine(&wine); err != nil {
    s.respondError(w, http.StatusBadRequest, "Validation error", err)
    return
}
```

**Estimated Time**: 40 minutes

---

### 6. Time Parsing Bug in GetAlertsByWineID
**File**: `internal/store/sqlite.go:688`

**Problem**: Manual time parsing fails with SQLite DATETIME format
```go
for rows.Next() {
    var createdAtStr string
    rows.Scan(..., &createdAtStr)
    // ❌ This format assumes SQLite string output, but types may differ
    alert.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
}
```

**Required Fix**: Let database/sql handle time parsing
```go
for rows.Next() {
    var alert domain.Alert
    var createdAt time.Time
    err := rows.Scan(&alert.ID, &alert.WineID, &alert.AlertType, 
                     &alert.Status, &createdAt)
    alert.CreatedAt = createdAt
}
```

**Estimated Time**: 10 minutes

---

## 🟠 MEDIUM PRIORITY

### 7. Test Failures
**File**: `internal/store/sqlite_test.go`

**Issue**: `go test ./internal/store -v` exits code 1

**Likely Problem**: Test database setup not working

**Fix**: Ensure temp database creation works:
```go
func createTestDB(t *testing.T) (*Store, string) {
    tmpfile, err := os.CreateTemp("", "glou-test-*.db")
    if err != nil {
        t.Fatalf("Failed to create temp file: %v", err)
    }
    tmpfile.Close()
    // ✓ Close before opening with Store
    
    store, err := New(tmpfile.Name())
    if err != nil {
        t.Fatalf("Failed to create store: %v", err)
    }
    
    return store, tmpfile.Name()
}
```

**Estimated Time**: 20 minutes

---

## 📊 Estimated Total Fix Time
- **Critical**: ~75 minutes (3 issues)
- **High Priority**: ~105 minutes (3 issues)
- **Medium Priority**: ~20 minutes (1 issue)
- **TOTAL**: ~200 minutes (3.5 hours)

## ✅ Testing Strategy After Fixes
1. Run unit tests: `go test ./internal/store -v`
2. Run integration tests: `go test ./cmd/api -v`
3. Manual testing: Create wine → Search → Update → Record consumption → Verify alerts

---

## 📝 Files to Modify (Summary)

| File | Changes | Priority |
|------|---------|----------|
| `internal/store/sqlite.go` | Add 17 fields to all wine queries, fix GetAlertsByWineID time parsing, add transaction to RecordConsumption | CRITICAL + HIGH |
| `internal/store/alert_generator.go` | Fix goroutine lifecycle, add sync.Mutex | CRITICAL |
| `cmd/api/main.go` | Add input validation to handlers | HIGH |
| `internal/store/sqlite_test.go` | Fix test database setup | MEDIUM |

---
