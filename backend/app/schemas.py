from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Cycle = Literal["weekly", "monthly", "quarterly", "yearly"]
Status = Literal["active", "paused", "cancelled"]


class SubscriptionIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount_minor: int = Field(gt=0, lt=10**12)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    billing_cycle: Cycle
    next_due_date: date
    category: str = Field(min_length=1, max_length=50)
    status: Status = "active"
    last_billed_date: date | None = None

    @field_validator("name", "category")
    @classmethod
    def strip_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("last_billed_date")
    @classmethod
    def not_future(cls, v: date | None) -> date | None:
        if v and v > datetime.now(timezone.utc).date():
            raise ValueError("cannot be in the future")
        return v


class StatusUpdate(BaseModel):
    status: Status
