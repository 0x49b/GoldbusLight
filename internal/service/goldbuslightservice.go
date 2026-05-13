package service

import (
	"context"
	"errors"
	"fmt"
	"goldbus"
	ctrlpkg "goldbus/internal/controller"
	"goldbus/internal/dmx"
	"time"
)

type GoldbusLightService struct {
	controller *ctrlpkg.WLEDController
}

func NewGreetService(controller *ctrlpkg.WLEDController) *GoldbusLightService {
	return &GoldbusLightService{controller: controller}
}

func (g *GoldbusLightService) Greet(name string) string {
	return "Hello " + name + "!"
}

func (g *GoldbusLightService) AppVersion() string {
	return goldbus.AppVersion
}

func (g *GoldbusLightService) GetControllerSnapshot() (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) DefaultControllerSettings() (ctrlpkg.ControllerSettings, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSettings{}, err
	}
	return controller.Snapshot().Settings, nil
}

func (g *GoldbusLightService) SaveControllerSettings(settings ctrlpkg.ControllerSettings) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	if err := controller.SaveSettings(settings); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) ApplyNetworkSettings() (ctrlpkg.NetworkApplyResult, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.NetworkApplyResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return controller.ApplyNetwork(ctx), nil
}

func (g *GoldbusLightService) DiscoverDevicesNow() ([]ctrlpkg.WLEDDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return controller.DiscoverNow(ctx)
}

func (g *GoldbusLightService) SetDeviceState(deviceID string, state map[string]any) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := controller.SetDeviceState(ctx, deviceID, state); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) SetGlobalState(state map[string]any) (map[string]string, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	if !controller.Snapshot().Settings.WLED.Enabled {
		return nil, fmt.Errorf("wled component is disabled in settings")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return controller.SetGlobalState(ctx, state), nil
}

func (g *GoldbusLightService) ProvisionDevice(deviceID string) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := controller.ProvisionDevice(ctx, deviceID); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) RefreshDevice(deviceID string) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := controller.RefreshDevice(ctx, deviceID); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) GetDeviceDetail(deviceID string) (ctrlpkg.WLEDDeviceDetail, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.WLEDDeviceDetail{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return controller.GetDeviceDetail(ctx, deviceID), nil
}

func (g *GoldbusLightService) RemoveDevice(deviceID string) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}

	if err := controller.RemoveDevice(deviceID); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) GetIgnoredDevices() ([]ctrlpkg.WLEDDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	return controller.IgnoredDevices(), nil
}

func (g *GoldbusLightService) SetDeviceIgnored(deviceID string, ignored bool) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	if err := controller.SetDeviceIgnored(deviceID, ignored); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) RenameDevice(deviceID string, name string) (ctrlpkg.ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := controller.RenameDevice(ctx, deviceID, name); err != nil {
		return ctrlpkg.ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) ControllerSummary() (string, error) {
	controller, err := g.requireController()
	if err != nil {
		return "", err
	}
	snapshot := controller.Snapshot()
	return fmt.Sprintf("Devices: %d, persistence: %s", len(snapshot.Devices), snapshot.PersistencePath), nil
}

func (g *GoldbusLightService) GetDMXState() (ctrlpkg.DMXState, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.DMXState{}, err
	}
	return controller.GetDMXState(), nil
}

func (g *GoldbusLightService) CreateDMXFixture(input ctrlpkg.UpsertDMXFixtureInput) (ctrlpkg.DMXFixture, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.DMXFixture{}, err
	}
	return controller.CreateDMXFixture(input)
}

func (g *GoldbusLightService) UpdateDMXFixture(input ctrlpkg.UpsertDMXFixtureInput) (ctrlpkg.DMXFixture, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.DMXFixture{}, err
	}
	return controller.UpdateDMXFixture(input)
}

func (g *GoldbusLightService) DeleteDMXFixture(id string) error {
	controller, err := g.requireController()
	if err != nil {
		return err
	}
	return controller.DeleteDMXFixture(id)
}

func (g *GoldbusLightService) ListUSBSerialDevices() ([]ctrlpkg.USBSerialDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	return controller.ListUSBSerialDevices(), nil
}

func (g *GoldbusLightService) SetSelectedUSBSerialDevice(deviceID string) (ctrlpkg.DMXState, error) {
	controller, err := g.requireController()
	if err != nil {
		return ctrlpkg.DMXState{}, err
	}
	if err := controller.SetSelectedUSBSerialDevice(deviceID); err != nil {
		return ctrlpkg.DMXState{}, err
	}
	return controller.GetDMXState(), nil
}

func (g *GoldbusLightService) StartDMXLive(fixtureID string) error {
	controller, err := g.requireController()
	if err != nil {
		return err
	}
	return controller.StartDMXLive(fixtureID)
}

func (g *GoldbusLightService) StopDMXLive() {
	controller, err := g.requireController()
	if err != nil {
		return
	}
	controller.StopDMXLive()
}

func (g *GoldbusLightService) ApplyDMXLivePatch(updates []dmx.DMXOutputUpdate) error {
	controller, err := g.requireController()
	if err != nil {
		return err
	}
	return controller.ApplyDMXLivePatch(updates)
}

func (g *GoldbusLightService) GetDMXLiveStatus() (dmx.DMXLiveStatus, error) {
	controller, err := g.requireController()
	if err != nil {
		return dmx.DMXLiveStatus{}, err
	}
	return controller.GetDMXLiveStatus(), nil
}

func (g *GoldbusLightService) requireController() (*ctrlpkg.WLEDController, error) {
	if g.controller == nil {
		return nil, errors.New("controller is not initialized")
	}
	return g.controller, nil
}
