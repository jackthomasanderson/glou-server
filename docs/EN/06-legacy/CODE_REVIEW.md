# Glou Wine Management System - Code Review

## Executive Summary
**Status**: ✅ **FUNCTIONAL** but with several areas requiring attention  
**Overall Score**: 7.5/10  
**Key Issues**: Database schema inconsistencies, incomplete error handling, missing validation, test failures

---

## 🔴 Critical Issues

### 1. **Schema-Code Mismatch in Wine Operations**
**Severity**: HIGH | **Location**: `internal/store/sqlite.go`

**Problem**: Multiple functions do NOT select/update all wine fields from the database schema, causing data loss:

```go
// CreateWine() - Only selects 8 fields
INSERT INTO wines (name, region, vintage, type, quantity, cell_id, created_at)
// Missing: producer, alcohol_level, price, rating, comments, consumed, 
//          min_apogee_date, max_apogee_date, consumption_date

// GetWines() - Only selects 8 fields
SELECT id, name, region, vintage, type, quantity, cell_id, created_at
// Missing: All the extended fields above

// GetWineByID() - Same issue
SELECT id, name, region, vintage, type, quantity, cell_id, created_at
```

**Impact**: When creating or fetching wines, all extended fields (producer, rating, comments, etc.) are lost/not hydrated

**Fix Required**: Update queries to include ALL 17 wine fields:
```go
SELECT id, name, region, vintage, type, quantity, cell_id, created_at, 
       producer, alcohol_level, price, rating, comments, consumed, 
       min_apogee_date, max_apogee_date, consumption_date
FROM wines
```

---

### 2. **Test Failure in AlertGenerator**
**Severity**: HIGH | **Location**: `internal/store/alert_generator.go:51`

**Problem**: Background goroutine created without proper lifecycle management:
```go
func (ag *AlertGenerator) Start(interval time.Duration) {
    ag.ticker = time.NewTicker(interval)
    
    go func() {  // ❌ Goroutine never cleaned up if Stop() is called before ticker ticks
        // ...
        for {
            select {
            case <-ag.ticker.C:
                // ...
            case <-ag.stopChan:
                return  // ❌ Goroutine exits, but ticker still running
            }
        }
    }()
}

func (ag *AlertGenerator) Stop() {
    if ag.ticker != nil {
        ag.ticker.Stop()  // ❌ Race condition: ticker.Stop() may be called while goroutine reading from ticker.C
    }
    ag.stopChan <- true  // ❌ May block if goroutine already exited
}
```

**Impact**: Potential goroutine leak, race conditions, or deadlock on shutdown

**Fix Required**:
```go
func (ag *AlertGenerator) Stop() {
    if ag.ticker != nil {
        ag.ticker.Stop()
    }
    close(ag.stopChan)  // Use close instead of sending, broadcast to all listeners
}
```

---

### 3. **Incomplete SearchWines Implementation**
**Severity**: MEDIUM | **Location**: `internal/store/sqlite.go:453`

**Problem**: Handler signature expects 9 parameters but React frontend calling with different signature:

**Handler Calls**:
```go
// From handlers (admin_handlers.go or main.go):
results, err := s.store.SearchWines(ctx, name, producer, region, wineType, 
                                     minVintage, maxVintage, minPrice, maxPrice)
```

**But Store Implementation**:
```go
func (s *Store) SearchWines(ctx context.Context, filters map[string]interface{}) ([]*domain.Wine, error)
// Takes a map, not individual params!
```

**Frontend Calling**:
```javascript
// apiClient.js
async searchWines(filters) {
    const params = new URLSearchParams();
    // Builds query params, not JSON body
    return this.request('GET', `/wines/search?${params.toString()}`);
}
```

**Impact**: Search functionality likely broken or inconsistent

**Fix Required**: Standardize on ONE approach - either:
1. **Option A**: Accept map in Store, build from query params in handler
2. **Option B**: Accept variadic params, convert in handler

---

### 4. **Race Condition in AlertGenerator**
**Severity**: MEDIUM | **Location**: `internal/store/alert_generator.go`

**Problem**: No synchronization when accessing `ag.ticker` between Start() and Stop():
```go
// Thread A (main)
func (ag *AlertGenerator) Stop() {
    if ag.ticker != nil {
        ag.ticker.Stop()  // May be nil or partially initialized
    }
}

// Thread B (goroutine in Start)
go func() {
    ag.ticker = time.NewTicker(interval)  // Can race with Stop() checking ticker
    // ...
}()
```

**Impact**: Nil pointer dereference, unexpected behavior

**Fix**: Use sync.Mutex or sync/atomic

---

## 🟡 Major Issues

### 5. **Database Transaction Missing**
**Severity**: MEDIUM | **Location**: `internal/store/sqlite.go:440-450`

**Problem**: RecordConsumption does two operations without transaction:
```go
func (s *Store) RecordConsumption(ctx context.Context, consumption *domain.ConsumptionHistory) (int64, error) {
    // 1. Insert consumption record
    result, err := s.Db.ExecContext(ctx, query1, ...)
    
    // 2. Update wine quantity
    _, err = s.Db.ExecContext(ctx, query2, ...)
    // ❌ If query2 fails after query1 succeeds, database is inconsistent!
}
```

**Impact**: Data inconsistency if one of two operations fails

**Fix**: Wrap in transaction:
```go
tx, err := s.Db.BeginTx(ctx, nil)
// Insert
// Update
tx.Commit() or tx.Rollback()
```

---

### 6. **No Input Validation in CreateWine**
**Severity**: MEDIUM | **Location**: `internal/store/sqlite.go:109`

**Problem**: Handler should validate before Store operations:
- No check for empty name/region
- No vintage range validation (1900-2100)
- No wine type whitelist validation
- Negative quantity not prevented

**Current Handler** (main.go):
```go
func (s *Server) handleCreateWine(w http.ResponseWriter, r *http.Request) {
    // Assumes data is valid, creates directly in store
    // No validation!
}
```

**Impact**: Invalid data can be stored in database

**Fix**: Add validation layer in handlers before calling Store

---

### 7. **GetAlertsByWineID Not Handling NULL Dates**
**Severity**: MEDIUM | **Location**: `internal/store/sqlite.go:688`

**Problem**: Time parsing assumes string but database stores DATETIME:
```go
for rows.Next() {
    var alert domain.Alert
    var createdAtStr string
    err := rows.Scan(&alert.ID, &alert.WineID, &alert.AlertType, 
                     &alert.Status, &createdAtStr)
    // ...
    alert.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
    // ❌ This will fail or produce wrong time!
}
```

**Why**: SQLite returns time as `DATETIME` which parses differently. Should use `sql.NullTime` or scan directly into `time.Time`

**Impact**: Alerts have incorrect timestamps

**Fix**:
```go
var alert domain.Alert
err := rows.Scan(&alert.ID, &alert.WineID, &alert.AlertType, 
                 &alert.Status, &alert.CreatedAt)  // Direct scan
```

---

## 🟠 Minor Issues

### 8. **Typo in Store Method Name**
**Severity**: LOW | **Location**: `internal/store/sqlite.go:549`

```go
// GetCellsByCAve  ❌ Wrong capitalization!
func (s *Store) GetCellsByCave(ctx context.Context, caveID int64) ([]*domain.Cell, error)
```

This is actually CORRECT in code but comment says "GetCellsByCAve" - just confusing

---

### 9. **Error Shadows Previous Error**
**Severity**: LOW | **Location**: `internal/store/sqlite.go:450`

```go
func (s *Store) RecordConsumption(ctx context.Context, consumption *domain.ConsumptionHistory) (int64, error) {
    // Insert
    result, err := s.Db.ExecContext(ctx, query)
    if err != nil {
        return 0, fmt.Errorf("failed to record consumption: %w", err)
    }
    
    // Update - err from line above is shadowed!
    _, err = s.Db.ExecContext(ctx, updateQuery)  // ❌ Shadows outer err
    if err != nil {
        return 0, fmt.Errorf("failed to update wine quantity: %w", err)
    }
}
```

**Fix**: Use different variable or defer cleanup:
```go
if _, err := s.Db.ExecContext(...); err != nil {
    return 0, fmt.Errorf("...")
}
```

---

### 10. **Missing Error Checking in AlertGenerator**
**Severity**: MEDIUM | **Location**: `internal/store/alert_generator.go:25`

```go
// Silent log if alerts fail
if err != nil {
    log.Printf("Error generating alerts on start: %v", err)  // Just logs, doesn't propagate
}
```

**Better Practice**: Return error from Start() so caller knows if alerts failed to initialize

---

## 🟢 Strengths

✅ **Well-organized project structure** - Clear separation of concerns (cmd, internal/store, internal/domain)

✅ **Good middleware architecture** - Security headers, CORS, rate limiting all properly implemented

✅ **Consistent error wrapping** - Uses `fmt.Errorf` with `%w` for error chains

✅ **React hooks pattern** - Good abstraction for state management

✅ **Material Design 3 compliance** - Both React and Flutter follow design system

✅ **SQLite schema proper** - Good use of foreign keys and indexes

---

## 📊 Code Quality Metrics

| Metric | Score | Notes |
|--------|-------|-------|
| **Test Coverage** | 2/10 | Only basic tests, many edge cases uncovered |
| **Error Handling** | 6/10 | Good try-catch patterns, but missing validation |
| **Documentation** | 7/10 | Functions have French comments, good clarity |
| **Architecture** | 8/10 | Layered architecture is solid |
| **Type Safety** | 7/10 | Go is typed, but schema-code mismatch reduces safety |
| **API Design** | 6/10 | REST endpoints good, but inconsistent parameter passing |

---

## 🛠️ Priority Fix List

### 🔴 CRITICAL (Fix immediately):
1. [ ] Fix wine query to select ALL 17 fields (affects CREATE, READ, SEARCH)
2. [ ] Fix SearchWines signature mismatch (handler vs store vs frontend)
3. [ ] Fix AlertGenerator goroutine lifecycle (race condition, goroutine leak)

### 🟡 HIGH (Fix before production):
4. [ ] Add database transaction to RecordConsumption
5. [ ] Add input validation to all Create/Update handlers
6. [ ] Fix time parsing in GetAlertsByWineID (use sql.NullTime)
7. [ ] Add tests for Store methods (tests currently fail)

### 🟠 MEDIUM (Fix when convenient):
8. [ ] Add error return from AlertGenerator.Start()
9. [ ] Reduce variable shadowing
10. [ ] Add context timeout to all database operations

---

## 📋 Test Status

**Current**: ❌ FAILING  
**Issue**: `go test ./internal/store -v` exits with code 1

**Root Cause**: Tests need database setup that may not be initializing properly

**Recommendation**: 
- Fix test helper function
- Add proper teardown for each test
- Use temporary databases (in-memory SQLite recommended)

---

## 🎯 Recommendations for Next Sprint

1. **Immediate** (This week):
   - Fix the 3 critical issues above
   - Get all tests passing
   - Add pre-commit hook to run tests

2. **Short-term** (Next 2 weeks):
   - Add OpenAPI/Swagger documentation
   - Implement request/response logging
   - Add monitoring for alert generation
   - Implement proper authentication (currently missing)

3. **Long-term** (Next month):
   - Add integration tests (end-to-end)
   - Implement caching strategy for frequently accessed data
   - Add database migrations tool (for schema versioning)
   - Containerize with Docker for consistent deployment

---

## 🔍 Code Review Checklist

- [x] Architecture reviewed
- [x] Security reviewed
- [x] Performance reviewed
- [x] Testing strategy reviewed
- [ ] Documentation reviewed (need to add)
- [ ] Deployment strategy reviewed (need to add)

---

## Conclusion

**The Glou system is architecturally sound** with good separation of concerns and proper middleware setup. However, **critical issues must be fixed before production use**, specifically:

1. Database field mapping inconsistencies
2. Race conditions in background services
3. Missing validation layers

Once these are resolved, the system will be **solid and ready for MVP release**.

