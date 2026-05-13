import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DMXLiveStatus } from "../../../bindings/goldbus/internal/dmx/models";

type DMXFixtureLiveDashboardProps = {
  status: DMXLiveStatus | null;
  onStart: () => Promise<unknown> | void;
  onStop: () => Promise<unknown> | void;
  disabled?: boolean;
};

export function DMXFixtureLiveDashboard({ status, onStart, onStop, disabled = false }: DMXFixtureLiveDashboardProps) {
  const connected = status?.connected ?? false;
  const label = connected ? `Connected${status?.deviceName ? ` (${status.deviceName})` : ""}` : "Disconnected";

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h3 className="text-lg font-bold">DMX Live Output</h3>
          <p className="text-sm text-muted-foreground">{label}</p>
          {status?.error && <p className="text-sm text-destructive">{status.error}</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={onStart} disabled={disabled || connected}>Start Live</Button>
          <Button onClick={onStop} disabled={disabled || !connected} variant="destructive">Stop Live</Button>
        </div>
      </CardContent>
    </Card>
  );
}
