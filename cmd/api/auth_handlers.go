package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/romain/glou-server/internal/notifier"
)

// LoginRequest représente une requête de connexion
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// RegisterRequest représente une requête d'inscription
type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// ForgotPasswordRequest représente une requête de mot de passe oublié
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ResetPasswordRequest représente une requête de réinitialisation de mot de passe
type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

// handleLogin gère la connexion utilisateur
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Valider les champs
	if req.Username == "" || req.Password == "" {
		s.respondError(w, http.StatusBadRequest, "Username and password are required", nil)
		return
	}

	// Vérifier les credentials
	valid, err := s.store.VerifyPassword(ctx, req.Username, req.Password)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to verify credentials", err)
		return
	}

	if !valid {
		s.respondError(w, http.StatusUnauthorized, "Invalid credentials", nil)
		return
	}

	// Récupérer l'utilisateur
	user, err := s.store.GetUserByUsername(ctx, req.Username)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to get user", err)
		return
	}

	if user == nil || !user.IsActive {
		s.respondError(w, http.StatusUnauthorized, "User not found or inactive", nil)
		return
	}

	// Créer une session
	s.setSession(w, user.ID, user.Username, user.Role)

	// Retourner les informations utilisateur
	response := map[string]interface{}{
		"status": "success",
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"role":     user.Role,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleRegister gère l'inscription d'un nouvel utilisateur
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Vérifier si l'inscription est activée
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to get settings", err)
		return
	}

	if !settings.AllowRegistration {
		s.respondError(w, http.StatusForbidden, "Registration is disabled", nil)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Valider les champs
	if err := validateRegistration(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	// Vérifier si le username existe déjà
	existingUser, err := s.store.GetUserByUsername(ctx, req.Username)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check username", err)
		return
	}
	if existingUser != nil {
		s.respondError(w, http.StatusConflict, "Username already exists", nil)
		return
	}

	// Vérifier si l'email existe déjà
	existingEmail, err := s.store.GetUserByEmail(ctx, req.Email)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check email", err)
		return
	}
	if existingEmail != nil {
		s.respondError(w, http.StatusConflict, "Email already exists", nil)
		return
	}

	// Créer l'utilisateur (role = "user" par défaut)
	userID, err := s.store.CreateUser(ctx, req.Username, req.Email, req.Password, "user")
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to create user", err)
		return
	}

	// Log l'activité
	s.store.LogActivity(ctx, "user", userID, "registered", fmt.Sprintf("New user registered: %s", req.Username), getClientIP(r))

	response := map[string]interface{}{
		"status":  "success",
		"message": "Registration successful. You can now log in.",
		"user_id": userID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// handleForgotPassword gère la demande de réinitialisation de mot de passe
func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Valider l'email
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		s.respondError(w, http.StatusBadRequest, "Valid email is required", nil)
		return
	}

	// Vérifier si SMTP est configuré
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to get settings", err)
		return
	}

	if !settings.SMTPConfigured {
		s.respondError(w, http.StatusServiceUnavailable, "Email service is not configured", nil)
		return
	}

	// Récupérer l'utilisateur par email
	user, err := s.store.GetUserByEmail(ctx, req.Email)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to check user", err)
		return
	}

	// Toujours retourner success pour éviter l'énumération des emails
	// mais n'envoyer l'email que si l'utilisateur existe
	if user != nil && user.IsActive {
		// Générer un token sécurisé
		token, err := generateSecureToken(32)
		if err != nil {
			s.respondError(w, http.StatusInternalServerError, "Failed to generate token", err)
			return
		}

		// Créer le token dans la base (expire dans 1 heure)
		expiresAt := time.Now().Add(1 * time.Hour)
		if err := s.store.CreatePasswordResetToken(ctx, user.ID, token, expiresAt); err != nil {
			s.respondError(w, http.StatusInternalServerError, "Failed to create reset token", err)
			return
		}

		// Envoyer l'email de réinitialisation
		if err := s.sendPasswordResetEmail(ctx, user.Email, token); err != nil {
			s.respondError(w, http.StatusInternalServerError, "Failed to send email", err)
			return
		}

		// Log l'activité
		s.store.LogActivity(ctx, "user", user.ID, "password_reset_requested", "Password reset requested", getClientIP(r))
	}

	// Toujours retourner un message de succès
	response := map[string]interface{}{
		"status":  "success",
		"message": "If the email exists, a password reset link has been sent.",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleResetPassword gère la réinitialisation du mot de passe
func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Valider les champs
	if req.Token == "" {
		s.respondError(w, http.StatusBadRequest, "Token is required", nil)
		return
	}

	if err := validatePassword(req.NewPassword); err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	// Récupérer le token
	resetToken, err := s.store.GetPasswordResetToken(ctx, req.Token)
	if err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to get token", err)
		return
	}

	if resetToken == nil {
		s.respondError(w, http.StatusBadRequest, "Invalid or expired token", nil)
		return
	}

	// Vérifier si le token est expiré ou déjà utilisé
	if resetToken.Used || time.Now().After(resetToken.ExpiresAt) {
		s.respondError(w, http.StatusBadRequest, "Invalid or expired token", nil)
		return
	}

	// Mettre à jour le mot de passe
	if err := s.store.UpdateUserPassword(ctx, resetToken.UserID, req.NewPassword); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to update password", err)
		return
	}

	// Marquer le token comme utilisé
	if err := s.store.MarkPasswordResetTokenUsed(ctx, resetToken.ID); err != nil {
		s.respondError(w, http.StatusInternalServerError, "Failed to mark token as used", err)
		return
	}

	// Log l'activité
	s.store.LogActivity(ctx, "user", resetToken.UserID, "password_reset", "Password successfully reset", getClientIP(r))

	response := map[string]interface{}{
		"status":  "success",
		"message": "Password successfully reset. You can now log in with your new password.",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleCheckAuthStatus vérifie si l'utilisateur est authentifié
func (s *Server) handleCheckAuthStatus(w http.ResponseWriter, r *http.Request) {
	// Vérifier si un cookie de session existe
	cookie, err := r.Cookie("glou_session")
	authenticated := err == nil && cookie.Value != ""

	response := map[string]interface{}{
		"authenticated": authenticated,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleLogout déconnecte l'utilisateur
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSession(w)

	response := map[string]interface{}{
		"status":  "success",
		"message": "Logged out successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// validateRegistration valide les données d'inscription
func validateRegistration(req *RegisterRequest) error {
	if req.Username == "" {
		return fmt.Errorf("username is required")
	}

	if len(req.Username) < 3 || len(req.Username) > 50 {
		return fmt.Errorf("username must be between 3 and 50 characters")
	}

	if req.Email == "" {
		return fmt.Errorf("email is required")
	}

	if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
		return fmt.Errorf("invalid email format")
	}

	return validatePassword(req.Password)
}

// validatePassword valide un mot de passe
func validatePassword(password string) error {
	if password == "" {
		return fmt.Errorf("password is required")
	}

	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
	}

	// Vérifier la complexité du mot de passe
	hasUpper := false
	hasLower := false
	hasDigit := false

	for _, char := range password {
		switch {
		case char >= 'A' && char <= 'Z':
			hasUpper = true
		case char >= 'a' && char <= 'z':
			hasLower = true
		case char >= '0' && char <= '9':
			hasDigit = true
		}
	}

	if !hasUpper || !hasLower || !hasDigit {
		return fmt.Errorf("password must contain at least one uppercase letter, one lowercase letter, and one digit")
	}

	return nil
}

// generateSecureToken génère un token sécurisé
func generateSecureToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// sendPasswordResetEmail envoie un email de réinitialisation de mot de passe
func (s *Server) sendPasswordResetEmail(ctx context.Context, email, token string) error {
	// Récupérer les paramètres
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		return fmt.Errorf("failed to get settings: %w", err)
	}

	// Construire l'URL de réinitialisation
	protocol := settings.PublicProtocol
	if protocol == "" {
		protocol = "http"
	}

	domain := settings.PublicDomain
	if domain == "" {
		domain = "localhost:8080"
	}

	resetURL := fmt.Sprintf("%s://%s/reset-password?token=%s", protocol, domain, token)

	// Préparer le message
	subject := "Réinitialisation de votre mot de passe Glou"
	message := fmt.Sprintf(`
Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe.

Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :
%s

Ce lien est valable pendant 1 heure.

Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email.

Cordialement,
L'équipe Glou
`, resetURL)

	// Envoyer via le service de notification SMTP au destinataire spécifique
	if s.notifierManager != nil {
		notification := &notifier.Notification{
			Title:   subject,
			Message: message,
			Type:    "password_reset",
		}
		return s.notifierManager.SendToSMTPAddress(ctx, email, notification)
	}

	return fmt.Errorf("notification service not configured")
}
