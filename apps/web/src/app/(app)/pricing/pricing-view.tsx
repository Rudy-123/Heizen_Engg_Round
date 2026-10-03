'use client';

import type { PriceRuleBasis, PriceTierDto } from '@fernleaf/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  CircleCheck,
  Hand,
  Layers,
  Lock,
  Pencil,
  Plus,
  Sigma,
  Star,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { describeRule, pricingQueryKey, useTiers } from '@/lib/pricing-queries';
import { useCan } from '@/lib/session';
import { TierDialog } from './tier-dialog';

const RULE_ICONS: Record<PriceRuleBasis, LucideIcon> = {
  NONE: Hand,
  COST: Sigma,
  TIER: Layers,
};

const STEPS = [
  {
    icon: Hand,
    title: 'Typed price',
    text: 'A price typed in on the tier always wins.',
  },
  {
    icon: Sigma,
    title: 'Else the tier’s rule',
    text: 'Cost × N, or another tier × N - rounded up to the next 5¢.',
  },
  {
    icon: TriangleAlert,
    title: 'Else no price',
    text: 'The dish is hidden from that tier’s menus - never shown at $0.',
  },
  {
    icon: Lock,
    title: 'Placed orders keep theirs',
    text: 'Price changes only affect new orders.',
  },
];

export function PricingView() {
  const tiers = useTiers();
  const canEdit = useCan('PRICING_WRITE');
  const [editing, setEditing] = useState<PriceTierDto | 'new' | null>(null);
  const [makingDefault, setMakingDefault] = useState<PriceTierDto | null>(null);

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="The same dish can cost different amounts for different companies. Each company buys at its tier’s prices; companies without a tier use the default."
        actions={
          canEdit ? (
            <Button onClick={() => setEditing('new')}>
              <Plus /> New tier
            </Button>
          ) : null
        }
      />

      <Card className="mb-6 gap-0 py-0">
        <ol className="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {tiers.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : tiers.isError ? (
        <p className="text-sm text-destructive">{tiers.error.message}</p>
      ) : tiers.data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No price tiers yet. The first tier you create becomes the default.
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tiers.data.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              canEdit={canEdit}
              onEdit={() => setEditing(tier)}
              onMakeDefault={() => setMakingDefault(tier)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <TierDialog
          tier={editing === 'new' ? null : editing}
          allTiers={tiers.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {makingDefault ? (
        <MakeDefaultDialog tier={makingDefault} onClose={() => setMakingDefault(null)} />
      ) : null}
    </div>
  );
}

function TierCard({
  tier,
  canEdit,
  onEdit,
  onMakeDefault,
}: {
  tier: PriceTierDto;
  canEdit: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
}) {
  const missing = tier.missingDishCount + tier.missingOptionCount;
  const missingParts = [
    tier.missingDishCount > 0 ? countLabel(tier.missingDishCount, 'dish', 'dishes') : null,
    tier.missingOptionCount > 0 ? countLabel(tier.missingOptionCount, 'option', 'options') : null,
  ].filter(Boolean);
  const RuleIcon = RULE_ICONS[tier.ruleBasis];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{tier.name}</CardTitle>
          {tier.isDefault ? (
            <Badge>
              <Star /> Default
            </Badge>
          ) : null}
        </div>
        {tier.description ? <CardDescription>{tier.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">
              <RuleIcon className="size-3.5 text-primary" />
              {describeRule(tier)}
            </span>
            {tier.ruleBasis === 'NONE' ? null : (
              <span className="text-xs text-muted-foreground">rounded up to the next 5¢</span>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-3.5" />
            Prices {countLabel(tier.companyCount, 'company', 'companies')}
            {tier.isDefault ? ', including any without a tier' : ''}
          </p>
        </div>

        {missing > 0 ? (
          <Link
            href={`/pricing/tiers/${tier.id}?show=missing`}
            className="flex items-start gap-2 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground transition-colors hover:bg-warning/25"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>{missingParts.join(' and ')}</strong> {missing === 1 ? 'has' : 'have'} no
              price here, so {missing === 1 ? 'it is' : 'they are'} hidden from these menus.
            </span>
          </Link>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm text-success">
            <CircleCheck className="size-4 shrink-0" /> Every active dish and option has a price.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/pricing/tiers/${tier.id}`}>
              Open price grid <ArrowRight />
            </Link>
          </Button>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil /> Edit rule
            </Button>
          ) : null}
          {canEdit && !tier.isDefault ? (
            <Button size="sm" variant="ghost" onClick={onMakeDefault}>
              Make default
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function MakeDefaultDialog({ tier, onClose }: { tier: PriceTierDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const makeDefault = useMutation({
    mutationFn: () => api.post<PriceTierDto>(`/pricing/tiers/${tier.id}/make-default`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pricingQueryKey });
      toast.success(`${tier.name} is now the default tier`);
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not change the default.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make {tier.name} the default?</DialogTitle>
          <DialogDescription>
            Companies without their own tier will be priced on {tier.name} for new orders. Orders
            already placed keep their prices.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => makeDefault.mutate()} disabled={makeDefault.isPending}>
            Make default
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
