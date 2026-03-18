import { Box, type SxProps, type Theme } from '@mui/material';
import { BRAND_ASSETS } from './assets';

export const QUICKBOOKS_BRAND = {
  white: '#FFFFFF',
  tofu: '#F4F4EF',
  fig: '#14324F',
  ice: '#EAF6F7',
  green: '#2CA01C'
} as const;

type QuickBooksLogoProps = {
  height?: number;
  alt?: string;
  sx?: SxProps<Theme>;
};

export const QuickBooksLogo = ({
  height = 36,
  alt = 'QuickBooks',
  sx
}: QuickBooksLogoProps) => (
  <Box
    component="img"
    src={BRAND_ASSETS.quickbooksLogo}
    alt={alt}
    sx={{
      height,
      width: 'auto',
      maxWidth: '100%',
      display: 'block',
      objectFit: 'contain',
      userSelect: 'none',
      ...sx
    }}
  />
);
