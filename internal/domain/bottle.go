package domain

import "time"

// Bottle represents a beverage item in a cave (wine, beer, spirit, cigar, etc.)
// This is an enhanced version of Wine supporting multiple beverage types
type Bottle struct {
	ID               int64      `json:"id"`
	CaveID           *int64     `json:"cave_id"`          // New: Reference to Cave
	UserID           *string    `json:"user_id"`          // New: For multi-user support
	Name             string     `json:"name"`
	Producer         string     `json:"producer"`
	Region           string     `json:"region"`
	Vintage          int        `json:"vintage"`
	BottleType       string     `json:"bottle_type"`      // New: Support multiple types (wine, beer, spirit, cigar)
	Quantity         int        `json:"quantity"`
	CellID           *int64     `json:"cell_id"`
	CreatedAt        time.Time  `json:"created_at"`
	MinApogeeDate    *time.Time `json:"min_apogee_date,omitempty"`
	MaxApogeeDate    *time.Time `json:"max_apogee_date,omitempty"`
	Rating           *float32   `json:"rating"`
	Comments         string     `json:"comments"`
	Price            *float32   `json:"price"`
	CurrentValue     *float32   `json:"current_value"`
	AlcoholLevel     *float32   `json:"alcohol_level"`
	Consumed         int        `json:"consumed"`
	ConsumptionDate  *time.Time `json:"consumption_date,omitempty"`
	BarCode          string     `json:"bar_code"`
	Image            string     `json:"image"`
	ExternalID       string     `json:"external_id"`
}

// Bottle type constants - Support 7 types of beverages
const (
	BottleTypeRedWine      = "red_wine"
	BottleTypeWhiteWine    = "white_wine"
	BottleTypeRoseWine     = "rose_wine"
	BottleTypeSparklingWine = "sparkling_wine"
	BottleTypeBeer         = "beer"
	BottleTypeSpirit       = "spirit"
	BottleTypeCigar        = "cigar"
)

// BottleTypes returns all supported bottle types
func BottleTypes() []string {
	return []string{
		BottleTypeRedWine,
		BottleTypeWhiteWine,
		BottleTypeRoseWine,
		BottleTypeSparklingWine,
		BottleTypeBeer,
		BottleTypeSpirit,
		BottleTypeCigar,
	}
}
