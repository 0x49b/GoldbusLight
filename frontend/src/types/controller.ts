export type JSONMap = Record<string, unknown>;

export type AccessPointSettings = {
  enabled: boolean;
  connection: string;
  interfaceName: string;
  ssid: string;
  password: string;
  channel: number;
};

export type DiscoverySettings = {
  enabled: boolean;
  serviceTypes: string[];
  intervalSeconds: number;
  queryTimeoutMs: number;
  bindInterface: string;
  passiveBrowse: boolean;
  subnetProbe: boolean;
  pollIntervalSecondsWhenApEnabled: number;
};

export type ProvisioningSettings = {
  autoProvision: boolean;
  defaultStatePayload: JSONMap;
  defaultConfigPatch: JSONMap;
};

export type TestingSettings = {
  simulateWled: boolean;
};

export type ControllerSettings = {
  accessPoint: AccessPointSettings;
  discovery: DiscoverySettings;
  provisioning: ProvisioningSettings;
  testing: TestingSettings;
};

export type WLEDDevice = {
  id: string;
  name: string;
  host: string;
  address: string;
  port: number;
  lastSeen: string;
  online: boolean;
  provisioned: boolean;
  ignored?: boolean;
  info?: JSONMap;
  lastState?: JSONMap;
};

export type ControllerSnapshot = {
  settings: ControllerSettings;
  devices: WLEDDevice[];
  persistencePath: string;
  updatedAt: string;
  capabilities: {
    networkBackendId: string;
    networkBackendLabel: string;
    networkControlAvailable: boolean;
    networkCliName: string;
    networkCliUnavailableReason?: string;
    nmcliAvailable: boolean;
  };
};

export type NetworkCommandResult = {
  command: string;
  output: string;
  success: boolean;
  error?: string;
};

export type NetworkApplyResult = {
  dryRun: boolean;
  warnings?: string[];
  steps: NetworkCommandResult[];
};

export type WLEDDeviceDetail = {
  online: boolean;
  error?: string;
  state?: JSONMap;
  info?: JSONMap;
  effects?: string[];
  palettes?: string[];
  config?: JSONMap;
  lastState?: JSONMap;
  address: string;
  port: number;
};

export type DetailRoute =
  | { kind: "presets" }
  | { kind: "settings" }
  | { kind: "device"; id: string };
