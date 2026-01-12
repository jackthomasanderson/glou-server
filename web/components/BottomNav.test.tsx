import React from "react";
import { render, screen } from "@testing-library/react";
import BottomNav from "./BottomNav";
import { I18nProvider } from "../lib/i18n/I18nProvider";

describe("BottomNav", () => {
  test("renders bottom nav items", () => {
    render(
      <I18nProvider>
        <BottomNav />
      </I18nProvider>
    );

    expect(screen.getByText(/Dashboard|Tableau de bord/i)).toBeInTheDocument();
    expect(screen.getByText(/Bottles|Bouteilles/i)).toBeInTheDocument();
    expect(screen.getByText(/Cellars|Celliers/i)).toBeInTheDocument();
  });
});
