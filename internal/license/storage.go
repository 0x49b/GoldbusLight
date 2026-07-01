package license

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const licenseFileName = "license.json"

type storedLicense struct {
	Key             string    `json:"key"`
	BoundMachineID  string    `json:"boundMachineId"`
	ActivatedAt     time.Time `json:"activatedAt"`
	LastValidatedAt time.Time `json:"lastValidatedAt"`
}

type storage struct {
	path string
	mu   sync.Mutex
}

func newStorage(path string) *storage {
	return &storage{path: path}
}

func defaultLicensePath() string {
	cfgDir, err := os.UserConfigDir()
	if err != nil || cfgDir == "" {
		return filepath.Join(".", "wled-controller", licenseFileName)
	}
	return filepath.Join(cfgDir, "wled-controller", licenseFileName)
}

func (s *storage) load() (storedLicense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return storedLicense{}, nil
		}
		return storedLicense{}, err
	}
	var stored storedLicense
	if err := json.Unmarshal(data, &stored); err != nil {
		return storedLicense{}, err
	}
	return stored, nil
}

func (s *storage) save(stored storedLicense) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(stored, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o600)
}

func (s *storage) clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
