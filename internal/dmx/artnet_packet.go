package dmx

const (
	artNetID      = "Art-Net\x00"
	artDMXOpLo    = 0x00
	artDMXOpHi    = 0x50
	artNetProtoHi = 0x00
	artNetProtoLo = 0x0e
)

// BuildArtDMXPacket creates an ArtDmx packet with a full 512-channel universe payload.
func BuildArtDMXPacket(universe [512]byte, sequence byte, netID, subnet, universeID int) []byte {
	packet := make([]byte, 18+len(universe))
	copy(packet[:8], []byte(artNetID))
	packet[8] = artDMXOpLo
	packet[9] = artDMXOpHi
	packet[10] = artNetProtoHi
	packet[11] = artNetProtoLo
	packet[12] = sequence
	packet[13] = 0
	packet[14] = byte(((subnet & 0x0f) << 4) | (universeID & 0x0f))
	packet[15] = byte(netID & 0x7f)
	packet[16] = 0x02
	packet[17] = 0x00
	copy(packet[18:], universe[:])
	return packet
}
