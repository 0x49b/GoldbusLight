// Package wled provides the runtime engine that talks HTTP to WLED devices.
// It runs as a goroutine pair (dispatcher + workers) fed by channels and is
// started or stopped together with the WLED component setting. All transport
// calls also stream summaries onto the console bus so the UI can show what
// has been sent live.
package wled

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"goldbus/internal/console"
	"goldbus/internal/wledhttp"
)

// ErrEngineStopped is returned when callers try to submit work after the
// engine has been stopped (e.g. WLED disabled in settings).
var ErrEngineStopped = errors.New("wled engine is stopped")

// Device is the minimal handle the engine needs to address a WLED unit.
// Mirrors the fields of controller.WLEDDevice that participate in HTTP.
type Device struct {
	ID      string
	Host    string
	Address string
	Port    int
}

// InspectResult is the parsed payload of a GET /json call against a freshly
// discovered device.
type InspectResult struct {
	ID      string
	Name    string
	Version string
	Info    map[string]any
	State   map[string]any
}

// Engine owns the goroutine and channels that perform WLED HTTP traffic.
// It is safe for concurrent use by callers.
type Engine struct {
	client  *http.Client
	logger  *log.Logger
	console *console.Bus

	mu      sync.Mutex
	running bool
	cancel  context.CancelFunc
	cmds    chan command
	done    chan struct{}
}

// NewEngine constructs a stopped Engine. Call Start to spin the worker up.
func NewEngine(logger *log.Logger, bus *console.Bus) *Engine {
	if logger == nil {
		logger = log.Default()
	}
	return &Engine{
		client: &http.Client{
			Timeout: 4 * time.Second,
		},
		logger:  logger,
		console: bus,
	}
}

func (e *Engine) Running() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.running
}

// Start launches the worker goroutine and opens the request channel.
// Start is idempotent: calling it while already running is a no-op.
func (e *Engine) Start(parent context.Context) {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	e.cancel = cancel
	e.cmds = make(chan command, 64)
	e.done = make(chan struct{})
	e.running = true
	e.mu.Unlock()

	go e.run(ctx)
	if e.console != nil {
		e.console.Info(console.TransportWLED, "", "WLED engine started")
	}
}

// Stop tears down the worker. It closes the command channel, waits for the
// worker to drain, and releases pending callers with ErrEngineStopped.
func (e *Engine) Stop() {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return
	}
	e.running = false
	cancel := e.cancel
	cmds := e.cmds
	done := e.done
	e.cancel = nil
	e.cmds = nil
	e.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if cmds != nil {
		close(cmds)
	}
	if done != nil {
		<-done
	}
	if e.console != nil {
		e.console.Info(console.TransportWLED, "", "WLED engine stopped")
	}
}

func (e *Engine) run(ctx context.Context) {
	defer func() {
		e.mu.Lock()
		done := e.done
		e.done = nil
		e.mu.Unlock()
		if done != nil {
			close(done)
		}
	}()

	for {
		e.mu.Lock()
		cmds := e.cmds
		e.mu.Unlock()
		if cmds == nil {
			return
		}
		select {
		case <-ctx.Done():
			e.drainPending(cmds)
			return
		case cmd, ok := <-cmds:
			if !ok {
				return
			}
			// Dispatch heavy work in its own goroutine so a slow device does
			// not stall the entire engine. Replies are delivered through the
			// command's reply channel which the caller owns.
			go e.handle(ctx, cmd)
		}
	}
}

func (e *Engine) drainPending(cmds chan command) {
	for {
		select {
		case cmd, ok := <-cmds:
			if !ok {
				return
			}
			cmd.fail(ErrEngineStopped)
		default:
			return
		}
	}
}

type commandOp int

const (
	opInspect commandOp = iota
	opGetState
	opGetFullJSON
	opGetConfig
	opApplyState
	opApplyStateAll
	opApplyCfgPatch
	opProvision
)

type command struct {
	op      commandOp
	ctx     context.Context
	device  Device
	devices []Device
	state   map[string]any
	cfg     map[string]any
	reply   chan reply
}

type reply struct {
	inspect InspectResult
	state   map[string]any
	full    map[string]any
	cfg     map[string]any
	results map[string]string
	err     error
}

func (c command) fail(err error) {
	if c.reply == nil {
		return
	}
	select {
	case c.reply <- reply{err: err}:
	default:
	}
}

func (e *Engine) submit(cmd command) (reply, error) {
	e.mu.Lock()
	cmds := e.cmds
	running := e.running
	e.mu.Unlock()
	if !running || cmds == nil {
		return reply{}, ErrEngineStopped
	}
	cmd.reply = make(chan reply, 1)

	select {
	case cmds <- cmd:
	case <-cmd.ctx.Done():
		return reply{}, cmd.ctx.Err()
	}

	select {
	case r := <-cmd.reply:
		return r, r.err
	case <-cmd.ctx.Done():
		return reply{}, cmd.ctx.Err()
	}
}

func (e *Engine) handle(ctx context.Context, cmd command) {
	// Always respect a stop in-flight so callers do not hang.
	if cmd.ctx == nil {
		cmd.ctx = ctx
	}
	switch cmd.op {
	case opInspect:
		res, err := e.doInspect(cmd.ctx, cmd.device)
		cmd.reply <- reply{inspect: res, err: err}
	case opGetState:
		st, err := e.doGetJSON(cmd.ctx, cmd.device, "/json/state", "GET /json/state")
		cmd.reply <- reply{state: st, err: err}
	case opGetFullJSON:
		st, err := e.doGetJSON(cmd.ctx, cmd.device, "/json", "GET /json")
		cmd.reply <- reply{full: st, err: err}
	case opGetConfig:
		st, err := e.doGetJSON(cmd.ctx, cmd.device, "/json/cfg", "GET /json/cfg")
		cmd.reply <- reply{cfg: st, err: err}
	case opApplyState:
		err := e.doPostJSON(cmd.ctx, cmd.device, "/json/state", cmd.state, "POST /json/state")
		cmd.reply <- reply{err: err}
	case opApplyStateAll:
		results := e.doApplyStateAll(cmd.ctx, cmd.devices, cmd.state)
		cmd.reply <- reply{results: results}
	case opApplyCfgPatch:
		err := e.doPostJSON(cmd.ctx, cmd.device, "/json/cfg", cmd.cfg, "POST /json/cfg")
		cmd.reply <- reply{err: err}
	case opProvision:
		err := e.doProvision(cmd.ctx, cmd.device, cmd.cfg, cmd.state)
		cmd.reply <- reply{err: err}
	default:
		cmd.reply <- reply{err: fmt.Errorf("unknown wled engine op: %d", cmd.op)}
	}
}

func (e *Engine) doApplyStateAll(ctx context.Context, devices []Device, state map[string]any) map[string]string {
	results := make(map[string]string, len(devices))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, dev := range devices {
		dev := dev
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := e.doPostJSON(ctx, dev, "/json/state", state, "POST /json/state")
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				results[dev.ID] = err.Error()
				return
			}
			results[dev.ID] = "ok"
		}()
	}
	wg.Wait()
	return results
}

func (e *Engine) doInspect(ctx context.Context, dev Device) (InspectResult, error) {
	var payload struct {
		Info struct {
			Name string `json:"name"`
			Mac  string `json:"mac"`
			Ver  string `json:"ver"`
		} `json:"info"`
		State map[string]any `json:"state"`
	}
	addr := strings.TrimSpace(dev.Address)
	portStr := fmt.Sprintf("%d", dev.Port)

	var endpoints []string
	if ip := net.ParseIP(addr); ip != nil && ip.To4() != nil {
		endpoints = []string{"http://" + net.JoinHostPort(addr, portStr) + "/json"}
	} else {
		endpoints = []string{wledhttp.BaseHTTPURL(dev.Host, dev.Address, dev.Port) + "/json"}
	}

	var lastErr error
	for _, endpoint := range endpoints {
		err := e.requestJSON(ctx, http.MethodGet, endpoint, nil, &payload, dev, "GET /json")
		if err == nil {
			return e.inspectResultFromPayload(dev, payload), nil
		}
		lastErr = err
	}
	return InspectResult{}, lastErr
}

func (e *Engine) inspectResultFromPayload(dev Device, payload struct {
	Info struct {
		Name string `json:"name"`
		Mac  string `json:"mac"`
		Ver  string `json:"ver"`
	} `json:"info"`
	State map[string]any `json:"state"`
}) InspectResult {
	id := strings.TrimSpace(payload.Info.Mac)
	if id == "" {
		id = fmt.Sprintf("%s:%d", dev.Address, dev.Port)
	}
	name := strings.TrimSpace(payload.Info.Name)
	if name == "" {
		name = strings.TrimSuffix(dev.Host, ".")
	}
	if name == "" {
		name = dev.Address
	}
	info := map[string]any{"version": payload.Info.Ver}
	for k, v := range payload.State {
		if k == "bri" || k == "on" {
			info[k] = v
		}
	}
	return InspectResult{
		ID:      id,
		Name:    name,
		Version: payload.Info.Ver,
		Info:    info,
		State:   payload.State,
	}
}

func (e *Engine) doGetJSON(ctx context.Context, dev Device, apiPath, summary string) (map[string]any, error) {
	var payload map[string]any
	if err := e.requestJSONWithFallback(ctx, dev, http.MethodGet, apiPath, nil, &payload, summary); err != nil {
		return nil, err
	}
	return payload, nil
}

func (e *Engine) doPostJSON(ctx context.Context, dev Device, apiPath string, payload map[string]any, summary string) error {
	return e.requestJSONWithFallback(ctx, dev, http.MethodPost, apiPath, payload, nil, summary)
}

func (e *Engine) doProvision(ctx context.Context, dev Device, cfgPatch, initialState map[string]any) error {
	var cfg map[string]any
	if err := e.requestJSONWithFallback(ctx, dev, http.MethodGet, "/json/cfg", nil, &cfg, "GET /json/cfg (provision check)"); err != nil {
		return err
	}
	if len(cfgPatch) > 0 {
		if err := e.requestJSONWithFallback(ctx, dev, http.MethodPost, "/json/cfg", cfgPatch, nil, "POST /json/cfg (provision)"); err != nil {
			return err
		}
	}
	if len(initialState) > 0 {
		if err := e.requestJSONWithFallback(ctx, dev, http.MethodPost, "/json/state", initialState, nil, "POST /json/state (provision)"); err != nil {
			return err
		}
	}
	return nil
}

// Inspect probes a discovered device for identification.
func (e *Engine) Inspect(ctx context.Context, dev Device) (InspectResult, error) {
	r, err := e.submit(command{op: opInspect, ctx: ctx, device: dev})
	if err != nil {
		return InspectResult{}, err
	}
	return r.inspect, nil
}

// GetState reads /json/state.
func (e *Engine) GetState(ctx context.Context, dev Device) (map[string]any, error) {
	r, err := e.submit(command{op: opGetState, ctx: ctx, device: dev})
	if err != nil {
		return nil, err
	}
	return r.state, nil
}

// GetFullJSON reads /json (info + state + effects + palettes).
func (e *Engine) GetFullJSON(ctx context.Context, dev Device) (map[string]any, error) {
	r, err := e.submit(command{op: opGetFullJSON, ctx: ctx, device: dev})
	if err != nil {
		return nil, err
	}
	return r.full, nil
}

// GetConfig reads /json/cfg.
func (e *Engine) GetConfig(ctx context.Context, dev Device) (map[string]any, error) {
	r, err := e.submit(command{op: opGetConfig, ctx: ctx, device: dev})
	if err != nil {
		return nil, err
	}
	return r.cfg, nil
}

// ApplyState POSTs a partial state object to /json/state.
func (e *Engine) ApplyState(ctx context.Context, dev Device, state map[string]any) error {
	_, err := e.submit(command{op: opApplyState, ctx: ctx, device: dev, state: state})
	return err
}

// ApplyStateToAll fans out a state patch in parallel to many devices and
// returns a per-device status map.
func (e *Engine) ApplyStateToAll(ctx context.Context, devices []Device, state map[string]any) map[string]string {
	r, err := e.submit(command{op: opApplyStateAll, ctx: ctx, devices: devices, state: state})
	if err != nil {
		out := make(map[string]string, len(devices))
		for _, d := range devices {
			out[d.ID] = err.Error()
		}
		return out
	}
	return r.results
}

// ApplyCfgPatch POSTs a partial cfg object to /json/cfg.
func (e *Engine) ApplyCfgPatch(ctx context.Context, dev Device, patch map[string]any) error {
	_, err := e.submit(command{op: opApplyCfgPatch, ctx: ctx, device: dev, cfg: patch})
	return err
}

// Provision performs the WLED first-touch sequence: GET /json/cfg, optional
// POST cfg patch, optional initial state.
func (e *Engine) Provision(ctx context.Context, dev Device, cfgPatch, initialState map[string]any) error {
	_, err := e.submit(command{op: opProvision, ctx: ctx, device: dev, cfg: cfgPatch, state: initialState})
	return err
}

func (e *Engine) requestJSON(ctx context.Context, method, endpoint string, payload, out any, dev Device, summary string) error {
	var body *bytes.Reader
	var rawPayload []byte
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			e.publishError(dev, summary, endpoint, err.Error())
			return err
		}
		rawPayload = encoded
		body = bytes.NewReader(encoded)
	} else {
		body = bytes.NewReader(nil)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		e.publishError(dev, summary, endpoint, err.Error())
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	e.publishRequest(dev, summary, endpoint, rawPayload)

	resp, err := e.client.Do(req)
	if err != nil {
		e.publishError(dev, summary, endpoint, err.Error())
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg := fmt.Sprintf("unexpected status %d for %s", resp.StatusCode, endpoint)
		e.publishError(dev, summary, endpoint, msg)
		return errors.New(msg)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		e.publishError(dev, summary, endpoint, err.Error())
		return err
	}
	return nil
}

func (e *Engine) requestJSONWithFallback(ctx context.Context, dev Device, method, apiPath string, payload, out any, summary string) error {
	primaryBase := wledhttp.BaseHTTPURL(dev.Host, dev.Address, dev.Port)
	primaryEndpoint := primaryBase + apiPath
	primaryHost := wledhttp.HostForHTTP(dev.Host, dev.Address)
	fallbackHost := strings.TrimSpace(dev.Address)

	// .local resolution can intermittently stall and consume most timeout
	// budget. Prefer direct IP first for hot paths when an address is known.
	ipFirstAllowed := (method == http.MethodPost && apiPath == "/json/state") ||
		(method == http.MethodGet && (apiPath == "/json" || apiPath == "/json/cfg" || apiPath == "/json/state"))
	if ipFirstAllowed && fallbackHost != "" && !strings.EqualFold(primaryHost, fallbackHost) {
		fastEndpoint := "http://" + net.JoinHostPort(fallbackHost, fmt.Sprintf("%d", dev.Port)) + apiPath
		if err := e.requestJSON(ctx, method, fastEndpoint, payload, out, dev, summary); err == nil {
			return nil
		}
	}

	if err := e.requestJSON(ctx, method, primaryEndpoint, payload, out, dev, summary); err == nil {
		return nil
	} else if fallbackHost == "" || strings.EqualFold(primaryHost, fallbackHost) || !shouldRetryWithAddressFallback(err) {
		return err
	}

	fallbackEndpoint := "http://" + net.JoinHostPort(fallbackHost, fmt.Sprintf("%d", dev.Port)) + apiPath
	return e.requestJSON(ctx, method, fallbackEndpoint, payload, out, dev, summary+" (fallback)")
}

func shouldRetryWithAddressFallback(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "deadline exceeded") || strings.Contains(msg, "timeout") {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr)
}

func (e *Engine) publishRequest(dev Device, summary, endpoint string, payload []byte) {
	if e.console == nil {
		return
	}
	target := strings.TrimSpace(dev.ID)
	if target == "" {
		target = endpoint
	}
	detail := endpoint
	if len(payload) > 0 {
		// Truncate large payloads to keep the console responsive.
		const maxDetail = 512
		if len(payload) > maxDetail {
			detail = endpoint + " body=" + string(payload[:maxDetail]) + "...(truncated)"
		} else {
			detail = endpoint + " body=" + string(payload)
		}
	}
	e.console.Out(console.TransportWLED, target, summary, detail)
}

func (e *Engine) publishError(dev Device, summary, endpoint, err string) {
	if e.console == nil {
		return
	}
	target := strings.TrimSpace(dev.ID)
	if target == "" {
		target = endpoint
	}
	e.console.Error(console.TransportWLED, target, summary+": "+err, endpoint)
}
