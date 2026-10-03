'use client';

import type { Dashboard, Permission } from '@fernleaf/shared';
import { PageHeader } from '@/components/page-header';
import { formatIsoDate } from '@/lib/format';
import { useKitchenToday } from '@/lib/kitchen-clock';
import { useCurrentUser } from '@/lib/session';
import { DriverView } from '../driver/driver-view';
import { AdminDashboard } from './admin-dashboard';
import { DispatchDashboard } from './dispatch-dashboard';
import { KitchenDashboard } from './kitchen-dashboard';

const DASHBOARDS: Record<
  Dashboard,
  { title: string; needs: Permission; Component: () => React.ReactNode }
> = {
  ADMIN: { title: 'Admin dashboard', needs: 'ORDERS_READ', Component: AdminDashboard },
  KITCHEN: { title: 'Kitchen dashboard', needs: 'KITCHEN_READ', Component: KitchenDashboard },
  DISPATCH: { title: 'Dispatch dashboard', needs: 'DISPATCH_READ', Component: DispatchDashboard },
  DRIVER: { title: 'Today’s deliveries', needs: 'DELIVERIES_OWN', Component: DriverView },
};

/** Each role lands on its own dashboard (spec 4.11), chosen by the role's data, not its name. */
export function DashboardHome() {
  const user = useCurrentUser();
  const today = useKitchenToday();
  const dashboard = DASHBOARDS[user.role.homeDashboard];
  const firstName = user.name.split(' ')[0] ?? user.name;

  if (user.role.homeDashboard === 'DRIVER') return <DriverView />;

  return (
    <div>
      <PageHeader
        title={`Hello, ${firstName}`}
        description={`${dashboard.title}${today ? ` · ${formatIsoDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}` : ''} · kitchen time`}
      />
      {user.permissions.includes(dashboard.needs) ? (
        <dashboard.Component />
      ) : (
        <p className="text-sm text-muted-foreground">
          Your role ({user.role.name}) doesn’t include what this dashboard shows.
        </p>
      )}
    </div>
  );
}
