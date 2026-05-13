package main

import (
	"context"
	"errors"
	"fmt"
	"goldbus/internal/dmx"
	"time"
)

type GoldbusLightService struct {
	controller *WLEDController
}

func NewGreetService(controller *WLEDController) *GoldbusLightService {
	return &GoldbusLightService{controller: controller}
}

func (g *GoldbusLightService) Greet(name string) string {
	return "Hello " + name + "!"
}

func (g *GoldbusLightService) AppVersion() string {
	return appVersion
}

func (g *GoldbusLightService) GetControllerSnapshot() (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) DefaultControllerSettings() (ControllerSettings, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSettings{}, err
	}
	return controller.Snapshot().Settings, nil
}

func (g *GoldbusLightService) SaveControllerSettings(settings ControllerSettings) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	if err := controller.SaveSettings(settings); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) ApplyNetworkSettings() (NetworkApplyResult, error) {
	controller, err := g.requireController()
	if err != nil {
		return NetworkApplyResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return controller.ApplyNetwork(ctx), nil
}

func (g *GoldbusLightService) DiscoverDevicesNow() ([]WLEDDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return controller.DiscoverNow(ctx)
}

func (g *GoldbusLightService) SetDeviceState(deviceID string, state map[string]any) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := controller.SetDeviceState(ctx, deviceID, state); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) SetGlobalState(state map[string]any) (map[string]string, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return controller.SetGlobalState(ctx, state), nil
}

func (g *GoldbusLightService) ProvisionDevice(deviceID string) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := controller.ProvisionDevice(ctx, deviceID); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) RefreshDevice(deviceID string) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := controller.RefreshDevice(ctx, deviceID); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) GetDeviceDetail(deviceID string) (WLEDDeviceDetail, error) {
	controller, err := g.requireController()
	if err != nil {
		return WLEDDeviceDetail{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return controller.GetDeviceDetail(ctx, deviceID), nil
}

func (g *GoldbusLightService) RemoveDevice(deviceID string) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}

	if err := controller.RemoveDevice(deviceID); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) GetIgnoredDevices() ([]WLEDDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	return controller.IgnoredDevices(), nil
}

func (g *GoldbusLightService) SetDeviceIgnored(deviceID string, ignored bool) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	if err := controller.SetDeviceIgnored(deviceID, ignored); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GoldbusLightService) RenameDevice(deviceID string, name string) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := controller.RenameDevice(ctx, deviceID, name); err != nil {
		return ControllerSnapshot{}, err
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

func (g *GoldbusLightService) GetDMXState() (DMXState, error) {
	controller, err := g.requireController()
	if err != nil {
		return DMXState{}, err
	}
	return controller.GetDMXState(), nil
}

func (g *GoldbusLightService) CreateDMXFixture(input UpsertDMXFixtureInput) (DMXFixture, error) {
	controller, err := g.requireController()
	if err != nil {
		return DMXFixture{}, err
	}
	return controller.CreateDMXFixture(input)
}

func (g *GoldbusLightService) UpdateDMXFixture(input UpsertDMXFixtureInput) (DMXFixture, error) {
	controller, err := g.requireController()
	if err != nil {
		return DMXFixture{}, err
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

func (g *GoldbusLightService) ListUSBSerialDevices() ([]USBSerialDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	return controller.ListUSBSerialDevices(), nil
}

func (g *GoldbusLightService) SetSelectedUSBSerialDevice(deviceID string) (DMXState, error) {
	controller, err := g.requireController()
	if err != nil {
		return DMXState{}, err
	}
	if err := controller.SetSelectedUSBSerialDevice(deviceID); err != nil {
		return DMXState{}, err
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

func (g *GoldbusLightService) requireController() (*WLEDController, error) {
	if g.controller == nil {
		return nil, errors.New("controller is not initialized")
	}
	return g.controller, nil
}
