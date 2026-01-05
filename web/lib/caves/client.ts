import { Cave, CreateCaveInput, UpdateCaveInput } from "@/types/caves";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

export const cavesClient = {
  /**
   * Get all caves for the authenticated user
   */
  async getCaves(): Promise<Cave[]> {
    const response = await fetch(`${API_BASE}/caves`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch caves");
    }

    return response.json();
  },

  /**
   * Get a single cave by ID
   */
  async getCaveById(caveId: string): Promise<Cave> {
    const response = await fetch(`${API_BASE}/caves/${caveId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Cave not found");
      }
      throw new Error("Failed to fetch cave");
    }

    return response.json();
  },

  /**
   * Create a new cave
   */
  async createCave(input: CreateCaveInput): Promise<Cave> {
    const response = await fetch(`${API_BASE}/caves`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to create cave");
    }

    return response.json();
  },

  /**
   * Update a cave
   */
  async updateCave(caveId: string, input: UpdateCaveInput): Promise<Cave> {
    const response = await fetch(`${API_BASE}/caves/${caveId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Cave not found");
      }
      throw new Error("Failed to update cave");
    }

    return response.json();
  },

  /**
   * Delete a cave
   */
  async deleteCave(caveId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/caves/${caveId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Cave not found");
      }
      throw new Error("Failed to delete cave");
    }
  },
};
