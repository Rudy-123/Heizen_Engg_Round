import { Hammer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Placeholder for a section whose screen is built in a later step. */
export function ComingSoon({ plannedFeatures }: { plannedFeatures: string[] }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Hammer className="size-5" />
        </span>
        <div>
          <p className="font-medium">This screen is being built.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {plannedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
