package goldbus

import "testing"

func TestEffectiveAppVersion(t *testing.T) {
	original := AppVersion
	t.Cleanup(func() {
		AppVersion = original
	})

	AppVersion = "1.2.3"
	if got := EffectiveAppVersion(); got != "1.2.3" {
		t.Fatalf("EffectiveAppVersion() = %q, want %q", got, "1.2.3")
	}

	AppVersion = "  "
	if got := EffectiveAppVersion(); got != DefaultAppVersion {
		t.Fatalf("EffectiveAppVersion() = %q, want default %q", got, DefaultAppVersion)
	}

	AppVersion = ""
	if got := EffectiveAppVersion(); got != DefaultAppVersion {
		t.Fatalf("EffectiveAppVersion() = %q, want default %q", got, DefaultAppVersion)
	}
}
