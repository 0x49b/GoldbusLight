import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import {useTheme} from "next-themes";
import {useEffect, useState} from "react";

const COLOR_MODES = [
    {value: "system", label: "System"},
    {value: "light", label: "Light"},
    {value: "dark", label: "Dark"},
] as const;

export function AppearanceCard() {
    const {theme, setTheme} = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <Card className="w-full max-w-none">
            <CardHeader>
                <CardTitle className="text-sm font-semibold">Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm opacity-70">
                    Choose light or dark mode, or follow the system preference.
                </p>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="color-mode" className="text-sm font-medium">
                        Color mode
                    </label>
                    <Select
                        value={mounted ? (theme ?? "system") : undefined}
                        onValueChange={(value) => {
                            if (value) {
                                setTheme(value);
                            }
                        }}
                        disabled={!mounted}
                    >
                        <SelectTrigger id="color-mode" className="w-56">
                            <SelectValue placeholder="System"/>
                        </SelectTrigger>
                        <SelectContent>
                            {COLOR_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                    {mode.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}
