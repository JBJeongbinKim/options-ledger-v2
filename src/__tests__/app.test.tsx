import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";

describe("App dashboard", () => {
  test("shows dashboard with default NAV", () => {
    window.localStorage.clear();
    render(<App />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getAllByText("17.00 pt")).toHaveLength(2);
    expect(screen.getAllByText("\u20A94,250,000")).toHaveLength(2);
  });

  test("adds a trade and renders an open position", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "New Trade" }));

    expect(screen.getByRole("heading", { name: "New Trade" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Thu" }));

    const strikeInput = screen.getByLabelText("Strike");
    const qtyInput = screen.getByLabelText("Qty");
    const priceInput = screen.getByLabelText("Price");

    await user.clear(strikeInput);
    await user.type(strikeInput, "350");
    await user.clear(qtyInput);
    await user.type(qtyInput, "1");
    await user.clear(priceInput);
    await user.type(priceInput, "1.25");

    await user.click(screen.getByRole("button", { name: "Save Trade" }));

    expect(screen.getByText("Thu Call 350")).toBeInTheDocument();
    expect(screen.getByText("1 @ 1.25")).toBeInTheDocument();
    expect(screen.getByText("15.75 pt")).toBeInTheDocument();
  });
});
