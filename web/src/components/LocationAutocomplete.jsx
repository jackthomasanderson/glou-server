import React, { useState, useEffect } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import api from '../services/apiClient';

/**
 * LocationAutocomplete - Autocomplétion pour les villes/adresses
 * Utilise OpenStreetMap Nominatim via le proxy backend
 */
export const LocationAutocomplete = ({ value, onChange, label, error, helperText, required, ...props }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');

  useEffect(() => {
    if (inputValue.length < 2) {
      setOptions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await api.searchLocations(inputValue);
        setOptions(results.map((result) => ({
          label: result.display_name,
          value: result.display_name,
          lat: result.lat,
          lon: result.lon,
          city: result.city,
          country: result.country,
        })));
      } catch (error) {
        console.error('Failed to fetch locations:', error);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(delayDebounceFn);
  }, [inputValue]);

  return (
    <Autocomplete
      {...props}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(event, newValue) => {
        if (typeof newValue === 'string') {
          onChange(newValue);
        } else if (newValue && newValue.value) {
          onChange(newValue.value);
        } else {
          onChange('');
        }
      }}
      inputValue={inputValue}
      onInputChange={(event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      isOptionEqualToValue={(option, value) => option.value === value}
      getOptionLabel={(option) => {
        if (typeof option === 'string') {
          return option;
        }
        return option.label || '';
      }}
      options={options}
      loading={loading}
      freeSolo
      renderInput={(params) => (
        <TextField
          {...params}
          label={label || 'Localisation'}
          required={required}
          error={error}
          helperText={helperText || 'Commencez à taper pour voir les suggestions'}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

export default LocationAutocomplete;
