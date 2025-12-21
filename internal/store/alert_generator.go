package store

import (
	"context"
	"log"
	"sync"
	"time"
)

// AlertGenerator handles automatic alert generation
type AlertGenerator struct {
	store    *Store
	ticker   *time.Ticker
	stopChan chan struct{}
	done     chan struct{}
	mu       sync.Mutex
}

// NewAlertGenerator creates a new AlertGenerator
func NewAlertGenerator(store *Store) *AlertGenerator {
	return &AlertGenerator{
		store:    store,
		stopChan: make(chan struct{}),
	}
}

// Start begins the automatic alert generation process
// interval: how often to check and generate alerts (e.g., 1*time.Hour)
func (ag *AlertGenerator) Start(interval time.Duration) {
	ag.mu.Lock()
	ag.ticker = time.NewTicker(interval)
	ag.done = make(chan struct{})
	ag.mu.Unlock()

	go func() {
		defer close(ag.done)

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
	ag.mu.Lock()
	if ag.ticker != nil {
		ag.ticker.Stop()
		ag.ticker = nil
	}
	ag.mu.Unlock()

	close(ag.stopChan)

	// Wait for goroutine to finish
	if ag.done != nil {
		<-ag.done
	}
}
