'use client';

import { PERMISSION_DESCRIPTIONS, type Dashboard } from '@fernleaf/shared';
import { CheckCircle2 } from 'lucide-react';
import { ComingSoon } from '@/components/coming-soon';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/lib/session';

const DASHBOARD_TITLES: Record<Dashboard, string> = {
  ADMIN: 'Admin dashboard',
  KITCHEN: 'Kitchen dashboard',
  DISPATCH: 'Dispatch dashboard',
  DRIVER: "Today's deliveries",
};

const DASHBOARD_PLANS: Record<Dashboard, string[]> = {
  ADMIN: [
    "Today: meals to deliver, delivered so far, on-time rate, what's late right now",
    'Next cut-off: drafts that will be cancelled and orders that will be confirmed',
    'Next 7 days of demand, uninvoiced amounts per company, data that needs fixing',
  ],
  KITCHEN: [
    'Prep units per station: not started, in progress, done',
    'Late and at-risk work, and the first deadline of the day',
    'What to batch-cook, and allergen warnings',
  ],
  DISPATCH: [
    "Today's drops by stage, and drops without a driver",
    'Late departures and late deliveries',
    'Load per driver and the on-time rate so far',
  ],
  DRIVER: ['Your drops for today, in time order'],
};

/** The person's landing page. The real figures arrive with the dashboards step. */
export function DashboardHome() {
  const user = useCurrentUser();
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={`${DASHBOARD_TITLES[user.role.homeDashboard]} · ${user.role.name}`}
      />

      <ComingSoon plannedFeatures={DASHBOARD_PLANS[user.role.homeDashboard]} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            What your role can do <Badge variant="secondary">{user.role.name}</Badge>
          </CardTitle>
          <CardDescription>
            Access is checked by the server on every request; this list is what it allows you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {user.permissions.map((permission) => (
              <li key={permission} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                {PERMISSION_DESCRIPTIONS[permission]}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
