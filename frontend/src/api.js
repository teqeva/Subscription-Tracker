// All calls use a relative /api path: Vite proxies it in dev, the ALB routes it in production.
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
      else if (typeof body?.detail === "string") message = body.detail;
    } catch {
      /* response had no JSON body */
    }
    throw new Error(message);
  }
  return res.json();
}

export const getSummary = () => request("/summary");

export const addSubscription = (payload) =>
  request("/subscriptions", { method: "POST", body: JSON.stringify(payload) });

export const listSubscriptions = () => request("/subscriptions");

export const setStatus = (id, status) =>
  request(`/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });