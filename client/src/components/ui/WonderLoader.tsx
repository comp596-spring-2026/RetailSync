import { Box, Stack, Typography } from '@mui/material';
import { Icon } from '../brand/Icon';

type WonderLoaderProps = {
  fullscreen?: boolean;
  label?: string;
};

export const WonderLoader = ({ fullscreen = false, label = 'Loading RetailSync...' }: WonderLoaderProps) => {
  return (
    <Box
      sx={{
        minHeight: fullscreen ? '100vh' : 120,
        display: 'grid',
        placeItems: 'center',
        background: fullscreen
          ? 'radial-gradient(circle at 10% 10%, rgba(61,156,116,0.14), transparent 35%), radial-gradient(circle at 90% 80%, rgba(156,204,180,0.24), transparent 30%), #f6fbf8'
          : 'transparent'
      }}
    >
      <Stack alignItems="center" spacing={1.5}>
        <Icon height={44} useSvg />
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {[0, 1, 2].map((dot) => (
            <Box
              key={dot}
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: dot === 1 ? '#3d9c74' : '#9cccb4',
                animation: 'wonderPulse 1.1s ease-in-out infinite',
                animationDelay: `${dot * 0.14}s`,
                '@keyframes wonderPulse': {
                  '0%, 100%': { transform: 'translateY(0)', opacity: 0.4 },
                  '50%': { transform: 'translateY(-7px)', opacity: 1 }
                }
              }}
            />
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
    </Box>
  );
};
