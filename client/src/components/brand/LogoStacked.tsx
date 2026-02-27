import { Stack, Typography } from '@mui/material';
import { Icon } from './Icon';

type LogoStackedProps = {
  /** Icon height in pixels */
  iconHeight?: number;
  /** Wordmark font size */
  wordmarkSize?: 'small' | 'medium' | 'large';
};

const sizeMap = {
  small: 'body1',
  medium: 'h6',
  large: 'h5'
} as const;

export const LogoStacked = ({ iconHeight = 48, wordmarkSize = 'medium' }: LogoStackedProps) => (
  <Stack alignItems="center" spacing={1}>
    <Icon height={iconHeight} useSvg />
    <Typography variant={sizeMap[wordmarkSize]} fontWeight={700} color="text.primary" sx={{ letterSpacing: 0.5 }}>
      RetailSync
    </Typography>
  </Stack>
);
