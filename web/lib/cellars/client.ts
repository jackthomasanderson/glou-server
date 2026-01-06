import { Cellar, CreateCellarInput, UpdateCellarInput } from "@/types/cellars";

const API_BASE = "/api";

export const cellarsClient = {
  /**
   * Get all cellars for the authenticated user
   */
  async getCellars(): Promise<Cellar[]> {
    const response = await fetch(`${API_BASE}/cellars`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch cellars");
    }

    return response.json();
  },

  /**
   * Get a single cellar by ID
   */
  async getCellarById(cellarId: string): Promise<Cellar> {
    const response = await fetch(`${API_BASE}/cellars/${cellarId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Cellar not found");
      }
      throw new Error("Failed to fetch cellar");
    }

    return response.json();
  },

  /**
   * Create a new cellar
   */
  async createCellar(input: CreateCellarInput): Promise<Cellar> {
    const response = await fetch(`${API_BASE}/cellars`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to create cellar");
    }

    return response.json();
  },

  /**
   * Update a cellar
   */
  async updateCellar(cellarId: string, input: UpdateCellarInput): Promise<Cellar> {
    const response = await fetch(`${API_BASE}/cellars/${cellarId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Cellar not found");
      }
      throw new Error("Failed to update cellar");
    }

    return response.json();
  },

  /**
   * Delete a cellar
   */
  async deleteCellar(cellarId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/cellars/${cellarId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Cellar not found");
      }
      throw new Error("Failed to delete cellar");
    }
  },
};
