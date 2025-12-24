import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../services/apiClient';

/**
 * Context pour gérer la configuration de l'application
 * Permet à l'admin de personnaliser le nom et le slogan
 */
const AppConfigContext = createContext({
  appName: 'Glou',
  appSlogan: 'Your personal cellar',
  appTitle: 'Glou - Your personal cellar',
  isLoading: false,
  error: null,
  reload: () => {},
});

export const useAppConfig = () => useContext(AppConfigContext);

export const AppConfigProvider = ({ children }) => {
  const [appName, setAppName] = useState('Glou');
  const [appSlogan, setAppSlogan] = useState('Your personal cellar');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const settings = await apiClient.getAdminSettings();
      
      if (settings) {
        setAppName(settings.app_title || 'Glou');
        setAppSlogan(settings.app_slogan || 'Your personal cellar');
        
        // Mettre à jour le titre du document
        document.title = `${settings.app_title || 'Glou'} - ${settings.app_slogan || 'Your personal cellar'}`;
      }
    } catch (err) {
      console.error('Erreur lors du chargement de la config:', err);
      setError(err.message);
      // Garder les valeurs par défaut
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const value = {
    appName,
    appSlogan,
    appTitle: `${appName} - ${appSlogan}`,
    isLoading,
    error,
    reload: loadConfig,
  };

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
};
