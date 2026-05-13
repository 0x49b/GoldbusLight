import { useCallback, useEffect, useMemo, useState } from "react";
import type { DMXLiveStatus } from "../../../bindings/goldbus/internal/dmx/models";
import type { DMXChannelType, DMXFixture, JSONMap } from "../../types/controller";
import {
  buildDmxLivePatch,
  defaultDmxLiveControlState,
  parseFixtureEntries,
  type DMXLiveControlState,
  type DMXLiveShutterMode,
} from "../../lib/dmxLiveMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type DMXFixtureLiveControlsProps = {
  fixture: DMXFixture;
  busy: boolean;
  liveStatus: DMXLiveStatus | null;
  queueDmxLivePatch: (entries: Array<{ address: number; value: number }>) => void;
  startDMXLiveOutput: (fixtureID: string) => Promise<boolean>;
  stopDMXLiveOutput: () => Promise<void>;
  pullDMXLiveStatus: () => Promise<void>;
};

function firstChannel(channels: DMXFixture["channels"], type: DMXChannelType) {
  return channels.find((c) => c.type === type);
}

function allChannelsOfType(channels: DMXFixture["channels"], type: DMXChannelType) {
  return channels.filter((c) => c.type === type);
}

const SHUTTER_OPTIONS: { value: DMXLiveShutterMode; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "strobe", label: "Strobe" },
  { value: "pulse", label: "Pulse" },
];

export function DMXFixtureLiveControls({
  fixture,
  busy,
  liveStatus,
  queueDmxLivePatch,
  startDMXLiveOutput,
  stopDMXLiveOutput,
  pullDMXLiveStatus,
}: DMXFixtureLiveControlsProps) {
  const connected = liveStatus?.connected ?? false;
  const [liveState, setLiveState] = useState<DMXLiveControlState>(() => defaultDmxLiveControlState());

  useEffect(() => {
    setLiveState(defaultDmxLiveControlState());
  }, [fixture.id]);

  useEffect(() => {
    if (!connected) {
      return;
    }
    queueDmxLivePatch(buildDmxLivePatch(fixture, liveState));
  }, [connected, fixture, liveState, queueDmxLivePatch]);

  const chans = fixture.channels;

  const cwEntries = useMemo(
    () => parseFixtureEntries(firstChannel(chans, "colorWheel")?.properties as JSONMap | undefined),
    [chans],
  );
  const goboWheels = useMemo(() => allChannelsOfType(chans, "goboWheel"), [chans]);
  const g1Entries = useMemo(
    () => parseFixtureEntries(goboWheels[0]?.properties as JSONMap | undefined),
    [goboWheels],
  );
  const g2Entries = useMemo(
    () => parseFixtureEntries(goboWheels[1]?.properties as JSONMap | undefined),
    [goboWheels],
  );
  const msEntries = useMemo(
    () => parseFixtureEntries(firstChannel(chans, "movementSpeed")?.properties as JSONMap | undefined),
    [chans],
  );
  const shutterEntries = useMemo(
    () => parseFixtureEntries(firstChannel(chans, "shutterStrobe")?.properties as JSONMap | undefined),
    [chans],
  );
  const frostEntries = useMemo(
    () => parseFixtureEntries(firstChannel(chans, "frost")?.properties as JSONMap | undefined),
    [chans],
  );

  const hasPan = Boolean(firstChannel(chans, "pan"));
  const hasTilt = Boolean(firstChannel(chans, "tilt"));
  const hasDimmer = Boolean(firstChannel(chans, "dimmer"));
  const hasColorWheel = cwEntries.length > 0;
  const hasGobo1 = g1Entries.length > 0;
  const hasGobo2 = g2Entries.length > 0;
  const hasShutter = shutterEntries.length > 0;
  const hasMovementSpeed = msEntries.length > 0;
  const hasFocus = Boolean(firstChannel(chans, "focus"));
  const hasZoom = Boolean(firstChannel(chans, "zoom"));
  const hasIris = Boolean(firstChannel(chans, "iris"));
  const hasFrost = Boolean(firstChannel(chans, "frost"));

  const cwMax = Math.max(0, cwEntries.length - 1);
  const g1Max = Math.max(0, g1Entries.length - 1);
  const g2Max = Math.max(0, g2Entries.length - 1);
  const msMax = Math.max(0, msEntries.length - 1);

  const patchState = useCallback((partial: Partial<DMXLiveControlState>) => {
    setLiveState((s) => ({ ...s, ...partial }));
  }, []);

  const onStart = useCallback(async () => {
    await startDMXLiveOutput(fixture.id);
    await pullDMXLiveStatus();
  }, [fixture.id, pullDMXLiveStatus, startDMXLiveOutput]);

  const onStop = useCallback(async () => {
    await stopDMXLiveOutput();
    await pullDMXLiveStatus();
  }, [pullDMXLiveStatus, stopDMXLiveOutput]);

  const sliderDisabled = busy || !connected;
  const noneConfigured =
    !hasPan &&
    !hasTilt &&
    !hasDimmer &&
    !hasColorWheel &&
    !hasGobo1 &&
    !hasGobo2 &&
    !hasShutter &&
    !hasMovementSpeed &&
    !hasFocus &&
    !hasZoom &&
    !hasIris &&
    !hasFrost;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">USB DMX output</CardTitle>
          <CardDescription>
            Start streaming to the USB-DMX interface selected in Settings, then use the controls below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => void onStart()} disabled={busy || connected}>
            Start live
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => void onStop()} disabled={busy || !connected}>
            Stop live
          </Button>
          <span className="text-sm text-muted-foreground">
            {connected
              ? `Connected${liveStatus?.deviceName ? ` (${liveStatus.deviceName})` : ""}`
              : "Disconnected"}
          </span>
          {liveStatus?.error ? (
            <span className="text-sm text-destructive">{liveStatus.error}</span>
          ) : null}
        </CardContent>
      </Card>

      {noneConfigured ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No mappable channels found for live control (add pan, tilt, dimmer, wheels, etc. in the fixture editor).
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Live controls</CardTitle>
            <CardDescription>
              Values map through your fixture definition to DMX addresses. Connect USB DMX to stream changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {(hasPan || hasTilt || hasDimmer || hasMovementSpeed) && (
              <section className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Movement &amp; master</div>
                <div className="grid gap-6 md:grid-cols-2">
                  {hasPan && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <Label>Pan</Label>
                        <span className="tabular-nums text-muted-foreground">{Math.round(liveState.pan01 * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[liveState.pan01 * 100]}
                        onValueChange={([v]) => patchState({ pan01: (v ?? 0) / 100 })}
                        disabled={sliderDisabled}
                      />
                    </div>
                  )}
                  {hasTilt && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <Label>Tilt</Label>
                        <span className="tabular-nums text-muted-foreground">{Math.round(liveState.tilt01 * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[liveState.tilt01 * 100]}
                        onValueChange={([v]) => patchState({ tilt01: (v ?? 0) / 100 })}
                        disabled={sliderDisabled}
                      />
                    </div>
                  )}
                  {hasDimmer && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <Label>Dimmer</Label>
                        <span className="tabular-nums text-muted-foreground">{Math.round(liveState.dimmer01 * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={1}
                        value={[liveState.dimmer01 * 100]}
                        onValueChange={([v]) => patchState({ dimmer01: (v ?? 0) / 100 })}
                        disabled={sliderDisabled}
                      />
                    </div>
                  )}
                  {hasMovementSpeed && (
                    <div className="space-y-2 md:col-span-2">
                      <div className="flex justify-between text-sm">
                        <Label>Movement speed slot</Label>
                        <span className="tabular-nums text-muted-foreground">
                          {liveState.movementSpeedIdx + 1} / {msEntries.length}
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={msMax}
                        step={1}
                        value={[Math.min(liveState.movementSpeedIdx, msMax)]}
                        onValueChange={([v]) => patchState({ movementSpeedIdx: Math.round(v ?? 0) })}
                        disabled={sliderDisabled}
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

            {(hasColorWheel || hasGobo1 || hasGobo2) && (
              <>
                <Separator />
                <section className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color &amp; gobos</div>
                  <div className="grid gap-6 md:grid-cols-2">
                    {hasColorWheel && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Color wheel</Label>
                          <span className="tabular-nums text-muted-foreground">
                            Slot {liveState.colorWheelIdx + 1}
                            {cwEntries[liveState.colorWheelIdx]?.label
                              ? ` · ${cwEntries[liveState.colorWheelIdx]?.label}`
                              : ""}
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={cwMax}
                          step={1}
                          value={[Math.min(liveState.colorWheelIdx, cwMax)]}
                          onValueChange={([v]) => patchState({ colorWheelIdx: Math.round(v ?? 0) })}
                          disabled={sliderDisabled}
                        />
                      </div>
                    )}
                    {hasGobo1 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Gobo wheel 1</Label>
                          <span className="tabular-nums text-muted-foreground">
                            Slot {liveState.gobo1Idx + 1}
                            {g1Entries[liveState.gobo1Idx]?.label
                              ? ` · ${g1Entries[liveState.gobo1Idx]?.label}`
                              : ""}
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={g1Max}
                          step={1}
                          value={[Math.min(liveState.gobo1Idx, g1Max)]}
                          onValueChange={([v]) => patchState({ gobo1Idx: Math.round(v ?? 0) })}
                          disabled={sliderDisabled}
                        />
                      </div>
                    )}
                    {hasGobo2 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Gobo wheel 2</Label>
                          <span className="tabular-nums text-muted-foreground">
                            Slot {liveState.gobo2Idx + 1}
                            {g2Entries[liveState.gobo2Idx]?.label
                              ? ` · ${g2Entries[liveState.gobo2Idx]?.label}`
                              : ""}
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={g2Max}
                          step={1}
                          value={[Math.min(liveState.gobo2Idx, g2Max)]}
                          onValueChange={([v]) => patchState({ gobo2Idx: Math.round(v ?? 0) })}
                          disabled={sliderDisabled}
                        />
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {(hasShutter || hasFocus || hasZoom || hasIris || hasFrost) && (
              <>
                <Separator />
                <section className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Beam</div>
                  <div className="grid gap-6 md:grid-cols-2">
                    {hasShutter && (
                      <div className="space-y-2 md:col-span-2">
                        <Label>Shutter / strobe</Label>
                        <NativeSelect
                          value={liveState.shutter}
                          onChange={(e) => patchState({ shutter: e.target.value as DMXLiveShutterMode })}
                          disabled={sliderDisabled}
                          className="max-w-xs"
                        >
                          {SHUTTER_OPTIONS.map((o) => (
                            <NativeSelectOption key={o.value} value={o.value}>
                              {o.label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    )}
                    {hasFocus && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Focus</Label>
                          <span className="tabular-nums text-muted-foreground">{Math.round(liveState.focus01 * 100)}%</span>
                        </div>
                        <Slider
                          min={0}
                          max={100}
                          step={1}
                          value={[liveState.focus01 * 100]}
                          onValueChange={([v]) => patchState({ focus01: (v ?? 0) / 100 })}
                          disabled={sliderDisabled}
                        />
                      </div>
                    )}
                    {hasZoom && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Zoom</Label>
                          <span className="tabular-nums text-muted-foreground">{Math.round(liveState.zoom01 * 100)}%</span>
                        </div>
                        <Slider
                          min={0}
                          max={100}
                          step={1}
                          value={[liveState.zoom01 * 100]}
                          onValueChange={([v]) => patchState({ zoom01: (v ?? 0) / 100 })}
                          disabled={sliderDisabled}
                        />
                      </div>
                    )}
                    {hasIris && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Iris</Label>
                          <span className="tabular-nums text-muted-foreground">{Math.round(liveState.iris01 * 100)}%</span>
                        </div>
                        <Slider
                          min={0}
                          max={100}
                          step={1}
                          value={[liveState.iris01 * 100]}
                          onValueChange={([v]) => patchState({ iris01: (v ?? 0) / 100 })}
                          disabled={sliderDisabled}
                        />
                      </div>
                    )}
                    {hasFrost && (
                      <>
                        <div className="space-y-2 md:col-span-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={liveState.frostCurve === "linear" ? "secondary" : "outline"}
                              className={cn(sliderDisabled && "pointer-events-none opacity-50")}
                              onClick={() => patchState({ frostCurve: "linear" })}
                              disabled={sliderDisabled}
                            >
                              Frost · linear curve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={liveState.frostCurve === "pulse" ? "secondary" : "outline"}
                              className={cn(sliderDisabled && "pointer-events-none opacity-50")}
                              onClick={() => patchState({ frostCurve: "pulse" })}
                              disabled={sliderDisabled}
                            >
                              Frost · pulse curve
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <div className="flex justify-between text-sm">
                            <Label>Frost</Label>
                            <span className="tabular-nums text-muted-foreground">{Math.round(liveState.frost01 * 100)}%</span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[liveState.frost01 * 100]}
                            onValueChange={([v]) => patchState({ frost01: (v ?? 0) / 100 })}
                            disabled={sliderDisabled || frostEntries.length === 0}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
