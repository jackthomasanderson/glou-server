package notifier

import (
	"context"
	"fmt"
)

// Notifier interface for sending notifications
type Notifier interface {
	Send(ctx context.Context, title, message string) error
}

// Notification represents a notification to send
type Notification struct {
	Title   string
	Message string
	WineID  int64
	Type    string // "apogee_ready", "apogee_passed", "low_stock"
}

// NotifierManager manages multiple notification channels
type NotifierManager struct {
	notifiers []Notifier
}

// NewNotifierManager creates a new notification manager
func NewNotifierManager() *NotifierManager {
	return &NotifierManager{
		notifiers: make([]Notifier, 0),
	}
}

// AddNotifier adds a notification channel
func (nm *NotifierManager) AddNotifier(n Notifier) {
	nm.notifiers = append(nm.notifiers, n)
}

// SendAll sends notification to all configured channels
func (nm *NotifierManager) SendAll(ctx context.Context, notification *Notification) error {
	if len(nm.notifiers) == 0 {
		return fmt.Errorf("no notifiers configured")
	}

	var lastErr error
	for _, n := range nm.notifiers {
		if err := n.Send(ctx, notification.Title, notification.Message); err != nil {
			// Log error but continue sending to other channels
			lastErr = err
			fmt.Printf("notification error: %v\n", err)
		}
	}

	return lastErr
}

// SendToType sends to a specific notifier type
func (nm *NotifierManager) SendToType(ctx context.Context, notifierType string, notification *Notification) error {
	for _, n := range nm.notifiers {
		if tn, ok := n.(TypedNotifier); ok {
			if tn.Type() == notifierType {
				return n.Send(ctx, notification.Title, notification.Message)
			}
		}
	}
	return fmt.Errorf("notifier type %s not found", notifierType)
}

// TypedNotifier interface for notifiers with type identification
type TypedNotifier interface {
	Notifier
	Type() string
}
