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

  test("nav value toggles points and KRW on tap", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    const navButton = screen.getByRole("button", { name: "17.00 pt" });
    await user.click(navButton);
    expect(screen.getByRole("button", { name: "\u20A94,250,000" })).toBeInTheDocument();
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

  test("kospi input uses shifted-decimal entry and keeps latest value", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const view = render(<App />);

    await user.clear(screen.getByLabelText("KOSPI200"));
    await user.type(screen.getByLabelText("KOSPI200"), "36025");
    await user.click(screen.getByRole("button", { name: "Apply All" }));

    expect(screen.getByLabelText("KOSPI200")).toHaveValue("360.25");

    view.unmount();
    render(<App />);
    expect(screen.getByLabelText("KOSPI200")).toHaveValue("360.25");
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

