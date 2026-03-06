import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";

async function addBaseTrade(user: ReturnType<typeof userEvent.setup>, qty = "1"): Promise<void> {
  await user.click(screen.getByRole("button", { name: "New Trade" }));
  await user.click(screen.getByRole("button", { name: "Thu" }));
  await user.clear(screen.getByLabelText("Strike"));
  await user.type(screen.getByLabelText("Strike"), "350");
  await user.clear(screen.getByLabelText("Qty"));
  await user.type(screen.getByLabelText("Qty"), qty);
  await user.clear(screen.getByLabelText("Price"));
  await user.type(screen.getByLabelText("Price"), "125");
  await user.click(screen.getByRole("button", { name: "Save Trade" }));
}

describe("App dashboard", () => {
  test("shows top metrics with revised labels", () => {
    window.localStorage.clear();
    render(<App />);

    expect(screen.getByText("Option Values")).toBeInTheDocument();
    expect(screen.getByText("Realized P&L")).toBeInTheDocument();
    expect(screen.queryByText("Realized Week")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  test("adds trades and merges same option into one open position", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user, "1");
    await addBaseTrade(user, "2");

    expect(screen.getByText("Thu Call 350")).toBeInTheDocument();
    expect(screen.getByText(/Qty 3/)).toBeInTheDocument();
  });

  test("updates position price from position action modal", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);
    await user.click(screen.getByText("Thu Call 350"));

    const priceInput = screen.getByLabelText("Action Price");
    await user.clear(priceInput);
    await user.type(priceInput, "175");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(screen.getByText(/Mkt 1.75/)).toBeInTheDocument();
    expect(screen.getAllByText("+0.50 pt").length).toBeGreaterThan(0);
  });

  test("apply-all updates open positions using intrinsic values", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);

    await user.type(screen.getByLabelText("KOSPI200"), "360");
    await user.click(screen.getByRole("button", { name: "Apply All" }));

    expect(screen.getByText(/Mkt 10.00/)).toBeInTheDocument();
    expect(screen.getAllByText("+8.75 pt").length).toBeGreaterThan(0);
  });

  test("hard reset clears ledger and sets NAV/Cash to entered points", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);
    expect(screen.getByText("Thu Call 350")).toBeInTheDocument();

    await user.click(screen.getByText("Reset"));
    await user.clear(screen.getByLabelText("Hard Reset NAV"));
    await user.type(screen.getByLabelText("Hard Reset NAV"), "20");
    await user.click(screen.getByRole("button", { name: "Hard Reset Ledger" }));

    expect(screen.getByText("No open positions yet.")).toBeInTheDocument();
    expect(screen.getAllByText("20.00 pt").length).toBeGreaterThan(0);
  });

  test("shows processing indicator during mutation reconcile", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);

    expect(screen.getByRole("status")).toHaveTextContent("Processing...");
    await waitFor(() => {
      expect(screen.queryByText("Processing...")).not.toBeInTheDocument();
    });
  });
});
