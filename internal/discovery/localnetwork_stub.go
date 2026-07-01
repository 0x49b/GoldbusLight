//go:build !darwin

package discovery

import "log"

func WarmupLocalNetworkAccess(*log.Logger) {}
