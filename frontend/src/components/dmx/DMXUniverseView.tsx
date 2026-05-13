import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Placeholder for DMX universe overview (channel-level visualization, conflicts, etc.).
 * Content will be added later.
 */
export function DMXUniverseView() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg">DMX Universe</CardTitle>
        <CardDescription>
          Overview of the current DMX universe. Detailed controls will appear here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}
