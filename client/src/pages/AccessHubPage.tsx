import { Paper, Tab, Tabs } from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { UsersPage } from './UsersPage';
import { RolesPage } from './RolesPage';
import { SettingsPage } from './SettingsPage';

type AccessTab = 'users' | 'roles' | 'settings';

export const AccessHubPage = () => {
  const [tab, setTab] = useState<AccessTab>('users');

  return (
    <>
      <PageHeader
        title="Access"
        subtitle="Manage users, roles, and integrations in one section"
        icon={<AdminPanelSettingsIcon />}
      />
      <Paper sx={{ mt: 2, p: 1 }}>
        <Tabs
          value={tab}
          onChange={(_e, value: AccessTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="users" label="Users" />
          <Tab value="roles" label="Roles" />
          <Tab value="settings" label="Settings" />
        </Tabs>
      </Paper>

      {tab === 'users' && <UsersPage />}
      {tab === 'roles' && <RolesPage />}
      {tab === 'settings' && <SettingsPage />}
    </>
  );
};
