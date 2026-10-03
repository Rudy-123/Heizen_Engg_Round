'use client';

import {
  centsToDollarString,
  dollarStringToCents,
  formatCents,
  type PriceSource,
  type TierGridDto,
  type TierGridRowDto,
  type TierPriceChangesInput,
} from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CircleCheck,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  Star,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import {
  describeRule,
  pricingQueryKey,
  tierGridQueryKey,
  useTierGrid,
  useTiers,
} from '@/lib/pricing-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { TierDialog } from '../../tier-dialog';

type Kind = 'dishes' | 'options';
export type GridFilter = 'all' | 'missing' | 'explicit' | 'derived';

const FILTERS: { value: GridFilter; label: string; source?: PriceSource }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'No price', source: 'MISSING' },
  { value: 'explicit', label: 'Typed in', source: 'EXPLICIT' },
  { value: 'derived', label: 'From rule', source: 'DERIVED' },
];

/** Unsaved price boxes, keyed "dishes:<id>" or "options:<id>". */
type Edits = Record<string, string>;

/** A box shows the typed price, or is empty when the price comes from the rule (or is missing). */
function savedText(row: TierGridRowDto): string {
  return row.explicitCents === null ? '' : centsToDollarString(row.explicitCents);
}

/** Empty box = no typed price (null). Otherwise a valid amount, or undefined when it isn't one. */
function parseBox(text: string): number | null | undefined {
  if (text.trim() === '') return null;
  return dollarStringToCents(text) ?? undefined;
}

function pendingChanges(data: TierGridDto | undefined, edits: Edits) {
  const changes: TierPriceChangesInput = { dishes: [], options: [] };
  let invalid = 0;
  for (const kind of ['dishes', 'options'] as const) {
    for (const row of data?.[kind] ?? []) {
      const text = edits[`${kind}:${row.id}`];
      if (text === undefined) continue;
      const cents = parseBox(text);
      if (cents === undefined) invalid += 1;
      else if (cents !== row.explicitCents) changes[kind].push({ id: row.id, priceCents: cents });
    }
  }
  return { changes, count: changes.dishes.length + changes.options.length, invalid };
}

/**
 * Spec 4.3 (7): the whole tier on one screen. Every dish and option with its cost, what the
 * tier's rule gives, the typed price (editable in place) and the price that applies - with a
 * filter that lists exactly the items that have no price, and so are hidden from menus.
 */
export function TierGrid({ id, initialFilter }: { id: string; initialFilter: GridFilter }) {
  const grid = useTierGrid(id);
  const tiers = useTiers();
  const canEdit = useCan('PRICING_WRITE');
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>('dishes');
  const [filter, setFilter] = useState<GridFilter>(initialFilter);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [editingTier, setEditingTier] = useState(false);

  const pending = useMemo(() => pendingChanges(grid.data, edits), [grid.data, edits]);

  // Leaving the page (reload, closing the tab) with unsaved prices asks first.
  useEffect(() => {
    if (pending.count === 0 && pending.invalid === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending.count, pending.invalid]);

  const save = useMutation({
    mutationFn: (changes: TierPriceChangesInput) =>
      api.put<TierGridDto>(`/pricing/tiers/${id}/prices`, changes),
    onSuccess: (saved, changes) => {
      queryClient.setQueryData(tierGridQueryKey(id), saved);
      // Tiers derived from this one have new prices too.
      void queryClient.invalidateQueries({ queryKey: pricingQueryKey });
      setEdits({});
      const count = changes.dishes.length + changes.options.length;
      toast.success(`Saved ${count} ${count === 1 ? 'price' : 'prices'}`);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save the prices.'),
  });

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
      <Link href="/pricing">
        <ArrowLeft /> All tiers
      </Link>
    </Button>
  );

  if (grid.isPending) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[28rem]" />
      </div>
    );
  }
  if (grid.isError) {
    return (
      <div>
        {back}
        <p className="text-sm text-destructive">{grid.error.message}</p>
      </div>
    );
  }

  const { tier } = grid.data;
  const hasRule = tier.ruleBasis !== 'NONE';
  const term = search.trim().toLowerCase();
  const inScope = grid.data[kind].filter((row) => showInactive || row.isActive);
  const sourceOf = (value: GridFilter) => FILTERS.find((f) => f.value === value)?.source;
  const countFor = (value: GridFilter) =>
    inScope.filter((row) => value === 'all' || row.source === sourceOf(value)).length;
  const rows = inScope.filter(
    (row) =>
      (filter === 'all' || row.source === sourceOf(filter)) &&
      (!term ||
        row.name.toLowerCase().includes(term) ||
        (row.sku ?? '').toLowerCase().includes(term)),
  );
  const missingIn = (which: Kind) =>
    grid.data[which].filter((row) => row.isActive && row.source === 'MISSING').length;

  return (
    <div>
      {back}
      <PageHeader
        title={tier.name}
        description={`${describeRule(tier)}${hasRule ? ', rounded up to the next 5¢' : ''} · priced for ${tier.companyCount} ${tier.companyCount === 1 ? 'company' : 'companies'}${tier.description ? ` · ${tier.description}` : ''}`}
        actions={
          <>
            {tier.isDefault ? (
              <Badge>
                <Star /> Default tier
              </Badge>
            ) : null}
            {canEdit ? (
              <Button variant="outline" onClick={() => setEditingTier(true)}>
                <Pencil /> Edit rule
              </Button>
            ) : null}
          </>
        }
      />

      <p className="mb-4 flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        {hasRule
          ? 'Leave a box empty to use the rule; type a price to override it. '
          : 'This tier has no rule: anything without a typed price has no price. '}
        Saved prices apply to new orders only.
      </p>

      <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
        <TabsList>
          {(['dishes', 'options'] as const).map((which) => (
            <TabsTrigger key={which} value={which} className="gap-1.5">
              {which === 'dishes' ? 'Dishes' : 'Options'}
              {missingIn(which) > 0 ? (
                <span className="rounded-full bg-destructive/12 px-1.5 text-xs text-destructive">
                  {missingIn(which)} unpriced
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="mt-4 gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={kind === 'dishes' ? 'Search by name or SKU' : 'Search by name'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? 'default' : 'outline'}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span className="tabular-nums opacity-70">{countFor(option.value)}</span>
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show switched-off
          </label>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (pending.count > 0 && pending.invalid === 0) save.mutate(pending.changes);
          }}
        >
          {rows.length === 0 ? (
            <p className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              {filter === 'missing' && !term ? (
                <>
                  <CircleCheck className="size-4 text-success" />
                  Every {kind === 'dishes' ? 'dish' : 'option'} has a price on this tier.
                </>
              ) : (
                'Nothing matches.'
              )}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{kind === 'dishes' ? 'Dish' : 'Option'}</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  {hasRule ? <TableHead className="text-right">Rule gives</TableHead> : null}
                  <TableHead className="w-44">Typed price</TableHead>
                  <TableHead className="text-right">Price on this tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const key = `${kind}:${row.id}`;
                  return (
                    <PriceRow
                      key={key}
                      row={row}
                      hasRule={hasRule}
                      canEdit={canEdit}
                      text={edits[key]}
                      onText={(text) => setEdits((current) => ({ ...current, [key]: text }))}
                      onUndo={() =>
                        setEdits((current) => {
                          const { [key]: _undone, ...rest } = current;
                          return rest;
                        })
                      }
                    />
                  );
                })}
              </TableBody>
            </Table>
          )}

          {canEdit && (pending.count > 0 || pending.invalid > 0) ? (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 p-4 backdrop-blur">
              <p className="text-sm">
                <strong>{pending.count}</strong> unsaved{' '}
                {pending.count === 1 ? 'change' : 'changes'}
                {pending.invalid > 0 ? (
                  <span className="text-destructive">
                    {' '}
                    · {pending.invalid} {pending.invalid === 1 ? 'box is' : 'boxes are'} not a valid
                    amount
                  </span>
                ) : null}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEdits({})}>
                  Discard
                </Button>
                <Button
                  type="submit"
                  disabled={pending.count === 0 || pending.invalid > 0 || save.isPending}
                >
                  {save.isPending ? <Loader2 className="animate-spin" /> : null}
                  Save prices
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </Card>

      {editingTier ? (
        <TierDialog tier={tier} allTiers={tiers.data ?? []} onClose={() => setEditingTier(false)} />
      ) : null}
    </div>
  );
}

function PriceRow({
  row,
  hasRule,
  canEdit,
  text,
  onText,
  onUndo,
}: {
  row: TierGridRowDto;
  hasRule: boolean;
  canEdit: boolean;
  /** Unsaved text in the box, if it was touched. */
  text: string | undefined;
  onText: (text: string) => void;
  onUndo: () => void;
}) {
  const value = text ?? savedText(row);
  const typed = parseBox(value);
  const invalid = typed === undefined;
  const dirty = text !== undefined && typed !== row.explicitCents;
  // What the price will be once this box is saved - updates while typing.
  const price = invalid ? row.priceCents : (typed ?? row.derivedCents);
  const source: PriceSource = invalid
    ? row.source
    : typed !== null
      ? 'EXPLICIT'
      : row.derivedCents !== null
        ? 'DERIVED'
        : 'MISSING';

  return (
    <TableRow className={cn(dirty && 'bg-warning/10 hover:bg-warning/15')}>
      <TableCell>
        <div className={cn(!row.isActive && 'opacity-60')}>
          <p className="font-medium">{row.name}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {row.sku ? <span className="font-mono">{row.sku}</span> : null}
            {!row.isActive ? <Badge variant="secondary">Switched off</Badge> : null}
          </p>
        </div>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {formatCents(row.costCents)}
      </TableCell>
      {hasRule ? (
        <TableCell className="text-right tabular-nums">
          {row.derivedCents === null ? (
            <span
              className="text-muted-foreground"
              title="The tier this one starts from has no price"
            >
              —
            </span>
          ) : (
            formatCents(row.derivedCents)
          )}
        </TableCell>
      ) : null}
      <TableCell>
        <div className="flex items-center gap-1">
          <div className="relative w-28">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              inputMode="decimal"
              aria-label={`Typed price for ${row.name}`}
              className={cn(
                'h-8 pl-6 tabular-nums',
                dirty && !invalid && 'border-warning ring-[3px] ring-warning/25',
              )}
              placeholder={row.derivedCents === null ? '' : centsToDollarString(row.derivedCents)}
              value={value}
              disabled={!canEdit}
              aria-invalid={invalid || undefined}
              onChange={(event) => onText(event.target.value)}
              onBlur={() => {
                const cents = parseBox(value);
                if (typeof cents === 'number') onText(centsToDollarString(cents));
              }}
            />
          </div>
          {canEdit && dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Undo this change"
              title="Undo this change"
              onClick={onUndo}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : canEdit && value !== '' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={hasRule ? 'Remove the typed price (use the rule)' : 'Remove the price'}
              title={hasRule ? 'Remove the typed price (use the rule)' : 'Remove the price'}
              onClick={() => onText('')}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <SourceBadge source={source} hasRule={hasRule} />
          <span className="w-20 text-right font-semibold tabular-nums">
            {price === null ? '—' : formatCents(price)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SourceBadge({ source, hasRule }: { source: PriceSource; hasRule: boolean }) {
  switch (source) {
    case 'EXPLICIT':
      return <Badge variant="outline">{hasRule ? 'Override' : 'Typed in'}</Badge>;
    case 'DERIVED':
      return <Badge variant="secondary">From rule</Badge>;
    case 'MISSING':
      return <Badge variant="destructive">No price · hidden</Badge>;
  }
}
