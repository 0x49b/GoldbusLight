package remotehttp

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"testing"
	"time"

	"goldbus/internal/controller"
)

func TestServerAPIHealthAndInfo(t *testing.T) {
	ctrl := controller.NewWLEDController(log.Default())
	if err := ctrl.Start(t.Context()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer ctrl.Stop()

	settings := ctrl.Snapshot().Settings
	settings.Companion.Enabled = true
	settings.Companion.Port = 18765
	if err := ctrl.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}

	srv := New(ctrl, nil, log.Default())
	srv.Sync()
	defer srv.Stop()

	deadline := time.Now().Add(2 * time.Second)
	for {
		st := srv.Status()
		if st.Listening {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("server did not start listening")
		}
		time.Sleep(50 * time.Millisecond)
	}

	resp, err := http.Get("http://127.0.0.1:18765/api/health")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health status %d", resp.StatusCode)
	}

	infoResp, err := http.Get("http://127.0.0.1:18765/api/info")
	if err != nil {
		t.Fatalf("info: %v", err)
	}
	defer infoResp.Body.Close()
	body, _ := io.ReadAll(infoResp.Body)
	var info CompanionStatus
	if err := json.Unmarshal(body, &info); err != nil {
		t.Fatalf("info json: %v", err)
	}
	if !info.Listening || info.Port != 18765 {
		t.Fatalf("unexpected info: %+v", info)
	}

	stateResp, err := http.Get("http://127.0.0.1:18765/api/state")
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	defer stateResp.Body.Close()
	if stateResp.StatusCode != http.StatusOK {
		t.Fatalf("state status %d", stateResp.StatusCode)
	}

	patchBody := []byte(`{"updates":[{"address":1,"value":10}]}`)
	patchResp, err := http.Post("http://127.0.0.1:18765/api/dmx/live-patch", "application/json", bytes.NewReader(patchBody))
	if err != nil {
		t.Fatalf("live-patch: %v", err)
	}
	defer patchResp.Body.Close()
	// May fail without live output configured; ensure we get JSON either way.
	if patchResp.StatusCode != http.StatusOK && patchResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("live-patch status %d", patchResp.StatusCode)
	}
}
