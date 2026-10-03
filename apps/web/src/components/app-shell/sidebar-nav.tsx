'use client';

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
            <p className="px-2 pb-2 text-[11px] font-semibold tracking-wider uppercase opacity-55">
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
                        'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                        active
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'opacity-80 hover:bg-sidebar-accent/60 hover:opacity-100',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4 text-xs">
        <p className="opacity-60">Signed in as</p>
        <p className="mt-0.5 font-medium">{user.role.name}</p>
      </div>
    </div>
  );
}
