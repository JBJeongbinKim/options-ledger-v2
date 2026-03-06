import { render, screen } from "@testing-library/react";
import { App } from "../App";

describe("App dashboard", () => {
  test("shows dashboard with default NAV", () => {
    window.localStorage.clear();
    render(<App />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getAllByText("17.00 pt")).toHaveLength(2);
    expect(screen.getAllByText("\u20A94,250,000")).toHaveLength(2);
  });

  test("shows open positions empty state", () => {
    window.localStorage.clear();
    render(<App />);

    expect(screen.getByText("Open Positions")).toBeInTheDocument();
    expect(screen.getByText("No open positions yet.")).toBeInTheDocument();
  });
});
