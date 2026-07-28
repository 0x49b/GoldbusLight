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

func TestDetectUSBProtocol(t *testing.T) {
	cases := []struct {
		desc, name, path string
		want             USBProtocol
		needsProbe       bool
	}{
		{"usb-Enttec_DMX_USB_Pro_EN123456-if00", "ttyACM0", "/dev/ttyACM0", USBProtocolEnttecPro, false},
		{"usb-Eurolite_Eurolite_DMX512_Pro-if00", "ttyACM1", "/dev/ttyACM1", USBProtocolEnttecPro, false},
		{"", "ttyACM0", "/dev/ttyACM0", USBProtocolEnttecPro, false},
		{"", "cu.usbmodem1101", "/dev/cu.usbmodem1101", USBProtocolEnttecPro, false},
		{"", "Enttec DMX USB Pro", "/dev/ttyUSB0", USBProtocolEnttecPro, false},
		// FTDI by-id with Enttec "EN…" serial — no "enttec" word, must still be Pro.
		{"usb-FTDI_FT232R_USB_UART_EN175330-if00-port0", "ttyUSB0", "/dev/ttyUSB0", USBProtocolEnttecPro, false},
		{"usb-DMXking_ultraDMX_Micro_123-if00-port0", "ttyUSB1", "/dev/ttyUSB1", USBProtocolEnttecPro, false},
		{"usb-Eurolite_USB-DMX_Interface_Cable-if00", "ttyUSB2", "/dev/ttyUSB2", USBProtocolOpenDMX, false},
		{"usb-ENTTEC_Open_DMX_USB_XXXX-if00-port0", "ttyUSB3", "/dev/ttyUSB3", USBProtocolOpenDMX, false},
		// Ambiguous bare FTDI — probe required.
		{"", "ttyUSB0", "/dev/ttyUSB0", "", true},
		{"usb-FTDI_FT232R_USB_UART_A1001-if00-port0", "ttyUSB0", "/dev/ttyUSB0", "", true},
	}
	for _, tc := range cases {
		got := DetectUSBProtocol(tc.desc, tc.name, tc.path)
		if USBProtocolNeedsProbe(got) != tc.needsProbe {
			t.Fatalf("DetectUSBProtocol(%q,%q,%q) needsProbe=%v, want %v (got %q)",
				tc.desc, tc.name, tc.path, USBProtocolNeedsProbe(got), tc.needsProbe, got)
		}
		if !tc.needsProbe && got != tc.want {
			t.Fatalf("DetectUSBProtocol(%q,%q,%q) = %q, want %q", tc.desc, tc.name, tc.path, got, tc.want)
		}
	}
}

func TestUsesEnttecProProtocol(t *testing.T) {
	cases := []struct {
		desc, name, path string
		want             bool
	}{
		{"usb-Enttec_DMX_USB_Pro_EN123456-if00", "ttyACM0", "/dev/ttyACM0", true},
		{"usb-Eurolite_Eurolite_DMX512_Pro-if00", "ttyACM1", "/dev/ttyACM1", true},
		{"", "ttyACM0", "/dev/ttyACM0", true},
		{"", "cu.usbmodem1101", "/dev/cu.usbmodem1101", true},
		{"", "tty.usbmodem1101", "/dev/tty.usbmodem1101", true},
		{"", "Enttec DMX USB Pro", "/dev/ttyUSB0", true},
		{"usb-FTDI_FT232R_USB_UART_EN175330-if00-port0", "ttyUSB0", "/dev/ttyUSB0", true},
		{"usb-ENTTEC_Open_DMX_USB_XXXX-if00-port0", "ttyUSB0", "/dev/ttyUSB0", false},
		// Ambiguous bare FTDI: legacy helper still prefers Pro.
		{"", "ttyUSB0", "/dev/ttyUSB0", true},
	}
	for _, tc := range cases {
		got := UsesEnttecProProtocol(tc.desc, tc.name, tc.path)
		if got != tc.want {
			t.Fatalf("UsesEnttecProProtocol(%q,%q,%q) = %v, want %v", tc.desc, tc.name, tc.path, got, tc.want)
		}
	}
}

func TestBuildEnttecProSetWidgetParams(t *testing.T) {
	packet := BuildEnttecProSetWidgetParams(9, 1, 40)
	if len(packet) != 10 {
		t.Fatalf("len=%d want 10", len(packet))
	}
	if packet[0] != 0x7E || packet[1] != 0x04 || packet[2] != 5 || packet[3] != 0 {
		t.Fatalf("bad header %v", packet[:4])
	}
	if packet[4] != 0 || packet[5] != 0 || packet[6] != 9 || packet[7] != 1 || packet[8] != 40 || packet[9] != 0xE7 {
		t.Fatalf("bad payload/footer %v", packet)
	}
}
