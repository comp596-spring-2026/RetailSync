import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { GoogleSheetsSettings } from "./GoogleSheetsIntegrationCard";

type Props = {
  variant: "oauth" | "shared";
  settings: GoogleSheetsSettings;
};

export const SheetDetailsAccordion = ({ variant, settings }: Props) => {
  const shared = settings.sharedConfig;

  return (
    <Accordion sx={{ boxShadow: "none", border: "1px solid", borderColor: "divider" }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">More details</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          {variant === "oauth" ? (
            <>
              <Typography variant="body2">
                Connected: <strong>{settings.connected ? "Yes" : "No"}</strong>
              </Typography>
              {settings.connected && (
                <Typography variant="body2">
                  Connected email: <strong>{settings.connectedEmail ?? "Unknown"}</strong>
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                OAuth is used when you connect with your Google account and pick a
                spreadsheet from Drive. Make sure the selected sheet has the POS
                daily columns.
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body2">
                Service account email:{" "}
                <strong>{settings.serviceAccountEmail}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Share the spreadsheet with this email with at least Viewer access.
              </Typography>
            </>
          )}

          {shared?.shareStatus && (
            <Typography variant="body2" color="text.secondary">
              Share status from last check: {shared.shareStatus}
            </Typography>
          )}

          {shared?.spreadsheetId && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Original sheet URL:
              </Typography>
              <Typography
                component="a"
                variant="body2"
                href={`https://docs.google.com/spreadsheets/d/${shared.spreadsheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "primary.main", wordBreak: "break-all" }}
              >
                https://docs.google.com/spreadsheets/d/{shared.spreadsheetId}
              </Typography>
            </Box>
          )}

          {shared?.lastImportAt && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Last imported at: {new Date(shared.lastImportAt).toLocaleString()}
              </Typography>
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

