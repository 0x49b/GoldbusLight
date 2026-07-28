package serial

// USBSerialDevice describes one candidate USB serial device for DMX output selection.
type USBSerialDevice struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// Protocol is a UI hint for the likely USB DMX framing ("enttec-pro", "open-dmx", or "auto").
	Protocol string `json:"protocol,omitempty"`
}
