'use client';

import { loginSchema, type LoginInput } from '@fernleaf/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyServerErrors } from '@/lib/form-errors';
import { homeRouteFor, useLogin, useSessionQuery } from '@/lib/session';

/** The four accounts from the assignment, shown only on demo deployments. */
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@test.com', does: 'Everything' },
  { role: 'Kitchen', email: 'kitchen@test.com', does: 'Kitchen board' },
  { role: 'Dispatch', email: 'dispatch@test.com', does: 'Drops and drivers' },
  { role: 'Driver', email: 'driver@test.com', does: "Today's deliveries" },
];
const DEMO_PASSWORD = 'Test@1234';
// Written as process.env.NAME so Next.js can inline it into the browser bundle at build time.
const showDemoAccounts = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true';

/** Only follow `next` to a page on this site, never to another website. */
function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return null;
  }
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const session = useSessionQuery();
  const login = useLogin();

  const form = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  // Already signed in (e.g. /login opened in a new tab): go straight in.
  useEffect(() => {
    if (session.data) router.replace(next ?? homeRouteFor(session.data));
  }, [session.data, next, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await login.mutateAsync(values);
      router.replace(next ?? homeRouteFor(user));
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  function signInAs(email: string) {
    form.clearErrors();
    form.setValue('email', email);
    form.setValue('password', DEMO_PASSWORD);
    void onSubmit();
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use your Fernleaf staff account.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@fernleaf.example"
            aria-invalid={errors.email ? true : undefined}
            {...form.register('email')}
          />
          {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            {...form.register('password')}
          />
          {errors.password ? (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          ) : null}
        </div>

        {errors.root?.server ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errors.root.server.message}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>

      {showDemoAccounts ? (
        <div className="mt-10">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Demo accounts
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Password for all four:{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
              {DEMO_PASSWORD}
            </code>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={isSubmitting}
                onClick={() => signInAs(account.email)}
                className="rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-50"
              >
                <span className="block text-sm font-medium">{account.role}</span>
                <span className="block text-xs text-muted-foreground">{account.does}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
