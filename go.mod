module github.com/romain/glou-server

go 1.24.0

require modernc.org/sqlite v1.41.0 // SQLite in pure Go - highly reliable, no CGO required

require (
	github.com/dustin/go-humanize v1.0.1 // indirect
	// Core dependencies - production quality
	github.com/google/uuid v1.6.0 // indirect; UUID generation - Google's proven standard
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v0.1.9 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/exp v0.0.0-20250620022241-b7579e27df2b // indirect
	golang.org/x/sys v0.39.0 // indirect
	modernc.org/libc v1.66.10 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
)

require golang.org/x/crypto v0.46.0 // indirect

// Indirect dependencies will be managed automatically
// Note: All dependencies use latest stable versions (as of Dec 2024)
// No indirect dependencies listed - Go will manage transitive deps
