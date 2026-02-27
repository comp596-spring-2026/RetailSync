import { Icon } from './Icon';
import { LogoBig } from './LogoBig';
import { LogoHorizontal } from './LogoHorizontal';

type BrandLogoProps = {
  /** @deprecated Use Icon, LogoHorizontal, LogoBig, or LogoStacked directly */
  variant?: 'icon' | 'big' | 'horizontal' | 'mark';
  height?: number;
};

/**
 * Legacy wrapper: prefer using Icon, LogoHorizontal, LogoBig, LogoStacked, or IconLoader directly.
 */
export const BrandLogo = ({ variant = 'big', height = 36 }: BrandLogoProps) => {
  if (variant === 'horizontal') {
    return <LogoHorizontal height={height} />;
  }
  if (variant === 'icon' || variant === 'mark') {
    return <Icon height={height} useSvg />;
  }
  return <LogoBig height={height} />;
};
