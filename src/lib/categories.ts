// Shared by server and client code, so keep this file free of Node imports.

/** The few spending categories everything is sorted into – quick to sort, easy to read. */
export const SPENDING = ["Bills", "Groceries", "Transport", "Eating out & fun", "Home & family", "Other"] as const;
/** Money that isn't spending: it doesn't count against any pot. */
export const NOT_SPENDING = ["Income", "Savings", "Transfers"] as const;
export const CATEGORIES: string[] = [...SPENDING, ...NOT_SPENDING];

export const CATEGORY_INFO: Record<string, { icon: string; hint: string }> = {
  "Bills": { icon: "🧾", hint: "Mortgage, rates, power, phone, insurance, loans, subscriptions" },
  "Groceries": { icon: "🛒", hint: "Supermarket, butcher, meal prep" },
  "Transport": { icon: "⛽", hint: "Fuel, car costs, parking, fares" },
  "Eating out & fun": { icon: "🍔", hint: "Takeaways, cafes, outings, holidays, gifts" },
  "Home & family": { icon: "🏠", hint: "Kids, health, clothes, household, garden, projects" },
  "Other": { icon: "📦", hint: "Anything else" },
  "Income": { icon: "💰", hint: "Pay, refunds, money in" },
  "Savings": { icon: "🐷", hint: "Moved into savings or investing" },
  "Transfers": { icon: "🔁", hint: "Between your own accounts, card repayments – not spending" },
};

export const isSpending = (c: string | null | undefined) => !!c && (SPENDING as readonly string[]).includes(c);
