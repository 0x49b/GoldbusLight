package license

import (
	"errors"
	"time"
)

const (
	ProductID          = "ch.goldbus.goldbuslightcontroller"
	TokenPrefix        = "GBLC1"
	EditionFree        = "free"
	EditionPro         = "pro"
	StatusFree         = "free"
	StatusActive       = "active"
	StatusGrace        = "grace"
	StatusExpired      = "expired"
	GracePeriodDays    = 14
	FreeMaxWLEDDevices = 8
)

var (
	ErrInvalidLicenseKey   = errors.New("invalid license key")
	ErrWrongMachine        = errors.New("license key is not valid for this machine")
	ErrLicenseExpired      = errors.New("license has expired")
	ErrFeatureNotAvailable = errors.New("feature requires Goldbus Light Controller Pro")
)

// LicenseInfo is the license state exposed to the UI and controller.
type LicenseInfo struct {
	Edition       string          `json:"edition"`
	Status        string          `json:"status"`
	ExpiresAt     *time.Time      `json:"expiresAt,omitempty"`
	CustomerName  string          `json:"customerName,omitempty"`
	CustomerID    string          `json:"customerId,omitempty"`
	DaysRemaining int             `json:"daysRemaining"`
	MachineID     string          `json:"machineId"`
	Features      map[string]bool `json:"features"`
}

// Claims is the signed license payload.
type Claims struct {
	V            int    `json:"v"`
	Product      string `json:"product"`
	Edition      string `json:"edition"`
	CustomerID   string `json:"customer_id"`
	CustomerName string `json:"customer_name"`
	IssuedAt     string `json:"issued_at"`
	ExpiresAt    string `json:"expires_at"`
	MachineID    string `json:"machine_id,omitempty"`
}

func freeLicenseInfo(machineID string) LicenseInfo {
	return LicenseInfo{
		Edition:   EditionFree,
		Status:    StatusFree,
		MachineID: machineID,
		Features:  featureMapForEdition(EditionFree),
	}
}

func buildLicenseInfo(claims Claims, status string, machineID string) LicenseInfo {
	expiresAt, _ := time.Parse(time.RFC3339, claims.ExpiresAt)
	info := LicenseInfo{
		Edition:      claims.Edition,
		Status:       status,
		CustomerName: claims.CustomerName,
		CustomerID:   claims.CustomerID,
		MachineID:    machineID,
		Features:     featureMapForEdition(claims.Edition),
	}
	if !expiresAt.IsZero() {
		info.ExpiresAt = &expiresAt
		info.DaysRemaining = daysUntil(expiresAt)
	}
	if status == StatusFree || status == StatusExpired {
		info.Edition = EditionFree
		info.Features = featureMapForEdition(EditionFree)
	}
	return info
}

func evaluateStatus(expiresAt time.Time, now time.Time) string {
	if now.Before(expiresAt) {
		return StatusActive
	}
	graceEnd := expiresAt.Add(GracePeriodDays * 24 * time.Hour)
	if !now.After(graceEnd) {
		return StatusGrace
	}
	return StatusExpired
}

func daysUntil(expiresAt time.Time) int {
	remaining := time.Until(expiresAt)
	if remaining < 0 {
		return 0
	}
	return int(remaining.Hours() / 24)
}

func isProEntitled(status string) bool {
	return status == StatusActive || status == StatusGrace
}
