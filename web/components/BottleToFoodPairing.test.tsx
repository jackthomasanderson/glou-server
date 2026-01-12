import React from "react";
import { beforeAll } from "vitest";

// Utilise jsdom pour simuler le DOM
beforeAll(async () => {
  if (typeof window === "undefined") {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<html><body></body></html>");
    global.window = dom.window;
    global.document = dom.window.document;
    // jsdom fournit déjà navigator
  }
});
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BottleToFoodPairing } from "./BottleToFoodPairing";
import { I18nextProvider } from "react-i18next";
import i18n from "../lib/i18n/test-config";

describe("BottleToFoodPairing", () => {
  beforeEach(() => {
    // @ts-ignore
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ suggestion: "Magret de canard aux figues" }),
      })
    );
  });

  it("affiche le bouton et le résultat IA", async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <BottleToFoodPairing bottle={{ name: "Château Test 2020", description: "Vin rouge puissant" }} />
      </I18nextProvider>
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText("Magret de canard aux figues")).toBeInTheDocument();
    });
  });
});
