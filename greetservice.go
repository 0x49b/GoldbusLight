package main

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type GreetService struct {
	controller *WLEDController
}

func NewGreetService(controller *WLEDController) *GreetService {
	return &GreetService{controller: controller}
}

func (g *GreetService) Greet(name string) string {
	return "Hello " + name + "!"
}

func (g *GreetService) GetControllerSnapshot() (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GreetService) DefaultControllerSettings() (ControllerSettings, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSettings{}, err
	}
	return controller.Snapshot().Settings, nil
}

func (g *GreetService) SaveControllerSettings(settings ControllerSettings) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	if err := controller.SaveSettings(settings); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GreetService) ApplyNetworkSettings() (NetworkApplyResult, error) {
	controller, err := g.requireController()
	if err != nil {
		return NetworkApplyResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return controller.ApplyNetwork(ctx), nil
}

func (g *GreetService) ScanNetworks() ([]WiFiNetwork, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return controller.ScanUpstreamNetworks(ctx)
}

func (g *GreetService) DiscoverDevicesNow() ([]WLEDDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return controller.DiscoverNow(ctx)
}

func (g *GreetService) SetDeviceState(deviceID string, state map[string]any) (ControllerSnapshot, error) {
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

func (g *GreetService) SetGlobalState(state map[string]any) (map[string]string, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return controller.SetGlobalState(ctx, state), nil
}

func (g *GreetService) ProvisionDevice(deviceID string) (ControllerSnapshot, error) {
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

func (g *GreetService) RefreshDevice(deviceID string) (ControllerSnapshot, error) {
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

func (g *GreetService) GetDeviceDetail(deviceID string) (WLEDDeviceDetail, error) {
	controller, err := g.requireController()
	if err != nil {
		return WLEDDeviceDetail{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return controller.GetDeviceDetail(ctx, deviceID), nil
}

func (g *GreetService) RemoveDevice(deviceID string) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}

	if err := controller.RemoveDevice(deviceID); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GreetService) GetIgnoredDevices() ([]WLEDDevice, error) {
	controller, err := g.requireController()
	if err != nil {
		return nil, err
	}
	return controller.IgnoredDevices(), nil
}

func (g *GreetService) SetDeviceIgnored(deviceID string, ignored bool) (ControllerSnapshot, error) {
	controller, err := g.requireController()
	if err != nil {
		return ControllerSnapshot{}, err
	}
	if err := controller.SetDeviceIgnored(deviceID, ignored); err != nil {
		return ControllerSnapshot{}, err
	}
	return controller.Snapshot(), nil
}

func (g *GreetService) RenameDevice(deviceID string, name string) (ControllerSnapshot, error) {
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

func (g *GreetService) ControllerSummary() (string, error) {
	controller, err := g.requireController()
	if err != nil {
		return "", err
	}
	snapshot := controller.Snapshot()
	return fmt.Sprintf("Devices: %d, persistence: %s", len(snapshot.Devices), snapshot.PersistencePath), nil
}

func (g *GreetService) requireController() (*WLEDController, error) {
	if g.controller == nil {
		return nil, errors.New("controller is not initialized")
	}
	return g.controller, nil
}
