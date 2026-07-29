package remotehttp

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
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

func TestServerDevFrontendProxy(t *testing.T) {
	vite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/companion.html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html>companion-dev</html>"))
		case "/src/companion/main.tsx":
			w.Header().Set("Content-Type", "text/javascript")
			_, _ = w.Write([]byte("export {}"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer vite.Close()

	ctrl := controller.NewWLEDController(log.Default())
	if err := ctrl.Start(t.Context()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer ctrl.Stop()

	settings := ctrl.Snapshot().Settings
	settings.Companion.Enabled = true
	settings.Companion.Port = 18766
	if err := ctrl.SaveSettings(settings); err != nil {
		t.Fatalf("SaveSettings: %v", err)
	}

	srv := New(ctrl, nil, log.Default())
	srv.UseDevFrontend(vite.URL)
	srv.Sync()
	defer srv.Stop()

	deadline := time.Now().Add(2 * time.Second)
	for {
		if srv.Status().Listening {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("server did not start listening")
		}
		time.Sleep(50 * time.Millisecond)
	}

	rootResp, err := http.Get("http://127.0.0.1:18766/")
	if err != nil {
		t.Fatalf("root: %v", err)
	}
	defer rootResp.Body.Close()
	rootBody, _ := io.ReadAll(rootResp.Body)
	if rootResp.StatusCode != http.StatusOK {
		t.Fatalf("root status %d", rootResp.StatusCode)
	}
	if !bytes.Contains(rootBody, []byte("companion-dev")) {
		t.Fatalf("root body = %q, want companion-dev markup", rootBody)
	}

	assetResp, err := http.Get("http://127.0.0.1:18766/src/companion/main.tsx")
	if err != nil {
		t.Fatalf("asset: %v", err)
	}
	defer assetResp.Body.Close()
	if assetResp.StatusCode != http.StatusOK {
		t.Fatalf("asset status %d", assetResp.StatusCode)
	}

	// API must still be local, not proxied to Vite.
	healthResp, err := http.Get("http://127.0.0.1:18766/api/health")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer healthResp.Body.Close()
	if healthResp.StatusCode != http.StatusOK {
		t.Fatalf("health status %d", healthResp.StatusCode)
	}
}
