package controller

import (
	"testing"
	"time"

	"goldbus/internal/license"
)

func activateTestProLicense(t *testing.T, c *WLEDController) {
	t.Helper()
	key, err := license.SignClaims(license.Claims{
		V:            1,
		Product:      license.ProductID,
		Edition:      license.EditionPro,
		CustomerID:   "test",
		CustomerName: "Test",
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}, license.DefaultDevPrivateKey())
	if err != nil {
		t.Fatalf("sign test license: %v", err)
	}
	if _, err := c.ActivateLicense(key); err != nil {
		t.Fatalf("activate test license: %v", err)
	}
}
