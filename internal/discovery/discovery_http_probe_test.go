package discovery

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeWLEDAtIPDetectsWLED(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"info": map[string]any{
				"name": "Test Strip",
				"mac":  "aabbccddeeff",
				"ver":  "0.14.0",
			},
		})
	}))
	defer srv.Close()

	host, port, err := net.SplitHostPort(srv.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	if port != "80" {
		t.Skip("httptest not on port 80")
	}

	client := srv.Client()
	candidate, ok := probeWLEDAtIP(context.Background(), client, host)
	if !ok {
		t.Fatal("expected WLED probe to match")
	}
	if candidate.Name != "Test Strip" || candidate.Address != host {
		t.Fatalf("candidate = %+v", candidate)
	}
}

func TestProbeWLEDAtIPRejectsNonWLED(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"info":{}}`))
	}))
	defer srv.Close()
	host, _, err := net.SplitHostPort(srv.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	_, ok := probeWLEDAtIP(context.Background(), srv.Client(), host)
	if ok {
		t.Fatal("expected non-WLED response to be rejected")
	}
}
