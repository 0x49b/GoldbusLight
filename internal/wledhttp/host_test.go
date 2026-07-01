package wledhttp

import "testing"

func TestHostForHTTP(t *testing.T) {
	cases := []struct {
		host, address, want string
	}{
		{"wled-abc.local.", "192.168.4.1", "192.168.4.1"},
		{"WLED-ABC.LOCAL", "10.0.0.2", "10.0.0.2"},
		{"", "192.168.1.5", "192.168.1.5"},
		{"  ", "192.168.1.5", "192.168.1.5"},
		{"wled.lan", "192.168.1.5", "192.168.1.5"},
		{"wled-abc", "192.168.1.5", "192.168.1.5"},
		{"wled-abc.local.", "", "wled-abc.local"},
	}
	for _, tc := range cases {
		if got := HostForHTTP(tc.host, tc.address); got != tc.want {
			t.Errorf("HostForHTTP(%q, %q) = %q, want %q", tc.host, tc.address, got, tc.want)
		}
	}
}
