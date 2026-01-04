import { type BottleInput, type BottleRecord } from "./schema";

const headers = { "Content-Type": "application/json" };

const handleResponse = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (payload as { error?: string }).error ?? "UNKNOWN_ERROR";
    throw new Error(error);
  }
  return (payload as { data: unknown }).data;
};

export async function fetchBottles(includeDeleted = true): Promise<BottleRecord[]> {
  const res = await fetch(`/api/bottles?includeDeleted=${includeDeleted}`, { cache: "no-store" });
  return (await handleResponse(res)) as BottleRecord[];
}

export async function createBottle(input: BottleInput): Promise<BottleRecord> {
  const res = await fetch("/api/bottles", {
    method: "POST",
    headers,
    body: JSON.stringify(input)
  });
  return (await handleResponse(res)) as BottleRecord;
}

export async function updateBottle(id: string, input: BottleInput): Promise<BottleRecord> {
  const res = await fetch(`/api/bottles/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(input)
  });
  return (await handleResponse(res)) as BottleRecord;
}

export async function deleteBottle(id: string): Promise<BottleRecord> {
  const res = await fetch(`/api/bottles/${id}`, { method: "DELETE" });
  return (await handleResponse(res)) as BottleRecord;
}

export async function restoreBottle(id: string): Promise<BottleRecord> {
  const res = await fetch(`/api/bottles/${id}/restore`, { method: "POST" });
  return (await handleResponse(res)) as BottleRecord;
}
