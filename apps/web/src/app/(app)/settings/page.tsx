import type { Metadata } from 'next';
import { RequirePermission } from '@/components/require-permission';
import { SettingsView } from './settings-view';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <RequirePermission permission="SETTINGS_READ">
      <SettingsView />
    </RequirePermission>
  );
}
