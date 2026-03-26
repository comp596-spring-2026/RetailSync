import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  Tab,
  TextField,
  Tabs,
  Typography
} from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { PageHeader } from '../../../components';
import { api } from '../../../app/api';

type CheckStatus = 'idle' | 'running' | 'ok' | 'error';

type CheckResult = {
  status: CheckStatus;
  detail: string;
};

const CLIENT_ENV_ITEMS = [
  { key: 'VITE_API_URL', value: import.meta.env.VITE_API_URL ?? 'TBD' }
];

const SERVER_ENV_ITEMS = [
  'PORT',
  'MONGO_URI',
  'CLIENT_URL',
  'ENCRYPTION_KEY'
];

const getHealthUrl = (apiBase: string) => {
  if (!apiBase) return '/health';
  const withoutApi = apiBase.replace(/\/api\/?$/, '');
  return `${withoutApi}/health`;
};

const getEnvReadinessUrl = (apiBase: string) => {
  if (!apiBase) return '/health/env-readiness';
  const withoutApi = apiBase.replace(/\/api\/?$/, '');
  return `${withoutApi}/health/env-readiness`;
};

const FRONTEND_REQUIRED_KEYS = ['VITE_API_URL'] as const;

type EnvReadinessResponse = {
  status: 'ok';
  data: {
    allRequiredPresent: boolean;
    required: Record<string, boolean>;
    optional: Record<string, boolean>;
  };
};

type CropBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SavedCropPreset = {
  id: string;
  label: string;
  imageName: string;
  naturalWidth: number;
  naturalHeight: number;
  box: CropBox;
  rowGapAbove: number;
  rowGapBelow: number;
  savedAt: string;
};

type LoadedImageOption = {
  id: string;
  name: string;
  url: string;
};

const CROP_PRESET_STORAGE_KEY = 'dev.playground.crop-presets.v1';
const FIXTURE_PAGE_IMAGE_ROOT =
  '/@fs/Users/trupal/Projects/RetailSync/server/tmp/statement-fixture-output/companies/fixture-company/statements/2025/12/fixture-statement/derived/pages';
const FIXTURE_PAGE_IMAGE_NAMES = [
  'page-001.png',
  'page-002.png',
  'page-003.png',
  'page-004.png',
  'page-005.png',
  'page-006.png',
  'page-007.png',
  'page-008.png'
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const MIN_BOX_SIZE = 24;

const defaultCropBox = (width: number, height: number): CropBox => ({
  left: Math.round(width * 0.1),
  top: Math.round(height * 0.1),
  width: Math.round(width * 0.38),
  height: Math.round(height * 0.24)
});

const readSavedPresets = (): SavedCropPreset[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CROP_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCropPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSavedPresets = (value: SavedCropPreset[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CROP_PRESET_STORAGE_KEY, JSON.stringify(value));
};

type CropDragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const handleSx = {
  position: 'absolute',
  width: 14,
  height: 14,
  borderRadius: '50%',
  border: '2px solid #fff',
  backgroundColor: '#1976d2',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.25)'
} as const;

const OVERLAY_GRID_COLUMNS = 3;
const OVERLAY_GRID_ROWS = 6;

const CropPresetLab = () => {
  const [imageName, setImageName] = useState('statement-page.png');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<LoadedImageOption[]>([]);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [presetLabel, setPresetLabel] = useState('check-anchor');
  const [rowGapAbove, setRowGapAbove] = useState(24);
  const [rowGapBelow, setRowGapBelow] = useState(24);
  const [savedPresets, setSavedPresets] = useState<SavedCropPreset[]>(() => readSavedPresets());
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: CropDragMode;
    originX: number;
    originY: number;
    start: CropBox;
  } | null>(null);

  useEffect(() => {
    writeSavedPresets(savedPresets);
  }, [savedPresets]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current) return;
      syncFromPointer(event.clientX, event.clientY);
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [naturalSize.height, naturalSize.width, cropBox]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setLoadedImages((current) => {
      if (current.length > 0) return current;
      const next = FIXTURE_PAGE_IMAGE_NAMES.map((name, index) => ({
        id: `fixture:${index + 1}`,
        name,
        url: `${FIXTURE_PAGE_IMAGE_ROOT}/${name}`
      }));
      if (!imageUrl && next[0]) {
        setSelectedImageId(next[0].id);
        setImageUrl(next[0].url);
        setImageName(next[0].name);
      }
      return next;
    });
  }, [imageUrl]);

  useEffect(() => {
    if (!copyMessage) return undefined;
    const timer = window.setTimeout(() => setCopyMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => () => {
    if (imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl);
    }
  }, [imageUrl]);

  const currentJson = useMemo(() => {
    if (!cropBox || !naturalSize.width || !naturalSize.height) return '';
    const right = cropBox.left + cropBox.width;
    const bottom = cropBox.top + cropBox.height;
    return JSON.stringify(
      {
        imageName,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        bbox: {
          left: cropBox.left,
          top: cropBox.top,
          right,
          bottom,
          width: cropBox.width,
          height: cropBox.height
        },
        normalized: {
          left: Number((cropBox.left / naturalSize.width).toFixed(6)),
          top: Number((cropBox.top / naturalSize.height).toFixed(6)),
          right: Number((right / naturalSize.width).toFixed(6)),
          bottom: Number((bottom / naturalSize.height).toFixed(6)),
          width: Number((cropBox.width / naturalSize.width).toFixed(6)),
          height: Number((cropBox.height / naturalSize.height).toFixed(6))
        },
        rowGap: {
          above: rowGapAbove,
          below: rowGapBelow
        }
      },
      null,
      2
    );
  }, [cropBox, imageName, naturalSize.height, naturalSize.width, rowGapAbove, rowGapBelow]);

  const syncFromPointer = (clientX: number, clientY: number) => {
    if (!stageRef.current || !cropBox) return;
    const drag = dragStateRef.current;
    if (!drag) return;
    const rect = stageRef.current.getBoundingClientRect();
    const scaleX = naturalSize.width / rect.width;
    const scaleY = naturalSize.height / rect.height;
    const deltaX = (clientX - drag.originX) * scaleX;
    const deltaY = (clientY - drag.originY) * scaleY;

    let next = { ...drag.start };
    if (drag.mode === 'move') {
      next.left = clamp(drag.start.left + deltaX, 0, naturalSize.width - drag.start.width);
      next.top = clamp(drag.start.top + deltaY, 0, naturalSize.height - drag.start.height);
    }
    if (drag.mode === 'nw') {
      const right = drag.start.left + drag.start.width;
      const bottom = drag.start.top + drag.start.height;
      next.left = clamp(drag.start.left + deltaX, 0, right - MIN_BOX_SIZE);
      next.top = clamp(drag.start.top + deltaY, 0, bottom - MIN_BOX_SIZE);
      next.width = right - next.left;
      next.height = bottom - next.top;
    }
    if (drag.mode === 'ne') {
      const bottom = drag.start.top + drag.start.height;
      next.top = clamp(drag.start.top + deltaY, 0, bottom - MIN_BOX_SIZE);
      next.width = clamp(drag.start.width + deltaX, MIN_BOX_SIZE, naturalSize.width - drag.start.left);
      next.height = bottom - next.top;
    }
    if (drag.mode === 'sw') {
      const right = drag.start.left + drag.start.width;
      next.left = clamp(drag.start.left + deltaX, 0, right - MIN_BOX_SIZE);
      next.width = right - next.left;
      next.height = clamp(drag.start.height + deltaY, MIN_BOX_SIZE, naturalSize.height - drag.start.top);
    }
    if (drag.mode === 'se') {
      next.width = clamp(drag.start.width + deltaX, MIN_BOX_SIZE, naturalSize.width - drag.start.left);
      next.height = clamp(drag.start.height + deltaY, MIN_BOX_SIZE, naturalSize.height - drag.start.top);
    }

    setCropBox({
      left: Math.round(next.left),
      top: Math.round(next.top),
      width: Math.round(next.width),
      height: Math.round(next.height)
    });
  };

  const beginDrag = (mode: CropDragMode, event: ReactPointerEvent) => {
    if (!cropBox) return;
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      mode,
      originX: event.clientX,
      originY: event.clientY,
      start: cropBox
    };
  };

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    const option = {
      id: `${file.name}:${Date.now()}`,
      name: file.name,
      url: nextUrl
    };
    setLoadedImages((current) => [option, ...current.filter((item) => item.name !== file.name)].slice(0, 20));
    setSelectedImageId(option.id);
    setImageUrl(nextUrl);
    setImageName(file.name);
    setCopyMessage(null);
  };

  const onImageSelectChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextId = event.target.value;
    setSelectedImageId(nextId);
    const selected = loadedImages.find((item) => item.id === nextId);
    if (!selected) return;
    setImageUrl(selected.url);
    setImageName(selected.name);
  };

  const onImageLoad = () => {
    if (!imageRef.current) return;
    const width = imageRef.current.naturalWidth;
    const height = imageRef.current.naturalHeight;
    setNaturalSize({ width, height });
    setCropBox((current) =>
      current
        ? {
            left: clamp(current.left, 0, Math.max(0, width - MIN_BOX_SIZE)),
            top: clamp(current.top, 0, Math.max(0, height - MIN_BOX_SIZE)),
            width: clamp(current.width, MIN_BOX_SIZE, width),
            height: clamp(current.height, MIN_BOX_SIZE, height)
          }
        : defaultCropBox(width, height)
    );
  };

  const copyJson = async () => {
    if (!currentJson) return;
    try {
      await navigator.clipboard.writeText(currentJson);
      setCopyMessage('Copied JSON');
    } catch {
      setCopyMessage('Copy failed');
    }
  };

  const savePreset = () => {
    if (!cropBox || !naturalSize.width || !naturalSize.height) return;
    const preset: SavedCropPreset = {
      id: `${presetLabel.trim() || 'crop'}:${Date.now()}`,
      label: presetLabel.trim() || 'crop',
      imageName,
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      box: cropBox,
      rowGapAbove,
      rowGapBelow,
      savedAt: new Date().toISOString()
    };
    setSavedPresets((current) => [preset, ...current].slice(0, 20));
    setCopyMessage('Preset saved');
  };

  const loadPreset = (preset: SavedCropPreset) => {
    setPresetLabel(preset.label);
    setCropBox(preset.box);
    setRowGapAbove(preset.rowGapAbove ?? 24);
    setRowGapBelow(preset.rowGapBelow ?? 24);
    setNaturalSize({
      width: preset.naturalWidth,
      height: preset.naturalHeight
    });
  };

  const deletePreset = (id: string) => {
    setSavedPresets((current) => current.filter((preset) => preset.id !== id));
  };

  const updateCropField = (field: keyof CropBox, rawValue: string) => {
    if (!cropBox) return;
    const numeric = Math.max(0, Number(rawValue) || 0);
    setCropBox((current) => {
      if (!current) return current;
      const next = { ...current, [field]: Math.round(numeric) };
      next.left = clamp(next.left, 0, Math.max(0, naturalSize.width - MIN_BOX_SIZE));
      next.top = clamp(next.top, 0, Math.max(0, naturalSize.height - MIN_BOX_SIZE));
      next.width = clamp(next.width, MIN_BOX_SIZE, Math.max(MIN_BOX_SIZE, naturalSize.width - next.left));
      next.height = clamp(next.height, MIN_BOX_SIZE, Math.max(MIN_BOX_SIZE, naturalSize.height - next.top));
      return next;
    });
  };

  const setPresetBox = (box: CropBox) => {
    setCropBox({
      left: clamp(box.left, 0, Math.max(0, naturalSize.width - MIN_BOX_SIZE)),
      top: clamp(box.top, 0, Math.max(0, naturalSize.height - MIN_BOX_SIZE)),
      width: clamp(box.width, MIN_BOX_SIZE, Math.max(MIN_BOX_SIZE, naturalSize.width - box.left)),
      height: clamp(box.height, MIN_BOX_SIZE, Math.max(MIN_BOX_SIZE, naturalSize.height - box.top))
    });
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Use the image dropdown and numeric fields to set exact preset values. Drag still works, but the numeric inputs are the reliable source of truth.
      </Alert>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Card sx={{ flex: 1.5 }}>
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button component="label" variant="contained">
                  Load Image
                  <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={onImageChange} />
                </Button>
                <TextField
                  select
                  label="Loaded Image"
                  value={selectedImageId}
                  onChange={onImageSelectChange}
                  size="small"
                  fullWidth
                >
                  {loadedImages.length === 0 && <MenuItem value="">No loaded images</MenuItem>}
                  {loadedImages.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Preset Label"
                  value={presetLabel}
                  onChange={(event) => setPresetLabel(event.target.value)}
                  size="small"
                  fullWidth
                />
                <Button variant="outlined" startIcon={<SaveOutlinedIcon />} onClick={savePreset} disabled={!cropBox}>
                  Save Box
                </Button>
              </Stack>

              <Box
                ref={stageRef}
                sx={{
                  position: 'relative',
                  borderRadius: 2,
                  overflow: 'hidden',
                  minHeight: 340,
                  border: '1px solid #dbe4ee',
                  background:
                    'linear-gradient(180deg, rgba(226,232,240,0.5) 0%, rgba(248,250,252,0.95) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {!imageUrl && (
                  <Stack spacing={1} sx={{ p: 3, alignItems: 'center', color: 'text.secondary' }}>
                    <Typography variant="subtitle1">No image loaded</Typography>
                    <Typography variant="body2">Use a rendered statement page image to tune the crop box.</Typography>
                  </Stack>
                )}

                {imageUrl && (
                  <>
                    <Box
                      component="img"
                      ref={imageRef}
                      src={imageUrl}
                      alt={imageName}
                      onLoad={onImageLoad}
                      sx={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none', pointerEvents: 'none' }}
                    />

                    {cropBox && naturalSize.width > 0 && naturalSize.height > 0 && (
                      <Box
                        onPointerDown={(event) => beginDrag('move', event)}
                        sx={{
                          position: 'absolute',
                          left: `${(cropBox.left / naturalSize.width) * 100}%`,
                          top: `${(cropBox.top / naturalSize.height) * 100}%`,
                          width: `${(cropBox.width / naturalSize.width) * 100}%`,
                          height: `${(cropBox.height / naturalSize.height) * 100}%`,
                          border: '2px solid #1976d2',
                          backgroundColor: 'rgba(25, 118, 210, 0.12)',
                          boxShadow: '0 0 0 9999px rgba(15,23,42,0.28)',
                          cursor: 'move',
                          touchAction: 'none',
                          userSelect: 'none'
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${(-rowGapAbove / naturalSize.height) * 100}%`,
                            height: 0,
                            borderTop: '2px dashed rgba(16, 185, 129, 0.95)'
                          }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${100 + (rowGapBelow / naturalSize.height) * 100}%`,
                            height: 0,
                            borderTop: '2px dashed rgba(245, 158, 11, 0.95)'
                          }}
                        />
                        {Array.from({ length: OVERLAY_GRID_COLUMNS - 1 }, (_, index) => (
                          <Box
                            key={`grid-v-${index + 1}`}
                            sx={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: `${((index + 1) / OVERLAY_GRID_COLUMNS) * 100}%`,
                              width: 1,
                              bgcolor: 'rgba(255,255,255,0.8)'
                            }}
                          />
                        ))}
                        {Array.from({ length: OVERLAY_GRID_ROWS - 1 }, (_, index) => (
                          <Box
                            key={`grid-h-${index + 1}`}
                            sx={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: `${((index + 1) / OVERLAY_GRID_ROWS) * 100}%`,
                              height: 1,
                              bgcolor: 'rgba(255,255,255,0.8)'
                            }}
                          />
                        ))}
                        <Box sx={{ ...handleSx, left: -7, top: -7, cursor: 'nwse-resize', touchAction: 'none' }} onPointerDown={(event) => beginDrag('nw', event)} />
                        <Box sx={{ ...handleSx, right: -7, top: -7, cursor: 'nesw-resize', touchAction: 'none' }} onPointerDown={(event) => beginDrag('ne', event)} />
                        <Box sx={{ ...handleSx, left: -7, bottom: -7, cursor: 'nesw-resize', touchAction: 'none' }} onPointerDown={(event) => beginDrag('sw', event)} />
                        <Box sx={{ ...handleSx, right: -7, bottom: -7, cursor: 'nwse-resize', touchAction: 'none' }} onPointerDown={(event) => beginDrag('se', event)} />
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6">Bounding Box</Typography>
              <Typography variant="body2" color="text.secondary">
                The saved JSON uses natural image pixels plus normalized coordinates so we can replay the same crop later. Portrait vs landscape does not matter once the values are set against the selected image.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Natural image size: {naturalSize.width || '-'} x {naturalSize.height || '-'}
              </Typography>
              <TextField label="Image" size="small" value={imageName} InputProps={{ readOnly: true }} fullWidth />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Left"
                  size="small"
                  type="number"
                  value={cropBox?.left ?? ''}
                  onChange={(event) => updateCropField('left', event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Top"
                  size="small"
                  type="number"
                  value={cropBox?.top ?? ''}
                  onChange={(event) => updateCropField('top', event.target.value)}
                  fullWidth
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Width"
                  size="small"
                  type="number"
                  value={cropBox?.width ?? ''}
                  onChange={(event) => updateCropField('width', event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Height"
                  size="small"
                  type="number"
                  value={cropBox?.height ?? ''}
                  onChange={(event) => updateCropField('height', event.target.value)}
                  fullWidth
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Row Gap Above"
                  size="small"
                  type="number"
                  value={rowGapAbove}
                  onChange={(event) => setRowGapAbove(Math.max(0, Number(event.target.value) || 0))}
                  fullWidth
                />
                <TextField
                  label="Row Gap Below"
                  size="small"
                  type="number"
                  value={rowGapBelow}
                  onChange={(event) => setRowGapBelow(Math.max(0, Number(event.target.value) || 0))}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyJson} disabled={!currentJson}>
                  Copy JSON
                </Button>
                <Button
                  variant="outlined"
                  onClick={() =>
                    setPresetBox({
                      left: 49,
                      top: 158,
                      width: 551,
                      height: 158
                    })
                  }
                  disabled={!naturalSize.width}
                >
                  Apply Sample Preset
                </Button>
                {copyMessage && (
                  <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    {copyMessage}
                  </Typography>
                )}
              </Stack>
              <TextField
                label="Current JSON"
                multiline
                minRows={12}
                value={currentJson}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 13 } }}
                fullWidth
              />
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6">Saved Presets</Typography>
            {savedPresets.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No saved boxes yet.
              </Typography>
            )}
            {savedPresets.map((preset) => (
              <Box
                key={preset.id}
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc'
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {preset.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {preset.imageName} • {preset.box.left},{preset.box.top} {preset.box.width}x{preset.box.height} • gaps {preset.rowGapAbove ?? 24}/{preset.rowGapBelow ?? 24}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="outlined" onClick={() => loadPreset(preset)}>
                      Load
                    </Button>
                    <IconButton size="small" color="error" onClick={() => deletePreset(preset.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
};

const statusChip = (status: CheckStatus) => {
  if (status === 'ok') return <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label="OK" />;
  if (status === 'error') return <Chip size="small" color="error" icon={<ErrorOutlineIcon />} label="Failed" />;
  if (status === 'running') return <Chip size="small" color="warning" icon={<HourglassTopIcon />} label="Running" />;
  return <Chip size="small" variant="outlined" label="Not run" />;
};

export const PlaygroundPage = () => {
  const [tab, setTab] = useState(0);
  const [apiHealth, setApiHealth] = useState<CheckResult>({ status: 'idle', detail: 'Health check has not run yet.' });
  const [authCheck, setAuthCheck] = useState<CheckResult>({
    status: 'idle',
    detail: 'Auth check has not run yet.'
  });
  const [dbCheck, setDbCheck] = useState<CheckResult>({ status: 'idle', detail: 'DB check has not run yet.' });
  const [backendEnvCheck, setBackendEnvCheck] = useState<CheckResult>({
    status: 'idle',
    detail: 'Backend env readiness check has not run yet.'
  });
  const [backendRequiredEnv, setBackendRequiredEnv] = useState<Record<string, boolean>>({});
  const [backendOptionalEnv, setBackendOptionalEnv] = useState<Record<string, boolean>>({});

  const apiBase = import.meta.env.VITE_API_URL ?? '';
  const healthUrl = useMemo(() => getHealthUrl(apiBase), [apiBase]);
  const envReadinessUrl = useMemo(() => getEnvReadinessUrl(apiBase), [apiBase]);
  const frontendRequiredStatus = useMemo(
    () =>
      FRONTEND_REQUIRED_KEYS.map((key) => ({
        key,
        present: Boolean(import.meta.env[key])
      })),
    []
  );
  const frontendAllRequiredPresent = frontendRequiredStatus.every((item) => item.present);

  const runApiHealth = async () => {
    setApiHealth({ status: 'running', detail: 'Checking /health...' });
    try {
      const res = await fetch(healthUrl, { credentials: 'include' });
      if (!res.ok) {
        setApiHealth({ status: 'error', detail: `Health endpoint returned ${res.status}` });
        return;
      }
      setApiHealth({ status: 'ok', detail: `Health endpoint reachable at ${healthUrl}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      setApiHealth({ status: 'error', detail: message });
    }
  };

  const runAuthCheck = async () => {
    setAuthCheck({ status: 'running', detail: 'Checking /api/auth/me...' });
    try {
      const res = await api.get('/auth/me');
      const email = (res.data as { data?: { email?: string } }).data?.email ?? 'authenticated user';
      setAuthCheck({ status: 'ok', detail: `Authenticated as ${email}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auth check failed';
      setAuthCheck({ status: 'error', detail: message });
    }
  };

  const runDbCheck = async () => {
    setDbCheck({ status: 'running', detail: 'Checking data path through /api/company/mine...' });
    try {
      const res = await api.get('/company/mine');
      const name = (res.data as { data?: { name?: string } }).data?.name ?? 'company loaded';
      setDbCheck({ status: 'ok', detail: `Company data reachable (${name})` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DB check failed';
      setDbCheck({ status: 'error', detail: message });
    }
  };

  const runBackendEnvCheck = async () => {
    setBackendEnvCheck({ status: 'running', detail: 'Checking backend environment readiness...' });
    try {
      const res = await fetch(envReadinessUrl, { credentials: 'include' });
      if (!res.ok) {
        setBackendEnvCheck({ status: 'error', detail: `Env readiness endpoint returned ${res.status}` });
        return;
      }
      const payload = (await res.json()) as EnvReadinessResponse;
      setBackendRequiredEnv(payload.data.required ?? {});
      setBackendOptionalEnv(payload.data.optional ?? {});
      if (payload.data.allRequiredPresent) {
        setBackendEnvCheck({ status: 'ok', detail: 'All required backend env vars are present.' });
      } else {
        setBackendEnvCheck({ status: 'error', detail: 'One or more required backend env vars are missing.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend env check failed';
      setBackendEnvCheck({ status: 'error', detail: message });
    }
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Developer Playground"
        subtitle="Runtime checks for setup, environment variables, and connectivity."
        icon={<ScienceOutlinedIcon />}
      />

      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_e, next) => setTab(next)} variant="scrollable" allowScrollButtonsMobile>
            <Tab label="Compliance" />
            <Tab label="Environment" />
            <Tab label="Connections" />
            <Tab label="Crop Lab" />
          </Tabs>
        </CardContent>
      </Card>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Stack spacing={1.25}>
              <Typography variant="h6">Local Run Compliance</Typography>
              <Alert severity="info">Use this checklist before debugging route or DB failures.</Alert>
              <List dense>
                <ListItem>
                  <ListItemText primary="Node.js 20+ and pnpm installed" secondary="Run: node -v && pnpm -v" />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Server env file is present"
                    secondary="Required: PORT, MONGO_URI, ENCRYPTION_KEY, CLIENT_URL"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="MongoDB is reachable"
                    secondary="Run: docker compose up -d mongo OR ensure mongodb://127.0.0.1:27017 is active"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="API is healthy"
                    secondary={`Expect GET ${healthUrl} to return status: ok`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Client API base is correct"
                    secondary={`Current VITE_API_URL=${apiBase || 'TBD'}`}
                  />
                </ListItem>
              </List>
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Environment Visibility</Typography>
              <Alert severity="warning">
                Browser can only read variables prefixed with <code>VITE_</code>. Server env vars are intentionally hidden.
              </Alert>
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Client Variables
              </Typography>
              <Stack spacing={1}>
                {CLIENT_ENV_ITEMS.map((item) => (
                  <Box
                    key={item.key}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc'
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {item.key}
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{String(item.value)}</Typography>
                  </Box>
                ))}
              </Stack>
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Frontend Required Variables
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {frontendRequiredStatus.map((item) => (
                  <Chip
                    key={item.key}
                    label={`${item.key}: ${item.present ? 'present' : 'missing'}`}
                    color={item.present ? 'success' : 'error'}
                    variant={item.present ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
              {!frontendAllRequiredPresent && (
                <Alert severity="error">Frontend required env is incomplete. Set missing VITE_* keys and rebuild the client.</Alert>
              )}
              {frontendAllRequiredPresent && (
                <Alert severity="success">Frontend required env is present.</Alert>
              )}
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Server Variables (expected)
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {SERVER_ENV_ITEMS.map((name) => (
                  <Chip key={name} label={name} variant="outlined" />
                ))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runBackendEnvCheck}>
                  Run Backend Env Check
                </Button>
                {statusChip(backendEnvCheck.status)}
                <Typography variant="body2" color="text.secondary">
                  {backendEnvCheck.detail}
                </Typography>
              </Stack>
              {Object.keys(backendRequiredEnv).length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Backend Required Status
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {Object.entries(backendRequiredEnv).map(([name, present]) => (
                      <Chip
                        key={name}
                        label={`${name}: ${present ? 'present' : 'missing'}`}
                        color={present ? 'success' : 'error'}
                        variant={present ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Stack>
                </>
              )}
              {Object.keys(backendOptionalEnv).length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Backend Optional Status
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {Object.entries(backendOptionalEnv).map(([name, present]) => (
                      <Chip
                        key={name}
                        label={`${name}: ${present ? 'present' : 'not set'}`}
                        color={present ? 'success' : 'default'}
                        variant={present ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Stack>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runApiHealth}>
                  Run API Health Check
                </Button>
                {statusChip(apiHealth.status)}
                <Typography variant="body2" color="text.secondary">
                  {apiHealth.detail}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runAuthCheck}>
                  Run Auth Check
                </Button>
                {statusChip(authCheck.status)}
                <Typography variant="body2" color="text.secondary">
                  {authCheck.detail}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runDbCheck}>
                  Run DB Path Check
                </Button>
                {statusChip(dbCheck.status)}
                <Typography variant="body2" color="text.secondary">
                  {dbCheck.detail}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {(apiHealth.status === 'error' ||
            authCheck.status === 'error' ||
            dbCheck.status === 'error' ||
            backendEnvCheck.status === 'error') && (
            <Alert severity="error">
              One or more checks failed. Review server logs and confirm Mongo and env setup before retrying.
            </Alert>
          )}
        </Stack>
      )}

      {tab === 3 && <CropPresetLab />}
    </Stack>
  );
};
