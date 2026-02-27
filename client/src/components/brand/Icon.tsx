import { Box } from '@mui/material';
import { BRAND_ASSETS } from './assets';

type IconProps = {
  /** Height in pixels; width follows automatically */
  height?: number;
  /** Use SVG for crisp scaling; PNG for consistency with loader */
  useSvg?: boolean;
};

export const Icon = ({ height = 36, useSvg = true }: IconProps) => (
  <Box
    component="img"
    src={useSvg ? BRAND_ASSETS.iconSvg : BRAND_ASSETS.icon}
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
