package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

func parseAndVerifyKey(key string, publicKey ed25519.PublicKey) (Claims, error) {
	key = strings.TrimSpace(key)
	parts := strings.Split(key, ".")
	if len(parts) != 3 || parts[0] != TokenPrefix {
		return Claims{}, ErrInvalidLicenseKey
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, ErrInvalidLicenseKey
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Claims{}, ErrInvalidLicenseKey
	}
	if len(publicKey) == 0 {
		return Claims{}, errors.New("license public key is not configured")
	}
	if !ed25519.Verify(publicKey, payloadBytes, signature) {
		return Claims{}, ErrInvalidLicenseKey
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return Claims{}, ErrInvalidLicenseKey
	}
	if claims.V != 1 {
		return Claims{}, ErrInvalidLicenseKey
	}
	if claims.Product != ProductID {
		return Claims{}, fmt.Errorf("%w: unexpected product", ErrInvalidLicenseKey)
	}
	if claims.Edition != EditionPro {
		return Claims{}, fmt.Errorf("%w: unsupported edition", ErrInvalidLicenseKey)
	}
	if strings.TrimSpace(claims.CustomerID) == "" {
		return Claims{}, ErrInvalidLicenseKey
	}
	if _, err := time.Parse(time.RFC3339, claims.ExpiresAt); err != nil {
		return Claims{}, ErrInvalidLicenseKey
	}
	return claims, nil
}

// SignClaims creates a signed license key for the given claims.
func SignClaims(claims Claims, privateKey ed25519.PrivateKey) (string, error) {
	return signClaims(claims, privateKey)
}

func signClaims(claims Claims, privateKey ed25519.PrivateKey) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	signature := ed25519.Sign(privateKey, payload)
	return fmt.Sprintf("%s.%s.%s",
		TokenPrefix,
		base64.RawURLEncoding.EncodeToString(payload),
		base64.RawURLEncoding.EncodeToString(signature),
	), nil
}
