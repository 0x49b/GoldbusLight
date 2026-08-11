//go:build !linux

package network

import (
	"context"
	"testing"
)

func TestListIPNeighborsUnsupported(t *testing.T) {
	if ListIPNeighborsSupported() {
		t.Fatal("expected ListIPNeighborsSupported false off linux")
	}
	result := ListIPNeighbors(context.Background(), nil)
	if result.Success {
		t.Fatal("expected unsuccessful result off linux")
	}
	if result.Error == "" {
		t.Fatal("expected error message off linux")
	}
}
