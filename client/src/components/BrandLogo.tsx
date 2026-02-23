import { Box } from '@mui/material';

type BrandLogoProps = {
  variant?: 'icon' | 'big' | 'horizontal' | 'mark';
  height?: number;
};

export const BrandLogo = ({ variant = 'big', height = 36 }: BrandLogoProps) => {
  const normalizedVariant = variant === 'mark' ? 'icon' : variant;
  const src =
    normalizedVariant === 'icon'
      ? '/brand/icon.svg'
      : normalizedVariant === 'horizontal'
        ? '/brand/logo-horizontal-removebg.png'
        : '/brand/BigLogo.png';
  const alt = normalizedVariant === 'icon' ? 'RetailSync Icon' : 'RetailSync';

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{
        height,
        width: 'auto',
        display: 'block',
        objectFit: 'contain',
        userSelect: 'none'
      }}
    />
  );
};
