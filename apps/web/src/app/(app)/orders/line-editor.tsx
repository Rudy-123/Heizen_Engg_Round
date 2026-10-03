'use client';

import {
  formatCents,
  type FieldError,
  type MenuDishDto,
  type MenuOptionGroupDto,
  type QuoteLineDto,
} from '@fernleaf/shared';
import { Lock, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { DishPhoto } from '@/components/dish-photo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { selectClassName } from '@/lib/catalogue-queries';
import { cn } from '@/lib/utils';

export interface ChoiceState {
  groupId: string;
  optionId: string;
  portionSizeId: string | null;
}

export interface CombinationState {
  key: string;
  quantity: number;
  choices: ChoiceState[];
}

export interface LineState {
  key: string;
  dishId: string;
  quantity: number;
  combinations: CombinationState[];
}

let nextKey = 0;
export const newKey = () => `k${(nextKey += 1)}`;

/** A combination with the first option of every required single-choice group already picked. */
export function defaultCombination(dish: MenuDishDto, quantity: number): CombinationState {
  const choices: ChoiceState[] = [];
  for (const group of dish.optionGroups) {
    const first = group.options[0];
    if (group.isRequired && group.maxSelections === 1 && first) {
      choices.push({
        groupId: group.id,
        optionId: first.id,
        portionSizeId: group.usesPortions ? (first.sizes[0]?.portionSizeId ?? null) : null,
      });
    }
  }
  return { key: newKey(), quantity, choices };
}

/** One dish on the order: its quantity, split into combinations of choices (spec 4.1). */
export function LineEditor({
  line,
  dish,
  index,
  quote,
  problems,
  allergies,
  onChange,
  onRemove,
}: {
  line: LineState;
  dish: MenuDishDto | undefined;
  index: number;
  quote: QuoteLineDto | undefined;
  problems: FieldError[];
  allergies: string[];
  onChange: (line: LineState) => void;
  onRemove: () => void;
}) {
  const path = `lines.${index}`;
  const assigned = line.combinations.reduce((sum, c) => sum + c.quantity, 0);
  const lineProblems = problems.filter(
    (p) =>
      p.path === path ||
      p.path === `${path}.dishId` ||
      p.path === `${path}.quantity` ||
      p.path === `${path}.combinations`,
  );

  const setQuantity = (quantity: number) => {
    const combinations =
      line.combinations.length === 1 && line.combinations[0]
        ? [{ ...line.combinations[0], quantity }] // one combination: it follows the line
        : line.combinations;
    onChange({ ...line, quantity, combinations });
  };
  const updateCombination = (key: string, change: Partial<CombinationState>) =>
    onChange({
      ...line,
      combinations: line.combinations.map((c) => (c.key === key ? { ...c, ...change } : c)),
    });

  if (!dish) {
    return (
      <div className="rounded-xl border border-destructive/40 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-destructive">This dish is no longer on this employee’s menu.</span>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 /> Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <DishPhoto
          url={dish.imageUrl}
          name={dish.name}
          subtitle={`${formatCents(dish.priceCents)} each before choices`}
          details={dish.description ? <p>{dish.description}</p> : null}
          className="size-12"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{dish.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatCents(dish.priceCents)} each before choices
            {dish.minOrderQuantity ? ` · minimum ${dish.minOrderQuantity}` : ''}
          </p>
        </div>
        {dish.allergyWarnings.length > 0 ? (
          <Badge variant="destructive">
            <TriangleAlert /> {dish.allergyWarnings.join(', ')}
          </Badge>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          Meals
          <Input
            type="number"
            min={1}
            className="h-8 w-20 tabular-nums"
            value={line.quantity}
            onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Remove ${dish.name}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {line.combinations.map((combination, comboIndex) => {
          const cpath = `${path}.combinations.${comboIndex}`;
          const comboProblems = problems.filter(
            (p) => p.path === cpath || p.path.startsWith(`${cpath}.`),
          );
          const priced = quote?.combinations[comboIndex];
          return (
            <div key={combination.key} className="rounded-lg bg-muted/50 p-3">
              <div className="flex flex-wrap items-start gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Input
                    type="number"
                    min={1}
                    aria-label="Meals with these choices"
                    className="h-8 w-16 bg-card tabular-nums"
                    value={combination.quantity}
                    onChange={(e) =>
                      updateCombination(combination.key, {
                        quantity: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                  ×
                </label>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {dish.optionGroups.length === 0 ? (
                    <span className="py-1 text-sm text-muted-foreground">
                      No choices - as it comes.
                    </span>
                  ) : null}
                  {dish.optionGroups.map((group) => (
                    <GroupPicker
                      key={group.id}
                      group={group}
                      choices={combination.choices.filter((c) => c.groupId === group.id)}
                      allergies={allergies}
                      onChange={(groupChoices) =>
                        updateCombination(combination.key, {
                          choices: [
                            ...combination.choices.filter((c) => c.groupId !== group.id),
                            ...groupChoices,
                          ],
                        })
                      }
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {priced ? (
                    <span className="text-sm whitespace-nowrap tabular-nums">
                      {formatCents(priced.unitPriceCents)} ×{priced.quantity} ={' '}
                      <strong>{formatCents(priced.totalCents)}</strong>
                      {priced.lockedPrice ? (
                        <Lock
                          className="ml-1 inline size-3 text-muted-foreground"
                          aria-label="Price locked when placed"
                        />
                      ) : null}
                    </span>
                  ) : null}
                  {line.combinations.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Remove this combination"
                      onClick={() =>
                        onChange({
                          ...line,
                          combinations: line.combinations.filter((c) => c.key !== combination.key),
                        })
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {comboProblems.map((problem) => (
                <p key={problem.path + problem.message} className="mt-1 text-xs text-destructive">
                  {problem.message}
                </p>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {dish.optionGroups.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...line,
                combinations: [
                  ...line.combinations,
                  defaultCombination(dish, Math.max(1, line.quantity - assigned)),
                ],
              })
            }
          >
            <Plus /> Split off different choices
          </Button>
        ) : (
          <span />
        )}
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            assigned === line.quantity ? 'text-success' : 'text-warning-foreground',
          )}
        >
          {assigned === line.quantity
            ? `All ${line.quantity} ${line.quantity === 1 ? 'meal' : 'meals'} assigned`
            : assigned < line.quantity
              ? `${assigned} of ${line.quantity} assigned - ${line.quantity - assigned} still to assign`
              : `${assigned} of ${line.quantity} assigned - ${assigned - line.quantity} too many`}
        </span>
      </div>
      {lineProblems.map((problem) => (
        <p key={problem.path + problem.message} className="mt-1 text-sm text-destructive">
          {problem.message}
        </p>
      ))}
    </div>
  );
}

/** One option group inside a combination: a dropdown (pick one) or chips (pick several). */
function GroupPicker({
  group,
  choices,
  allergies,
  onChange,
}: {
  group: MenuOptionGroupDto;
  choices: ChoiceState[];
  allergies: string[];
  onChange: (choices: ChoiceState[]) => void;
}) {
  const label = (option: MenuOptionGroupDto['options'][number]) => {
    const warn = option.allergens.some((a) => allergies.includes(a.name)) ? ' ⚠' : '';
    return `${option.name}${option.priceCents > 0 ? ` +${formatCents(option.priceCents)}` : ''}${warn}`;
  };
  const sizeOf = (optionId: string) => group.options.find((o) => o.id === optionId)?.sizes ?? [];

  if (group.maxSelections === 1) {
    const current = choices[0];
    return (
      <div className="flex items-center gap-1">
        <select
          className={cn(selectClassName, 'h-8 w-auto max-w-56 bg-card')}
          aria-label={group.name}
          value={current?.optionId ?? ''}
          onChange={(e) => {
            const option = group.options.find((o) => o.id === e.target.value);
            onChange(
              option
                ? [
                    {
                      groupId: group.id,
                      optionId: option.id,
                      portionSizeId: group.usesPortions
                        ? (option.sizes[0]?.portionSizeId ?? null)
                        : null,
                    },
                  ]
                : [],
            );
          }}
        >
          {!group.isRequired || !current ? (
            <option value="">
              {group.isRequired ? `${group.name}…` : `No ${group.name.toLowerCase()}`}
            </option>
          ) : null}
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>
              {label(option)}
            </option>
          ))}
        </select>
        {group.usesPortions && current ? (
          <select
            className={cn(selectClassName, 'h-8 w-auto bg-card')}
            aria-label={`${group.name} size`}
            value={current.portionSizeId ?? ''}
            onChange={(e) => onChange([{ ...current, portionSizeId: e.target.value || null }])}
          >
            {sizeOf(current.optionId).map((size) => (
              <option key={size.portionSizeId} value={size.portionSizeId}>
                {size.name}
                {size.extraChargeCents > 0 ? ` +${formatCents(size.extraChargeCents)}` : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={group.name}>
      <span className="text-xs text-muted-foreground">
        {group.name} (up to {group.maxSelections}):
      </span>
      {group.options.map((option) => {
        const on = choices.some((c) => c.optionId === option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on
                  ? choices.filter((c) => c.optionId !== option.id)
                  : [
                      ...choices,
                      {
                        groupId: group.id,
                        optionId: option.id,
                        portionSizeId: group.usesPortions
                          ? (option.sizes[0]?.portionSizeId ?? null)
                          : null,
                      },
                    ],
              )
            }
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              on
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            {label(option)}
          </button>
        );
      })}
    </div>
  );
}
