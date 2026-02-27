import {
  Box,
  Button,
  Collapse,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { GoogleSheetsSettings } from "./GoogleSheetsIntegrationCard";

type Props = {
  settings: GoogleSheetsSettings;
  canEdit: boolean;
  isBusy: boolean;
  onSave: () => Promise<void> | void;
  onOpenWizard: () => void;
};

export const MappingSummaryPanel = ({
  settings,
  canEdit,
  isBusy,
  onSave,
  onOpenWizard,
}: Props) => {
  const [showAll, setShowAll] = useState(false);
  const lastMapping = settings.sharedConfig?.lastMapping?.columnsMap ?? {};
  const entries = Object.entries(lastMapping);
  const mappedCount = entries.length;
  const rowsToShow = showAll ? entries : entries.slice(0, 5);

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle2">Field mapping</Typography>
        <Stack direction="row" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            {mappedCount} mapped field{mappedCount === 1 ? "" : "s"}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={onOpenWizard}
            disabled={!canEdit || isBusy}
          >
            Open mapping wizard
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={onSave}
            disabled={!canEdit || isBusy}
          >
            Advanced (JSON)
          </Button>
        </Stack>
      </Stack>

      <Collapse in={entries.length > 0}>
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Sheet column</TableCell>
                <TableCell>POS field</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rowsToShow.map(([source, target]) => (
                <TableRow key={source}>
                  <TableCell>
                    <Typography variant="body2">{source}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {target}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {entries.length > 5 && (
          <Box sx={{ mt: 0.5 }}>
            <Button
              size="small"
              variant="text"
              onClick={() => setShowAll((prev) => !prev)}
            >
              {showAll ? "View less" : `View all (${entries.length})`}
            </Button>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

