package license

// Feature identifies a license-gated capability.
type Feature string

const (
	FeatureDMX              Feature = "dmx"
	FeatureParty            Feature = "party"
	FeatureAccessPoint      Feature = "accessPoint"
	FeatureBackup           Feature = "backup"
	FeatureFixtureExport    Feature = "fixtureExport"
	FeatureDMXChannelSweep  Feature = "dmxChannelSweep"
	FeatureWLEDUnlimited    Feature = "wledUnlimited"
)

func featureMapForEdition(edition string) map[string]bool {
	free := map[string]bool{
		string(FeatureWLEDUnlimited):   false,
		string(FeatureDMX):             false,
		string(FeatureParty):           false,
		string(FeatureAccessPoint):     false,
		string(FeatureBackup):          false,
		string(FeatureFixtureExport):   false,
		string(FeatureDMXChannelSweep): false,
	}
	if edition != EditionPro {
		return free
	}
	return map[string]bool{
		string(FeatureWLEDUnlimited):   true,
		string(FeatureDMX):             true,
		string(FeatureParty):           true,
		string(FeatureAccessPoint):     true,
		string(FeatureBackup):          true,
		string(FeatureFixtureExport):   true,
		string(FeatureDMXChannelSweep): true,
	}
}

func (m *Manager) Allows(feature Feature) bool {
	info := m.Current()
	return info.Features[string(feature)]
}

func (m *Manager) RequireFeature(feature Feature) error {
	if m.Allows(feature) {
		return nil
	}
	return ErrFeatureNotAvailable
}
