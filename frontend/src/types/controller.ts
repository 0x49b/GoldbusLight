export type JSONMap = Record<string, unknown>;

export type AccessPointSettings = {
    enabled: boolean;
    connection: string;
    interfaceName: string;
    ssid: string;
    password: string;
    channel: number;
};

export type ProvisioningSettings = {
    autoProvision: boolean;
    defaultStatePayload: JSONMap;
    defaultConfigPatch: JSONMap;
};

export type TestingSettings = {
    simulateWled: boolean;
};

export type WLEDDebugSettings = {
    showInfo: boolean;
};

export type WLEDSettings = {
    enabled: boolean;
    provisioning: ProvisioningSettings;
    testing: TestingSettings;
    debug?: WLEDDebugSettings;
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

export type DMXUniverseInterfaceSettings = {
    selectedUSBDeviceId: string;
    artNet: ArtNetSettings;
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
    universeInterfaces?: Record<string, DMXUniverseInterfaceSettings>;
};

export type ControllerSettings = {
    accessPoint: AccessPointSettings;
    wled: WLEDSettings;
    dmx: DMXSettings;
    companion: CompanionSettings;
};

export type CompanionSettings = {
    enabled: boolean;
    port: number;
};

export type CompanionStatus = {
    enabled: boolean;
    listening: boolean;
    port: number;
    urls: string[];
    qrDataUrl?: string;
};

export type WLEDDevicePreset = {
    id: string;
    name: string;
    state: JSONMap;
    createdAt?: string;
    updatedAt?: string;
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
    presets?: WLEDDevicePreset[];
};

export type SceneWLEDEntry = {
    deviceId: string;
    presetId: string;
};

export type SceneDMXEntry = {
    fixtureId: string;
    cueId: string;
};

export type LightingScene = {
    id: string;
    name: string;
    wled?: SceneWLEDEntry[];
    dmx?: SceneDMXEntry[];
    partyWledDeviceIds?: string[];
    partyFixtureIds?: string[];
    createdAt?: string;
    updatedAt?: string;
};

export type UpsertLightingSceneInput = {
    id?: string;
    name: string;
    wled?: SceneWLEDEntry[];
    dmx?: SceneDMXEntry[];
    partyWledDeviceIds?: string[];
    partyFixtureIds?: string[];
};

export type ControllerSnapshot = {
    settings: ControllerSettings;
    devices: WLEDDevice[];
    scenes?: LightingScene[];
    activeSceneId?: string;
    defaultSceneId?: string;
    partySceneId?: string;
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
    defaultValue?: number;
    properties?: JSONMap;
};

export type DMXChannelTyp={
    type: string;
    label: string;
}

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
    | "timer"
    | "command"
    | "operatingMode"
    | "custom";

/** A single saved pose: channel values keyed by fixture-relative channel offset (string key). */
export type DMXFixtureCue = {
    id: string;
    label?: string;
    /** Fixture-relative channel offset (string key) → DMX value 0–255. */
    values: Record<string, number>;
    /** Per-pose dwell time in ms; 0/undefined inherits the sequence-level stepMs. */
    holdMs?: number;
    /** Per-pose crossfade-in time in ms; 0/undefined inherits the sequence-level fadeMs. */
    fadeMs?: number;
};

/** Behavior for a fixture channel that is not pinned by a cue pose. */
export type DMXCueChannelBehavior = "random" | "exclude";

/** Steps a fixture through an ordered list of poses during party mode. */
export type DMXFixtureCueSequence = {
    /** Turns on cue-sequence mode for this fixture (overrides the generative algorithm). */
    enabled?: boolean;
    /** Ordered poses to step through. */
    cues?: DMXFixtureCue[];
    /** How long each pose is held before advancing (milliseconds). */
    stepMs?: number;
    /** Crossfade time into each pose (milliseconds). 0 = snap instantly. */
    fadeMs?: number;
    /** When true, restart from the first pose after the last; when false, hold the final pose. */
    loop?: boolean;
    /** Pose applied as the fixture's static "idle" position when live output starts (empty = none). */
    idleCueId?: string;
    /**
     * Fixture-relative channel offset (string key) → behavior for channels not pinned by a pose.
     * Channels absent from this map default to "exclude" (left untouched by the sequence).
     */
    channelBehaviors?: Record<string, DMXCueChannelBehavior>;
};

export type DMXFixtureParty = {
    /** Fixture-relative channel offset (string key) → 0–100; 100 = full motion (default). */
    channelWeights?: Record<string, number>;
    strobeEnabled?: boolean;
    strobeOnMs?: number;
    strobeOffMs?: number;
    /** Cue-sequence (pose chase) configuration for this fixture. */
    cueSequence?: DMXFixtureCueSequence;
};

/** Spatial rainbow across a Color Changer master and its slaves. */
export type DMXColorSweep = {
    /** When true, a rainbow hue travels across the master + slave chain. */
    enabled?: boolean;
    /** `ltr` = ascending DMX address; `rtl` = reverse. */
    direction?: "ltr" | "rtl";
    /** 1–100; higher advances the hue faster. Default 50. */
    speed?: number;
};

export type DMXFixture = {
    id: string;
    type: DMXFixtureType;
    brand: string;
    name: string;
    /** Logical DMX universe this fixture belongs to. */
    universeId?: string;
    /** DMX start address (1–512). Channel rows use offsets from this address (universe slot = address + offset − 1). */
    dmxAddress: number;
    /** When set, this fixture mirrors channel output from the referenced master fixture. */
    masterFixtureId?: string;
    movingHead: {
        maxPan: number;
        maxTilt: number;
    };
    party?: DMXFixtureParty;
    /** Color Changer master effect: rainbow sweep across master + slaves. */
    colorSweep?: DMXColorSweep;
    /** Static poses for Lighting Scenes (separate from party cueSequence). */
    sceneCues?: DMXFixtureCue[];
    channels: DMXChannel[];
    createdAt: string;
    updatedAt: string;
};

export type DMXPartyMode = "auto" | "audio";

export type DMXPartyChannelGroup = "movement" | "color" | "gobo" | "beam" | "effects";

/** Per-device WLED effect/palette applied while party mode is on. */
export type DMXPartyWLEDDeviceSettings = {
    fx: number;
    pal: number;
    /** Effect speed (sx), 0–255. */
    sx: number;
    /** Effect intensity (ix), 0–255. */
    ix: number;
};

export type DMXPartyConfig = {
    enabled: boolean;
    mode: DMXPartyMode;
    fixtureIds?: string[];
    wledDeviceIds?: string[];
    /** Per-device effect/palette for included WLED targets. */
    wledDeviceSettings?: Record<string, DMXPartyWLEDDeviceSettings>;
    /** WLED brightness (bri), 0–255. */
    wledBrightness?: number;
    /** Solid-mode hue sweep speed, 0–255. */
    wledSpeed?: number;
    intensity: number;
    speed: number;
    /** How wide pan/tilt sweeps are (0–100); larger = bigger sweeps. */
    movementRange?: number;
    /** Max pan/tilt travel from centre in degrees (0 = use movementRange only). */
    movementAngleLimitDeg?: number;
    /** Channel category toggles; absent keys default to included. */
    channelGroups?: Partial<Record<DMXPartyChannelGroup, boolean>>;
    colorVariation: number;
    audioSensitivity: number;
    audioInputDeviceId?: string;
    /** Smoke/hazer burst length in milliseconds. */
    smokeBurstOnMs?: number;
    /** Pause between smoke/hazer bursts in milliseconds. */
    smokeBurstOffMs?: number;
    /** Fog output level during a burst (0–100). */
    smokeVolume?: number;
};

export type DMXPartyAudioFeatures = {
    level: number;
    bass: number;
    mid: number;
    treble: number;
    beat: number;
    /** Estimated tempo in BPM (0 = not enough signal yet). */
    bpm: number;
    capturedAt?: string;
    deviceId?: string;
};

export type DMXPartyAudioInputDevice = {
    id: string;
    name: string;
    isDefault: boolean;
    isLoopback: boolean;
    isBuiltin: boolean;
    isUSB: boolean;
};

export type DMXPartyStatus = {
    running: boolean;
    mode: DMXPartyMode;
    error?: string;
    lastFrameAt?: string;
    lastAudioAt?: string;
    audioInputDeviceId?: string;
    partyBlocksManualPatch?: boolean;
    audioCapturing?: boolean;
    audioNoSignal?: boolean;
    audioCaptureError?: string;
};

export type DMXPartyAudioSourcePreset = "mic" | "usbMic" | "loopback" | "custom";

export type DMXPartyState = {
    config: DMXPartyConfig;
    status: DMXPartyStatus;
    audio: DMXPartyAudioFeatures;
};

export type DMXState = {
    universes: DMXUniverse[];
    fixtures: DMXFixture[];
    selectedUSBDeviceId: string;
    party: DMXPartyState;
    /** Present while DMX live output is running: per-universe 512 slot values 0–255. */
    liveUniverses?: Record<string, number[]>;
    /** Legacy single-universe buffer (universe 1) while live output is active. */
    liveUniverse?: number[];
};

export type DMXUniverse = {
    id: string;
    name: string;
};

export const DEFAULT_DMX_UNIVERSE_ID = "universe-1";

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
    universeId?: string;
    dmxAddress: number;
    /** When set, this fixture mirrors channel output from the referenced master fixture. */
    masterFixtureId?: string;
    maxPan: number;
    maxTilt: number;
    party?: DMXFixtureParty;
    colorSweep?: DMXColorSweep;
    sceneCues?: DMXFixtureCue[];
    channels: DMXChannel[];
};

export type SettingsTab = "general" | "wled" | "dmx" | "party" | "console";

export type DetailRoute =
    | { kind: "presets" }
    | { kind: "scenes" }
    | { kind: "settings"; tab?: SettingsTab }
    | { kind: "device"; id: string }
    | { kind: "wledAddDevice" }
    | { kind: "dmxUniverse"; universeId?: string }
    | { kind: "dmxAddFixture"; universeId?: string }
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
