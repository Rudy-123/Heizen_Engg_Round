'use client';

import {
  MAX_DELIVERY_PHOTO_BASE64_LENGTH,
  minutesToTime,
  type DeliverDropInput,
  type DropDto,
} from '@fernleaf/shared';
import { useMutation } from '@tanstack/react-query';
import { Camera, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FieldError } from '@/components/field-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';

type Photo = NonNullable<DeliverDropInput['photo']>;

/**
 * Phone photos are several MB. Shrink to at most 1280 px on the long side and re-encode as
 * JPEG before upload, lowering the quality until it fits the server's limit.
 */
async function shrinkPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  let longSide = 1280;
  for (const quality of [0.72, 0.6, 0.45, 0.35]) {
    const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (dataBase64.length <= MAX_DELIVERY_PHOTO_BASE64_LENGTH) {
      return { mimeType: 'image/jpeg', dataBase64 };
    }
    longSide = Math.round(longSide * 0.75);
  }
  throw new Error('That photo is too large even after shrinking it.');
}

/** Spec 4.8: mark a drop delivered, with an optional note and photo. */
export function DeliverDialog({
  drop,
  path,
  onClose,
  onDelivered,
}: {
  drop: DropDto;
  /** The driver's own route or the admin override route. */
  path: string;
  onClose: () => void;
  onDelivered: (drop: DropDto) => void;
}) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ data: Photo; preview: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deliver = useMutation({
    mutationFn: () =>
      api.post<DropDto>(path, { note, photo: photo?.data ?? null } satisfies DeliverDropInput),
    onSuccess: (result) => {
      toast.success(
        result.deliveredOnTime
          ? `Delivered to ${result.company.name} - on time`
          : `Delivered to ${result.company.name} - after the agreed time`,
      );
      onDelivered(result);
      onClose();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not save.',
      ),
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delivered to {drop.company.name}?</DialogTitle>
          <DialogDescription>
            {minutesToTime(drop.deliveryTimeMinutes)} · {drop.meals} meals · {drop.addressText}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-note">Note (optional)</Label>
            <Textarea
              id="delivery-note"
              rows={2}
              placeholder="e.g. Left with reception"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Photo (optional)</Label>
            {photo ? (
              <div className="relative w-fit">
                {/* A local preview of the photo being uploaded. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.preview}
                  alt="Delivery"
                  className="max-h-48 rounded-lg border object-cover"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-1.5 right-1.5 size-7"
                  aria-label="Remove photo"
                  onClick={() => setPhoto(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-accent/40">
                {preparing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                {preparing ? 'Preparing photo…' : 'Take or choose a photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setPreparing(true);
                    setError(null);
                    try {
                      const data = await shrinkPhoto(file);
                      setPhoto({
                        data,
                        preview: `data:${data.mimeType};base64,${data.dataBase64}`,
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not read that photo.');
                    } finally {
                      setPreparing(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
          <FieldError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not yet
          </Button>
          <Button onClick={() => deliver.mutate()} disabled={deliver.isPending || preparing}>
            {deliver.isPending ? <Loader2 className="animate-spin" /> : null}
            Mark delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
