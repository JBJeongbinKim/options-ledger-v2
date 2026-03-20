import { render, screen, waitFor, within } from "@testing-library/react";
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

    expect(screen.getByText("Unrealized P&L")).toBeInTheDocument();
    expect(screen.getByText("Realized P&L")).toBeInTheDocument();
    expect(screen.queryByText("Cash")).not.toBeInTheDocument();
    expect(screen.queryByText("Option Values")).not.toBeInTheDocument();
  });

  test("nav value toggles points and KRW on tap", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    const navButton = screen.getByRole("button", { name: "17.00 / 17.00 pt" });
    await user.click(navButton);
    expect(screen.getByRole("button", { name: /4,250,000/ })).toBeInTheDocument();
  });

  test("adds trades and merges same option into one open position", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user, "1");
    await addBaseTrade(user, "2");

    expect(screen.getByRole("button", { name: /Thu Call 350/ })).toBeInTheDocument();
    expect(screen.getByText(/Qty 3/)).toBeInTheDocument();
  });

  test("updates position price from position action modal", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);
    await user.click(screen.getByRole("button", { name: /Thu Call 350/ }));

    const priceInput = screen.getByLabelText("Price");
    await user.clear(priceInput);
    await user.type(priceInput, "175");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(screen.getByText(/Value 1.75/)).toBeInTheDocument();
    expect(screen.getAllByText("+0.50 pt").length).toBeGreaterThan(0);
  });
  test("updates underlying/type/strike from position action modal", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);
    await user.click(screen.getByRole("button", { name: /Thu Call 350/ }));

    await user.click(screen.getByRole("button", { name: "Mon" }));
    await user.click(screen.getByRole("button", { name: "Put" }));
    await user.clear(screen.getByLabelText("Strike"));
    await user.type(screen.getByLabelText("Strike"), "360");
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(screen.getByRole("button", { name: /Mon Put 360/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thu Call 350/ })).not.toBeInTheDocument();
  });

  test("can add a put option from new trade form", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "New Trade" }));
    await user.click(screen.getByRole("button", { name: "Put" }));
    await user.click(screen.getByRole("button", { name: "Thu" }));
    await user.clear(screen.getByLabelText("Strike"));
    await user.type(screen.getByLabelText("Strike"), "330");
    await user.clear(screen.getByLabelText("Qty"));
    await user.type(screen.getByLabelText("Qty"), "1");
    await user.clear(screen.getByLabelText("Price"));
    await user.type(screen.getByLabelText("Price"), "100");
    await user.click(screen.getByRole("button", { name: "Save Trade" }));

    expect(screen.getByRole("button", { name: /Thu Put 330/ })).toBeInTheDocument();
  });

  test("allows editing parsed buy transaction before review", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      "",
      "/?underlying=Mon&type=Call&strike=350&qty=2&price=0.88&sentAt=2026-03-06T12:00:00.000Z",
    );
    render(<App />);

    expect(await screen.findByText("Parsed Transactions")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Mon Call 350/ }).find((button) => button.className.includes("pending-import-main"))!);
    expect(await screen.findByLabelText("Strike")).toBeInTheDocument();
    expect(screen.getByLabelText("Strike")).toHaveValue("350");
    expect(screen.getByLabelText("Qty")).toHaveValue("2");
    expect(screen.getByLabelText("Price")).toHaveValue("0.88");

    await user.click(screen.getByRole("button", { name: "Put" }));
    await user.clear(screen.getByLabelText("Strike"));
    await user.type(screen.getByLabelText("Strike"), "360");

    const pendingModal = screen.getByLabelText("Pending Transaction Modal");
    await user.click(within(pendingModal).getByRole("button", { name: "Confirm" }));
    await user.click(screen.getByRole("button", { name: "Save Trade" }));

    expect(screen.getByRole("button", { name: /Mon Put 360/ })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  test("parses broker weekly sms format into a pending transaction", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      "",
      "/?sms=%5BWeb%EB%B0%9C%EC%8B%A0%5D%0A%5B%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%5D%0A%EA%B9%80%EC%A0%95%EB%B9%88%EB%8B%98%0A%EB%A7%A4%EC%88%98%EC%B2%B4%EA%B2%B0%0A%EC%BD%94%EC%8A%A4%ED%94%BC%EC%9C%84%ED%81%B4%EB%A6%ACM%20C%202603W2%20%20%20857.5%0A1%EA%B3%84%EC%95%BD%0A0.88P%0A%EC%A0%84%EB%9F%89%EC%B2%B4%EA%B2%B0&sentAt=2026-03-20T10:00:00.000-04:00",
    );
    render(<App />);

    expect(await screen.findByText("Parsed Transactions")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Mon Call 858/ }).find((button) => button.className.includes("pending-import-main"))!);
    expect(await screen.findByLabelText("Strike")).toBeInTheDocument();
    expect(screen.getByLabelText("Strike")).toHaveValue("858");
    expect(screen.getByLabelText("Qty")).toHaveValue("1");
    expect(screen.getByLabelText("Price")).toHaveValue("0.88");
    expect(screen.getByRole("button", { name: "Mon" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Call" })).toHaveClass("active");
  });

  test("maps 코스피위클리 to Thu and 코스피위클리M to Mon", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      "",
      "/?sms=%5BWeb%EB%B0%9C%EC%8B%A0%5D%0A%5B%ED%95%9C%EA%B5%AD%ED%88%AC%EC%9E%90%5D%0A%EA%B9%80%EC%A0%95%EB%B9%88%EB%8B%98%0A%EB%A7%A4%EC%88%98%EC%B2%B4%EA%B2%B0%0A%EC%BD%94%EC%8A%A4%ED%94%BC%EC%9C%84%ED%81%B4%EB%A6%AC%20P%202603W3%20%20%20772.5%0A1%EA%B3%84%EC%95%BD%0A1.15P%0A%EC%A0%84%EB%9F%89%EC%B2%B4%EA%B2%B0&sentAt=2026-03-20T10:00:00.000-04:00",
    );
    render(<App />);

    expect(await screen.findByText("Parsed Transactions")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Thu Put 773/ }));
    expect(await screen.findByLabelText("Strike")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thu" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Put" })).toHaveClass("active");
  });

  test("opens position action prefilled from sell sms query", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const firstView = render(<App />);

    await user.click(screen.getByRole("button", { name: "New Trade" }));
    await user.click(screen.getByRole("button", { name: "Thu" }));
    await user.clear(screen.getByLabelText("Strike"));
    await user.type(screen.getByLabelText("Strike"), "350");
    await user.clear(screen.getByLabelText("Qty"));
    await user.type(screen.getByLabelText("Qty"), "2");
    await user.clear(screen.getByLabelText("Price"));
    await user.type(screen.getByLabelText("Price"), "100");
    await user.click(screen.getByRole("button", { name: "Save Trade" }));

    firstView.unmount();

    window.history.replaceState(
      {},
      "",
      "/?side=sell&underlying=Thu&type=Call&strike=350&qty=1&price=0.88&sentAt=2026-03-10T12:00:00.000Z",
    );
    render(<App />);

    expect(await screen.findByText("Parsed Transactions")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Thu Call 350/ }).find((button) => button.className.includes("pending-import-main"))!);
    expect(await screen.findByLabelText("Strike")).toBeInTheDocument();
    const pendingModal = screen.getByLabelText("Pending Transaction Modal");
    await user.click(within(pendingModal).getByRole("button", { name: "Confirm" }));

    expect(screen.getByText("Thu Call 350")).toBeInTheDocument();
    expect(screen.getByLabelText("Qty")).toHaveValue("1");
    expect(screen.getByLabelText("Price")).toHaveValue("0.88");
    expect(window.location.search).toBe("");
  });

  test("kospi input uses integer entry and keeps latest value", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    const view = render(<App />);

    await user.clear(screen.getByLabelText("KOSPI200"));
    await user.type(screen.getByLabelText("KOSPI200"), "36025");
    await user.click(screen.getByRole("button", { name: "Apply All" }));

    expect(screen.getByLabelText("KOSPI200")).toHaveValue("36025");

    view.unmount();
    render(<App />);
    expect(screen.getByLabelText("KOSPI200")).toHaveValue("36025");
  });

  test("hard reset clears ledger and sets NAV/Cash to entered points", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    await addBaseTrade(user);
    expect(screen.getByRole("button", { name: /Thu Call 350/ })).toBeInTheDocument();

    await user.click(screen.getByText("Reset"));
    await user.clear(screen.getByLabelText("Hard Reset NAV"));
    await user.type(screen.getByLabelText("Hard Reset NAV"), "20");
    await user.click(screen.getByRole("button", { name: "Hard Reset Ledger" }));

    expect(screen.getByText("No open positions yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "20.00 / 20.00 pt" })).toBeInTheDocument();
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




