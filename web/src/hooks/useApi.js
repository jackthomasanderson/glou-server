import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/apiClient';

/**
 * useWines - Hook for managing wine data
 */
export const useWines = () => {
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getWines();
      setWines(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchWines = useCallback(async (filters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.searchWines(filters);
      setWines(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createWine = useCallback(async (wine) => {
    setLoading(true);
    setError(null);
    try {
      const newWine = await apiClient.createWine(wine);
      setWines([newWine, ...wines]);
      return newWine;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wines]);

  const updateWine = useCallback(async (id, wine) => {
    setLoading(true);
    setError(null);
    try {
      const updatedWine = await apiClient.updateWine(id, wine);
      setWines(wines.map(w => w.id === id ? updatedWine : w));
      return updatedWine;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wines]);

  const deleteWine = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteWine(id);
      setWines(wines.filter(w => w.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [wines]);

  const getWinesToDrinkNow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getWinesToDrinkNow();
      return data || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWines();
  }, [fetchWines]);

  return {
    wines,
    loading,
    error,
    fetchWines,
    searchWines,
    createWine,
    updateWine,
    deleteWine,
    getWinesToDrinkNow,
  };
};

/**
 * useCaves - Hook for managing caves
 */
export const useCaves = () => {
  const [caves, setCaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getCaves();
      setCaves(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createCave = useCallback(async (cave) => {
    setLoading(true);
    setError(null);
    try {
      const newCave = await apiClient.createCave(cave);
      setCaves((prev) => [newCave, ...prev]);
      return newCave;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCave = useCallback(async (id, cave) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await apiClient.updateCave(id, cave);
      setCaves((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaves();
  }, [fetchCaves]);

  return {
    caves,
    loading,
    error,
    fetchCaves,
    createCave,
    updateCave,
  };
};

/**
 * useAlerts - Hook for managing alerts
 */
export const useAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getAlerts();
      setAlerts(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createAlert = useCallback(async (alert) => {
    setLoading(true);
    setError(null);
    try {
      const newAlert = await apiClient.createAlert(alert);
      setAlerts([newAlert, ...alerts]);
      return newAlert;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [alerts]);

  const dismissAlert = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.dismissAlert(id);
      setAlerts(alerts.filter(a => a.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [alerts]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    fetchAlerts,
    createAlert,
    dismissAlert,
  };
};

/**
 * useTastingHistory - Hook for consumption history
 */
export const useTastingHistory = (wineId) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!wineId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getConsumptionHistory(wineId);
      setHistory(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [wineId]);

  const recordTasting = useCallback(async (consumption) => {
    setLoading(true);
    setError(null);
    try {
      const newRecord = await apiClient.recordConsumption(consumption);
      setHistory([newRecord, ...history]);
      return newRecord;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [history]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    loading,
    error,
    fetchHistory,
    recordTasting,
  };
};

/**
 * useSettings - Hook for application settings
 */
export const useSettings = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSettings();
      setSettings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await apiClient.updateSettings(newSettings);
      setSettings(updated);
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateSettings,
  };
};

/**
 * useTobaccoAlerts - Hook for managing tobacco alerts
 */
export const useTobaccoAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getTobaccoAlerts();
      setAlerts(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.generateTobaccoAlerts();
      await fetchAlerts(); // Refresh alerts after generation
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAlerts]);

  const dismissAlert = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.dismissTobaccoAlert(id);
      setAlerts(alerts.filter(a => a.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [alerts]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    fetchAlerts,
    generateAlerts,
    dismissAlert,
  };
};
