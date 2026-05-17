// Package console provides an in-memory ring buffer of transport-level log
// entries (USB DMX, Art-Net, WLED). The UI polls List() to render a live
// transport console under Settings.
package console

import (
	"sync"
	"sync/atomic"
	"time"
)

const (
	// Direction values describe the role of an entry.
	DirectionOut   = "out"
	DirectionIn    = "in"
	DirectionInfo  = "info"
	DirectionError = "error"

	// Transport identifiers used by the publishers across the controller.
	TransportWLED   = "wled"
	TransportUSBDMX = "usb-dmx"
	TransportArtNet = "artnet"
)

// Entry is one row in the live transport console.
type Entry struct {
	ID        int64     `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Transport string    `json:"transport"`
	Direction string    `json:"direction"`
	Target    string    `json:"target,omitempty"`
	Summary   string    `json:"summary"`
	Detail    string    `json:"detail,omitempty"`
}

// Bus is a thread-safe ring buffer of entries. Publishers append via Publish
// or convenience helpers; consumers fetch new entries via List.
type Bus struct {
	mu      sync.Mutex
	entries []Entry
	max     int
	nextID  int64
}

// NewBus creates a Bus that keeps the most recent `max` entries.
func NewBus(max int) *Bus {
	if max <= 0 {
		max = 500
	}
	return &Bus{
		entries: make([]Entry, 0, max),
		max:     max,
	}
}

// Publish records one entry. Empty summaries are dropped to keep the UI tidy.
func (b *Bus) Publish(transport, direction, target, summary, detail string) {
	if b == nil {
		return
	}
	if summary == "" {
		return
	}
	id := atomic.AddInt64(&b.nextID, 1)
	entry := Entry{
		ID:        id,
		Timestamp: time.Now().UTC(),
		Transport: transport,
		Direction: direction,
		Target:    target,
		Summary:   summary,
		Detail:    detail,
	}
	b.mu.Lock()
	b.entries = append(b.entries, entry)
	if len(b.entries) > b.max {
		drop := len(b.entries) - b.max
		b.entries = b.entries[drop:]
	}
	b.mu.Unlock()
}

// Info is a convenience for status/lifecycle entries.
func (b *Bus) Info(transport, target, summary string) {
	b.Publish(transport, DirectionInfo, target, summary, "")
}

// Error is a convenience for error entries.
func (b *Bus) Error(transport, target, summary, detail string) {
	b.Publish(transport, DirectionError, target, summary, detail)
}

// Out is a convenience for outgoing commands.
func (b *Bus) Out(transport, target, summary, detail string) {
	b.Publish(transport, DirectionOut, target, summary, detail)
}

// List returns at most `limit` entries with ID > afterID, in append order.
// Use limit <= 0 to fall back to the bus capacity.
func (b *Bus) List(afterID int64, limit int) []Entry {
	if b == nil {
		return nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if limit <= 0 {
		limit = b.max
	}
	out := make([]Entry, 0, len(b.entries))
	for _, e := range b.entries {
		if e.ID <= afterID {
			continue
		}
		out = append(out, e)
		if len(out) >= limit {
			break
		}
	}
	return out
}

// Clear empties the buffer without resetting the running id counter so
// in-flight subscribers see no stale ids reappear.
func (b *Bus) Clear() {
	if b == nil {
		return
	}
	b.mu.Lock()
	b.entries = b.entries[:0]
	b.mu.Unlock()
}
