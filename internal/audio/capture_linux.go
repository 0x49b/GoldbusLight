//go:build linux

package audio

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

type pipewireBackend struct {
	cancel context.CancelFunc
	cmd    *exec.Cmd
	done   chan struct{}
}

func (b *pipewireBackend) Stop() {
	if b.cancel != nil {
		b.cancel()
		b.cancel = nil
	}
	if b.cmd != nil && b.cmd.Process != nil {
		_ = b.cmd.Process.Kill()
	}
	if b.done != nil {
		<-b.done
		b.done = nil
	}
	b.cmd = nil
}

type pactlSource struct {
	Index       int      `json:"index"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	State       string   `json:"state"`
	Flags       []string `json:"flags"`
}

// ListInputDevices returns PipeWire/PulseAudio capture sources via pactl.
func ListInputDevices() ([]InputDevice, error) {
	defaultName, err := pactlDefaultSource()
	if err != nil {
		return nil, err
	}
	sources, err := pactlListSources()
	if err != nil {
		return nil, err
	}
	out := make([]InputDevice, 0, len(sources))
	for _, src := range sources {
		if strings.EqualFold(src.State, "UNAVAILABLE") {
			continue
		}
		out = append(out, deviceFromName(src.Name, src.Description, src.Name == defaultName))
	}
	return out, nil
}

// Start begins capture using pw-record (avoids malgo/miniaudio signal handlers in the GUI process).
func (c *Capture) Start(deviceID string, onFeatures FeatureHandler) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	selectedID := strings.TrimSpace(deviceID)
	if c.running {
		if c.deviceID == selectedID {
			return nil
		}
		c.stopLocked()
	}

	target := selectedID
	if target == "" {
		defaultName, err := pactlDefaultSource()
		if err != nil {
			return err
		}
		target = defaultName
	} else if !pactlSourceExists(target) {
		return fmt.Errorf("audio input %q not found (reselect device in party settings)", target)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, "pw-record",
		"-",
		"--rate", strconv.Itoa(partySampleRate),
		"--channels", strconv.Itoa(partyChannels),
		"--format", "s16",
		"--target", target,
	)
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("pw-record stdout: %w", err)
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start pw-record: %w", err)
	}
	done := make(chan struct{})
	backend := &pipewireBackend{cancel: cancel, cmd: cmd, done: done}
	c.backend = backend
	c.beginCaptureLocked(target, onFeatures)

	go func() {
		defer close(done)
		c.readPipewirePCM(stdout)
		_ = cmd.Wait()
		c.mu.Lock()
		if c.backend == backend {
			c.stopFeatureLoopLocked()
			c.backend = nil
			c.running = false
			c.sampleBuf = nil
			c.onFeatures = nil
		}
		c.mu.Unlock()
	}()

	return nil
}

func (c *Capture) readPipewirePCM(r io.Reader) {
	buf := make([]byte, partySampleRate*2) // ~1s mono s16
	for {
		n, err := r.Read(buf)
		if n > 0 {
			c.appendSamples(bytesToInt16(buf[:n]))
		}
		if err != nil {
			return
		}
	}
}

func pactlDefaultSource() (string, error) {
	out, err := exec.Command("pactl", "get-default-source").Output()
	if err != nil {
		return "", fmt.Errorf("pactl get-default-source: %w", err)
	}
	name := strings.TrimSpace(string(out))
	if name == "" {
		return "", fmt.Errorf("pactl returned empty default source")
	}
	return name, nil
}

func pactlSourceExists(name string) bool {
	sources, err := pactlListSources()
	if err != nil {
		return false
	}
	for _, src := range sources {
		if src.Name == name {
			return true
		}
	}
	return false
}

func pactlListSources() ([]pactlSource, error) {
	out, err := exec.Command("pactl", "-f", "json", "list", "sources").Output()
	if err != nil {
		return nil, fmt.Errorf("pactl list sources: %w", err)
	}
	var sources []pactlSource
	if err := json.Unmarshal(out, &sources); err != nil {
		return nil, fmt.Errorf("parse pactl json: %w", err)
	}
	return sources, nil
}
