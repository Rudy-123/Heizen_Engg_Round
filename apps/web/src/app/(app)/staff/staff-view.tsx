'use client';

import {
  PERMISSION_DESCRIPTIONS,
  PERMISSIONS,
  type RoleDto,
  type StaffMemberDto,
} from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, KeyRound, Lock, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/session';
import { PasswordDialog, StaffDialog } from './staff-dialogs';

export const staffQueryKey = ['staff'] as const;

export function StaffView() {
  const me = useCurrentUser();
  const staff = useQuery({
    queryKey: staffQueryKey,
    queryFn: () => api.get<StaffMemberDto[]>('/staff'),
  });
  const roles = useQuery({
    queryKey: [...staffQueryKey, 'roles'],
    queryFn: () => api.get<RoleDto[]>('/staff/roles'),
  });
  const [editing, setEditing] = useState<StaffMemberDto | 'new' | null>(null);
  const [resetting, setResetting] = useState<StaffMemberDto | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & roles"
        description="Everyone who signs in to the panel. Each person has exactly one role; a role is a named set of permissions."
        actions={
          <Button onClick={() => setEditing('new')} disabled={!roles.data}>
            <Plus /> New staff member
          </Button>
        }
      />

      <Card className="gap-0 py-0">
        {staff.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : staff.isError ? (
          <p className="p-4 text-sm text-destructive">{staff.error.message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.data.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {person.name}
                      {person.id === me.id ? <Badge variant="outline">You</Badge> : null}
                      {person.isReviewerAccount ? (
                        <Badge variant="secondary" title="Email, role and password are locked">
                          <Lock /> Reviewer account
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{person.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{person.role.name}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{person.phone ?? '-'}</TableCell>
                  <TableCell>
                    {person.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Switched off</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(person)}
                        disabled={!roles.data}
                      >
                        <Pencil /> Edit
                      </Button>
                      {!person.isReviewerAccount ? (
                        <Button variant="ghost" size="sm" onClick={() => setResetting(person)}>
                          <KeyRound /> Password
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>What each role can do</CardTitle>
          <CardDescription>
            The server checks these permissions on every request - never role names - so a new role
            is just a new set of ticks, with no code changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {roles.isPending ? (
            <Skeleton className="m-4 h-64" />
          ) : roles.isError ? (
            <p className="p-4 text-sm text-destructive">{roles.error.message}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission</TableHead>
                  {roles.data.map((role) => (
                    <TableHead key={role.id} className="text-center">
                      {role.name}
                      <span className="block font-normal normal-case">
                        {role.activeStaffCount} active
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERMISSIONS.map((permission) => (
                  <TableRow key={permission}>
                    <TableCell className="text-sm">
                      {PERMISSION_DESCRIPTIONS[permission]}
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {permission}
                      </span>
                    </TableCell>
                    {roles.data.map((role) => (
                      <TableCell key={role.id} className="text-center">
                        {role.permissions.includes(permission) ? (
                          <Check
                            className="mx-auto size-4 text-success"
                            aria-label={`${role.name} can`}
                          />
                        ) : (
                          <span
                            className="text-muted-foreground/40"
                            aria-label={`${role.name} can't`}
                          >
                            ·
                          </span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && roles.data ? (
        <StaffDialog
          person={editing === 'new' ? null : editing}
          roles={roles.data}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {resetting ? <PasswordDialog person={resetting} onClose={() => setResetting(null)} /> : null}
    </div>
  );
}
