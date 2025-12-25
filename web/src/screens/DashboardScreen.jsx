import React, { useState, useEffect } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import { CollectionDashboard } from '../components/CollectionDashboard';
import api from '../services/apiClient';

/**
 * DashboardScreen - Main entry point for the personal collection ("Ma Cave")
 * 
 * Displays:
 * - Ready to drink wines  
 * - Peak drinking alerts
 * - Recent tastings
 * - Quick add actions (camera, barcode, manual)
 * 
 * This is the intimate collection dashboard
 */
const DashboardScreen = () => {
  const [wines, setWines] = useState([]);
  const [tastings, setTastings] = useState([]);
  const [peakAlerts, setPeakAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch wines
        const winesData = await api.getWines();
        if (winesData && Array.isArray(winesData)) {
          setWines(winesData);
        }

        // Fetch tastings (from tasting history)
        try {
          const tastingsData = await api.getTastings?.();
          if (tastingsData && Array.isArray(tastingsData)) {
            setTastings(tastingsData);
          }
        } catch (e) {
          console.log('Tastings not available:', e);
        }

        // Calculate peak alerts - wines approaching their peak drinking date
        const alerts = winesData?.filter(w => {
          if (!w.peakDrinkingStart || !w.peakDrinkingEnd) return false;
          const now = new Date();
          const startDate = new Date(w.peakDrinkingStart);
          const endDate = new Date(w.peakDrinkingEnd);
          return now >= startDate && now <= endDate;
        }) || [];
        setPeakAlerts(alerts);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ marginBottom: 2 }}>
          {error}
        </Alert>
      )}
      <CollectionDashboard
        wines={wines}
        tastings={tastings}
        peakAlerts={peakAlerts}
      />
    </Box>
  );
};

export default DashboardScreen;
