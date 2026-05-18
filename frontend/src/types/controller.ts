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

export type WLEDSettings = {
    enabled: boolean;
    discovery: DiscoverySettings;
    provisioning: ProvisioningSettings;
    testing: TestingSettings;
};

export type ArtNetSettings = {
    enabled: boolean;
    targetHost: string;
    port: number;
    net: number;
    subnet: number;
    universe: number;
    refreshHz: number;
};

export type DMXSettings = {
    enabled: boolean;
    usb: {
        enabled?: boolean;
    };
    artNet: ArtNetSettings;
    testing: {
        simulateUsbDmx: boolean;
        simulateArtNet: boolean;
    };
};

export type ControllerSettings = {
    accessPoint: AccessPointSettings;
    wled: WLEDSettings;
    dmx: DMXSettings;
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
    generalTabState?: {
        on: boolean;
        bri: number;
        rgb: [number, number, number];
        fx: number;
        pal: number;
        sx: number;
        ix: number;
    };
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

export type DMXFixtureType =
    | "colorChanger"
    | "dimmer"
    | "effect"
    | "fan"
    | "flower"
    | "hazer"
    | "laser"
    | "ledBarBeams"
    | "ledBarPixels"
    | "movingHead"
    | "other"
    | "scanner"
    | "smoke"
    | "strobe";

export type DMXChannel = {
    channel: number;
    type: DMXChannelType;
    properties?: JSONMap;
};

export type DMXChannelType =
    | "pan"
    | "panFine"
    | "tilt"
    | "tiltFine"
    | "infinitePan"
    | "infiniteTilt"
    | "movementSpeed"
    | "dimmer"
    | "dimmerFine"
    | "colorComponent"
    | "colorWheel"
    | "colorTemperature"
    | "colorTemperatureFine"
    | "greenSaturation"
    | "greenSaturationFine"
    | "xfadeToColor"
    | "xfadeToColorFine"
    | "goboWheel"
    | "goboIndexing"
    | "goboIndexingFine"
    | "goboRotation"
    | "goboRotationFine"
    | "goboShake"
    | "shutterStrobe"
    | "focus"
    | "focusFine"
    | "zoom"
    | "zoomFine"
    | "iris"
    | "irisFine"
    | "frost"
    | "frostFine"
    | "prism"
    | "prismIndexing"
    | "prismIndexingFine"
    | "prismRotation"
    | "onOff"
    | "lamp"
    | "fog"
    | "command"
    | "operatingMode"
    | "custom";

export type DMXFixture = {
    id: string;
    type: DMXFixtureType;
    brand: string;
    name: string;
    /** DMX start address (1–512). Channel rows use offsets from this address (universe slot = address + offset − 1). */
    dmxAddress: number;
    movingHead: {
        maxPan: number;
        maxTilt: number;
    };
    channels: DMXChannel[];
    createdAt: string;
    updatedAt: string;
};

export type DMXPartyMode = "auto" | "audio";

export type DMXPartyConfig = {
    enabled: boolean;
    mode: DMXPartyMode;
    fixtureIds?: string[];
    intensity: number;
    speed: number;
    colorVariation: number;
    audioSensitivity: number;
    audioInputDeviceId?: string;
};

export type DMXPartyAudioFeatures = {
    level: number;
    bass: number;
    mid: number;
    treble: number;
    beat: number;
    capturedAt?: string;
    deviceId?: string;
};

export type DMXPartyStatus = {
    running: boolean;
    mode: DMXPartyMode;
    error?: string;
    lastFrameAt?: string;
    lastAudioAt?: string;
    audioInputDeviceId?: string;
};

export type DMXPartyState = {
    config: DMXPartyConfig;
    status: DMXPartyStatus;
    audio: DMXPartyAudioFeatures;
};

export type DMXState = {
    fixtures: DMXFixture[];
    selectedUSBDeviceId: string;
    party: DMXPartyState;
};

export type USBSerialDevice = {
    id: string;
    path: string;
    name: string;
    description?: string;
};

export type UpsertDMXFixtureInput = {
    id?: string;
    type: DMXFixtureType;
    brand: string;
    name: string;
    dmxAddress: number;
    maxPan: number;
    maxTilt: number;
    channels: DMXChannel[];
};

export type DetailRoute =
    | { kind: "presets" }
    | { kind: "settings" }
    | { kind: "device"; id: string }
    | { kind: "dmxUniverse" }
    | { kind: "dmxAddFixture" }
    | { kind: "dmxFixture"; id: string };

export type ConsoleEntry = {
    id: number;
    timestamp: string;
    transport: string;
    direction: string;
    target: string;
    summary: string;
    detail?: string;
};
