'use client';

import { Expand, UtensilsCrossed, XIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { cn } from '@/lib/utils';

const ZOOM = 2.5;

/**
 * The demo photos also come whole and larger in /dishes/large/ (the card versions are cropped
 * to 4:3). Any other photo address is shown as it is.
 */
function largeVersion(url: string): string {
  const demo = /^\/dishes\/([\w-]+\.jpg)$/.exec(url);
  return demo ? `/dishes/large/${demo[1]}` : url;
}

/**
 * Makes a photo clickable: it opens full screen, whole, with the dish's name and details.
 * Click the photo to zoom in where you clicked, move to look around, click again to zoom out.
 * Clicks don't reach the row or card underneath (those often open the dish itself).
 */
export function PhotoZoom({
  url,
  name,
  subtitle,
  details,
  className,
  children,
}: {
  url: string;
  name: string;
  subtitle?: ReactNode;
  details?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={`View the photo of ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'group/photo relative shrink-0 cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
      >
        {children}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover/photo:bg-black/25 group-hover/photo:opacity-100">
          <Expand className="size-5 text-white drop-shadow" />
        </span>
      </button>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onClick={(event) => {
            event.stopPropagation();
            // A click on the dark area around the photo closes the viewer.
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex w-full max-w-5xl items-start justify-between gap-4 text-white">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">
                {name}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className={cn('text-sm text-white/75', !subtitle && 'sr-only')}
              >
                {subtitle ?? `Photo of ${name}`}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-full bg-white/10 p-2 transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
              <XIcon className="size-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          <ZoomablePhoto url={url} name={name} />
          {details ? (
            <div className="w-full max-w-5xl space-y-2 text-sm text-white/85 [&_p]:max-w-prose">
              {details}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The photo itself in the viewer: whole, as large as the screen allows, zoomable. */
function ZoomablePhoto({ url, name }: { url: string; name: string }) {
  const [source, setSource] = useState(() => largeVersion(url));
  // Where the zoom is centred, in % of the photo; null = not zoomed.
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);

  const pointAt = (box: HTMLElement, clientX: number, clientY: number) => {
    const rect = box.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };
  const toggle = (event: MouseEvent<HTMLDivElement>) =>
    setFocus(focus ? null : pointAt(event.currentTarget, event.clientX, event.clientY));
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    if (focus) setFocus(pointAt(event.currentTarget, event.clientX, event.clientY));
  };
  const followTouch = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (focus && touch) setFocus(pointAt(event.currentTarget, touch.clientX, touch.clientY));
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={focus ? 'Zoom out' : 'Zoom in'}
        onClick={toggle}
        onMouseMove={follow}
        onTouchMove={followTouch}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setFocus(focus ? null : { x: 50, y: 50 });
          }
        }}
        className={cn(
          'overflow-hidden rounded-xl shadow-2xl focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none',
          focus ? 'cursor-zoom-out' : 'cursor-zoom-in',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source}
          alt={`Photo of ${name}`}
          // The larger version is optional: fall back to the photo the card shows.
          onError={() => source !== url && setSource(url)}
          draggable={false}
          style={{
            transform: focus ? `scale(${ZOOM})` : 'none',
            transformOrigin: focus ? `${focus.x}% ${focus.y}%` : 'center',
          }}
          className="block max-h-[72vh] max-w-[min(92vw,64rem)] object-contain transition-transform duration-200 ease-out select-none"
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-white/60">
        {focus ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />}
        {focus
          ? 'Move to look around · click to zoom out'
          : 'Click the photo to zoom in · Esc to close'}
      </p>
    </div>
  );
}

/**
 * A dish's photo as a small square - click it to see it large - or a plain placeholder when
 * the dish has none.
 */
export function DishPhoto({
  url,
  name,
  subtitle,
  details,
  className,
}: {
  url: string | null | undefined;
  name: string;
  subtitle?: ReactNode;
  details?: ReactNode;
  className?: string;
}) {
  if (!url) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,oklch(0.95_0.03_80),oklch(0.92_0.04_60))]',
          className,
        )}
      >
        <UtensilsCrossed className="size-4 text-terracotta" />
      </span>
    );
  }
  return (
    <PhotoZoom
      url={url}
      name={name}
      subtitle={subtitle}
      details={details}
      className={cn('rounded-lg', className)}
    >
      {/* Photos are files with the app or admin-entered URLs on any host: a plain lazy <img>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="size-full bg-muted object-cover" />
    </PhotoZoom>
  );
}
