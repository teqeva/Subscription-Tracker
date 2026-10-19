from datetime import date

from app.logic import add_months, roll_forward, summarize

TODAY = date(2026, 10, 19)


def sub(**kw):
    base = dict(id=1, name="Spotify", amount_minor=1000, currency="USD", billing_cycle="monthly",
                next_due_date=TODAY, status="active")
    return {**base, **kw}


def total(rows):
    return summarize(rows, TODAY)["monthly_totals_minor"]


def test_each_cycle_normalizes_to_monthly():
    assert total([sub(billing_cycle="monthly", amount_minor=1200)]) == {"USD": 1200}
    assert total([sub(billing_cycle="quarterly", amount_minor=3000)]) == {"USD": 1000}
    assert total([sub(billing_cycle="yearly", amount_minor=12000)]) == {"USD": 1000}
    assert total([sub(billing_cycle="weekly", amount_minor=1200)]) == {"USD": 5200}  # 1200 * 52 / 12


def test_totals_are_grouped_per_currency_and_skip_stopped():
    rows = [sub(), sub(id=2, currency="KES", amount_minor=50000), sub(id=3, status="cancelled"), sub(id=4, status="paused")]
    assert total(rows) == {"USD": 1000, "KES": 50000}


def test_upcoming_window_boundaries():
    rows = [
        sub(id=1, name="today", next_due_date=date(2026, 10, 19)),
        sub(id=2, name="day7", next_due_date=date(2026, 10, 26)),
        sub(id=3, name="day8", next_due_date=date(2026, 10, 27)),
    ]
    names = [u["name"] for u in summarize(rows, TODAY)["upcoming"]]
    assert names == ["today", "day7"]


def test_empty():
    assert summarize([], TODAY) == {"monthly_totals_minor": {}, "upcoming": []}


def test_overdue_rolls_forward():
    assert roll_forward(date(2026, 9, 25), "monthly", TODAY) == date(2026, 10, 25)
    assert roll_forward(date(2026, 10, 1), "weekly", TODAY) == date(2026, 10, 22)
    assert roll_forward(date(2025, 10, 20), "yearly", TODAY) == date(2026, 10, 20)


def test_month_end_does_not_drift():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert roll_forward(date(2026, 1, 31), "monthly", date(2026, 3, 1)) == date(2026, 3, 31)
