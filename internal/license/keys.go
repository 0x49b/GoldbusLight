package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"sync"
)

// Default development public key. Replace for production releases.
const defaultDevPublicKeyB64 = "IMSy3MuQPNiauGT0gPrYULYb2HaZbASRG3JiZebj/1g="

var (
	publicKeyMu sync.RWMutex
	publicKey   ed25519.PublicKey
)

func init() {
	_ = SetPublicKeyBase64(defaultDevPublicKeyB64)
}

// SetPublicKeyBase64 configures the embedded verification key.
func SetPublicKeyBase64(encoded string) error {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return err
	}
	if len(raw) != ed25519.PublicKeySize {
		return errInvalidPublicKeySize(len(raw))
	}
	publicKeyMu.Lock()
	publicKey = ed25519.PublicKey(raw)
	publicKeyMu.Unlock()
	return nil
}

func verificationKey() ed25519.PublicKey {
	publicKeyMu.RLock()
	defer publicKeyMu.RUnlock()
	out := make(ed25519.PublicKey, len(publicKey))
	copy(out, publicKey)
	return out
}

// DefaultDevPrivateKey is used by licensegen in development only.
func DefaultDevPrivateKey() ed25519.PrivateKey {
	raw, err := base64.StdEncoding.DecodeString("Fjv46FGBMuBY5LhfVXZ63D/vaZeNbEfPsriB6c7N08wgxLLcy5A82Jq4ZPSA+thQthvYdplsBJEbcmJl5uP/WA==")
	if err != nil {
		panic(err)
	}
	return ed25519.PrivateKey(raw)
}

type invalidPublicKeySizeError int

func (e invalidPublicKeySizeError) Error() string {
	return "invalid ed25519 public key size"
}

func errInvalidPublicKeySize(n int) error {
	return invalidPublicKeySizeError(n)
}
