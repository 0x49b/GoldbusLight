package remotehttp

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"goldbus/internal/controller"
	"goldbus/internal/dmx"
)

type apiStateResponse struct {
	Companion      CompanionStatus          `json:"companion"`
	DMXEnabled     bool                     `json:"dmxEnabled"`
	WLEDEnabled    bool                     `json:"wledEnabled"`
	PartyRunning   bool                     `json:"partyRunning"`
	LiveStatus     dmx.DMXLiveStatus        `json:"liveStatus"`
	DMX            controller.DMXState      `json:"dmx"`
	Devices        []controller.WLEDDevice  `json:"devices"`
	GeneralTab     controller.GeneralTabState `json:"generalTabState"`
}

type livePatchRequest struct {
	Updates []dmx.DMXOutputUpdate `json:"updates"`
}

type cueSequenceRequest struct {
	CueSequence controller.DMXFixtureCueSequence `json:"cueSequence"`
}

func (s *Server) registerAPI(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/info", s.handleInfo)
	mux.HandleFunc("GET /api/state", s.handleState)
	mux.HandleFunc("POST /api/dmx/live-patch", s.handleLivePatch)
	mux.HandleFunc("PUT /api/fixtures/{id}/cues", s.handlePutFixtureCues)
	mux.HandleFunc("POST /api/wled/devices/{id}/state", s.handleWLEDDeviceState)
	mux.HandleFunc("POST /api/wled/devices/{id}/presets/{presetId}/apply", s.handleWLEDApplyPreset)
	mux.HandleFunc("POST /api/wled/global", s.handleWLEDGlobal)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleInfo(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Status())
}

func (s *Server) handleState(w http.ResponseWriter, _ *http.Request) {
	if s.ctrl == nil {
		writeErr(w, http.StatusServiceUnavailable, "controller unavailable")
		return
	}
	snap := s.ctrl.Snapshot()
	party := s.ctrl.GetDMXPartyState()
	writeJSON(w, http.StatusOK, apiStateResponse{
		Companion:    s.Status(),
		DMXEnabled:   snap.Settings.DMX.Enabled,
		WLEDEnabled:  snap.Settings.WLED.Enabled,
		PartyRunning: party.Status.Running,
		LiveStatus:   s.ctrl.GetDMXLiveStatus(),
		DMX:          s.ctrl.GetDMXState(),
		Devices:      filterActiveDevices(snap.Devices),
		GeneralTab:   snap.GeneralTabState,
	})
}

func (s *Server) handleLivePatch(w http.ResponseWriter, r *http.Request) {
	if s.ctrl == nil {
		writeErr(w, http.StatusServiceUnavailable, "controller unavailable")
		return
	}
	if s.ctrl.GetDMXPartyState().Status.Running {
		writeErr(w, http.StatusConflict, "party mode is running — stop party on the kiosk to use live controls")
		return
	}
	var req livePatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.Updates) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if err := s.ctrl.ApplyDMXLivePatch(req.Updates); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePutFixtureCues(w http.ResponseWriter, r *http.Request) {
	if s.ctrl == nil {
		writeErr(w, http.StatusServiceUnavailable, "controller unavailable")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeErr(w, http.StatusBadRequest, "fixture id required")
		return
	}
	var req cueSequenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	fixture, ok := findFixture(s.ctrl.GetDMXState().Fixtures, id)
	if !ok {
		writeErr(w, http.StatusNotFound, "unknown fixture")
		return
	}
	party := fixture.Party
	party.CueSequence = req.CueSequence
	updated, err := s.ctrl.UpdateDMXFixture(controller.UpsertDMXFixtureInput{
		ID:              fixture.ID,
		Type:            fixture.Type,
		Brand:           fixture.Brand,
		Name:            fixture.Name,
		UniverseID:      fixture.UniverseID,
		DMXAddress:      fixture.DMXAddress,
		MasterFixtureID: fixture.MasterFixtureID,
		MaxPan:          fixture.MovingHead.MaxPan,
		MaxTilt:         fixture.MovingHead.MaxTilt,
		Party:           party,
		ColorSweep:      fixture.ColorSweep,
		SceneCues:       fixture.SceneCues,
		Channels:        fixture.Channels,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleWLEDDeviceState(w http.ResponseWriter, r *http.Request) {
	if s.ctrl == nil {
		writeErr(w, http.StatusServiceUnavailable, "controller unavailable")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeErr(w, http.StatusBadRequest, "device id required")
		return
	}
	var state map[string]any
	if err := json.NewDecoder(r.Body).Decode(&state); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	if err := s.ctrl.SetDeviceState(ctx, id, state); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleWLEDApplyPreset(w http.ResponseWriter, r *http.Request) {
	if s.ctrl == nil {
		writeErr(w, http.StatusServiceUnavailable, "controller unavailable")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	presetID := strings.TrimSpace(r.PathValue("presetId"))
	if id == "" || presetID == "" {
		writeErr(w, http.StatusBadRequest, "device id and preset id required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	if err := s.ctrl.ApplyWLEDDevicePreset(ctx, id, presetID); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleWLEDGlobal(w http.ResponseWriter, r *http.Request) {
	if s.ctrl == nil {
		writeErr(w, http.StatusServiceUnavailable, "controller unavailable")
		return
	}
	var state map[string]any
	if err := json.NewDecoder(r.Body).Decode(&state); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	errorsByDevice := s.ctrl.SetGlobalState(ctx, state)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "errors": errorsByDevice})
}

func findFixture(fixtures []controller.DMXFixture, id string) (controller.DMXFixture, bool) {
	for _, f := range fixtures {
		if f.ID == id {
			return f, true
		}
	}
	return controller.DMXFixture{}, false
}

func filterActiveDevices(devices []controller.WLEDDevice) []controller.WLEDDevice {
	out := make([]controller.WLEDDevice, 0, len(devices))
	for _, d := range devices {
		if d.Ignored {
			continue
		}
		out = append(out, d)
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}
