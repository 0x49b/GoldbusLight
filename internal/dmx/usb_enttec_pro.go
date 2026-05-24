package dmx

import "strings"

const enttecProLabelSendDMX = 0x06

// BuildEnttecProSendDMXPacket wraps a 512-channel universe in the Enttec / Eurolite
// USB-DMX512 Pro serial packet format (label 6).
func BuildEnttecProSendDMXPacket(universe [512]byte) []byte {
	packet := make([]byte, 518)
	packet[0] = 0x7E
	packet[1] = enttecProLabelSendDMX
	packet[2] = 0x01 // LSB of payload length (start code + 512 slots = 513)
	packet[3] = 0x02 // MSB
	packet[4] = 0x00 // DMX start code
	copy(packet[5:517], universe[:])
	packet[517] = 0xE7
	return packet
}

// UsesEnttecProProtocol reports whether a listed USB serial device expects Enttec Pro
// framed packets instead of a raw 513-byte stream.
func UsesEnttecProProtocol(description, name, path string) bool {
	hay := strings.ToLower(strings.TrimSpace(description) + " " + strings.TrimSpace(name) + " " + strings.TrimSpace(path))
	if strings.Contains(hay, "enttec") {
		return true
	}
	if strings.Contains(hay, "eurolite") && strings.Contains(hay, "dmx") {
		return true
	}
	if strings.Contains(hay, "dmx512") && strings.Contains(hay, "pro") {
		return true
	}
	return false
}
