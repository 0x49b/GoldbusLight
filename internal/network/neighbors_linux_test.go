//go:build linux

package network

import "testing"

func TestListIPNeighborsSupported(t *testing.T) {
	if !ListIPNeighborsSupported() {
		t.Fatal("expected ListIPNeighborsSupported on linux")
	}
}
