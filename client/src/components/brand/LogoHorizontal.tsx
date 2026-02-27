import { Box } from '@mui/material';
import { BRAND_ASSETS } from './assets';

type LogoHorizontalProps = {
  /** Height in pixels; width follows automatically */
  height?: number;
};

export const LogoHorizontal = ({ height = 36 }: LogoHorizontalProps) => (
  <Box
    component="img"
    src={BRAND_ASSETS.logoHorizontal}
    alt="RetailSync"
    sx={{
      height,
      width: 'auto',
      display: 'block',
      objectFit: 'contain',
      userSelect: 'none'
    }}
  />
);
