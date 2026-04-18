import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { SvgIconComponent } from '@mui/icons-material';
import { ButtonBase, Paper, Stack, Typography } from '@mui/material';

type QuickbooksCardProps = {
  title: string;
  description: string;
  icon: SvgIconComponent;
  onClick: () => void;
};

export const QuickbooksCard = ({
  title,
  description,
  icon: Icon,
  onClick
}: QuickbooksCardProps) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      borderRadius: 3,
      textAlign: 'left',
      alignItems: 'stretch'
    }}
  >
    <Paper
      variant="outlined"
      sx={{
        width: '100%',
        minHeight: 164,
        p: 2.25,
        borderRadius: 3,
        transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: 'primary.main',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)'
        }
      }}
    >
      <Stack spacing={2} sx={{ height: '100%' }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
        >
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2.5,
              bgcolor: 'primary.50',
              color: 'primary.main'
            }}
          >
            <Icon fontSize="small" />
          </Stack>
          <ArrowForwardIcon fontSize="small" color="action" />
        </Stack>

        <Stack spacing={0.75} sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontSize: 18, lineHeight: 1.2 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {description}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  </ButtonBase>
);

export default QuickbooksCard;
