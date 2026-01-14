/**
 * HTTP client for bottles API
 * Handles all API calls to the bottles endpoint
 */

import { BottleInput, BottleRecord } from "./schema";

const API_BASE = "/api/bottles";

class BottlesClientError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "BottlesClientError";
  }
}

export const bottlesClient = {
  async list(): Promise<BottleRecord[]> {
    try {
      const res = await fetch(`${API_BASE}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new BottlesClientError("LIST_FAILED", res.status, error.error || "Failed to list bottles");
      }

      return (await res.json()) as BottleRecord[];
    } catch (err) {
      if (err instanceof BottlesClientError) throw err;
      throw new BottlesClientError("NETWORK_ERROR", 0, String(err));
    }
  },

  async listByCellar(cellarId: string): Promise<BottleRecord[]> {
    try {
      const res = await fetch(`${API_BASE}/cellar/${cellarId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new BottlesClientError("LIST_CELLAR_FAILED", res.status, error.error || "Failed to list cellar bottles");
      }

      return (await res.json()) as BottleRecord[];
    } catch (err) {
      if (err instanceof BottlesClientError) throw err;
      throw new BottlesClientError("NETWORK_ERROR", 0, String(err));
    }
  },

  async getById(bottleId: string): Promise<BottleRecord> {
    try {
      const res = await fetch(`${API_BASE}/${bottleId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new BottlesClientError("NOT_FOUND", 404, "Bottle not found");
        }
        const error = await res.json();
        throw new BottlesClientError("GET_FAILED", res.status, error.error || "Failed to get bottle");
      }

      return (await res.json()) as BottleRecord;
    } catch (err) {
      if (err instanceof BottlesClientError) throw err;
      throw new BottlesClientError("NETWORK_ERROR", 0, String(err));
    }
  },

  async create(input: BottleInput): Promise<BottleRecord> {
    try {
      const res = await fetch(`${API_BASE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new BottlesClientError(
          "CREATE_FAILED",
          res.status,
          error.error || "Failed to create bottle"
        );
      }

      return (await res.json()) as BottleRecord;
    } catch (err) {
      if (err instanceof BottlesClientError) throw err;
      throw new BottlesClientError("NETWORK_ERROR", 0, String(err));
    }
  },

  async update(bottleId: string, input: Partial<BottleInput>): Promise<BottleRecord> {
    try {
      const res = await fetch(`${API_BASE}/${bottleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new BottlesClientError("NOT_FOUND", 404, "Bottle not found");
        }
        const error = await res.json();
        throw new BottlesClientError(
          "UPDATE_FAILED",
          res.status,
          error.error || "Failed to update bottle"
        );
      }

      return (await res.json()) as BottleRecord;
    } catch (err) {
      if (err instanceof BottlesClientError) throw err;
      throw new BottlesClientError("NETWORK_ERROR", 0, String(err));
    }
  },

  async delete(bottleId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/${bottleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new BottlesClientError("NOT_FOUND", 404, "Bottle not found");
        }
        const error = await res.json();
        throw new BottlesClientError(
          "DELETE_FAILED",
          res.status,
          error.error || "Failed to delete bottle"
        );
      }

      return (await res.json()) as { success: boolean; message: string };
    } catch (err) {
      if (err instanceof BottlesClientError) throw err;
      throw new BottlesClientError("NETWORK_ERROR", 0, String(err));
    }
  },
};

// Convenience functions for backward compatibility
export async function fetchBottles(): Promise<BottleRecord[]> {
  return bottlesClient.list();
}

export async function createBottle(input: BottleInput): Promise<BottleRecord> {
  return bottlesClient.create(input);
}

export async function updateBottle(id: string, input: Partial<BottleInput>): Promise<BottleRecord> {
  return bottlesClient.update(id, input);
}

export async function deleteBottle(id: string): Promise<{ success: boolean; message: string }> {
  return bottlesClient.delete(id);
}

export { BottlesClientError };
