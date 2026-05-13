import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { DMXFixtureLiveDashboard } from "./DMXFixtureLiveDashboard";
import type { DMXLiveStatus } from "../../../bindings/goldbus/internal/dmx/models";
import type { DMXChannel, DMXFixture, DMXState, DetailRoute, UpsertDMXFixtureInput, USBSerialDevice } from "../../types/controller";

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

export function DMXFixtureEditorView(props: DMXFixtureEditorViewProps) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [address, setAddress] = useState(1);
  const [maxPan, setMaxPan] = useState(540);
  const [maxTilt, setMaxTilt] = useState(270);
  const [channels, setChannels] = useState<DMXChannel[]>([]);

  useEffect(() => {
    if (props.fixture) {
      setName(props.fixture.name);
      setBrand(props.fixture.brand);
      setAddress(props.fixture.dmxAddress || 1);
      setMaxPan(props.fixture.movingHead?.maxPan || 540);
      setMaxTilt(props.fixture.movingHead?.maxTilt || 270);
      setChannels(props.fixture.channels || []);
      return;
    }
    setName("");
    setBrand("");
    setAddress(1);
    setMaxPan(540);
    setMaxTilt(270);
    setChannels([]);
  }, [props.fixture]);

  const handleSave = async () => {
    const input: UpsertDMXFixtureInput = {
      id: props.fixture?.id,
      type: "movingHead",
      brand,
      name,
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

  const handleStartLive = async () => {
    if (!props.fixture) {
      return;
    }
    await props.startDMXLiveOutput(props.fixture.id);
    await props.pullDMXLiveStatus();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <Label>DMX Start Address</Label>
            <Input type="number" value={address} onChange={(e) => setAddress(Number(e.target.value) || 1)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Max Pan</Label>
              <Input type="number" value={maxPan} onChange={(e) => setMaxPan(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Max Tilt</Label>
              <Input type="number" value={maxTilt} onChange={(e) => setMaxTilt(Number(e.target.value) || 0)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Configured channels: {channels.length}</p>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={props.busy}>Save</Button>
            <Button variant="outline" onClick={() => props.setRoute({ kind: "presets" })} disabled={props.busy}>Back</Button>
            {props.fixture && (
              <Button variant="destructive" onClick={handleDelete} disabled={props.busy}>Delete</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <DMXFixtureLiveDashboard
        status={props.dmxLiveStatus}
        disabled={props.busy || !props.fixture}
        onStart={handleStartLive}
        onStop={props.stopDMXLiveOutput}
      />
    </div>
  );
}
