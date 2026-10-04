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

  return (
    <div>
      <h2 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sign in with your Fernleaf staff account.
      </p>

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

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </div>
  );
}
