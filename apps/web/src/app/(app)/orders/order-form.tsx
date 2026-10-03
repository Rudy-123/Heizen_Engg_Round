'use client';

import {
  formatCents,
  formatOrderNumber,
  minutesToTime,
  type FieldError,
  type MenuDishDto,
  type OrderDetailDto,
  type OrderFormContextDto,
  type OrderQuoteDto,
} from '@fernleaf/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Lock, Plus, Search, Send, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FieldError as FieldMessage } from '@/components/field-error';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { DishPhoto } from '@/components/dish-photo';
import { api, ApiError } from '@/lib/api';
import { selectClassName } from '@/lib/catalogue-queries';
import { useCompanies, useEmployees } from '@/lib/company-queries';
import { formatInstant, formatIsoDate } from '@/lib/format';
import { useKitchenTimeZone } from '@/lib/kitchen-clock';
import { ordersQueryKey, useOrderFormContext } from '@/lib/order-queries';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/utils';
import { defaultCombination, LineEditor, newKey, type LineState } from './line-editor';

/** New order (order = null) or editing an existing draft/placed order. */
export function OrderForm({ order }: { order: OrderDetailDto | null }) {
  const [companyId, setCompanyId] = useState(order?.company.id ?? '');
  const [employeeId, setEmployeeId] = useState(order?.employee.id ?? '');
  const companies = useCompanies('', 'active');
  const employees = useEmployees({ companyId, status: 'active', pageSize: 100 }, companyId !== '');
  const context = useOrderFormContext(employeeId || null);

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href={order ? `/orders/${order.id}` : '/orders'}>
          <ArrowLeft /> {order ? `Back to ${formatOrderNumber(order.number)}` : 'All orders'}
        </Link>
      </Button>
      <PageHeader
        title={order ? `Edit ${formatOrderNumber(order.number)}` : 'New order'}
        description="Ordering on behalf of an employee: they see their own company’s menu and prices."
      />

      {order ? null : (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-[1_1_14rem] space-y-2">
              <Label htmlFor="order-company">Company</Label>
              <select
                id="order-company"
                className={selectClassName}
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setEmployeeId('');
                }}
              >
                <option value="">Choose a company…</option>
                {(companies.data ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-[1_1_14rem] space-y-2">
              <Label htmlFor="order-employee">Employee</Label>
              <select
                id="order-employee"
                className={selectClassName}
                value={employeeId}
                disabled={!companyId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Choose an employee…</option>
                {(employees.data?.items ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {!employeeId ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Choose who the order is for. Their menu, prices and delivery options follow.
        </p>
      ) : context.isPending ? (
        <Skeleton className="h-96" />
      ) : context.isError ? (
        <p className="text-sm text-destructive">{context.error.message}</p>
      ) : (
        <OrderBuilder key={employeeId} context={context.data} order={order} />
      )}
    </div>
  );
}

function linesFromOrder(order: OrderDetailDto): LineState[] {
  return order.lines.map((line) => ({
    key: newKey(),
    dishId: line.dishId,
    quantity: line.quantity,
    combinations: line.combinations.map((combination) => ({
      key: newKey(),
      quantity: combination.quantity,
      choices: combination.options.map((option) => ({
        groupId: option.optionGroupId ?? '',
        optionId: option.optionId,
        portionSizeId: option.portionSizeId,
      })),
    })),
  }));
}

function OrderBuilder({
  context,
  order,
}: {
  context: OrderFormContextDto;
  order: OrderDetailDto | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const zone = useKitchenTimeZone() ?? 'Asia/Kolkata';
  const canOverride = useCan('ORDERS_OVERRIDE');
  const { employee, defaults } = context;

  const [deliveryDate, setDeliveryDate] = useState<string | null>(order?.deliveryDate ?? null);
  const [time, setTime] = useState(order?.deliveryTimeMinutes ?? defaults.deliveryTimeMinutes);
  const [addressId, setAddressId] = useState(order?.addressId ?? defaults.addressId ?? '');
  const [packagingTypeId, setPackagingTypeId] = useState(
    order?.packagingTypeId ?? defaults.packagingTypeId ?? '',
  );
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<LineState[]>(order ? linesFromOrder(order) : []);
  const [latestQuote, setQuote] = useState<OrderQuoteDto | null>(null);
  const [problems, setProblems] = useState<FieldError[]>([]);
  const [saving, setSaving] = useState<'draft' | 'place' | 'save' | null>(null);
  const [search, setSearch] = useState('');

  const dishes = useMemo(() => {
    const map = new Map<string, MenuDishDto>();
    for (const section of [...context.menu.sections, ...context.menu.secretSections]) {
      for (const dish of section.dishes) if (!map.has(dish.dishId)) map.set(dish.dishId, dish);
    }
    return map;
  }, [context.menu]);
  const allergyNames = employee.allergies.map((a) => a.name);

  const payload = useMemo(
    () => ({
      deliveryDate,
      deliveryTimeMinutes: time,
      addressId: addressId || null,
      packagingTypeId: packagingTypeId || null,
      notes,
      lines: lines.map((line) => ({
        dishId: line.dishId,
        quantity: line.quantity,
        combinations: line.combinations.map((c) => ({ quantity: c.quantity, choices: c.choices })),
      })),
    }),
    [deliveryDate, time, addressId, packagingTypeId, notes, lines],
  );

  // Live price breakdown from the server (the same rules that will check the order).
  const requestId = useRef(0);
  useEffect(() => {
    // Nothing to price yet (the quote below is hidden until there is).
    if (!deliveryDate || lines.length === 0) return;
    const id = (requestId.current += 1);
    const timer = setTimeout(() => {
      api
        .post<OrderQuoteDto>('/orders/quote', {
          ...payload,
          employeeId: employee.id,
          ...(order?.status === 'PLACED' ? { orderId: order.id } : {}),
        })
        .then((result) => {
          if (id !== requestId.current) return;
          setQuote(result);
          setProblems([]);
        })
        .catch((error: unknown) => {
          if (id !== requestId.current) return;
          setQuote(null);
          setProblems(
            error instanceof ApiError
              ? error.fieldErrors.length > 0
                ? error.fieldErrors
                : [{ path: '', message: error.message }]
              : [],
          );
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [payload, deliveryDate, lines.length, employee.id, order]);
  const quote = deliveryDate && lines.length > 0 ? latestQuote : null;

  async function submit(intent: 'draft' | 'place' | 'save') {
    if (!deliveryDate) {
      setProblems([{ path: 'deliveryDate', message: 'Pick a delivery date.' }]);
      return;
    }
    setSaving(intent);
    try {
      const saved = order
        ? await api.put<OrderDetailDto>(`/orders/${order.id}`, {
            ...payload,
            version: order.version,
          })
        : await api.post<OrderDetailDto>('/orders', {
            ...payload,
            employeeId: employee.id,
            place: intent === 'place',
          });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKey });
      toast.success(
        order
          ? `Saved ${formatOrderNumber(saved.number)}`
          : intent === 'place'
            ? `Placed ${formatOrderNumber(saved.number)} - prices are locked`
            : `Saved ${formatOrderNumber(saved.number)} as a draft`,
      );
      router.push(`/orders/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setProblems(
          error.fieldErrors.length > 0 ? error.fieldErrors : [{ path: '', message: error.message }],
        );
        toast.error(error.message);
      }
    } finally {
      setSaving(null);
    }
  }

  const fieldProblem = (path: string) => problems.find((p) => p.path === path)?.message;
  const otherProblems = problems.filter(
    (p) =>
      p.path === '' ||
      !(
        p.path.startsWith('lines') ||
        ['deliveryDate', 'deliveryTimeMinutes', 'addressId', 'packagingTypeId'].includes(p.path)
      ),
  );
  const selectedDate = context.deliveryDates.find((d) => d.date === deliveryDate);
  const dateOptions =
    deliveryDate && !selectedDate
      ? [
          { date: deliveryDate, problems: [], cutoffAt: null, isLocked: false },
          ...context.deliveryDates,
        ]
      : context.deliveryDates;
  const term = search.trim().toLowerCase();
  const onOrder = new Set(lines.map((l) => l.dishId));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="font-semibold">{employee.name}</p>
              <p className="text-muted-foreground">
                {employee.company.name} · {employee.email}
              </p>
            </div>
            <Badge variant="secondary">Priced on {context.menu.tier.name}</Badge>
            {employee.allergies.map((allergen) => (
              <Badge key={allergen.id} variant="destructive">
                <TriangleAlert /> Allergic to {allergen.name}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>When</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Delivery date">
              {dateOptions.map((day) => {
                const blocked = day.problems.length > 0 || (day.isLocked && !canOverride);
                const selected = day.date === deliveryDate;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={blocked && !selected}
                    title={
                      day.problems.join(' ') || (day.isLocked ? 'Past the cut-off' : undefined)
                    }
                    onClick={() => setDeliveryDate(day.date)}
                    aria-pressed={selected}
                    className={cn(
                      'min-w-24 rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : day.isLocked
                          ? 'border-warning/60 bg-warning/10 hover:bg-warning/20'
                          : 'bg-card hover:bg-accent',
                    )}
                  >
                    <span className="block font-semibold">{formatIsoDate(day.date)}</span>
                    <span className="flex items-center gap-1 text-xs opacity-80">
                      {day.problems.length > 0 ? (
                        'Closed'
                      ) : day.isLocked ? (
                        <>
                          <Lock className="size-3" /> Locked
                        </>
                      ) : day.cutoffAt ? (
                        `locks ${formatInstant(day.cutoffAt, zone, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedDate?.isLocked ? (
              <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                Past the cut-off. As an admin you can still place it; it is confirmed at the next
                cut-off run (within 5 minutes). It can’t be saved as a draft.
              </p>
            ) : null}
            <FieldMessage message={fieldProblem('deliveryDate')} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="order-time" className="flex items-center gap-1">
                  Time {!employee.canChangeDeliveryTime ? <Lock className="size-3" /> : null}
                </Label>
                <select
                  id="order-time"
                  className={selectClassName}
                  value={time}
                  disabled={!employee.canChangeDeliveryTime}
                  onChange={(e) => setTime(Number(e.target.value))}
                >
                  {context.deliveryTimes.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutesToTime(minutes)}
                    </option>
                  ))}
                </select>
                <FieldMessage message={fieldProblem('deliveryTimeMinutes')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-address" className="flex items-center gap-1">
                  Address {!employee.canChooseAddress ? <Lock className="size-3" /> : null}
                </Label>
                <select
                  id="order-address"
                  className={selectClassName}
                  value={addressId}
                  disabled={!employee.canChooseAddress}
                  onChange={(e) => setAddressId(e.target.value)}
                >
                  {context.addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label}
                    </option>
                  ))}
                </select>
                <FieldMessage message={fieldProblem('addressId')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-packaging" className="flex items-center gap-1">
                  Packaging {!employee.canChangePackaging ? <Lock className="size-3" /> : null}
                </Label>
                <select
                  id="order-packaging"
                  className={selectClassName}
                  value={packagingTypeId}
                  disabled={!employee.canChangePackaging}
                  onChange={(e) => setPackagingTypeId(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {context.packagingTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <FieldMessage message={fieldProblem('packagingTypeId')} />
              </div>
            </div>
            {!employee.canChangeDeliveryTime ||
            !employee.canChooseAddress ||
            !employee.canChangePackaging ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3" /> Locked fields follow {employee.company.name}’s defaults:
                the employee isn’t allowed to change them.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Add dishes from {employee.name.split(' ')[0]}’s menu below.
            </p>
          ) : null}
          {lines.map((line, index) => (
            <LineEditor
              key={line.key}
              line={line}
              dish={dishes.get(line.dishId)}
              index={index}
              quote={quote?.lines.find((q) => q.dishId === line.dishId)}
              problems={problems}
              allergies={allergyNames}
              onChange={(changed) => setLines(lines.map((l) => (l.key === line.key ? changed : l)))}
              onRemove={() => setLines(lines.filter((l) => l.key !== line.key))}
            />
          ))}
        </div>

        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
            <CardTitle>{employee.name.split(' ')[0]}’s menu</CardTitle>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Find a dish"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="divide-y px-0">
            {[
              ...context.menu.sections.map((s) => ({ ...s, secret: false })),
              ...context.menu.secretSections.map((s) => ({ ...s, secret: true })),
            ].map((section) => {
              const visible = section.dishes.filter(
                (dish) => !term || dish.name.toLowerCase().includes(term),
              );
              if (visible.length === 0) return null;
              return (
                <div key={section.categoryId} className="px-5 py-3">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {section.name}
                    {section.secret ? <Lock className="size-3" /> : null}
                  </p>
                  <ul className="space-y-1">
                    {visible.map((dish) => (
                      <li
                        key={`${section.categoryId}-${dish.dishId}`}
                        className="flex items-center gap-3 text-sm"
                      >
                        <DishPhoto
                          url={dish.imageUrl}
                          name={dish.name}
                          subtitle={formatCents(dish.priceCents)}
                          details={dish.description ? <p>{dish.description}</p> : null}
                          className="size-11"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{dish.name}</span>
                          {dish.allergyWarnings.length > 0 ? (
                            <span className="ml-2 text-xs text-destructive">
                              contains {dish.allergyWarnings.join(', ')}
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCents(dish.priceCents)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Add ${dish.name}`}
                          disabled={onOrder.has(dish.dishId)}
                          onClick={() => {
                            const quantity = Math.max(1, dish.minOrderQuantity ?? 1);
                            setLines([
                              ...lines,
                              {
                                key: newKey(),
                                dishId: dish.dishId,
                                quantity,
                                combinations: [defaultCombination(dish, quantity)],
                              },
                            ]);
                          }}
                        >
                          {onOrder.has(dish.dishId) ? (
                            'Added'
                          ) : (
                            <>
                              <Plus /> Add
                            </>
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Order total</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {quote ? (
            <ul className="space-y-2 text-sm">
              {quote.lines.map((line) => (
                <li key={line.dishId} className="flex justify-between gap-3">
                  <span>
                    {line.quantity} × {line.dishName}
                  </span>
                  <span className="tabular-nums">{formatCents(line.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {deliveryDate && lines.length > 0
                ? problems.length > 0
                  ? 'Fix the highlighted problems to see the price.'
                  : 'Working out the price…'
                : 'Pick a date and add dishes to see the price.'}
            </p>
          )}
          <div className="flex items-baseline justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total (pre-tax, no fees)</span>
            <span className="font-display text-2xl font-semibold tabular-nums">
              {quote ? formatCents(quote.totalCents) : '-'}
            </span>
          </div>
          {otherProblems.map((problem) => (
            <p key={problem.path + problem.message} className="text-sm text-destructive">
              {problem.message}
            </p>
          ))}
          <div className="space-y-2">
            <Label htmlFor="order-notes">Notes for the kitchen (optional)</Label>
            <Textarea
              id="order-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {order ? (
            <Button
              className="w-full"
              disabled={saving !== null}
              onClick={() => void submit('save')}
            >
              {saving ? <Loader2 className="animate-spin" /> : null} Save changes
            </Button>
          ) : (
            <div className="grid gap-2">
              <Button disabled={saving !== null} onClick={() => void submit('place')}>
                {saving === 'place' ? <Loader2 className="animate-spin" /> : <Send />} Place order
              </Button>
              <Button
                variant="outline"
                disabled={saving !== null}
                onClick={() => void submit('draft')}
              >
                {saving === 'draft' ? <Loader2 className="animate-spin" /> : null} Save as draft
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {order?.status === 'PLACED'
              ? 'This order is placed: combinations it already had keep their prices; new ones use today’s.'
              : 'Drafts are priced live. Prices lock when the order is placed.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
