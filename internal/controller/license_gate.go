package controller

import (
	"context"
	"fmt"
	"goldbus/internal/license"
	"time"
)

func (c *WLEDController) LicenseInfo() license.LicenseInfo {
	return c.licenseInfo()
}

func (c *WLEDController) licenseInfo() license.LicenseInfo {
	if c.licenseManager == nil {
		return license.LicenseInfo{
			Edition:  license.EditionFree,
			Status:   license.StatusFree,
			Features: licenseFeatureMap(license.EditionFree),
		}
	}
	return c.licenseManager.Current()
}

func (c *WLEDController) refreshLicense() license.LicenseInfo {
	if c.licenseManager == nil {
		return c.licenseInfo()
	}
	prev := c.licenseManager.Current()
	info := c.licenseManager.Refresh()
	if proEntitled(prev) && !proEntitled(info) {
		c.downgradeProFeatures()
	}
	return info
}

func (c *WLEDController) ActivateLicense(key string) (license.LicenseInfo, error) {
	if c.licenseManager == nil {
		return license.LicenseInfo{}, fmt.Errorf("license manager unavailable")
	}
	info, err := c.licenseManager.Activate(key)
	if err != nil {
		return license.LicenseInfo{}, err
	}
	c.touch()
	return info, nil
}

func (c *WLEDController) DeactivateLicense() license.LicenseInfo {
	if c.licenseManager == nil {
		return c.licenseInfo()
	}
	info := c.licenseManager.Deactivate()
	c.downgradeProFeatures()
	c.touch()
	return info
}

func (c *WLEDController) requireLicenseFeature(feature license.Feature) error {
	if c.licenseManager == nil {
		return license.ErrFeatureNotAvailable
	}
	return c.licenseManager.RequireFeature(feature)
}

func (c *WLEDController) requireLicensedDMX() error {
	if err := c.requireLicenseFeature(license.FeatureDMX); err != nil {
		return err
	}
	if !c.dmxEnabled() {
		return fmt.Errorf("dmx component is disabled in settings")
	}
	return nil
}

func (c *WLEDController) requireLicensedParty() error {
	if err := c.requireLicenseFeature(license.FeatureParty); err != nil {
		return err
	}
	if !c.partyFeaturesEnabled() {
		return fmt.Errorf("party mode requires WLED or DMX to be enabled in settings")
	}
	return nil
}

func (c *WLEDController) RequireLicenseFeature(feature license.Feature) error {
	return c.requireLicenseFeature(feature)
}

func (c *WLEDController) countActiveWLEDDevicesLocked() int {
	count := 0
	for _, device := range c.devices {
		if device.Ignored {
			continue
		}
		if isSimulatedWLED(device, c.settings) {
			continue
		}
		count++
	}
	return count
}

func (c *WLEDController) canAddWLEDDeviceLocked() error {
	if c.licenseManager != nil && c.licenseManager.Allows(license.FeatureWLEDUnlimited) {
		return nil
	}
	if c.countActiveWLEDDevicesLocked() >= license.FreeMaxWLEDDevices {
		return fmt.Errorf("free edition supports up to %d WLED devices; upgrade to Pro for unlimited devices", license.FreeMaxWLEDDevices)
	}
	return nil
}

func (c *WLEDController) downgradeProFeatures() {
	c.StopDMXParty()
	c.StopDMXLive()
	c.mu.Lock()
	if c.settings.DMX.Enabled {
		c.settings.DMX.Enabled = false
	}
	if c.settings.AccessPoint.Enabled {
		c.settings.AccessPoint.Enabled = false
	}
	c.updated = time.Now()
	c.mu.Unlock()
	_ = c.persist()
}

func proEntitled(info license.LicenseInfo) bool {
	return info.Edition == license.EditionPro && (info.Status == license.StatusActive || info.Status == license.StatusGrace)
}

func (c *WLEDController) licenseRefreshLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.refreshLicense()
			c.touch()
		}
	}
}

func licenseFeatureMap(edition string) map[string]bool {
	if edition == license.EditionPro {
		return map[string]bool{
			string(license.FeatureWLEDUnlimited):   true,
			string(license.FeatureDMX):             true,
			string(license.FeatureParty):           true,
			string(license.FeatureAccessPoint):     true,
			string(license.FeatureBackup):          true,
			string(license.FeatureFixtureExport):   true,
			string(license.FeatureDMXChannelSweep): true,
		}
	}
	return map[string]bool{
		string(license.FeatureWLEDUnlimited):   false,
		string(license.FeatureDMX):             false,
		string(license.FeatureParty):           false,
		string(license.FeatureAccessPoint):     false,
		string(license.FeatureBackup):          false,
		string(license.FeatureFixtureExport):   false,
		string(license.FeatureDMXChannelSweep): false,
	}
}
