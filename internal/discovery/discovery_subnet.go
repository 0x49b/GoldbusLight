package discovery

import (
	"net"
)

// IPv4ProbeTargets returns IPv4 addresses on iface's first numbered IPv4 subnet,
// excluding the network/broadcast addresses and any address assigned to iface itself.
func IPv4ProbeTargets(iface *net.Interface) []string {
	if iface == nil {
		return nil
	}
	addrs, err := iface.Addrs()
	if err != nil {
		return nil
	}
	self := map[string]struct{}{}
	for _, a := range addrs {
		if ipNet, ok := a.(*net.IPNet); ok {
			if ip4 := ipNet.IP.To4(); ip4 != nil {
				self[ip4.String()] = struct{}{}
			}
		}
	}

	var targets []string
	for _, a := range addrs {
		ipNet, ok := a.(*net.IPNet)
		if !ok || ipNet.IP.To4() == nil {
			continue
		}
		maskOnes, bits := ipNet.Mask.Size()
		if bits != 32 || maskOnes >= 31 {
			continue
		}
		network := ipNet.IP.Mask(ipNet.Mask).To4()
		bcast := broadcastIPv4(network, ipNet.Mask)
		if bcast == nil {
			continue
		}

		cur := cloneIPv4(network)
		incIPv4(cur)
		for !cur.Equal(bcast) {
			s := cur.String()
			if _, skip := self[s]; !skip {
				targets = append(targets, s)
			}
			incIPv4(cur)
		}
		break
	}
	return targets
}

func cloneIPv4(ip net.IP) net.IP {
	out := make(net.IP, len(ip.To4()))
	copy(out, ip.To4())
	return out
}

func incIPv4(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] != 0 {
			return
		}
	}
}

func broadcastIPv4(network net.IP, mask net.IPMask) net.IP {
	n := network.To4()
	m := net.IP(mask).To4()
	if n == nil || m == nil || len(n) != len(m) {
		return nil
	}
	b := make(net.IP, len(n))
	for i := range n {
		b[i] = n[i] | ^m[i]
	}
	return b
}
