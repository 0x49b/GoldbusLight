import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PiPlus, PiTrash } from "react-icons/pi";
import type { DMXLiveStatus } from "../../../bindings/goldbus/internal/dmx/models";
import type {
  DMXChannel,
  DMXChannelType,
  DMXFixture,
  DMXState,
  DetailRoute,
  JSONMap,
  USBSerialDevice,
  UpsertDMXFixtureInput,
} from "../../types/controller";
import { ButtonGroup } from "../ui/button-group";
import { DMXFixtureLiveControls } from "./DMXFixtureLiveControls";

type FixturePageMode = "editor" | "live";

type DMXFixtureEditorViewProps = {
  fixture: DMXFixture | undefined;
  busy: boolean;
  onCreate: (input: UpsertDMXFixtureInput) => Promise<DMXFixture | null>;
  onUpdate: (input: UpsertDMXFixtureInput) => Promise<DMXFixture | null>;
  onDelete: (fixtureID: string) => Promise<boolean>;
  onOpenFixture: (fixtureID: string) => void;
  dmxState: DMXState;
  usbSerialDevices: USBSerialDevice[];
  dmxLiveStatus: DMXLiveStatus | null;
  setRoute: (route: DetailRoute) => void;
  pullDMXLiveStatus: () => Promise<void>;
  queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
  startDMXLiveOutput: (fixtureID: string) => Promise<boolean>;
  stopDMXLiveOutput: () => Promise<void>;
  onRefreshUSBSerialDevices: () => Promise<void>;
  onSelectUSBSerialDevice: (deviceID: string) => Promise<void>;
};

const DMX_CHANNEL_TYPES: DMXChannelType[] = [
  "colorComponent",
  "colorTemperature",
  "colorTemperatureFine",
  "colorWheel",
  "command",
  "custom",
  "dimmer",
  "dimmerFine",
  "fog",
  "focus",
  "focusFine",
  "frost",
  "frostFine",
  "goboIndexing",
  "goboIndexingFine",
  "goboRotation",
  "goboRotationFine",
  "goboShake",
  "goboWheel",
  "greenSaturation",
  "greenSaturationFine",
  "infinitePan",
  "infiniteTilt",
  "iris",
  "irisFine",
  "lamp",
  "movementSpeed",
  "onOff",
  "operatingMode",
  "pan",
  "panFine",
  "prism",
  "prismIndexing",
  "prismIndexingFine",
  "prismRotation",
  "shutterStrobe",
  "tilt",
  "tiltFine",
  "xfadeToColor",
  "xfadeToColorFine",
  "zoom",
  "zoomFine",
];

/** Types that default to slot-based `entries` instead of linear min/max. */
const ENTRY_FIRST_TYPES = new Set<DMXChannelType>([
  "colorWheel",
  "goboWheel",
  "infinitePan",
  "infiniteTilt",
  "movementSpeed",
  "shutterStrobe",
]);

type SlotEntry = {
  from: number;
  to: number;
  label: string;
  mode?: string;
  color?: string;
  direction?: string;
  numeric?: number;
  goboIdentifier?: string;
  goboName?: string;
  goboImage?: string;
};

function defaultPropsForType(type: DMXChannelType): JSONMap {
  if (ENTRY_FIRST_TYPES.has(type)) {
    switch (type) {
      case "colorWheel":
        return {
          entries: [
            { from: 0, to: 14, label: "Open / white", color: "#ffffff" },
            { from: 15, to: 29, label: "Red", color: "#ff0000" },
            { from: 30, to: 44, label: "Green", color: "#00ff00" },
            { from: 45, to: 59, label: "Blue", color: "#0000ff" },
          ],
        };
      case "goboWheel":
        return {
          entries: [
            {
              from: 0,
              to: 31,
              label: "Open",
              goboIdentifier: "",
              goboName: "Open",
              goboImage: "",
            },
          ],
        };
      case "shutterStrobe":
        return {
          entries: [
            { from: 0, to: 31, label: "Closed", mode: "closed" },
            { from: 32, to: 63, label: "Open", mode: "open" },
            { from: 64, to: 95, label: "Strobe", mode: "strobe" },
            { from: 96, to: 127, label: "Pulse", mode: "pulse" },
          ],
        };
      case "infinitePan":
      case "infiniteTilt":
      case "movementSpeed":
        return {
          entries: [
            { from: 0, to: 42, label: "Slow CW", direction: "cw", mode: "slow", numeric: 0 },
            { from: 43, to: 85, label: "Fast CW", direction: "cw", mode: "fast", numeric: 128 },
            { from: 86, to: 127, label: "Stop", direction: "stop", mode: "stop", numeric: 0 },
            { from: 128, to: 170, label: "Slow CCW", direction: "ccw", mode: "slow", numeric: 0 },
            { from: 171, to: 213, label: "Fast CCW", direction: "ccw", mode: "fast", numeric: 128 },
          ],
        };
      default:
        return { entries: [{ from: 0, to: 255, label: "Slot A" }] };
    }
  }
  return { min: 0, max: 255 };
}

function cloneChannels(from: DMXChannel[]): DMXChannel[] {
  return from.map((c) => ({
    channel: c.channel,
    type: c.type,
    properties: c.properties ? ({ ...c.properties } as JSONMap) : undefined,
  }));
}

function defaultInitialChannels(): DMXChannel[] {
  return [{ channel: 1, type: "pan", properties: { min: 0, max: 255 } }];
}

function parseEntries(props: JSONMap | undefined): SlotEntry[] {
  const raw = props?.entries;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const out: SlotEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const e = item as Record<string, unknown>;
    out.push({
      from: typeof e.from === "number" ? e.from : Number(e.from) || 0,
      to: typeof e.to === "number" ? e.to : Number(e.to) || 255,
      label: typeof e.label === "string" ? e.label : "",
      mode: typeof e.mode === "string" ? e.mode : undefined,
      color: typeof e.color === "string" ? e.color : undefined,
      direction: typeof e.direction === "string" ? e.direction : undefined,
      numeric: typeof e.numeric === "number" ? e.numeric : undefined,
      goboIdentifier: typeof e.goboIdentifier === "string" ? e.goboIdentifier : undefined,
      goboName: typeof e.goboName === "string" ? e.goboName : undefined,
      goboImage: typeof e.goboImage === "string" ? e.goboImage : undefined,
    });
  }
  return out;
}

function usesSlots(properties: JSONMap | undefined): boolean {
  const entries = parseEntries(properties);
  return entries.length > 0;
}

function maxChannelOffset(dmxAddress: number): number {
  const base = Number.isFinite(dmxAddress) && dmxAddress >= 1 && dmxAddress <= 512 ? Math.round(dmxAddress) : 1;
  return 512 - base + 1;
}

export function DMXFixtureEditorView(props: DMXFixtureEditorViewProps) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [address, setAddress] = useState(1);
  const [maxPan, setMaxPan] = useState(540);
  const [maxTilt, setMaxTilt] = useState(270);
  const [channels, setChannels] = useState<DMXChannel[]>(defaultInitialChannels);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<FixturePageMode>("editor");

  useEffect(() => {
    if (props.fixture) {
      setName(props.fixture.name);
      setBrand(props.fixture.brand);
      setAddress(props.fixture.dmxAddress || 1);
      setMaxPan(props.fixture.movingHead?.maxPan ?? 540);
      setMaxTilt(props.fixture.movingHead?.maxTilt ?? 270);
      setChannels(props.fixture.channels?.length ? cloneChannels(props.fixture.channels) : defaultInitialChannels());
      setSaveHint(null);
      return;
    }
    setName("");
    setBrand("");
    setAddress(1);
    setMaxPan(540);
    setMaxTilt(270);
    setChannels(defaultInitialChannels());
    setSaveHint(null);
  }, [props.fixture?.id, props.fixture?.updatedAt]);

  useEffect(() => {
    if (!props.fixture) {
      setPageMode("editor");
    }
  }, [props.fixture]);

  useEffect(() => {
    if (props.fixture && pageMode === "live") {
      void props.pullDMXLiveStatus();
    }
  }, [pageMode, props.fixture?.id, props.pullDMXLiveStatus]);

  const slotBudget = useMemo(() => maxChannelOffset(address), [address]);

  const channelRows = useMemo(() => {
    return channels
      .map((ch, originalIdx) => ({ ch, originalIdx }))
      .sort((a, b) => a.ch.channel - b.ch.channel || a.originalIdx - b.originalIdx);
  }, [channels]);

  const updateChannelAt = useCallback((originalIdx: number, patch: Partial<DMXChannel>) => {
    setChannels((prev) =>
      prev.map((c, i) => {
        if (i !== originalIdx) {
          return c;
        }
        return {
          ...c,
          ...patch,
          properties: patch.properties !== undefined ? patch.properties : c.properties,
        };
      }),
    );
  }, []);

  const replaceChannelAt = useCallback((originalIdx: number, next: DMXChannel) => {
    setChannels((prev) => prev.map((c, i) => (i === originalIdx ? next : c)));
  }, []);

  const addChannel = useCallback(() => {
    const used = new Set(channels.map((c) => c.channel));
    let nextOff = 1;
    while (used.has(nextOff) && nextOff <= slotBudget) {
      nextOff += 1;
    }
    if (nextOff > slotBudget) {
      setSaveHint(`No free channel offsets left for address ${address} (max offset ${slotBudget}).`);
      return;
    }
    setChannels((prev) => [
      ...prev,
      { channel: nextOff, type: "dimmer", properties: defaultPropsForType("dimmer") },
    ]);
    setSaveHint(null);
  }, [address, channels, slotBudget]);

  const removeChannelAt = useCallback((originalIdx: number) => {
    setChannels((prev) => {
      const next = prev.filter((_, i) => i !== originalIdx);
      return next.length > 0 ? next : defaultInitialChannels();
    });
  }, []);

  const handleSave = async () => {
    setSaveHint(null);
    const trimmedBrand = brand.trim();
    const trimmedName = name.trim();
    if (!trimmedBrand || !trimmedName) {
      setSaveHint("Brand and name are required.");
      return;
    }
    const seen = new Set<number>();
    for (const ch of channels) {
      const off = Math.round(ch.channel);
      if (off < 1 || off > slotBudget) {
        setSaveHint(
          `Channel offset ${off} is invalid for start address ${address}. Use 1–${slotBudget} (DMX slots remaining in universe).`,
        );
        return;
      }
      if (seen.has(off)) {
        setSaveHint(`Channel offset ${off} is used more than once.`);
        return;
      }
      seen.add(off);
    }
    const input: UpsertDMXFixtureInput = {
      id: props.fixture?.id,
      type: "movingHead",
      brand: trimmedBrand,
      name: trimmedName,
      dmxAddress: Math.max(1, Math.min(512, Math.round(address) || 1)),
      maxPan: Math.max(0, Math.round(maxPan) || 0),
      maxTilt: Math.max(0, Math.round(maxTilt) || 0),
      channels,
    };
    const saved = props.fixture ? await props.onUpdate(input) : await props.onCreate(input);
    if (saved) {
      props.onOpenFixture(saved.id);
    }
  };

  const handleDelete = async () => {
    if (!props.fixture) {
      return;
    }
    const ok = await props.onDelete(props.fixture.id);
    if (ok) {
      props.setRoute({ kind: "presets" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-3">
          {props.fixture ? (
            <>
              <ButtonGroup>
                <Button
                  type="button"
                  variant="outline"
                  className={pageMode === "editor" ? "btn-active" : ""}
                  aria-pressed={pageMode === "editor"}
                  onClick={() => setPageMode("editor")}
                >
                  Editor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={pageMode === "live" ? "btn-active" : ""}
                  aria-pressed={pageMode === "live"}
                  onClick={() => setPageMode("live")}
                >
                  Live
                </Button>
              </ButtonGroup>
            </>
          ) : null}
          {props.fixture ? (
            <span className="text-sm font-medium text-muted-foreground">{props.fixture.name}</span>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => props.setRoute({ kind: "presets" })} disabled={props.busy}>
          Back
        </Button>
      </div>

      {props.fixture && pageMode === "live" ? (
        <DMXFixtureLiveControls
          fixture={props.fixture}
          busy={props.busy}
          liveStatus={props.dmxLiveStatus}
          queueDmxLivePatch={props.queueDmxLivePatch}
          startDMXLiveOutput={props.startDMXLiveOutput}
          stopDMXLiveOutput={props.stopDMXLiveOutput}
          pullDMXLiveStatus={props.pullDMXLiveStatus}
        />
      ) : (
        <>
          <Card>
        <CardHeader>
          <CardTitle className="text-base">Fixture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dmx-fixture-name">Name</Label>
              <Input
                id="dmx-fixture-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dmx-fixture-brand">Brand</Label>
              <Input
                id="dmx-fixture-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dmx-fixture-address">DMX start address</Label>
              <Input
                id="dmx-fixture-address"
                type="number"
                min={1}
                max={512}
                value={address}
                onChange={(e) => setAddress(Number(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Channel offsets below are relative to this address (max offset {slotBudget}).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="dmx-max-pan">Max pan (°)</Label>
                <Input
                  id="dmx-max-pan"
                  type="number"
                  min={0}
                  max={720}
                  value={maxPan}
                  onChange={(e) => setMaxPan(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dmx-max-tilt">Max tilt (°)</Label>
                <Input
                  id="dmx-max-tilt"
                  type="number"
                  min={0}
                  max={360}
                  value={maxTilt}
                  onChange={(e) => setMaxTilt(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">DMX channels</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={addChannel} disabled={props.busy}>
            <PiPlus className="mr-1 inline size-4" aria-hidden />
            Add channel
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Map each function to a channel offset from the fixture start address. Use linear min/max for faders, or discrete
            slots for wheels and macros.
          </p>

          {channelRows.map(({ ch, originalIdx }) => {
            const propsMap = (ch.properties ?? {}) as JSONMap;
            const slots = parseEntries(propsMap);
            const slotMode = usesSlots(propsMap);
            const minV =
              typeof propsMap.min === "number" ? propsMap.min : Number(propsMap.min) || 0;
            const maxV =
              typeof propsMap.max === "number" ? propsMap.max : Number(propsMap.max) || 255;
            const goboExtras = ch.type === "goboWheel";

            return (
              <div
                key={originalIdx}
                className="rounded-lg border bg-muted/20 p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid w-[88px] gap-1">
                    <Label className="text-xs">Offset</Label>
                    <Input
                      type="number"
                      min={1}
                      max={slotBudget}
                      value={ch.channel}
                      onChange={(e) => {
                        const v = Math.round(Number(e.target.value) || 1);
                        replaceChannelAt(originalIdx, {
                          ...ch,
                          channel: Math.max(1, Math.min(slotBudget, v)),
                        });
                      }}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1 grid gap-1">
                    <Label className="text-xs">Function</Label>
                    <NativeSelect
                      value={ch.type}
                      onChange={(e) => {
                        const nextType = e.target.value as DMXChannelType;
                        replaceChannelAt(originalIdx, {
                          channel: ch.channel,
                          type: nextType,
                          properties: defaultPropsForType(nextType),
                        });
                      }}
                    >
                      {DMX_CHANNEL_TYPES.map((t) => (
                        <NativeSelectOption key={t} value={t}>
                          {t}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    title="Remove channel"
                    onClick={() => removeChannelAt(originalIdx)}
                    disabled={props.busy || channels.length <= 1}
                  >
                    <PiTrash className="size-4" />
                  </Button>
                </div>

                <Separator className="my-3" />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!slotMode ? "secondary" : "outline"}
                    onClick={() => {
                      replaceChannelAt(originalIdx, {
                        ...ch,
                        properties: { min: minV, max: maxV },
                      });
                    }}
                  >
                    Linear range
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={slotMode ? "secondary" : "outline"}
                    onClick={() => {
                      const nextEntries =
                        slots.length > 0
                          ? slots
                          : [{ from: 0, to: 255, label: "Slot 1" }];
                      replaceChannelAt(originalIdx, {
                        ...ch,
                        properties: {
                          entries: nextEntries.map((s) => ({ ...s })),
                        },
                      });
                    }}
                  >
                    Discrete slots
                  </Button>
                </div>

                {!slotMode ? (
                  <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Min DMX</Label>
                      <Input
                        type="number"
                        min={0}
                        max={255}
                        value={minV}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value) || 0);
                          updateChannelAt(originalIdx, {
                            properties: {
                              ...propsMap,
                              min: Math.max(0, Math.min(255, v)),
                              max: maxV,
                            },
                          });
                        }}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Max DMX</Label>
                      <Input
                        type="number"
                        min={0}
                        max={255}
                        value={maxV}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value) || 255);
                          updateChannelAt(originalIdx, {
                            properties: {
                              ...propsMap,
                              min: minV,
                              max: Math.max(0, Math.min(255, v)),
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {slots.map((slot, si) => (
                      <div
                        key={si}
                        className={cn(
                          "grid gap-2 rounded-md border bg-background p-2",
                          goboExtras
                            ? "sm:grid-cols-[repeat(6,minmax(0,1fr))_auto]"
                            : "sm:grid-cols-[88px_88px_1fr_auto]",
                        )}
                      >
                        <div className="grid gap-1">
                          <Label className="text-xs">From</Label>
                          <Input
                            type="number"
                            min={0}
                            max={255}
                            value={slot.from}
                            onChange={(e) => {
                              const v = Math.round(Number(e.target.value) || 0);
                              const next = [...slots];
                              next[si] = { ...slot, from: Math.max(0, Math.min(255, v)) };
                              updateChannelAt(originalIdx, {
                                properties: {
                                  ...propsMap,
                                  entries: next,
                                },
                              });
                            }}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">To</Label>
                          <Input
                            type="number"
                            min={0}
                            max={255}
                            value={slot.to}
                            onChange={(e) => {
                              const v = Math.round(Number(e.target.value) || 0);
                              const next = [...slots];
                              next[si] = { ...slot, to: Math.max(0, Math.min(255, v)) };
                              updateChannelAt(originalIdx, {
                                properties: {
                                  ...propsMap,
                                  entries: next,
                                },
                              });
                            }}
                          />
                        </div>
                        <div className={cn("grid gap-1", goboExtras && "sm:col-span-2")}>
                          <Label className="text-xs">Label</Label>
                          <Input
                            value={slot.label}
                            onChange={(e) => {
                              const next = [...slots];
                              next[si] = { ...slot, label: e.target.value };
                              updateChannelAt(originalIdx, {
                                properties: {
                                  ...propsMap,
                                  entries: next,
                                },
                              });
                            }}
                          />
                        </div>
                        {goboExtras && (
                          <>
                            <div className="grid gap-1">
                              <Label className="text-xs">Gobo code</Label>
                              <Input
                                value={slot.goboIdentifier ?? ""}
                                placeholder="e.g. 76501"
                                onChange={(e) => {
                                  const next = [...slots];
                                  next[si] = { ...slot, goboIdentifier: e.target.value };
                                  updateChannelAt(originalIdx, {
                                    properties: {
                                      ...propsMap,
                                      entries: next,
                                    },
                                  });
                                }}
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label className="text-xs">Image path</Label>
                              <Input
                                value={slot.goboImage ?? ""}
                                placeholder="/gobos/images/76501.jpg"
                                onChange={(e) => {
                                  const next = [...slots];
                                  next[si] = { ...slot, goboImage: e.target.value };
                                  updateChannelAt(originalIdx, {
                                    properties: {
                                      ...propsMap,
                                      entries: next,
                                    },
                                  });
                                }}
                              />
                            </div>
                          </>
                        )}
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Remove slot"
                            onClick={() => {
                              const next = slots.filter((_, j) => j !== si);
                              if (next.length === 0) {
                                replaceChannelAt(originalIdx, {
                                  ...ch,
                                  properties: { min: 0, max: 255 },
                                });
                                return;
                              }
                              updateChannelAt(originalIdx, {
                                properties: {
                                  ...propsMap,
                                  entries: next,
                                },
                              });
                            }}
                          >
                            <PiTrash className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const last = slots[slots.length - 1];
                        const start = last ? Math.min(255, last.to + 1) : 0;
                        const next = [
                          ...slots,
                          {
                            from: start,
                            to: Math.min(255, start + 15),
                            label: `Slot ${slots.length + 1}`,
                            ...(goboExtras
                              ? { goboIdentifier: "", goboName: "", goboImage: "" }
                              : {}),
                          },
                        ];
                        updateChannelAt(originalIdx, {
                          properties: {
                            ...propsMap,
                            entries: next,
                          },
                        });
                      }}
                    >
                      <PiPlus className="mr-1 inline size-4" aria-hidden />
                      Add slot
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {saveHint && <p className="text-sm text-destructive">{saveHint}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-6">
          <Button onClick={handleSave} disabled={props.busy}>
            Save
          </Button>
          {props.fixture && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={props.busy}>
              Delete
            </Button>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
