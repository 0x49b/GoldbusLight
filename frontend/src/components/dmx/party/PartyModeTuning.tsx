import React from "react";
import {useTranslation} from "react-i18next";
import type { DMXChannel } from "@/types/controller.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { channelPartyIncludeEnabled } from "@/lib/dmxPartyInclude.ts";

export interface PartyModeTuningProps {
    channels: DMXChannel[];
    partyChannelWeights: Record<string, number>;
    setPartyChannelWeights: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    partyStrobeEnabled: boolean;
    setPartyStrobeEnabled: (enabled: boolean) => void;
    partyStrobeOnMs: number;
    setPartyStrobeOnMs: (ms: number) => void;
    partyStrobeOffMs: number;
    setPartyStrobeOffMs: (ms: number) => void;
    busy: boolean;
}

export function PartyModeTuning({
    channels,
    partyChannelWeights,
    setPartyChannelWeights,
    partyStrobeEnabled,
    setPartyStrobeEnabled,
    partyStrobeOnMs,
    setPartyStrobeOnMs,
    partyStrobeOffMs,
    setPartyStrobeOffMs,
    busy,
}: PartyModeTuningProps) {
    const {t} = useTranslation("dmx");
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{t("partyTuning.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                    {t("partyTuning.perChannelDescription")}
                </p>
                <div className="grid gap-3">
                    {channels.filter((ch) => channelPartyIncludeEnabled(ch)).map((ch) => {
                        const key = String(Math.round(ch.channel));
                        const w = partyChannelWeights[key] ?? 100;
                        return (
                            <label
                                key={`${key}-${ch.type}`}
                                className="flex flex-col gap-1 text-xs text-muted-foreground"
                            >
                                <span className="font-medium text-foreground">
                                    {t("partyTuning.channelWeightLabel", {offset: ch.channel, type: ch.type, value: w})}
                                </span>
                                <Slider
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={[w]}
                                    disabled={busy}
                                    onValueChange={([nextW]) =>
                                        setPartyChannelWeights((prev) => ({
                                            ...prev,
                                            [key]: Math.max(0, Math.min(100, Math.round(nextW ?? 100))),
                                        }))
                                    }
                                />
                            </label>
                        );
                    })}
                </div>
                <Separator />
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">
                        {t("partyTuning.strobeDescription")}
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={partyStrobeEnabled}
                            disabled={busy}
                            onCheckedChange={(v) => setPartyStrobeEnabled(v === true)}
                        />
                        <span>{t("partyTuning.useTimedStrobe")}</span>
                    </label>
                    {partyStrobeEnabled ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label htmlFor="party-strobe-on">{t("partyTuning.burstOnMs")}</Label>
                                <Input
                                    id="party-strobe-on"
                                    type="number"
                                    min={20}
                                    max={8000}
                                    value={partyStrobeOnMs}
                                    disabled={busy}
                                    onChange={(e) =>
                                        setPartyStrobeOnMs(Math.max(20, Math.round(Number(e.target.value) || 120)))
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="party-strobe-off">{t("partyTuning.burstOffMs")}</Label>
                                <Input
                                    id="party-strobe-off"
                                    type="number"
                                    min={20}
                                    max={15000}
                                    value={partyStrobeOffMs}
                                    disabled={busy}
                                    onChange={(e) =>
                                        setPartyStrobeOffMs(Math.max(20, Math.round(Number(e.target.value) || 500)))
                                    }
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
}
