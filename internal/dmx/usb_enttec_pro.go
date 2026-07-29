package dmx

import "strings"

const enttecProLabelSendDMX = 0x06

// BuildEnttecProSendDMXPacket wraps a 512-channel universe in the Enttec / Eurolite
// USB-DMX512 Pro serial packet format (label 6).
func BuildEnttecProSendDMXPacket(universe [512]byte) []byte {
	data := make([]byte, 513)
	data[0] = 0x00 // DMX start code
	copy(data[1:], universe[:])
	return BuildEnttecProMessage(enttecProLabelSendDMX, data)
}

// UsesEnttecProProtocol reports whether a listed USB serial device expects Enttec Pro
// framed packets instead of a raw Open DMX stream.
//
// Prefer DetectUSBProtocol / ResolveUSBProtocol for new call sites; this helper remains
// for compatibility and treats ambiguous FTDI ports as Pro (historical default).
func UsesEnttecProProtocol(description, name, path string) bool {
	p := DetectUSBProtocol(description, name, path)
	if USBProtocolNeedsProbe(p) {
		// Legacy behaviour: unknown FTDI → Pro framing (many Enttec Pros lack "enttec" in by-id).
		return true
	}
	return p == USBProtocolEnttecPro
}

// GuessUSBProtocolLabel returns a UI/console hint without opening the port.
func GuessUSBProtocolLabel(description, name, path string) string {
	p := DetectUSBProtocol(description, name, path)
	if USBProtocolNeedsProbe(p) {
		hay := strings.ToLower(description + " " + name + " " + path)
		if isAmbiguousFTDISerial(hay) {
			return "auto (probe)"
		}
		return "auto"
	}
	return USBProtocolLabel(p)
}
