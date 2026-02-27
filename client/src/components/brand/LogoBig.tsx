import { Box } from '@mui/material';
import { BRAND_ASSETS } from './assets';

type LogoBigProps = {
  /** Height in pixels; width follows automatically */
  height?: number;
};

export const LogoBig = ({ height = 36 }: LogoBigProps) => (
  <Box
    component="img"
    src={BRAND_ASSETS.logoBig}
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
