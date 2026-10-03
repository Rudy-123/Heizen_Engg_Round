import { ChefHat, ClipboardList, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Brand } from '@/components/brand';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const HIGHLIGHTS = [
  { icon: ClipboardList, text: 'Orders for every company, checked against cut-offs and pricing' },
  { icon: ChefHat, text: 'A live kitchen board, station by station' },
  { icon: Truck, text: 'Dispatch and delivery, drop by drop' },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Brand subtitle="Kitchen operations" />
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Corporate meals, from order to office.
          </h1>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-sm opacity-85">
                <item.icon className="mt-0.5 size-5 shrink-0" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-50">For Fernleaf Kitchen staff only.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <Brand className="mb-10 lg:hidden" subtitle="Kitchen operations" />
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
