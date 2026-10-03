'use client';

import { formatCents, type OptionDto } from '@fernleaf/shared';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOptions, useReferenceData } from '@/lib/catalogue-queries';
import { useCan } from '@/lib/session';
import { OptionDialog } from './option-dialog';

export function OptionsTab() {
  const canEdit = useCan('CATALOGUE_WRITE');
  const options = useOptions();
  const reference = useReferenceData();
  // undefined = dialog closed, null = new option, OptionDto = editing that option
  const [editing, setEditing] = useState<OptionDto | null | undefined>(undefined);

  const names = (ids: string[], list: { id: string; name: string }[] = []) =>
    ids.map((id) => list.find((item) => item.id === id)?.name).filter(Boolean);

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <p className="text-sm text-muted-foreground">
          Reusable choices (paneer, jeera rice, raita…) that dishes offer in their option groups.
        </p>
        {canEdit ? (
          <Button onClick={() => setEditing(null)}>
            <Plus /> New option
          </Button>
        ) : null}
      </div>

      {options.isPending || reference.isPending ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : options.isError ? (
        <p className="p-4 text-sm text-destructive">{options.error.message}</p>
      ) : options.data.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No options yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Option</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Sizes (extra charge)</TableHead>
              <TableHead>Allergens · dietary</TableHead>
              <TableHead className="text-right">Used in</TableHead>
              <TableHead className="text-right">Status</TableHead>
              {canEdit ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.data.map((option) => (
              <TableRow key={option.id}>
                <TableCell>
                  <p className="font-medium">{option.name}</p>
                  {option.description ? (
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {option.costCents === null ? '—' : formatCents(option.costCents)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {option.portions.length === 0
                    ? '—'
                    : option.portions
                        .map((p) => `${p.portionSizeName} +${formatCents(p.extraChargeCents)}`)
                        .join(', ')}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {names(option.allergenIds, reference.data?.allergens).map((name) => (
                      <Badge key={name} variant="warning">
                        {name}
                      </Badge>
                    ))}
                    {names(option.dietaryTagIds, reference.data?.['dietary-tags']).map((name) => (
                      <Badge key={name} variant="success">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                  {option.usedInGroups} {option.usedInGroups === 1 ? 'group' : 'groups'}
                </TableCell>
                <TableCell className="text-right">
                  {option.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Switched off</Badge>
                  )}
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${option.name}`}
                      onClick={() => setEditing(option)}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing !== undefined && reference.data ? (
        <OptionDialog
          option={editing}
          reference={reference.data}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </Card>
  );
}
