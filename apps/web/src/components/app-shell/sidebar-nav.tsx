'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brand } from '@/components/brand';
import { visibleNavGroups } from '@/lib/navigation';
import { useCurrentUser } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Navigation for the signed-in person: only the sections their role's permissions allow. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const groups = visibleNavGroups(user);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Brand subtitle="Kitchen operations" />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'size-[18px] shrink-0 transition-colors',
                          active
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 flex items-center gap-3 rounded-xl border border-sidebar-border bg-background px-3 py-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck className="size-4" />
        </span>
        <div className="text-xs leading-tight">
          <p className="text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 font-semibold">{user.role.name}</p>
        </div>
      </div>
    </div>
  );
}
