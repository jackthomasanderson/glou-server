package notifier

import (
	"context"
	"fmt"
	"net/smtp"
	"time"
)

// SMTPNotifier sends notifications via email (SMTP)
type SMTPNotifier struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	To       string
	UseTLS   bool
}

// NewSMTPNotifier creates a new SMTP notifier
func NewSMTPNotifier(host string, port int, username, password, from, to string, useTLS bool) *SMTPNotifier {
	return &SMTPNotifier{
		Host:     host,
		Port:     port,
		Username: username,
		Password: password,
		From:     from,
		To:       to,
		UseTLS:   useTLS,
	}
}

// Type returns the notifier type
func (s *SMTPNotifier) Type() string {
	return "smtp"
}

// Send sends a notification via SMTP (email)
func (s *SMTPNotifier) Send(ctx context.Context, title, message string) error {
	if s.Host == "" || s.From == "" || s.To == "" {
		return fmt.Errorf("smtp not configured: missing host, from, or to")
	}

	// Create message
	headers := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: [Glou] %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n",
		s.From, s.To, title)

	body := fmt.Sprintf("%s\r\n\r\n%s\r\n\r\nGlou Wine Management System", title, message)

	message = headers + body

	// SMTP address
	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Dial with timeout
	done := make(chan error)
	go func() {
		auth := smtp.PlainAuth("", s.Username, s.Password, s.Host)
		done <- smtp.SendMail(addr, auth, s.From, []string{s.To}, []byte(message))
	}()

	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("failed to send smtp email: %w", err)
		}
		return nil
	case <-ctx.Done():
		return fmt.Errorf("smtp email send timeout")
	}
}

// SendTo sends a notification to a specific recipient, overriding default To
func (s *SMTPNotifier) SendTo(ctx context.Context, to string, title, message string) error {
	if s.Host == "" || s.From == "" || to == "" {
		return fmt.Errorf("smtp not configured: missing host, from, or to")
	}

	headers := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: [Glou] %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n",
		s.From, to, title)
	body := fmt.Sprintf("%s\r\n\r\n%s\r\n\r\nGlou Wine Management System", title, message)
	msg := headers + body

	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	done := make(chan error)
	go func() {
		auth := smtp.PlainAuth("", s.Username, s.Password, s.Host)
		done <- smtp.SendMail(addr, auth, s.From, []string{to}, []byte(msg))
	}()

	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("failed to send smtp email: %w", err)
		}
		return nil
	case <-ctx.Done():
		return fmt.Errorf("smtp email send timeout")
	}
}
