package enricher

import (
	"context"
	"fmt"
)

// searchOpenFoodFacts searches Open Food Facts API
// Supports barcode lookup and free text search
func (we *WineEnricher) searchOpenFoodFacts(ctx context.Context, query string) (*EnrichedWineData, error) {
	// API endpoint: https://world.openfoodfacts.org/api/v0/product/[barcode].json
	// or search: https://world.openfoodfacts.org/cgi/search.pl?search_terms=[query]&json=1

	var endpoint string

	// If query looks like a barcode (12-14 digits), use barcode endpoint
	if len(query) >= 12 && len(query) <= 14 {
		endpoint = fmt.Sprintf("https://world.openfoodfacts.org/api/v0/product/%s.json", query)
	} else {
		// Use search endpoint for text query
		endpoint = fmt.Sprintf("https://world.openfoodfacts.org/cgi/search.pl?search_terms=%s&json=1&page_size=1", urlEncode(query))
	}

	body, err := we.makeRequest(ctx, "GET", endpoint, map[string]string{
		"User-Agent": "Glou-WineManager/1.0",
	})
	if err != nil {
		return nil, err
	}

	// Parse barcode response
	if len(query) >= 12 && len(query) <= 14 {
		return we.parseOFFBarcode(body)
	}

	// Parse search response
	return we.parseOFFSearch(body)
}

// parseOFFBarcode parses Open Food Facts barcode response
func (we *WineEnricher) parseOFFBarcode(body []byte) (*EnrichedWineData, error) {
	var resp struct {
		Product struct {
			Name           string  `json:"product_name"`
			Brands         string  `json:"brands"`
			Categories     string  `json:"categories"`
			AlcoholContent float64 `json:"alcohol"`
			ImageURL       string  `json:"image_front_url"`
			Quantity       string  `json:"quantity"`
		} `json:"product"`
		Status int `json:"status"`
	}

	if err := unmarshalJSON(body, &resp); err != nil {
		return nil, err
	}

	if resp.Status != 1 {
		return nil, fmt.Errorf("product not found")
	}

	data := &EnrichedWineData{
		Name:         resp.Product.Name,
		Producer:     resp.Product.Brands,
		AlcoholLevel: float32(resp.Product.AlcoholContent),
		ImageURL:     resp.Product.ImageURL,
	}

	// Try to determine type from categories
	if resp.Product.Categories != "" {
		data.Type = resp.Product.Categories
	}

	return data, nil
}

// parseOFFSearch parses Open Food Facts search response
func (we *WineEnricher) parseOFFSearch(body []byte) (*EnrichedWineData, error) {
	var resp struct {
		Products []struct {
			Name           string  `json:"product_name"`
			Brands         string  `json:"brands"`
			Categories     string  `json:"categories"`
			AlcoholContent float64 `json:"alcohol"`
			ImageURL       string  `json:"image_front_url"`
		} `json:"products"`
	}

	if err := unmarshalJSON(body, &resp); err != nil {
		return nil, err
	}

	if len(resp.Products) == 0 {
		return nil, fmt.Errorf("no results found")
	}

	product := resp.Products[0]
	data := &EnrichedWineData{
		Name:         product.Name,
		Producer:     product.Brands,
		AlcoholLevel: float32(product.AlcoholContent),
		ImageURL:     product.ImageURL,
		Type:         product.Categories,
	}

	return data, nil
}

// searchSnooth searches Snooth API for wine information
// Free tier allows limited searches
func (we *WineEnricher) searchSnooth(ctx context.Context, name, producer, vintage string) (*EnrichedWineData, error) {
	// Snooth API: http://api.snooth.com/
	// Note: Requires API key, adjust if you have one

	endpoint := fmt.Sprintf("http://api.snooth.com/?q=%s&type=wines&format=json", urlEncode(name))
	if producer != "" {
		endpoint += "&producer=" + urlEncode(producer)
	}

	body, err := we.makeRequest(ctx, "GET", endpoint, map[string]string{
		"User-Agent": "Glou-WineManager/1.0",
	})
	if err != nil {
		return nil, err
	}

	return we.parseSnoothResponse(body)
}

// parseSnoothResponse parses Snooth API response
func (we *WineEnricher) parseSnoothResponse(body []byte) (*EnrichedWineData, error) {
	var resp struct {
		Results []struct {
			Name        string  `json:"name"`
			Winery      string  `json:"winery"`
			Region      string  `json:"region"`
			Vintage     int     `json:"vintage"`
			Rating      float64 `json:"rating"`
			Price       float64 `json:"price"`
			LowestURL   string  `json:"lowest_url"`
			LowestPrice float64 `json:"lowest_price"`
		} `json:"results"`
	}

	if err := unmarshalJSON(body, &resp); err != nil {
		return nil, err
	}

	if len(resp.Results) == 0 {
		return nil, fmt.Errorf("no results")
	}

	wine := resp.Results[0]
	data := &EnrichedWineData{
		Name:     wine.Name,
		Producer: wine.Winery,
		Region:   wine.Region,
		Vintage:  wine.Vintage,
		Rating:   float32(wine.Rating),
		Price:    float32(wine.Price),
	}

	return data, nil
}

// searchGlobalWineScore searches for wine ratings
func (we *WineEnricher) searchGlobalWineScore(ctx context.Context, name, producer, vintage string) (*EnrichedWineData, error) {
	// Global Wine Score: https://www.globalwinescore.com/
	// Note: Check their API documentation for exact endpoint

	// Simplified search URL
	query := fmt.Sprintf("%s %s", name, producer)
	endpoint := fmt.Sprintf("https://www.globalwinescore.com/api/search/?q=%s", urlEncode(query))

	body, err := we.makeRequest(ctx, "GET", endpoint, map[string]string{
		"User-Agent": "Glou-WineManager/1.0",
	})
	if err != nil {
		return nil, err
	}

	var resp struct {
		Wines []struct {
			Name     string  `json:"name"`
			Score    float64 `json:"score"`
			Producer string  `json:"producer"`
		} `json:"wines"`
	}

	if err := unmarshalJSON(body, &resp); err != nil {
		return nil, err
	}

	if len(resp.Wines) == 0 {
		return nil, fmt.Errorf("no wines found")
	}

	wine := resp.Wines[0]
	data := &EnrichedWineData{
		Name:     wine.Name,
		Producer: wine.Producer,
		Rating:   float32(wine.Score),
	}

	return data, nil
}

// searchTheCocktailDB searches for spirits and cocktails
func (we *WineEnricher) searchTheCocktailDB(ctx context.Context, name string) (*EnrichedWineData, error) {
	// TheCocktailDB: https://www.thecocktaildb.com/api.php
	// Search by ingredient or drink name

	endpoint := fmt.Sprintf("https://www.thecocktaildb.com/api/json/v1/1/search.php?s=%s", urlEncode(name))

	body, err := we.makeRequest(ctx, "GET", endpoint, map[string]string{
		"User-Agent": "Glou-WineManager/1.0",
	})
	if err != nil {
		return nil, err
	}

	var resp struct {
		Drinks []struct {
			Name        string `json:"strDrink"`
			Type        string `json:"strType"`
			Category    string `json:"strCategory"`
			Alcoholic   string `json:"strAlcoholic"`
			ImageURL    string `json:"strDrinkThumb"`
			Ingredients []struct {
				Ingredient string `json:"strIngredient1"`
				Measure    string `json:"strMeasure1"`
			} `json:"ingredients"`
		} `json:"drinks"`
	}

	if err := unmarshalJSON(body, &resp); err != nil {
		return nil, err
	}

	if len(resp.Drinks) == 0 {
		return nil, fmt.Errorf("spirit not found")
	}

	drink := resp.Drinks[0]
	data := &EnrichedWineData{
		Name:        drink.Name,
		Type:        drink.Category,
		ImageURL:    drink.ImageURL,
		Description: fmt.Sprintf("Category: %s, Alcoholic: %s", drink.Type, drink.Alcoholic),
	}

	return data, nil
}

// searchUntappd searches Untappd API for beer information
// Note: Requires API key - adjust implementation if you have access
func (we *WineEnricher) searchUntappd(ctx context.Context, name string, apiKey string) (*EnrichedWineData, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("untappd API key not configured")
	}

	endpoint := fmt.Sprintf("https://api.untappd.com/v4/search/beer?q=%s&client_id=%s", urlEncode(name), apiKey)

	body, err := we.makeRequest(ctx, "GET", endpoint, map[string]string{
		"User-Agent": "Glou-WineManager/1.0",
	})
	if err != nil {
		return nil, err
	}

	var resp struct {
		Response struct {
			Beers struct {
				Items []struct {
					Beer struct {
						Name        string  `json:"beer_name"`
						AbV         float64 `json:"beer_abv"`
						IBU         float64 `json:"beer_ibu"`
						Description string  `json:"beer_description"`
						Label       string  `json:"beer_label"`
					} `json:"beer"`
					Brewery struct {
						Name string `json:"brewery_name"`
					} `json:"brewery"`
				} `json:"items"`
			} `json:"beers"`
		} `json:"response"`
	}

	if err := unmarshalJSON(body, &resp); err != nil {
		return nil, err
	}

	items := resp.Response.Beers.Items
	if len(items) == 0 {
		return nil, fmt.Errorf("beer not found")
	}

	beer := items[0]
	data := &EnrichedWineData{
		Name:         beer.Beer.Name,
		Producer:     beer.Brewery.Name,
		Type:         "Beer",
		AlcoholLevel: float32(beer.Beer.AbV),
		Description:  fmt.Sprintf("IBU: %.1f - %s", beer.Beer.IBU, beer.Beer.Description),
		ImageURL:     beer.Beer.Label,
	}

	return data, nil
}
