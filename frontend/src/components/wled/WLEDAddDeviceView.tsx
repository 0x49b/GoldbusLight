import {useState} from "react";
import {useTranslation} from "react-i18next";
import {PiPlus} from "react-icons/pi";
import i18n from "@/i18n";
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
    const {t} = useTranslation("wled");
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
                setError(i18n.t("status:addDeviceFailed"));
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
                    <CardTitle className="text-base font-semibold">{t("add.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t("add.description")}
                    </p>

                    <Field>
                        <FieldLabel htmlFor="wled-ip">{t("add.ipLabel")}</FieldLabel>
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
                        <FieldLabel htmlFor="wled-port">{t("add.portLabel")}</FieldLabel>
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
                            {t("add.submit")}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRoute({kind: "presets"})}
                            disabled={formBusy}
                        >
                            {t("add.cancel")}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
