import {useTranslation} from "react-i18next";
import {Alert, AlertDescription} from "@/components/ui/alert.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {prettyJSON} from "@/lib/json.ts";
import type {NetworkApplyResult} from "@/types/controller.ts";

type NetworkApplyResultCardProps = {
    applyResult: NetworkApplyResult | null;
};

export function NetworkApplyResultCard({applyResult}: NetworkApplyResultCardProps) {
    const {t} = useTranslation("settings");

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("networkApply.title")}</CardTitle>
            </CardHeader>
            <CardContent>
                {!applyResult ? (
                    <p className="text-sm opacity-70">{t("networkApply.noAction")}</p>
                ) : (
                    <div className="space-y-2">
                        <p className="text-sm">
                            {applyResult.dryRun ? t("networkApply.dryRun") : t("networkApply.applied")}
                        </p>
                        {(applyResult.warnings ?? []).map((warning) => (
                            <Alert key={warning} className="py-1 text-xs">
                                <AlertDescription>{warning}</AlertDescription>
                            </Alert>
                        ))}
                        <div className="max-h-48 overflow-auto rounded border p-2 bg-card">
                            <pre className="text-xs whitespace-pre-wrap">{prettyJSON(applyResult.steps)}</pre>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
