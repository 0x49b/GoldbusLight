//go:build linux

package platform

// SignalProbe describes sigaction flags for a signal.
type SignalProbe struct {
	Signum     int  `json:"signum"`
	Flags      int  `json:"flags"`
	HasOnStack bool `json:"hasOnStack"`
	ProbeOK    bool `json:"probeOk"`
}
