package domain

import "time"

// Tobacco represents a tobacco product (e.g., cigar)
type Tobacco struct {
    ID           int64     `json:"id"`
    Name         string    `json:"name"`          // Product name
    Brand        string    `json:"brand"`         // Producer/Brand
    PurchaseDate *time.Time `json:"purchase_date"` // Date of purchase
    Quantity     int       `json:"quantity"`      // Units in stock
    PurchasePrice *float32  `json:"purchase_price"` // Price paid
    CurrentValue  *float32  `json:"current_value"`  // Current estimated value
    CaveID       *int64    `json:"cave_id"`       // Cave location (optional)
    CellID       *int64    `json:"cell_id"`       // Specific cell position (optional)
    Notes        string    `json:"notes"`         // Tasting notes/comments

    // Specifics
    OriginCountry string   `json:"origin_country"` // Country of origin
    Format        string   `json:"format"`         // Format (e.g., Robusto)
    Wrapper       string   `json:"wrapper"`        // Cape
    Binder        string   `json:"binder"`         // Sous-cape

    CreatedAt    time.Time `json:"created_at"`
}
