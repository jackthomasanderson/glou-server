package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

// SetupRequest représente la requête de configuration initiale
type SetupRequest struct {
	// Admin user
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`

	// Branding
	AppTitle   string `json:"app_title"`
	AppSlogan  string `json:"app_slogan"`
	LogoURL    string `json:"logo_url"`
	FaviconURL string `json:"favicon_url"`

	// Colors
	ThemeColor     string `json:"theme_color"`
	SecondaryColor string `json:"secondary_color"`
	AccentColor    string `json:"accent_color"`

	// Network
	PublicDomain   string `json:"public_domain"`
	PublicProtocol string `json:"public_protocol"`
	ProxyMode      bool   `json:"proxy_mode"`

	// Notifications (optionnel)
	GotifyURL    string `json:"gotify_url"`
	GotifyToken  string `json:"gotify_token"`
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     int    `json:"smtp_port"`
	SMTPUsername string `json:"smtp_username"`
	SMTPPassword string `json:"smtp_password"`
	SMTPFrom     string `json:"smtp_from"`
	SMTPTo       string `json:"smtp_to"`
	SMTPUseTLS   bool   `json:"smtp_use_tls"`

	// Other settings
	Language string `json:"language"`
}

// handleCheckSetup vérifie si le setup est déjà complété
func (s *Server) handleCheckSetup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Vérifier si le setup est déjà complété
	isComplete, err := s.store.IsSetupComplete(ctx)
	if err != nil {
		http.Error(w, "Failed to check setup status", http.StatusInternalServerError)
		return
	}

	// Vérifier si un admin existe
	hasAdmin, err := s.store.HasAdminUser(ctx)
	if err != nil {
		http.Error(w, "Failed to check admin user", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"setup_complete": isComplete,
		"has_admin":      hasAdmin,
		"needs_setup":    !isComplete || !hasAdmin,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleCheckSMTPConfig vérifie si SMTP est configuré
func (s *Server) handleCheckSMTPConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Récupérer les paramètres
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		http.Error(w, "Failed to get settings", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"smtp_configured": settings.SMTPConfigured,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSetupWizard affiche la page du wizard
func (s *Server) handleSetupWizard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Vérifier si le setup est déjà complété
	isComplete, err := s.store.IsSetupComplete(ctx)
	if err != nil {
		http.Error(w, "Failed to check setup status", http.StatusInternalServerError)
		return
	}

	if isComplete {
		// Rediriger vers la page principale
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}

	// Servir la page du wizard
	http.ServeFile(w, r, "assets/setup.html")
}

// handleCompleteSetup traite la soumission du wizard de configuration
func (s *Server) handleCompleteSetup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Vérifier si le setup est déjà complété
	isComplete, err := s.store.IsSetupComplete(ctx)
	if err != nil {
		http.Error(w, "Failed to check setup status", http.StatusInternalServerError)
		return
	}

	if isComplete {
		http.Error(w, "Setup already completed", http.StatusBadRequest)
		return
	}

	// Décoder la requête
	var req SetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Valider les champs obligatoires
	if err := validateSetupRequest(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Créer l'utilisateur admin
	_, err = s.store.CreateUser(ctx, req.Username, req.Email, req.Password, "admin")
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create admin user: %v", err), http.StatusInternalServerError)
		return
	}

	// Mettre à jour les paramètres
	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		http.Error(w, "Failed to get settings", http.StatusInternalServerError)
		return
	}

	// Appliquer les paramètres du wizard
	if req.AppTitle != "" {
		settings.AppTitle = req.AppTitle
	}
	if req.AppSlogan != "" {
		settings.AppSlogan = req.AppSlogan
	}
	if req.LogoURL != "" {
		settings.LogoURL = req.LogoURL
	}
	if req.FaviconURL != "" {
		settings.FaviconURL = req.FaviconURL
	}
	if req.ThemeColor != "" {
		settings.ThemeColor = req.ThemeColor
	}
	if req.SecondaryColor != "" {
		settings.SecondaryColor = req.SecondaryColor
	}
	if req.AccentColor != "" {
		settings.AccentColor = req.AccentColor
	}
	if req.PublicDomain != "" {
		settings.PublicDomain = req.PublicDomain
	}
	if req.PublicProtocol != "" {
		settings.PublicProtocol = req.PublicProtocol
	}
	settings.ProxyMode = req.ProxyMode
	if req.Language != "" {
		settings.Language = req.Language
	}

	// Sauvegarder les paramètres
	if err := s.store.UpdateSettings(ctx, settings); err != nil {
		http.Error(w, "Failed to update settings", http.StatusInternalServerError)
		return
	}

	// Sauvegarder les paramètres de notifications dans les variables d'environnement
	// (pour l'instant, on les enregistre dans un fichier .env.notifications)
	smtpConfigured := false
	if req.GotifyURL != "" || req.SMTPHost != "" {
		if err := saveNotificationSettings(&req); err != nil {
			// Ne pas bloquer le setup si la sauvegarde des notifications échoue
			fmt.Printf("Warning: Failed to save notification settings: %v\n", err)
		}
		// Marquer SMTP comme configuré si les paramètres sont fournis
		if req.SMTPHost != "" && req.SMTPFrom != "" {
			smtpConfigured = true
		}
	}

	// Mettre à jour le flag SMTP configuré dans les settings
	settings.SMTPConfigured = smtpConfigured
	if err := s.store.UpdateSettings(ctx, settings); err != nil {
		fmt.Printf("Warning: Failed to update SMTP configured flag: %v\n", err)
	}

	// Marquer le setup comme complété
	if err := s.store.MarkSetupComplete(ctx); err != nil {
		http.Error(w, "Failed to mark setup complete", http.StatusInternalServerError)
		return
	}

	// Retourner une réponse de succès
	response := map[string]interface{}{
		"status":  "success",
		"message": "Setup completed successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// validateSetupRequest valide les données de la requête de setup
func validateSetupRequest(req *SetupRequest) error {
	// Validation de l'utilisateur
	if req.Username == "" {
		return fmt.Errorf("username is required")
	}
	if len(req.Username) < 3 {
		return fmt.Errorf("username must be at least 3 characters")
	}
	if req.Email == "" {
		return fmt.Errorf("email is required")
	}
	if !strings.Contains(req.Email, "@") {
		return fmt.Errorf("invalid email format")
	}
	if req.Password == "" {
		return fmt.Errorf("password is required")
	}

	// Validation des couleurs du thème
	if req.ThemeColor != "" && !isValidHexColor(req.ThemeColor) {
		return fmt.Errorf("invalid theme color format")
	}
	if req.SecondaryColor != "" && !isValidHexColor(req.SecondaryColor) {
		return fmt.Errorf("invalid secondary color format")
	}
	if req.AccentColor != "" && !isValidHexColor(req.AccentColor) {
		return fmt.Errorf("invalid accent color format")
	}

	// Validation du protocole
	if req.PublicProtocol != "" && req.PublicProtocol != "http" && req.PublicProtocol != "https" {
		return fmt.Errorf("public protocol must be http or https")
	}

	// Validation de la langue
	if req.Language != "" && req.Language != "en" && req.Language != "fr" {
		return fmt.Errorf("language must be en or fr")
	}

	return nil
}

// isValidHexColor vérifie si une chaîne est une couleur hexadécimale valide
func isValidHexColor(color string) bool {
	if len(color) != 7 || color[0] != '#' {
		return false
	}
	for i := 1; i < len(color); i++ {
		c := color[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// checkPasswordStrength évalue la force du mot de passe et retourne un score
// 0 = très faible, 1 = faible, 2 = moyen, 3 = fort, 4 = très fort
func checkPasswordStrength(password string) int {
	score := 0

	// Longueur
	if len(password) >= 8 {
		score++
	}
	if len(password) >= 12 {
		score++
	}

	// Types de caractères
	var hasLower, hasUpper, hasDigit, hasSpecial bool
	for _, char := range password {
		switch {
		case char >= 'a' && char <= 'z':
			hasLower = true
		case char >= 'A' && char <= 'Z':
			hasUpper = true
		case char >= '0' && char <= '9':
			hasDigit = true
		case strings.ContainsRune("!@#$%^&*()_+-=[]{}|;:',.<>?/~`\\\"", char):
			hasSpecial = true
		}
	}

	typeCount := 0
	if hasLower {
		typeCount++
	}
	if hasUpper {
		typeCount++
	}
	if hasDigit {
		typeCount++
	}
	if hasSpecial {
		typeCount++
	}

	if typeCount >= 2 {
		score++
	}
	if typeCount >= 3 {
		score++
	}

	return score
}

// saveNotificationSettings sauvegarde les paramètres de notifications dans un fichier
func saveNotificationSettings(req *SetupRequest) error {
	content := "# Configuration des notifications - Générée par le wizard de configuration\n"
	content += "# Pour appliquer ces paramètres, définissez ces variables d'environnement ou utilisez ce fichier avec votre système de déploiement\n\n"

	if req.GotifyURL != "" {
		content += "# Gotify\n"
		content += fmt.Sprintf("GOTIFY_URL=%s\n", req.GotifyURL)
		if req.GotifyToken != "" {
			content += fmt.Sprintf("GOTIFY_TOKEN=%s\n", req.GotifyToken)
		}
		content += "\n"
	}

	if req.SMTPHost != "" {
		content += "# SMTP\n"
		content += fmt.Sprintf("SMTP_HOST=%s\n", req.SMTPHost)
		content += fmt.Sprintf("SMTP_PORT=%d\n", req.SMTPPort)
		if req.SMTPUsername != "" {
			content += fmt.Sprintf("SMTP_USERNAME=%s\n", req.SMTPUsername)
		}
		if req.SMTPPassword != "" {
			content += fmt.Sprintf("SMTP_PASSWORD=%s\n", req.SMTPPassword)
		}
		if req.SMTPFrom != "" {
			content += fmt.Sprintf("SMTP_FROM=%s\n", req.SMTPFrom)
		}
		if req.SMTPTo != "" {
			content += fmt.Sprintf("SMTP_TO=%s\n", req.SMTPTo)
		}
		content += fmt.Sprintf("SMTP_USE_TLS=%t\n", req.SMTPUseTLS)
	}

	// Écrire dans un fichier .env.notifications
	return os.WriteFile(".env.notifications", []byte(content), 0600)
}
