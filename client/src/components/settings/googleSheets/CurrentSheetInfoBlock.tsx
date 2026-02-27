import {
  Button,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { GoogleSheetsSettings } from "./GoogleSheetsIntegrationCard";
import type { GoogleSheetMode } from "../../../api";
import { MappingSummaryPanel } from "./MappingSummaryPanel";
import { SheetDetailsAccordion } from "./SheetDetailsAccordion";

type Props = {
  variant: "oauth" | "shared";
  settings: GoogleSheetsSettings;
  canEdit: boolean;
  isBusy: boolean;
  activeMode: GoogleSheetMode;
  onSetActiveMode: (mode: GoogleSheetMode) => Promise<void> | void;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  onVerify: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onOpenWizard: () => void;
};

export const CurrentSheetInfoBlock = ({
  variant,
  settings,
  canEdit,
  isBusy,
  activeMode,
  onSetActiveMode,
  onPrimaryAction,
  onSecondaryAction,
  onVerify,
  onSave,
  onOpenWizard,
}: Props) => {
  const shared = settings.sharedConfig;
  const isActive = activeMode === (variant === "oauth" ? "oauth" : "service_account");

  const lastImportAt = shared?.lastImportAt ? new Date(shared.lastImportAt) : null;
  const lastVerifiedAt = shared?.lastVerifiedAt ? new Date(shared.lastVerifiedAt) : null;

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        spacing={1.5}
      >
        <Stack spacing={0.5}>
          <Typography variant="subtitle1">
            Current sheet info ({variant === "oauth" ? "OAuth" : "Shared path"})
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Source name:{" "}
            {settings.sources.find((s) => s.active)?.name ?? "POS Sheet"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Spreadsheet ID:{" "}
            {shared?.spreadsheetId ? shared.spreadsheetId.slice(0, 10) + "…" : "Not set"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Tab: {shared?.sheetName || "Sheet1"} · Header row: {shared?.headerRow || 1}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Share status: {shared?.shareStatus ?? "unknown"}
          </Typography>
          <Stack direction="row" spacing={1}>
            {lastVerifiedAt && (
              <Chip
                size="small"
                label={`Last verified: ${lastVerifiedAt.toLocaleString()}`}
              />
            )}
            {lastImportAt && (
              <Chip
                size="small"
                label={`Last import: ${lastImportAt.toLocaleString()}`}
              />
            )}
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          {!isActive && (
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                onSetActiveMode(variant === "oauth" ? "oauth" : "service_account")
              }
              disabled={!canEdit || isBusy}
            >
              Use this mode
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            onClick={onPrimaryAction}
            disabled={!canEdit || isBusy}
          >
            {variant === "oauth" ? "Connect / Reconnect" : "Save config"}
          </Button>
          {onSecondaryAction && (
            <Button
              size="small"
              color="error"
              onClick={onSecondaryAction}
              disabled={!canEdit || isBusy}
            >
              Disconnect
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            onClick={onVerify}
            disabled={!canEdit || isBusy}
          >
            Verify access
          </Button>
        </Stack>
      </Stack>

      <MappingSummaryPanel
        settings={settings}
        canEdit={canEdit}
        isBusy={isBusy}
        onSave={onSave}
        onOpenWizard={onOpenWizard}
      />

      <SheetDetailsAccordion variant={variant} settings={settings} />
    </Stack>
  );
};

