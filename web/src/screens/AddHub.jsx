import React from 'react';
import { Box, Button, Card, CardContent, Grid, Typography } from '@mui/material';
import { Add as AddIcon, Inventory as CaveIcon } from '@mui/icons-material';
import { Link } from 'react-router-dom';

const AddHub = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Ajout rapide</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1">Ajouter une cave</Typography>
              <Button component={Link} to="/cellars/add" variant="contained" startIcon={<CaveIcon />} sx={{ mt: 1 }}>Configurer</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1">Ajouter une boisson</Typography>
              <Button component={Link} to="/bottles/add" variant="contained" startIcon={<AddIcon />} sx={{ mt: 1 }}>Formulaire</Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1">Ajouter du tabac</Typography>
              <Button component={Link} to="/tobacco/add" variant="contained" startIcon={<AddIcon />} sx={{ mt: 1 }}>Formulaire</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AddHub;
