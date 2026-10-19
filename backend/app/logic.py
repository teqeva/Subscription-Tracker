"""Pure business rules. No database or web code here, so it is trivial to unit test."""
from calendar import monthrange
from datetime import date, timedelta
from fractions import Fraction

UPCOMING_DAYS = 7

# Multiply a billing amount by this to get its monthly equivalent.
MONTHLY_FACTOR = {
    "weekly": Fraction(52, 12),
    "monthly": Fraction(1),
    "quarterly": Fraction(1, 3),
    "yearly": Fraction(1, 12),
}
STEP_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12}


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    year, month = d.year + m // 12, m % 12 + 1
    return date(year, month, min(d.day, monthrange(year, month)[1]))


def roll_forward(due: date, cycle: str, today: date) -> date:
    """If a due date is in the past, move it to the next future occurrence (read time only)."""
    if due >= today:
        return due
    if cycle == "weekly":
        return due + timedelta(weeks=-(-(today - due).days // 7))
    step, k = STEP_MONTHS[cycle], 1
    while (nxt := add_months(due, step * k)) < today:  # from the original date: no day drift
        k += 1
    return nxt


def summarize(rows: list[dict], today: date) -> dict:
    """Monthly total per currency (active only) and renewals due in the next 7 days, inclusive."""
    totals: dict[str, Fraction] = {}
    upcoming = []
    for r in rows:
        if r["status"] != "active":
            continue
        totals[r["currency"]] = totals.get(r["currency"], 0) + r["amount_minor"] * MONTHLY_FACTOR[r["billing_cycle"]]
        due = roll_forward(r["next_due_date"], r["billing_cycle"], today)
        days = (due - today).days
        if 0 <= days <= UPCOMING_DAYS:
            upcoming.append(
                {
                    "id": r["id"],
                    "name": r["name"],
                    "amount_minor": r["amount_minor"],
                    "currency": r["currency"],
                    "billing_cycle": r["billing_cycle"],
                    "next_due_date": due,
                    "days_remaining": days,
                }
            )
    upcoming.sort(key=lambda u: (u["next_due_date"], u["name"]))
    return {"monthly_totals_minor": {c: round(v) for c, v in totals.items()}, "upcoming": upcoming}
