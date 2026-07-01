import {useState} from "react";
import {PiPlus} from "react-icons/pi";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Field, FieldLabel} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import type {DetailRoute} from "@/types/controller";

type WLEDAddDeviceViewProps = {
    busy: boolean;
    setRoute: (route: DetailRoute) => void;
    onAddDevice: (address: string, port: number) => Promise<string | null>;
};

export function WLEDAddDeviceView({busy, setRoute, onAddDevice}: WLEDAddDeviceViewProps) {
    const [address, setAddress] = useState("");
    const [port, setPort] = useState("80");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const formBusy = busy || submitting;

    const submit = async () => {
        setError(null);
        setSubmitting(true);
        try {
            const parsedPort = Number.parseInt(port, 10);
            const deviceID = await onAddDevice(address, Number.isFinite(parsedPort) ? parsedPort : 80);
            if (!deviceID) {
                setError("Could not add device. Check the IP address and that WLED is reachable on the network.");
                return;
            }
            setRoute({kind: "device", id: deviceID});
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-xl space-y-4 p-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-semibold">Add WLED device</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Enter the device IPv4 address. Goldbus Light will health-check it via HTTP before saving it.
                    </p>

                    <Field>
                        <FieldLabel htmlFor="wled-ip">IPv4 address</FieldLabel>
                        <Input
                            id="wled-ip"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="192.168.1.42"
                            disabled={formBusy}
                            autoFocus
                        />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="wled-port">Port</FieldLabel>
                        <Input
                            id="wled-port"
                            type="number"
                            min={1}
                            max={65535}
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            disabled={formBusy}
                        />
                    </Field>

                    {error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void submit()} disabled={formBusy || !address.trim()}>
                            <PiPlus className="mr-1 size-4"/>
                            Add device
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRoute({kind: "presets"})}
                            disabled={formBusy}
                        >
                            Cancel
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
