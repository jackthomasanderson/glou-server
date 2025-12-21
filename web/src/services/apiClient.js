/**
 * Centralized API Client for Glou Backend
 * Handles all HTTP requests with proper error handling and auth
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('auth_token');
  }

  /**
   * Generic request method
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : null,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      // Return null for 204 No Content
      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error);
      throw error;
    }
  }

  // ============ WINES ============

  /**
   * Fetch all wines
   */
  async getWines() {
    return this.request('GET', '/wines');
  }

  /**
   * Fetch wine by ID
   */
  async getWineById(id) {
    return this.request('GET', `/wines/${id}`);
  }

  /**
   * Search wines with filters
   */
  async searchWines(filters) {
    const params = new URLSearchParams();
    if (filters.name) params.append('name', filters.name);
    if (filters.producer) params.append('producer', filters.producer);
    if (filters.region) params.append('region', filters.region);
    if (filters.type) params.append('type', filters.type);
    if (filters.min_vintage) params.append('min_vintage', filters.min_vintage);
    if (filters.max_vintage) params.append('max_vintage', filters.max_vintage);
    if (filters.min_price) params.append('min_price', filters.min_price);
    if (filters.max_price) params.append('max_price', filters.max_price);
    if (filters.min_rating) params.append('min_rating', filters.min_rating);

    return this.request('GET', `/wines/search?${params.toString()}`);
  }

  /**
   * Create new wine
   */
  async createWine(wine) {
    return this.request('POST', '/wines', wine);
  }

  /**
   * Update wine
   */
  async updateWine(id, wine) {
    return this.request('PUT', `/wines/${id}`, wine);
  }

  /**
   * Delete wine
   */
  async deleteWine(id) {
    return this.request('DELETE', `/wines/${id}`);
  }

  /**
   * Get wines to drink now
   */
  async getWinesToDrinkNow() {
    return this.request('GET', '/wines/drinkable');
  }

  // ============ CAVES ============

  /**
   * Fetch all caves
   */
  async getCaves() {
    return this.request('GET', '/caves');
  }

  /**
   * Create new cave
   */
  async createCave(cave) {
    return this.request('POST', '/caves', cave);
  }

  /**
   * Get cells in cave
   */
  async getCells(caveId) {
    return this.request('GET', `/caves/${caveId}/cells`);
  }

  /**
   * Create cell
   */
  async createCell(cell) {
    return this.request('POST', '/cells', cell);
  }

  // ============ ALERTS ============

  /**
   * Get all active alerts
   */
  async getAlerts() {
    return this.request('GET', '/alerts');
  }

  /**
   * Create alert
   */
  async createAlert(alert) {
    return this.request('POST', '/alerts', alert);
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(id) {
    return this.request('DELETE', `/alerts/${id}`);
  }

  // ============ CONSUMPTION HISTORY ============

  /**
   * Get consumption history for wine
   */
  async getConsumptionHistory(wineId) {
    return this.request('GET', `/wines/${wineId}/history`);
  }

  /**
   * Record consumption
   */
  async recordConsumption(consumption) {
    return this.request('POST', '/consumption', consumption);
  }

  // ============ EXPORT / IMPORT ============

  /**
   * Export all data as JSON
   */
  async exportJSON() {
    return this.request('GET', '/api/export/json');
  }

  /**
   * Export wines as CSV
   */
  async exportWinesCSV() {
    return this.request('GET', '/api/export/wines-csv');
  }

  /**
   * Import JSON data
   */
  async importJSON(data) {
    return this.request('POST', '/api/import/json', data);
  }

  // ============ SETTINGS ============

  /**
   * Get settings
   */
  async getSettings() {
    return this.request('GET', '/api/admin/settings');
  }

  /**
   * Update settings
   */
  async updateSettings(settings) {
    return this.request('PUT', '/api/admin/settings', settings);
  }

  // ============ ACTIVITY LOG ============

  /**
   * Get activity log
   */
  async getActivityLog(limit = 50, offset = 0) {
    return this.request('GET', `/api/admin/activity-log?limit=${limit}&offset=${offset}`);
  }
}

// Export singleton instance
export default new ApiClient();
