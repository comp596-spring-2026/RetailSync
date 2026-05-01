import { Box, Typography, Container, Paper } from "@mui/material";

export const ArchitecturePage = () => {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom fontWeight="600" color="primary">
        System Architecture
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        High-level overview of the RetailSync platform stack and data flow.
      </Typography>
      
      <Paper 
        elevation={0} 
        sx={{ 
          p: 4, 
          mt: 4, 
          borderRadius: 4, 
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: '#f8fafc',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'auto'
        }}
      >
        <img 
          src="/d2.svg" 
          alt="RetailSync Architecture" 
          style={{ maxWidth: '100%', height: 'auto', minWidth: '800px' }} 
        />
      </Paper>
    </Container>
  );
};
