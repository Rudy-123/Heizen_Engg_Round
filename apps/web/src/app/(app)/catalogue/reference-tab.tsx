'use client';

import {
  REFERENCE_KIND_INFO,
  REFERENCE_KINDS,
  type ReferenceItemDto,
  type ReferenceKind,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, ApiError } from '@/lib/api';
import { referenceQueryKey, useReferenceData } from '@/lib/catalogue-queries';
import { useCan } from '@/lib/session';

/** The admin-managed lists: add, rename, switch on/off. Items are never deleted. */
export function ReferenceTab() {
  const reference = useReferenceData();
  if (reference.isPending) {
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {REFERENCE_KINDS.map((kind) => (
          <Skeleton key={kind} className="h-64" />
        ))}
      </div>
    );
  }
  if (reference.isError)
    return <p className="text-sm text-destructive">{reference.error.message}</p>;

  return (
    <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
      {REFERENCE_KINDS.map((kind) => (
        <ReferenceListCard key={kind} kind={kind} items={reference.data[kind]} />
      ))}
    </div>
  );
}

function ReferenceListCard({ kind, items }: { kind: ReferenceKind; items: ReferenceItemDto[] }) {
  const info = REFERENCE_KIND_INFO[kind];
  const canEdit = useCan('CATALOGUE_WRITE');
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: referenceQueryKey });
  const add = useMutation({
    mutationFn: (name: string) => api.post<ReferenceItemDto>(`/reference/${kind}`, { name }),
    onSuccess: () => {
      setNewName('');
      setError(null);
      void refresh();
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not add.'),
  });

  function onAdd(event: FormEvent) {
    event.preventDefault();
    if (newName.trim()) add.mutate(newName.trim());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{info.title}</CardTitle>
        <CardDescription>{info.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <ReferenceRow
                key={item.id}
                kind={kind}
                item={item}
                canEdit={canEdit}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
        {canEdit ? (
          <form onSubmit={onAdd} className="space-y-1">
            <div className="flex gap-2">
              <Input
                placeholder={`New ${info.singular}`}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                aria-label={`New ${info.singular}`}
              />
              <Button type="submit" variant="outline" disabled={add.isPending || !newName.trim()}>
                <Plus /> Add
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReferenceRow({
  kind,
  item,
  canEdit,
  onChanged,
}: {
  kind: ReferenceKind;
  item: ReferenceItemDto;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.name);
  const update = useMutation({
    mutationFn: (body: { name?: string; isActive?: boolean }) =>
      api.patch<ReferenceItemDto>(`/reference/${kind}/${item.id}`, body),
    onSuccess: () => {
      setRenaming(false);
      onChanged();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not save.',
      ),
  });

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      {renaming ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ name });
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8"
            autoFocus
            aria-label="Name"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Save name"
            disabled={update.isPending}
          >
            <Check />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel"
            onClick={() => {
              setName(item.name);
              setRenaming(false);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <>
          <span className={item.isActive ? 'flex-1' : 'flex-1 text-muted-foreground line-through'}>
            {item.name}
          </span>
          {!item.isActive ? <Badge variant="secondary">Off</Badge> : null}
          {canEdit ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Rename ${item.name}`}
                onClick={() => setRenaming(true)}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Switch
                checked={item.isActive}
                disabled={update.isPending}
                aria-label={item.isActive ? `Switch off ${item.name}` : `Switch on ${item.name}`}
                onCheckedChange={(isActive) => update.mutate({ isActive })}
              />
            </>
          ) : null}
        </>
      )}
    </li>
  );
}
