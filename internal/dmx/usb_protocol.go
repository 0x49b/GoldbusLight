package dmx

import (
	"fmt"
	"strings"
	"time"

	goserial "go.bug.st/serial"
)

// USBProtocol is the host↔adapter framing used for USB DMX output.
type USBProtocol string

const (
	// USBProtocolEnttecPro is the Enttec DMX USB Pro API (label 6 framed packets).
	// Also used by Eurolite PRO, DMXking ultraDMX, JESE, and other Pro-compatible widgets.
	USBProtocolEnttecPro USBProtocol = "enttec-pro"
	// USBProtocolOpenDMX is a raw 513-byte DMX stream with a serial BREAK (Open DMX / Cable).
	USBProtocolOpenDMX USBProtocol = "open-dmx"
)

// Serial timing for each protocol.
const (
	EnttecProBaudRate = 57600
	OpenDMXBaudRate   = 250000
	// Enttec Pro widgets regenerate DMX at most ~40 Hz (API: rate 1–40, or 0 = fastest).
	EnttecProMaxFrameHz = 40
	// OpenDMX / raw DMX line rate target.
	OpenDMXFrameHz = 44
	// DMX512 break must be ≥88µs; 100µs is a common safe default.
	OpenDMXBreakDuration = 100 * time.Microsecond
)

// USBProtocolLabel returns a short console/UI label for the protocol.
func USBProtocolLabel(p USBProtocol) string {
	switch p {
	case USBProtocolEnttecPro:
		return "Enttec Pro"
	case USBProtocolOpenDMX:
		return "Open DMX"
	default:
		return string(p)
	}
}

// SerialModeForUSBProtocol returns the serial port mode for the given USB DMX protocol.
func SerialModeForUSBProtocol(p USBProtocol) *goserial.Mode {
	baud := OpenDMXBaudRate
	if p == USBProtocolEnttecPro {
		baud = EnttecProBaudRate
	}
	return &goserial.Mode{
		BaudRate: baud,
		DataBits: 8,
		Parity:   goserial.NoParity,
		StopBits: goserial.TwoStopBits,
	}
}

// FrameHzForUSBProtocol returns the host-side refresh rate for the protocol.
func FrameHzForUSBProtocol(p USBProtocol) int {
	if p == USBProtocolEnttecPro {
		return EnttecProMaxFrameHz
	}
	return OpenDMXFrameHz
}

// DetectUSBProtocol classifies a listed USB serial device from OS description strings.
// Ambiguous FTDI/ttyUSB adapters should be confirmed with ProbeEnttecProWidget.
func DetectUSBProtocol(description, name, path string) USBProtocol {
	hay := strings.ToLower(strings.TrimSpace(description) + " " + strings.TrimSpace(name) + " " + strings.TrimSpace(path))

	// Explicit Open DMX / Cable style adapters (raw BREAK + 513-byte frames).
	if isOpenDMXName(hay) {
		return USBProtocolOpenDMX
	}

	// Known Enttec Pro–compatible brands / product strings.
	if strings.Contains(hay, "enttec") && !isOpenDMXName(hay) {
		return USBProtocolEnttecPro
	}
	if strings.Contains(hay, "eurolite") && strings.Contains(hay, "dmx") {
		// Eurolite "Cable" is Open DMX; "PRO" / "DMX512 Pro" is Pro API.
		if strings.Contains(hay, "cable") && !strings.Contains(hay, "pro") {
			return USBProtocolOpenDMX
		}
		return USBProtocolEnttecPro
	}
	if strings.Contains(hay, "dmxking") || strings.Contains(hay, "ultradmx") || strings.Contains(hay, "ultra-dmx") {
		return USBProtocolEnttecPro
	}
	if strings.Contains(hay, "jese") || strings.Contains(hay, "jesé") {
		return USBProtocolEnttecPro
	}
	if strings.Contains(hay, "dmx512") && strings.Contains(hay, "pro") {
		return USBProtocolEnttecPro
	}
	// Enttec Pro serial numbers traditionally start with "EN" on FTDI by-id names, e.g.
	// usb-FTDI_FT232R_USB_UART_EN175330-if00-port0 — without the word "enttec".
	if looksLikeEnttecProSerial(hay) {
		return USBProtocolEnttecPro
	}

	// CDC ACM / usbmodem widgets are almost always Pro-style (Eurolite PRO, some clones).
	if strings.Contains(hay, "ttyacm") || strings.Contains(hay, "usbmodem") {
		return USBProtocolEnttecPro
	}

	// Bare FTDI ttyUSB / cu.usbserial: could be Pro or Open DMX — caller should probe.
	if isAmbiguousFTDISerial(hay) {
		return ""
	}

	// Prefer Pro for remaining unknown USB-serial DMX candidates; docs target Pro-compatible adapters.
	return USBProtocolEnttecPro
}

// USBProtocolNeedsProbe reports whether DetectUSBProtocol could not decide (empty protocol).
func USBProtocolNeedsProbe(p USBProtocol) bool {
	return strings.TrimSpace(string(p)) == ""
}

func isOpenDMXName(hay string) bool {
	normalized := strings.NewReplacer("_", " ", "-", " ").Replace(hay)
	if strings.Contains(normalized, "open dmx") || strings.Contains(normalized, "opendmx") {
		return true
	}
	if strings.Contains(normalized, "dmx usb open") {
		return true
	}
	return false
}

func looksLikeEnttecProSerial(hay string) bool {
	// Match ..._EN123456... or ...-en123456... as Enttec Pro serial markers.
	for _, tok := range strings.FieldsFunc(hay, func(r rune) bool {
		return r == ' ' || r == '/' || r == '-' || r == '_' || r == '.'
	}) {
		if len(tok) >= 4 && strings.HasPrefix(tok, "en") {
			digits := tok[2:]
			if len(digits) >= 2 && isAllDigits(digits) {
				return true
			}
		}
	}
	return false
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func isAmbiguousFTDISerial(hay string) bool {
	if strings.Contains(hay, "ttyusb") || strings.Contains(hay, "usbserial") || strings.Contains(hay, "ftdi") {
		return true
	}
	return false
}

const (
	enttecProLabelGetParams = 0x03
	enttecProLabelSetParams = 0x04
)

// BuildEnttecProMessage builds a Pro API host→widget message.
func BuildEnttecProMessage(label byte, data []byte) []byte {
	n := len(data)
	packet := make([]byte, 0, 5+n)
	packet = append(packet, 0x7E, label, byte(n&0xFF), byte((n>>8)&0xFF))
	packet = append(packet, data...)
	packet = append(packet, 0xE7)
	return packet
}

// BuildEnttecProSetWidgetParams builds a Set Widget Parameters request (label 4)
// with empty user config, typical break/MAB, and the given output rate (1–40, or 0 = fastest).
func BuildEnttecProSetWidgetParams(breakUnits, mabUnits, rate byte) []byte {
	return BuildEnttecProMessage(enttecProLabelSetParams, []byte{
		0x00, 0x00, // user configuration size
		breakUnits,
		mabUnits,
		rate,
	})
}

// ProbeEnttecProWidget sends Get Widget Parameters (label 3) and returns true if a
// valid Pro reply (label 3) is observed. Used to distinguish Pro widgets from Open DMX
// on ambiguous FTDI serial ports.
func ProbeEnttecProWidget(port goserial.Port, timeout time.Duration) bool {
	if port == nil {
		return false
	}
	_ = port.ResetInputBuffer()
	_ = port.SetReadTimeout(timeout)
	req := BuildEnttecProMessage(enttecProLabelGetParams, []byte{0x00, 0x00})
	if err := WriteFull(port, req); err != nil {
		return false
	}
	deadline := time.Now().Add(timeout)
	buf := make([]byte, 256)
	var acc []byte
	for time.Now().Before(deadline) {
		n, err := port.Read(buf)
		if n > 0 {
			acc = append(acc, buf[:n]...)
			if enttecProReplyLabel(acc) == enttecProLabelGetParams {
				return true
			}
			if len(acc) > 1024 {
				acc = acc[len(acc)-512:]
			}
		}
		if err != nil && !isTimeoutErr(err) {
			return false
		}
	}
	return false
}

func enttecProReplyLabel(buf []byte) byte {
	for i := 0; i+4 < len(buf); i++ {
		if buf[i] != 0x7E {
			continue
		}
		label := buf[i+1]
		length := int(buf[i+2]) | int(buf[i+3])<<8
		end := i + 4 + length
		if end >= len(buf) {
			return 0
		}
		if buf[end] == 0xE7 {
			return label
		}
	}
	return 0
}

func isTimeoutErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "timeout") || strings.Contains(msg, "timed out") || strings.Contains(msg, "deadline")
}

// ConfigureEnttecProWidget sets break/MAB/rate so the widget keeps regenerating DMX output.
// Timing matches ENTTEC EMU defaults for DMX USB Pro (SKU 70304): break ≈181µs, MAB ≈106µs, 40 Hz.
// Units are 10.67µs per the Pro API (Set Widget Parameters, label 4).
func ConfigureEnttecProWidget(port goserial.Port) error {
	if port == nil {
		return fmt.Errorf("nil serial port")
	}
	const (
		breakUnits = 17 // 17 * 10.67µs ≈ 181µs (EMU default)
		mabUnits   = 10 // 10 * 10.67µs ≈ 107µs (EMU default ~106µs)
	)
	packet := BuildEnttecProSetWidgetParams(breakUnits, mabUnits, byte(EnttecProMaxFrameHz))
	if err := WriteFull(port, packet); err != nil {
		return err
	}
	_ = port.ResetInputBuffer()
	return nil
}

// WriteFull writes all of b to port, retrying short writes.
func WriteFull(port goserial.Port, b []byte) error {
	for len(b) > 0 {
		n, err := port.Write(b)
		if err != nil {
			return err
		}
		if n <= 0 {
			return fmt.Errorf("serial write returned %d bytes", n)
		}
		b = b[n:]
	}
	return nil
}

// WriteOpenDMXFrame sends a DMX512 frame with a leading BREAK (Open DMX / Cable).
func WriteOpenDMXFrame(port goserial.Port, universe [512]byte) error {
	if port == nil {
		return fmt.Errorf("nil serial port")
	}
	if err := port.Break(OpenDMXBreakDuration); err != nil {
		return fmt.Errorf("dmx break: %w", err)
	}
	frame := make([]byte, 513)
	frame[0] = 0 // start code
	copy(frame[1:], universe[:])
	return WriteFull(port, frame)
}

// ResolveUSBProtocol picks a concrete protocol, using an optional open port for probing
// when string heuristics are ambiguous.
func ResolveUSBProtocol(description, name, path string, port goserial.Port) USBProtocol {
	p := DetectUSBProtocol(description, name, path)
	if !USBProtocolNeedsProbe(p) {
		return p
	}
	if port != nil && ProbeEnttecProWidget(port, 200*time.Millisecond) {
		return USBProtocolEnttecPro
	}
	// Ambiguous FTDI that does not answer Pro get-params: treat as Open DMX (needs BREAK).
	return USBProtocolOpenDMX
}
