import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";

async function addBaseTrade(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "New Trade" }));
  await user.click(screen.getByRole("button", { name: "Thu" }));
  await user.clear(screen.getByLabelText("Strike"));
  await user.type(screen.getByLabelText("Strike"), "350");
  await user.clear(screen.getByLabelText("Qty"));
  await user.type(screen.getByLabelText("Qty"), "1");
  await user.clear(screen.getByLabelText("Price"));
  await user.type(screen.getByLabelText("Price"), "1.25");
  await user.click(screen.getByRole("button", { name: "Save Trade" }));
}

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

    await addBaseTrade(user);

    expect(screen.getByText("Thu Call 350")).toBeInTheDocument();
    expect(screen.getByText("1 @ 1.25")).toBeInTheDocument();
    expect(screen.getByText("15.75 pt")).toBeInTheDocument();
  });

  test("updates position price from position action modal", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);
    await user.click(screen.getByText("Thu Call 350"));

    expect(screen.getByRole("heading", { name: "Position Action" })).toBeInTheDocument();

    const priceInput = screen.getByLabelText("Action Price");
    await user.clear(priceInput);
    await user.type(priceInput, "1.75");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(screen.getByText("1 @ 1.75")).toBeInTheDocument();
    expect(screen.getByText("0.50 pt")).toBeInTheDocument();
  });

  test("partially closes a position and updates realized P&L", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "New Trade" }));
    await user.click(screen.getByRole("button", { name: "Thu" }));
    await user.clear(screen.getByLabelText("Strike"));
    await user.type(screen.getByLabelText("Strike"), "350");
    await user.clear(screen.getByLabelText("Qty"));
    await user.type(screen.getByLabelText("Qty"), "2");
    await user.clear(screen.getByLabelText("Price"));
    await user.type(screen.getByLabelText("Price"), "1.00");
    await user.click(screen.getByRole("button", { name: "Save Trade" }));

    await user.click(screen.getByText("Thu Call 350"));

    await user.clear(screen.getByLabelText("Action Price"));
    await user.type(screen.getByLabelText("Action Price"), "1.50");
    await user.clear(screen.getByLabelText("Action Qty"));
    await user.type(screen.getByLabelText("Action Qty"), "1");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByText("1 @ 1.50")).toBeInTheDocument();
    expect(screen.getByText("16.50 pt")).toBeInTheDocument();
    expect(screen.getAllByText("0.50 pt").length).toBeGreaterThan(0);
  });
});
