import { AlarmClock, ChefHat, CircleCheck, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { MealBowl } from '@/components/meal-bowl';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const WARM_GRADIENT =
  'bg-[linear-gradient(160deg,oklch(0.978_0.012_85),oklch(0.95_0.02_78)_55%,oklch(0.925_0.03_68))]';

export default function LoginPage() {
  return (
    <main className={`relative min-h-screen overflow-hidden ${WARM_GRADIENT}`}>
      {/* Soft glows: teal mist top left, terracotta bottom right. */}
      <div className="absolute -top-28 -left-28 size-96 rounded-full bg-[oklch(0.87_0.06_190)] opacity-35 blur-3xl" />
      <div className="absolute -right-24 -bottom-32 size-[30rem] rounded-full bg-[oklch(0.78_0.1_45)] opacity-25 blur-3xl" />

      {/* Wide screens: the bowl, whole, in the corner beside the centred form. */}
      <div className="pointer-events-none absolute right-10 bottom-8 hidden aspect-square w-[min(20rem,22vw,calc(100vh-24rem))] lg:block">
        <MealBowl idPrefix="bowl" className="size-full drop-shadow-xl" />
        <FloatingCard className="right-0 bottom-[calc(100%+0.75rem)] rotate-[1.5deg] max-xl:hidden">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
            <ChefHat className="size-4.5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Paneer tikka rice bowl</span>
            <span className="block text-xs text-muted-foreground">42 boxes · Tandoor station</span>
          </span>
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">
            <CircleCheck className="size-3" /> Ready
          </span>
        </FloatingCard>
      </div>

      {/* A glimpse of the product in the empty space on the left (wide, tall screens only). */}
      <div className="pointer-events-none absolute inset-y-0 left-10 hidden xl:block [@media(max-height:720px)]:hidden">
        <FloatingCard className="top-[30%] left-0 rotate-[-2deg]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
            <AlarmClock className="size-4.5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Wednesday’s orders lock</span>
            <span className="block text-xs text-muted-foreground">Monday at 16:00</span>
          </span>
        </FloatingCard>
        <FloatingCard className="bottom-[22%] left-8 rotate-[1.5deg]">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
            <Truck className="size-4.5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Out for delivery</span>
            <span className="block text-xs text-muted-foreground">
              12 boxes · due 12:30 · on time
            </span>
          </span>
        </FloatingCard>
      </div>

      <div className="relative flex min-h-screen flex-col px-6 py-6 sm:px-10">
        <Brand subtitle="Kitchen operations" />

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center">
              <p className="text-xs font-bold tracking-[0.14em] text-terracotta-foreground uppercase">
                Corporate meal programs
              </p>
              <h1 className="mt-3 font-display text-4xl leading-tight font-semibold tracking-tight">
                Good food,{' '}
                <span className="underline decoration-terracotta decoration-4 underline-offset-8">
                  right on time.
                </span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-foreground/75 [@media(max-height:700px)]:hidden">
                Orders, kitchen stations, drivers and invoices for every company Fernleaf Kitchen
                feeds, all in one place.
              </p>
            </div>

            <div className="rounded-3xl border border-white/70 bg-card/85 p-7 shadow-lift backdrop-blur sm:p-8">
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-foreground/60">For Fernleaf Kitchen staff only.</p>
      </div>
    </main>
  );
}

function FloatingCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={`absolute flex w-max items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-lift backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}
