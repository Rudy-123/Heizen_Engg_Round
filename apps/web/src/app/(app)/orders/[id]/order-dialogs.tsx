'use client';

import { minutesToTime, type OrderDetailDto } from '@fernleaf/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { selectClassName } from '@/lib/catalogue-queries';
import { useOrderFormContext } from '@/lib/order-queries';

/** Cancel or reject an order, saying why (shown on its timeline). */
export function ReasonDialog({
  order,
  action,
  onClose,
  onSaved,
}: {
  order: OrderDetailDto;
  action: 'cancel' | 'reject';
  onClose: () => void;
  onSaved: (order: OrderDetailDto) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.post<OrderDetailDto>(`/orders/${order.id}/${action}`, { version: order.version, reason }),
    onSuccess: (result) => {
      onSaved(result);
      toast.success(action === 'cancel' ? 'Order cancelled' : 'Order rejected');
      onClose();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not save.',
      ),
  });
  const invoiced = order.isInvoiced;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === 'cancel' ? 'Cancel this order?' : 'Reject this order?'}
          </DialogTitle>
          <DialogDescription>
            {action === 'reject'
              ? 'Rejecting means the kitchen refuses it. It won’t be billed.'
              : 'It won’t be cooked or billed.'}{' '}
            {invoiced
              ? 'It is already on an invoice, so a credit for the full amount goes on the company’s next invoice.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason (shown on the timeline)</Label>
          <Textarea
            id="reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <FieldError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {action === 'cancel' ? 'Cancel order' : 'Reject order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Spec 4.6 admin override: a confirmed order's time, address or packaging. Money doesn't change. */
export function DeliveryDialog({
  order,
  onClose,
  onSaved,
}: {
  order: OrderDetailDto;
  onClose: () => void;
  onSaved: (order: OrderDetailDto) => void;
}) {
  const context = useOrderFormContext(order.employee.id);
  const [time, setTime] = useState(order.deliveryTimeMinutes);
  const [addressId, setAddressId] = useState(order.addressId);
  const [packagingTypeId, setPackagingTypeId] = useState(order.packagingTypeId);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.put<OrderDetailDto>(`/orders/${order.id}/delivery`, {
        version: order.version,
        deliveryTimeMinutes: time,
        addressId,
        packagingTypeId,
      }),
    onSuccess: (result) => {
      onSaved(result);
      toast.success('Delivery changed - planned times updated');
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
          <DialogTitle>Change delivery</DialogTitle>
          <DialogDescription>
            An admin override on a confirmed order. The kitchen and dispatch plan move with it; the
            price doesn’t change.
          </DialogDescription>
        </DialogHeader>
        {context.isPending ? (
          <Loader2 className="mx-auto animate-spin" />
        ) : context.isError ? (
          <p className="text-sm text-destructive">{context.error.message}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="override-time">Delivery time</Label>
              <select
                id="override-time"
                className={selectClassName}
                value={time}
                onChange={(e) => setTime(Number(e.target.value))}
              >
                {context.data.deliveryTimes.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutesToTime(minutes)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-address">Address</Label>
              <select
                id="override-address"
                className={selectClassName}
                value={addressId}
                onChange={(e) => setAddressId(e.target.value)}
              >
                {context.data.addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.text}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-packaging">Packaging</Label>
              <select
                id="override-packaging"
                className={selectClassName}
                value={packagingTypeId}
                onChange={(e) => setPackagingTypeId(e.target.value)}
              >
                {context.data.packagingTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
            <FieldError message={error ?? undefined} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !context.data}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
