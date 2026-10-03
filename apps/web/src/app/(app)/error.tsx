'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown if a page crashes while rendering, instead of a blank screen. */
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">This page hit a problem</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Try again. If it keeps happening, reload the page.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
