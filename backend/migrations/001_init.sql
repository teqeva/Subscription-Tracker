CREATE TABLE subscriptions (
    id               BIGSERIAL PRIMARY KEY,
    name             TEXT        NOT NULL,
    amount_minor     BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency         CHAR(3)     NOT NULL,
    billing_cycle    TEXT        NOT NULL CHECK (billing_cycle IN ('weekly','monthly','quarterly','yearly')),
    next_due_date    DATE        NOT NULL,
    category         TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
    last_billed_date DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_next_due ON subscriptions (next_due_date);
