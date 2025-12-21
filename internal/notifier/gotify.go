package notifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// GotifyNotifier sends notifications via Gotify
type GotifyNotifier struct {
	URL    string // Base URL (e.g., "http://localhost:80")
	Token  string // App token
	client *http.Client
}

// NewGotifyNotifier creates a new Gotify notifier
func NewGotifyNotifier(url, token string) *GotifyNotifier {
	return &GotifyNotifier{
		URL:   url,
		Token: token,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Type returns the notifier type
func (g *GotifyNotifier) Type() string {
	return "gotify"
}

// Send sends a notification via Gotify
func (g *GotifyNotifier) Send(ctx context.Context, title, message string) error {
	if g.URL == "" || g.Token == "" {
		return fmt.Errorf("gotify not configured: missing URL or token")
	}

	payload := map[string]interface{}{
		"title":    title,
		"message":  message,
		"priority": 5,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal gotify payload: %w", err)
	}

	endpoint := fmt.Sprintf("%s/message?token=%s", g.URL, g.Token)
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create gotify request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send gotify notification: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("gotify returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}
