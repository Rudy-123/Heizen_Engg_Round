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
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className={`relative hidden overflow-hidden lg:block ${WARM_GRADIENT}`}>
        {/* Soft glows: teal mist top left, terracotta bottom right. */}
        <div className="absolute -top-28 -left-28 size-96 rounded-full bg-[oklch(0.87_0.06_190)] opacity-35 blur-3xl" />
        <div className="absolute -right-24 -bottom-32 size-[30rem] rounded-full bg-[oklch(0.78_0.1_45)] opacity-25 blur-3xl" />

        <div className="relative flex h-full flex-col p-12">
          <Brand subtitle="Kitchen operations" />
          <div className="mt-16 max-w-lg">
            <p className="text-xs font-bold tracking-[0.14em] text-terracotta-foreground uppercase">
              Corporate meal programs
            </p>
            <h1 className="mt-4 font-display text-5xl leading-[1.1] font-semibold tracking-tight">
              Good food,
              <br />
              <span className="underline decoration-terracotta decoration-4 underline-offset-[10px]">
                right on time.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-foreground/75">
              Orders, kitchen stations, drivers and invoices for every company Fernleaf Kitchen
              feeds, all in one place.
            </p>
          </div>
          <p className="mt-auto text-xs text-foreground/60">For Fernleaf Kitchen staff only.</p>
        </div>

        <MealBowl
          idPrefix="bowl-wide"
          className="pointer-events-none absolute -right-20 -bottom-16 w-[30rem] drop-shadow-xl"
        />

        {/* A glimpse of the product, floating over the bowl (hidden on short screens). */}
        <div className="pointer-events-none absolute inset-0 [@media(max-height:760px)]:hidden">
          <FloatingCard className="right-[19rem] bottom-[19rem] rotate-[-2deg]">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
              <ChefHat className="size-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Paneer tikka rice bowl</span>
              <span className="block text-xs text-muted-foreground">
                42 boxes · Tandoor station
              </span>
            </span>
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-semibold text-success">
              <CircleCheck className="size-3" /> Ready
            </span>
          </FloatingCard>
          <FloatingCard className="right-[22rem] bottom-[11rem] rotate-[1.5deg]">
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
          <FloatingCard className="right-8 bottom-[29rem] rotate-[2deg]">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
              <AlarmClock className="size-4.5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Wednesday’s orders lock</span>
              <span className="block text-xs text-muted-foreground">Monday at 16:00</span>
            </span>
          </FloatingCard>
        </div>
      </section>

      <section className="flex flex-col lg:bg-card/70">
        {/* Phones: a smaller version of the welcome panel. */}
        <div className={`relative h-44 shrink-0 overflow-hidden lg:hidden ${WARM_GRADIENT}`}>
          <Brand className="absolute top-6 left-6" subtitle="Kitchen operations" />
          <MealBowl
            idPrefix="bowl-phone"
            className="pointer-events-none absolute -right-14 -bottom-36 w-64 drop-shadow-lg"
          />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}

function FloatingCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={`absolute flex items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-lift backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}
