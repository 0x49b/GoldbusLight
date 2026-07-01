package license

import (
	"strings"
	"sync"
	"time"
)

// Manager validates and stores license keys for the desktop app.
type Manager struct {
	storage   *storage
	publicKey func() []byte
	now       func() time.Time

	mu      sync.RWMutex
	current LicenseInfo
}

// NewManager creates a license manager with the default config directory path.
func NewManager() *Manager {
	return NewManagerAtPath(defaultLicensePath())
}

// NewManagerAtPath creates a license manager using a custom license.json path.
func NewManagerAtPath(path string) *Manager {
	m := &Manager{
		storage: newStorage(path),
		publicKey: func() []byte {
			return verificationKey()
		},
		now: time.Now,
	}
	m.refreshLocked()
	return m
}

// Path returns the on-disk license file path.
func (m *Manager) Path() string {
	return m.storage.path
}

// Current returns the active license state.
func (m *Manager) Current() LicenseInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

// Refresh re-validates the stored license and updates Current().
func (m *Manager) Refresh() LicenseInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.refreshLocked()
	return m.current
}

// Activate validates a license key, binds it to this machine, and persists it.
func (m *Manager) Activate(key string) (LicenseInfo, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return LicenseInfo{}, ErrInvalidLicenseKey
	}

	claims, err := parseAndVerifyKey(key, m.publicKey())
	if err != nil {
		return LicenseInfo{}, err
	}

	localMachine := MachineFingerprint()
	if err := validateMachineBinding(claims, localMachine, ""); err != nil {
		return LicenseInfo{}, err
	}

	now := m.now().UTC()
	stored := storedLicense{
		Key:             key,
		BoundMachineID:  boundMachineID(claims, localMachine),
		ActivatedAt:     now,
		LastValidatedAt: now,
	}
	if err := m.storage.save(stored); err != nil {
		return LicenseInfo{}, err
	}

	m.mu.Lock()
	m.refreshLockedWithStored(stored)
	info := m.current
	m.mu.Unlock()
	return info, nil
}

// Deactivate removes the stored license and returns to the free edition.
func (m *Manager) Deactivate() LicenseInfo {
	_ = m.storage.clear()
	m.mu.Lock()
	m.refreshLocked()
	info := m.current
	m.mu.Unlock()
	return info
}

func (m *Manager) refreshLocked() {
	stored, err := m.storage.load()
	if err != nil || strings.TrimSpace(stored.Key) == "" {
		m.current = freeLicenseInfo(MachineFingerprint())
		return
	}
	m.refreshLockedWithStored(stored)
}

func (m *Manager) refreshLockedWithStored(stored storedLicense) {
	localMachine := MachineFingerprint()
	claims, err := parseAndVerifyKey(stored.Key, m.publicKey())
	if err != nil {
		m.current = freeLicenseInfo(localMachine)
		return
	}
	if err := validateMachineBinding(claims, localMachine, stored.BoundMachineID); err != nil {
		m.current = freeLicenseInfo(localMachine)
		return
	}

	expiresAt, _ := time.Parse(time.RFC3339, claims.ExpiresAt)
	status := evaluateStatus(expiresAt, m.now().UTC())
	info := buildLicenseInfo(claims, status, localMachine)
	if !isProEntitled(status) {
		info.Edition = EditionFree
		info.Features = featureMapForEdition(EditionFree)
	}
	m.current = info

	stored.LastValidatedAt = m.now().UTC()
	_ = m.storage.save(stored)
}

func validateMachineBinding(claims Claims, localMachine, boundMachineID string) error {
	if claims.MachineID != "" {
		if claims.MachineID != localMachine {
			return ErrWrongMachine
		}
		return nil
	}
	if boundMachineID != "" && boundMachineID != localMachine {
		return ErrWrongMachine
	}
	return nil
}

func boundMachineID(claims Claims, localMachine string) string {
	if claims.MachineID != "" {
		return claims.MachineID
	}
	return localMachine
}
