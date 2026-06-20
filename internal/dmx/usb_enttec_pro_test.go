package dmx

import "testing"

func TestBuildEnttecProSendDMXPacket(t *testing.T) {
	var universe [512]byte
	universe[0] = 255
	universe[511] = 128

	packet := BuildEnttecProSendDMXPacket(universe)
	if len(packet) != 518 {
		t.Fatalf("packet length = %d, want 518", len(packet))
	}
	if packet[0] != 0x7E || packet[1] != 0x06 || packet[2] != 0x01 || packet[3] != 0x02 || packet[4] != 0x00 {
		t.Fatalf("unexpected header: %v", packet[:5])
	}
	if packet[517] != 0xE7 {
		t.Fatalf("footer = %#x, want 0xE7", packet[517])
	}
	if packet[5] != 255 || packet[516] != 128 {
		t.Fatalf("universe copy mismatch: first=%d last=%d", packet[5], packet[516])
	}
}

func TestUsesEnttecProProtocol(t *testing.T) {
	cases := []struct {
		desc, name, path string
		want             bool
	}{
		// Linux: /dev/serial/by-id name in Description (typical working setup).
		{"usb-Enttec_DMX_USB_Pro_EN123456-if00", "ttyACM0", "/dev/ttyACM0", true},
		{"usb-Eurolite_Eurolite_DMX512_Pro-if00", "ttyACM1", "/dev/ttyACM1", true},
		// Linux: bare ttyACM when by-id is unavailable (CDC ACM Pro fallback).
		{"", "ttyACM0", "/dev/ttyACM0", true},
		// macOS: bare usbmodem when IOKit/by-id has no vendor string.
		{"", "cu.usbmodem1101", "/dev/cu.usbmodem1101", true},
		{"", "tty.usbmodem1101", "/dev/tty.usbmodem1101", true},
		// FTDI Open DMX and generic serial: raw 513-byte stream.
		{"", "Enttec DMX USB Pro", "/dev/ttyUSB0", true},
		{"", "ttyUSB0", "/dev/ttyUSB0", false},
	}
	for _, tc := range cases {
		got := UsesEnttecProProtocol(tc.desc, tc.name, tc.path)
		if got != tc.want {
			t.Fatalf("UsesEnttecProProtocol(%q,%q,%q) = %v, want %v", tc.desc, tc.name, tc.path, got, tc.want)
		}
	}
}
