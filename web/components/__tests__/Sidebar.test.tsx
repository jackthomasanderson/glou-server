import React from "react";
import { render, screen } from "@testing-library/react";
import Sidebar from "../Sidebar";
import { I18nProvider } from "../../lib/i18n/I18nProvider";

describe("Sidebar", () => {
  test("renders main nav items", () => {
    render(
      <I18nProvider>
        <Sidebar />
      </I18nProvider>
    );

    expect(screen.getByText(/Dashboard|Tableau de bord/i)).toBeInTheDocument();
    expect(screen.getByText(/Bottles|Bouteilles/i)).toBeInTheDocument();
    expect(screen.getByText(/Cellars|Celliers/i)).toBeInTheDocument();
  });
});
