import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid2 as Grid,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import type { BankStatementDetail, StatementCheck } from '@retailsync/shared';
import type { ReactNode } from 'react';
import {
  formatArtifactText,
  getStatementArtifactItems,
  getStatementViewerArtifacts,
  isImagePath,
  type StatementViewerTab
} from '../../utils/statementDetailHelpers';

type ArtifactGroup = {
  folder: string;
  items: ReturnType<typeof getStatementViewerArtifacts>;
};

type Props = {
  statement: BankStatementDetail;
  checks: StatementCheck[];
  artifactGroups: ArtifactGroup[];
  statementViewerTab: StatementViewerTab;
  onSelectViewerTab: (tab: StatementViewerTab) => void;
  artifactText: Record<string, string>;
  artifactBlobUrls: Record<string, string>;
  artifactLoading: Record<string, boolean>;
  artifactErrors: Record<string, string>;
  renderViewerBody: () => ReactNode;
  developerMode?: boolean;
};

export const StatementSourceProofTab = ({
  statement,
  checks,
  artifactGroups,
  statementViewerTab,
  onSelectViewerTab,
  artifactText,
  artifactBlobUrls,
  artifactLoading,
  artifactErrors,
  renderViewerBody,
  developerMode = import.meta.env.DEV
}: Props) => {
  const artifactItems = getStatementArtifactItems(statement);
  const pageThumbnails = statement.artifacts?.pageImagePaths ?? [];
  const structuredPath = statement.artifacts?.structuredStatementPath;
  const sectionsPath = statement.artifacts?.transactionSectionsPath;
  const ocrTextPath = statement.artifacts?.ocrTextPath;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Verify where each value came from: original PDF, page text, section summaries, and row-level extracts.
      </Typography>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2">Source files</Typography>
              {artifactGroups.map((group) => (
                <Accordion
                  key={group.folder}
                  disableGutters
                  defaultExpanded={group.items.some((item) => item.key === statementViewerTab)}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {group.folder}
                      </Typography>
                      <Chip size="small" variant="outlined" label={group.items.length} />
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={0.75}>
                      {group.items.map((artifact) => (
                        <Button
                          key={artifact.key}
                          size="small"
                          variant={statementViewerTab === artifact.key ? 'contained' : 'outlined'}
                          onClick={() => onSelectViewerTab(artifact.key)}
                          sx={{ justifyContent: 'flex-start' }}
                        >
                          {artifact.label}
                        </Button>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          </Paper>

          {pageThumbnails.length > 0 ? (
            <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Page thumbnails ({pageThumbnails.length})
              </Typography>
              <Stack spacing={0.5}>
                {pageThumbnails.slice(0, 12).map((path, index) => (
                  <Typography key={path} variant="caption" color="text.secondary">
                    Page {index + 1}: {path.split('/').pop()}
                  </Typography>
                ))}
                {pageThumbnails.length > 12 ? (
                  <Typography variant="caption" color="text.secondary">
                    +{pageThumbnails.length - 12} more pages
                  </Typography>
                ) : null}
              </Stack>
            </Paper>
          ) : null}

          {checks.length > 0 ? (
            <Paper variant="outlined" sx={{ p: 1.25, mt: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Check / deposit images
              </Typography>
              <Stack spacing={0.5}>
                {checks.slice(0, 8).map((check) => (
                  <Typography key={check.id} variant="caption" color="text.secondary">
                    Check {check.extracted?.checkNumber ?? check.id.slice(-4)}
                    {check.artifacts?.pageNumber ? ` · page ${check.artifacts.pageNumber}` : ''}
                    {check.artifacts?.cropImagePath ? ' · crop ready' : ''}
                  </Typography>
                ))}
              </Stack>
            </Paper>
          ) : null}
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper variant="outlined" sx={{ p: 1.25, minHeight: 320 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2">Preview</Typography>
              {renderViewerBody()}
            </Stack>
          </Paper>

          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {ocrTextPath && artifactText[ocrTextPath] ? (
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  OCR text (excerpt)
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    maxHeight: 160,
                    overflow: 'auto',
                    fontSize: '0.72rem',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {artifactText[ocrTextPath].slice(0, 4000)}
                  {artifactText[ocrTextPath].length > 4000 ? '\n…' : ''}
                </Box>
              </Paper>
            ) : null}

            {structuredPath && artifactText[structuredPath] ? (
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Extracted statement summary
                </Typography>
                <Box
                  component="pre"
                  sx={{ m: 0, maxHeight: 200, overflow: 'auto', fontSize: '0.72rem' }}
                >
                  {formatArtifactText(structuredPath, artifactText[structuredPath]).slice(0, 6000)}
                </Box>
              </Paper>
            ) : null}

            {sectionsPath && artifactText[sectionsPath] ? (
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Extracted section summaries
                </Typography>
                <Box
                  component="pre"
                  sx={{ m: 0, maxHeight: 200, overflow: 'auto', fontSize: '0.72rem' }}
                >
                  {formatArtifactText(sectionsPath, artifactText[sectionsPath]).slice(0, 6000)}
                </Box>
              </Paper>
            ) : null}

            {developerMode ? (
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Raw extracted JSON (debug)
                </Typography>
                <Stack spacing={0.5}>
                  {artifactItems.map(([label, path]) => (
                    <Box key={path}>
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                      {artifactLoading[path] ? (
                        <CircularProgress size={16} sx={{ my: 1 }} />
                      ) : artifactErrors[path] ? (
                        <Alert severity="warning" sx={{ mt: 0.5 }}>
                          {artifactErrors[path]}
                        </Alert>
                      ) : artifactText[path] ? (
                        <Box
                          component="pre"
                          sx={{ m: 0, maxHeight: 120, overflow: 'auto', fontSize: '0.65rem' }}
                        >
                          {formatArtifactText(path, artifactText[path]).slice(0, 2000)}
                        </Box>
                      ) : isImagePath(path) && artifactBlobUrls[path] ? (
                        <Typography variant="caption">Binary artifact loaded</Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Not loaded
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
};
