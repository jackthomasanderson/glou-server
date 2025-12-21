package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

// EncryptionService gère le chiffrement/déchiffrement conforme ANSSI
// Suit les recommandations ANSSI :
// - AES-256-GCM (algorithme recommandé)
// - Nonce aléatoire par opération
// - PBKDF2 pour la dérivation de clé (100 000 itérations minimum)
type EncryptionService struct {
	masterKey []byte
}

// NewEncryptionService crée un nouveau service de chiffrement
// Recommandation ANSSI : utiliser une clé de 256 bits minimum
func NewEncryptionService(passphrase, salt string) (*EncryptionService, error) {
	if len(passphrase) < 32 {
		return nil, fmt.Errorf("passphrase must be at least 32 characters (ANSSI requirement)")
	}

	// Dériver une clé de 256 bits depuis la passphrase
	// Recommandation ANSSI : PBKDF2 avec au moins 100 000 itérations
	key := pbkdf2.Key([]byte(passphrase), []byte(salt), 100000, 32, sha256.New)

	return &EncryptionService{
		masterKey: key,
	}, nil
}

// Encrypt chiffre les données en utilisant AES-256-GCM
// Retourne les données chiffrées encodées en base64
// Recommandation ANSSI : AES-GCM pour confidentialité + authentification
func (es *EncryptionService) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}

	// Créer un bloc AES
	block, err := aes.NewCipher(es.masterKey)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Créer le mode GCM (Galois/Counter Mode)
	// GCM assure à la fois la confidentialité et l'authentification
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Générer un nonce aléatoire
	// Recommandation ANSSI : nonce unique par opération de chiffrement
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Chiffrer et authentifier les données
	// Le nonce est préfixé aux données chiffrées
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	// Encoder en base64 pour stockage en base de données
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt déchiffre les données chiffrées avec AES-256-GCM
func (es *EncryptionService) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}

	// Décoder depuis base64
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Créer un bloc AES
	block, err := aes.NewCipher(es.masterKey)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Créer le mode GCM
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Extraire le nonce
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]

	// Déchiffrer et vérifier l'authenticité
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

// GenerateSecureKey génère une clé aléatoire sécurisée
// Recommandation ANSSI : au moins 256 bits d'entropie
func GenerateSecureKey() (string, error) {
	// Générer 32 octets (256 bits) aléatoires
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}

	return base64.StdEncoding.EncodeToString(key), nil
}

// HashPassword hache un mot de passe de manière sécurisée
// Utilise SHA-256 avec salt (déjà géré par bcrypt dans users.go)
// Cette fonction est pour les besoins additionnels
func HashPassword(password, salt string) string {
	h := sha256.New()
	h.Write([]byte(password + salt))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}
