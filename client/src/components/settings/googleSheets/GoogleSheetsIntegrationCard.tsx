import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import ShareIcon from "@mui/icons-material/Share";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import LinkIcon from "@mui/icons-material/Link";
import { useState } from "react";
import type { GoogleSheetMode } from "../../../api";
import { CurrentSheetInfoBlock } from "./CurrentSheetInfoBlock";

export type GoogleSheetsSettings = {
  mode: GoogleSheetMode;
  serviceAccountEmail: string;
  connected: boolean;
  connectedEmail: string | null;
  sources: Array<{
    sourceId: string;
    name: string;
    spreadsheetId: string;
    sheetGid: string | null;
    range: string;
    mapping: Record<string, string>;
    active: boolean;
  }>;
  sharedConfig?: {
    spreadsheetId: string | null;
    sheetName: string;
    headerRow: number;
    enabled: boolean;
    shareStatus?: "unknown" | "not_shared" | "shared" | "no_permission" | "not_found";
    lastVerifiedAt?: string | null;
    lastImportAt?: string | null;
    lastMapping?: {
      columnsMap?: Record<string, string>;
      createdAt?: string | null;
      createdBy?: string | null;
    } | null;
  };
};

type Props = {
  settings: GoogleSheetsSettings;
  canEdit: boolean;
  isBusy: boolean;
  onConnectOAuth: () => void;
  onDisconnectOAuth: () => void;
  onOpenWizard: () => void;
  onReset: () => void;
  onVerifyShared: () => Promise<void> | void;
  onSaveShared: () => Promise<void> | void;
  onSetActiveMode: (mode: GoogleSheetMode) => Promise<void> | void;
};

export const GoogleSheetsIntegrationCard = ({
  settings,
  canEdit,
  isBusy,
  onConnectOAuth,
  onDisconnectOAuth,
  onOpenWizard,
  onReset,
  onVerifyShared,
  onSaveShared,
  onSetActiveMode,
}: Props) => {
  const [tab, setTab] = useState<"oauth" | "shared">(
    settings.mode === "oauth" ? "oauth" : "shared",
  );

  const activeMode = settings.mode;
  const oauthConnected = Boolean(settings.connectedEmail);
  const shared = settings.sharedConfig;
  const sharedConfigured = Boolean(shared?.spreadsheetId);

  const statusLabel =
    activeMode === "oauth"
      ? oauthConnected
        ? "OAuth connected"
        : "OAuth configured"
      : shared?.enabled
        ? "Shared sheet enabled"
        : sharedConfigured
          ? "Shared sheet configured"
          : "Not configured";

  const statusColor: "success" | "warning" | "default" =
    activeMode === "oauth"
      ? oauthConnected
        ? "success"
        : "warning"
      : shared?.enabled
        ? "success"
        : sharedConfigured
          ? "warning"
          : "default";

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                component="img"
                src="/google-sheets-icon.svg"
                alt="Google Sheets"
                sx={{ width: 24, height: 24 }}
              />
              <Typography variant="h6">Google Sheets</Typography>
              <Chip
                size="small"
                label={statusLabel}
                color={statusColor}
                variant="filled"
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SyncAltIcon />}
                disabled={!shared?.enabled || isBusy || !canEdit}
              >
                Sync now
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<LinkIcon />}
                color="error"
                disabled={isBusy || !canEdit}
                onClick={onReset}
              >
                Reset integration
              </Button>
            </Stack>
          </Stack>

          <Tabs
            value={tab}
            onChange={(_e, value: "oauth" | "shared") => setTab(value)}
            sx={{ borderBottom: 1, borderColor: "divider" }}
          >
            <Tab
              value="oauth"
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <GoogleIcon fontSize="small" />
                  <span>OAuth</span>
                </Stack>
              }
            />
            <Tab
              value="shared"
              label={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <ShareIcon fontSize="small" />
                  <span>Shared sheet path</span>
                </Stack>
              }
            />
          </Tabs>

          {tab === "oauth" && (
            <CurrentSheetInfoBlock
              variant="oauth"
              settings={settings}
              canEdit={canEdit}
              isBusy={isBusy}
              activeMode={activeMode}
              onSetActiveMode={onSetActiveMode}
              onPrimaryAction={onConnectOAuth}
              onSecondaryAction={onDisconnectOAuth}
              onVerify={onVerifyShared}
              onSave={onSaveShared}
              onOpenWizard={onOpenWizard}
            />
          )}

          {tab === "shared" && (
            <CurrentSheetInfoBlock
              variant="shared"
              settings={settings}
              canEdit={canEdit}
              isBusy={isBusy}
              activeMode={activeMode}
              onSetActiveMode={onSetActiveMode}
              onPrimaryAction={onSaveShared}
              onSecondaryAction={onVerifyShared}
              onVerify={onVerifyShared}
              onSave={onSaveShared}
              onOpenWizard={onOpenWizard}
            />
          )}

          <Divider />
        </Stack>
      </CardContent>
    </Card>
  );
};

