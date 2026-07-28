package controller

import (
	"context"
	"io"
	"log"
	"path/filepath"
	"testing"
	"time"
)

func TestApplyAccessPointOnBootSkipsWhenDisabled(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.AccessPoint.Enabled = false
	c.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	done := make(chan struct{})
	go func() {
		c.applyAccessPointOnBoot(ctx)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("applyAccessPointOnBoot did not return promptly when AP disabled")
	}
}

func TestApplyAccessPointOnBootHonorsCancel(t *testing.T) {
	dir := t.TempDir()
	c := NewWLEDController(log.New(io.Discard, "", 0))
	c.persistence = &StatePersistenceManager{path: filepath.Join(dir, defaultStateFileName)}
	c.generalTabPersistence = &GeneralTabStatePersistenceManager{path: filepath.Join(dir, generalTabStateFileName)}
	c.dmxPersistence = &DMXPersistenceManager{path: filepath.Join(dir, dmxStateFileName)}
	c.dmxLiveLayoutPersistence = &DMXFixtureLiveLayoutPersistenceManager{path: filepath.Join(dir, dmxFixtureLiveLayoutsFileName)}

	c.mu.Lock()
	c.settings = DefaultControllerSettings()
	c.settings.AccessPoint.Enabled = true
	c.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})
	go func() {
		c.applyAccessPointOnBoot(ctx)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("applyAccessPointOnBoot did not return after context cancel")
	}
}
