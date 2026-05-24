package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const dmxFixtureLiveLayoutsFileName = "dmx-fixture-live-layouts.json"

type dmxFixtureLiveLayoutsDoc struct {
	Version int                       `json:"version"`
	Layouts map[string]json.RawMessage `json:"layouts"`
}

// DMXFixtureLiveLayoutPersistenceManager stores per-fixture live control layout JSON
// (frontend-owned schema) in UserConfigDir/wled-controller/dmx-fixture-live-layouts.json.
type DMXFixtureLiveLayoutPersistenceManager struct {
	mu   sync.Mutex
	path string
}

func NewDMXFixtureLiveLayoutPersistenceManager() *DMXFixtureLiveLayoutPersistenceManager {
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(".", dmxFixtureLiveLayoutsFileName)}
	}
	return &DMXFixtureLiveLayoutPersistenceManager{
		path: filepath.Join(cfgDir, "wled-controller", dmxFixtureLiveLayoutsFileName),
	}
}

func (s *DMXFixtureLiveLayoutPersistenceManager) Path() string {
	return s.path
}

func defaultLiveLayoutsDoc() dmxFixtureLiveLayoutsDoc {
	return dmxFixtureLiveLayoutsDoc{
		Version: 1,
		Layouts: map[string]json.RawMessage{},
	}
}

func (s *DMXFixtureLiveLayoutPersistenceManager) readDocLocked() (dmxFixtureLiveLayoutsDoc, error) {
	doc := defaultLiveLayoutsDoc()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return doc, nil
		}
		return doc, err
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return defaultLiveLayoutsDoc(), err
	}
	if doc.Layouts == nil {
		doc.Layouts = map[string]json.RawMessage{}
	}
	if doc.Version < 1 {
		doc.Version = 1
	}
	return doc, nil
}

func (s *DMXFixtureLiveLayoutPersistenceManager) writeDocLocked(doc dmxFixtureLiveLayoutsDoc) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	doc.Version = 1
	if doc.Layouts == nil {
		doc.Layouts = map[string]json.RawMessage{}
	}
	payload, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o600)
}

// Get returns raw JSON for one fixture, or "{}" when unset.
func (s *DMXFixtureLiveLayoutPersistenceManager) Get(fixtureID string) (string, error) {
	id := strings.TrimSpace(fixtureID)
	if id == "" {
		return "", fmt.Errorf("fixture id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.readDocLocked()
	if err != nil {
		return "", err
	}
	raw, ok := doc.Layouts[id]
	if !ok || len(raw) == 0 {
		return "{}", nil
	}
	return string(raw), nil
}

// Set stores JSON for one fixture; payload must be a JSON object.
func (s *DMXFixtureLiveLayoutPersistenceManager) Set(fixtureID string, jsonStr string) error {
	id := strings.TrimSpace(fixtureID)
	if id == "" {
		return fmt.Errorf("fixture id is required")
	}
	trim := strings.TrimSpace(jsonStr)
	if trim == "" {
		trim = "{}"
	}
	var verify map[string]any
	if err := json.Unmarshal([]byte(trim), &verify); err != nil {
		return fmt.Errorf("layout json: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.readDocLocked()
	if err != nil {
		return err
	}
	doc.Layouts[id] = json.RawMessage(trim)
	return s.writeDocLocked(doc)
}

func (c *WLEDController) GetDMXFixtureLiveLayoutJSON(fixtureID string) (string, error) {
	return c.dmxLiveLayoutPersistence.Get(fixtureID)
}

func (c *WLEDController) SetDMXFixtureLiveLayoutJSON(fixtureID string, layoutJSON string) error {
	return c.dmxLiveLayoutPersistence.Set(fixtureID, layoutJSON)
}
