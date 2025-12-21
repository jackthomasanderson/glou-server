package store

import (
	"context"
	"log"
	"time"
)

// AlertGenerator handles automatic alert generation
type AlertGenerator struct {
	store    *Store
	ticker   *time.Ticker
	stopChan chan bool
}

// NewAlertGenerator creates a new AlertGenerator
func NewAlertGenerator(store *Store) *AlertGenerator {
	return &AlertGenerator{
		store:    store,
		stopChan: make(chan bool),
	}
}

// Start begins the automatic alert generation process
// interval: how often to check and generate alerts (e.g., 1*time.Hour)
func (ag *AlertGenerator) Start(interval time.Duration) {
	ag.ticker = time.NewTicker(interval)

	go func() {
		// Run immediately on start
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		err := ag.store.GenerateAlerts(ctx)
		cancel()
		if err != nil {
			log.Printf("Error generating alerts on start: %v", err)
		}

		// Then run periodically
		for {
			select {
			case <-ag.ticker.C:
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				err := ag.store.GenerateAlerts(ctx)
				cancel()
				if err != nil {
					log.Printf("Error generating alerts: %v", err)
				} else {
					log.Println("Alerts generated successfully")
				}
			case <-ag.stopChan:
				return
			}
		}
	}()
}

// Stop stops the automatic alert generation
func (ag *AlertGenerator) Stop() {
	if ag.ticker != nil {
		ag.ticker.Stop()
	}
	ag.stopChan <- true
}
