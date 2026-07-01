package license

import (
	"crypto/ed25519"
	"path/filepath"
	"testing"
	"time"
)

func TestActivateAndValidateProLicense(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "license.json")
	m := NewManagerAtPath(path)

	priv := DefaultDevPrivateKey()
	expires := time.Now().UTC().Add(365 * 24 * time.Hour).Format(time.RFC3339)
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_test",
		CustomerName: "Test Customer",
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    expires,
	}, priv)
	if err != nil {
		t.Fatal(err)
	}

	info, err := m.Activate(key)
	if err != nil {
		t.Fatalf("activate: %v", err)
	}
	if info.Edition != EditionPro || info.Status != StatusActive {
		t.Fatalf("unexpected info: %+v", info)
	}
	if !m.Allows(FeatureDMX) || !m.Allows(FeatureParty) {
		t.Fatal("pro features should be enabled")
	}
}

func TestWrongMachineRejected(t *testing.T) {
	dir := t.TempDir()
	m := NewManagerAtPath(filepath.Join(dir, "license.json"))
	priv := DefaultDevPrivateKey()
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_test",
		CustomerName: "Test Customer",
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
		MachineID:    "sha256:deadbeef",
	}, priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Activate(key); err != ErrWrongMachine {
		t.Fatalf("expected ErrWrongMachine, got %v", err)
	}
}

func TestExpiredLicenseDowngradesToFree(t *testing.T) {
	dir := t.TempDir()
	m := NewManagerAtPath(filepath.Join(dir, "license.json"))
	m.now = func() time.Time {
		return time.Date(2028, 1, 1, 0, 0, 0, 0, time.UTC)
	}

	priv := DefaultDevPrivateKey()
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_test",
		CustomerName: "Test Customer",
		IssuedAt:     time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339),
		ExpiresAt:    time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339),
	}, priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Activate(key); err != nil {
		t.Fatal(err)
	}
	info := m.Refresh()
	if info.Status != StatusExpired || info.Edition != EditionFree {
		t.Fatalf("expected expired free edition, got %+v", info)
	}
	if m.Allows(FeatureDMX) {
		t.Fatal("dmx should be blocked after expiry")
	}
}

func TestGracePeriodKeepsPro(t *testing.T) {
	dir := t.TempDir()
	m := NewManagerAtPath(filepath.Join(dir, "license.json"))
	expires := time.Date(2027, 6, 1, 0, 0, 0, 0, time.UTC)
	m.now = func() time.Time {
		return expires.Add(7 * 24 * time.Hour)
	}

	priv := DefaultDevPrivateKey()
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_test",
		CustomerName: "Test Customer",
		IssuedAt:     time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339),
		ExpiresAt:    expires.Format(time.RFC3339),
	}, priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Activate(key); err != nil {
		t.Fatal(err)
	}
	info := m.Refresh()
	if info.Status != StatusGrace || info.Edition != EditionPro {
		t.Fatalf("expected grace pro, got %+v", info)
	}
}

func TestTamperedKeyRejected(t *testing.T) {
	dir := t.TempDir()
	m := NewManagerAtPath(filepath.Join(dir, "license.json"))
	priv := DefaultDevPrivateKey()
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_test",
		CustomerName: "Test Customer",
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}, priv)
	if err != nil {
		t.Fatal(err)
	}
	key = key[:len(key)-4] + "AAAA"
	if _, err := m.Activate(key); err != ErrInvalidLicenseKey {
		t.Fatalf("expected invalid key, got %v", err)
	}
}

func TestDeactivateReturnsFree(t *testing.T) {
	dir := t.TempDir()
	m := NewManagerAtPath(filepath.Join(dir, "license.json"))
	priv := DefaultDevPrivateKey()
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_test",
		CustomerName: "Test Customer",
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
	}, priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Activate(key); err != nil {
		t.Fatal(err)
	}
	info := m.Deactivate()
	if info.Edition != EditionFree || m.Allows(FeatureDMX) {
		t.Fatalf("expected free after deactivate, got %+v", info)
	}
}

func TestSignClaimsUsesValidKeypair(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := parseAndVerifyKey(mustSign(t, priv), pub); err != nil {
		t.Fatalf("verify: %v", err)
	}
}

func mustSign(t *testing.T, priv ed25519.PrivateKey) string {
	t.Helper()
	key, err := signClaims(Claims{
		V:            1,
		Product:      ProductID,
		Edition:      EditionPro,
		CustomerID:   "cust_x",
		CustomerName: "X",
		IssuedAt:     time.Now().UTC().Format(time.RFC3339),
		ExpiresAt:    time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
	}, priv)
	if err != nil {
		t.Fatal(err)
	}
	return key
}
