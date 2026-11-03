# Webhooks

Your restaurant's menu system can send events to your own server as they happen: a guest checks in, an order is placed, a table is settled. Each event is an HTTP `POST` with a JSON body to an address you choose, so you can record the details in your own database.

## 1. Set it up

1. In the admin panel open **Restaurant settings → Webhook**.
2. Enter your **endpoint URL** (must be `https://` in production), switch the webhook **on**, and save.
3. A **signing secret** is created when you first save (it looks like `whsec_` followed by 48 characters). Use **Show** / **Copy** to get it, and store it on your server, for example as an environment variable. Do not put it in a web page or app.
4. Press **Send test**. Your server should receive a `webhook.test` event and answer `200`.

If the secret is ever exposed, press **New** to replace it. The old one stops working at once, so update your server straight away.

The same screen lists recent events with their status and, for failures, the reason. A failed event has a **Retry** button.

## 2. What we send

Every event is a `POST` with `Content-Type: application/json`.

### Headers

| Header | Meaning |
|---|---|
| `X-Webhook-Event` | The event name, e.g. `customer.checked_in`. Same as `event` in the body. |
| `X-Webhook-Id` | A unique id for this event. Same as `id` in the body. A retry carries the same id. |
| `X-Webhook-Timestamp` | When it was sent, in Unix seconds. Part of the signature. |
| `X-Webhook-Signature` | `sha256=` followed by the HMAC-SHA256 signature (see section 4). |
| `User-Agent` | `menu3d-webhook/1` |

### Body

Every event has the same envelope; only `data` differs.

```json
{
  "id": "6ae9abe6592d288f0f062499",
  "event": "customer.checked_in",
  "createdAt": "2026-11-03T09:39:50.172Z",
  "restaurant": { "slug": "laxmi-famous-kitchen", "name": "Laxmis kitchen" },
  "data": { }
}
```

| Field | Meaning |
|---|---|
| `id` | Unique event id (use it to ignore duplicates). |
| `event` | The event name. |
| `createdAt` | When the event happened (ISO 8601, UTC). |
| `restaurant` | Which restaurant it is from. |
| `data` | The details, different for each event (below). |

## 3. Events

| Event | When it is sent |
|---|---|
| `customer.checked_in` | A guest verified their mobile number (SMS code) and said how many people are seated. |
| `order.placed` | An order was placed. |
| `order.status_changed` | The kitchen moved an order to *preparing* or *served*. |
| `order.cancelled` | An order was cancelled by the guest or by the staff. |
| `table.closed` | The bill was settled and the table session ended. |
| `webhook.test` | You pressed **Send test**. |

### `customer.checked_in`

This is the customer record.

```json
{
  "sessionId": "6ae9abe5592d288f0f062492",
  "table": "Table 1",
  "phone": "+919000000001",
  "guests": 4,
  "otherPhones": ["+919876543210", "+919123456780"],
  "checkedInAt": "2026-11-03T09:39:49.234Z"
}
```

| Field | Meaning |
|---|---|
| `sessionId` | Id of this table visit. Orders and `table.closed` events for the visit refer back to it through the phone number. |
| `table` | Table name. |
| `phone` | The guest's own number, **verified by SMS**. Format `+91XXXXXXXXXX`. |
| `guests` | Number of people seated. |
| `otherPhones` | Optional numbers the guest gave for the others at the table. **Not verified.** May be empty. |
| `checkedInAt` | When the guest checked in. |

### `order.placed`

```json
{
  "orderId": "6ae9abe6592d288f0f0624a5",
  "table": "Table 1",
  "status": "new",
  "total": 399,
  "note": "less spicy",
  "items": [{ "name": "Tandoori chicken", "price": 399, "qty": 1 }],
  "customer": { "phone": "+919000000001", "guests": 4 },
  "placedAt": "2026-11-03T09:39:50.841Z"
}
```

- `customer` is `null` when the restaurant does not ask guests to check in.
- `total` and `price` are in the restaurant's currency, as plain numbers.
- A new order is held back from the kitchen for a short time (default 2 minutes) so the guest can still cancel. `order.placed` is sent when the order is placed, not when the kitchen sees it. If the guest cancels in that time you receive `order.cancelled` for the same `orderId`.

### `order.status_changed`

Same fields as `order.placed`, with the new `status`: `preparing` or `served`.

### `order.cancelled`

Same fields as `order.placed`, with `status: "cancelled"` and one more field:

| Field | Meaning |
|---|---|
| `cancelledBy` | `"customer"` or `"kitchen"`. |

### `table.closed`

```json
{
  "table": "Table 1",
  "total": 399,
  "paidAt": "2026-11-03T09:39:51.232Z",
  "customers": [{ "phone": "+919000000001", "guests": 4 }],
  "orders": [{ "orderId": "6ae9abe6592d288f0f0624a5", "total": 399 }]
}
```

`orders` lists the orders that were paid. Cancelled orders are not included in `total`.

### `webhook.test`

```json
{ "message": "This is a test event from your menu." }
```

## 4. Verify the signature

Anyone who learns your URL could send fake requests to it, so check the signature before you trust a request.

```
signature = "sha256=" + hex( HMAC-SHA256( secret, timestamp + "." + rawBody ) )
```

- `secret` is your signing secret.
- `timestamp` is the `X-Webhook-Timestamp` header.
- `rawBody` is the request body **exactly as received**, before any JSON parsing. Re-serialising it changes the bytes and the check fails.

Compare your result with `X-Webhook-Signature` using a constant-time comparison. Also reject a timestamp more than about 5 minutes away from your clock, so an old captured request cannot be replayed.

### Node.js (Express)

```js
import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.WEBHOOK_SECRET;
const app = express();

app.post('/hook', express.raw({ type: 'application/json' }), (req, res) => {
  const ts = req.header('x-webhook-timestamp');
  const got = req.header('x-webhook-signature') || '';
  const body = req.body.toString('utf8');

  const want = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  const ok = got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.sendStatus(401);

  const event = JSON.parse(body);
  // Ignore an event id you have already stored, then save event.data.
  res.sendStatus(200);
});

app.listen(3000);
```

### Python (Flask)

```python
import hashlib, hmac, os, time
from flask import Flask, request

SECRET = os.environ["WEBHOOK_SECRET"].encode()
app = Flask(__name__)

@app.post("/hook")
def hook():
    ts = request.headers.get("X-Webhook-Timestamp", "")
    got = request.headers.get("X-Webhook-Signature", "")
    body = request.get_data()  # raw bytes

    want = "sha256=" + hmac.new(SECRET, ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(got, want) or abs(time.time() - int(ts or 0)) > 300:
        return "", 401

    event = request.get_json()
    # Ignore an event id you have already stored, then save event["data"].
    return "", 200
```

## 5. Replying, retries and duplicates

- **Reply with any `2xx` status** as soon as you have stored the event. The reply body is ignored.
- You have **8 seconds** to answer. Do slow work after replying.
- Anything else counts as a failure: a non-`2xx` status, a timeout, a connection error. **Redirects are not followed** (a `3xx` is a failure), so give the final URL.
- A failed event is retried automatically **6 more times**, after 30 seconds, 2 minutes, 10 minutes, 30 minutes, 2 hours and 6 hours. After that it is marked failed and stays in the events list, where the restaurant can press **Retry**.
- **Delivery is at least once.** The same event can arrive more than once, for example if your reply was lost. Store the `id` of every event you handle and ignore an id you have already seen.
- **Order is not guaranteed.** After an outage, older events can arrive after newer ones. Use `createdAt` to put events in order.
- **Send test** sends once and does not retry. It shows you the status your server answered.

## 6. Data and privacy

- Phone numbers are Indian mobile numbers in the form `+91XXXXXXXXXX`.
- The guest's own number is verified by an SMS code. Numbers in `otherPhones` were typed by the guest and are not verified.
- The guest agrees at check-in that the restaurant may keep their number and visit details.
- Treat the data as personal data: store it securely and use it only as the guest agreed.

## 7. Testing

1. Use a receiver such as requestcatcher.com, beeceptor.com or your own endpoint, and press **Send test**.
2. Open a table link with check-in on, check in, place an order, then settle the table from the admin panel. You should see `customer.checked_in`, `order.placed` and `table.closed`.
3. To test failures, make your endpoint answer `500`, place an order, and watch the event retry in the events list. Then fix it and press **Retry**.
