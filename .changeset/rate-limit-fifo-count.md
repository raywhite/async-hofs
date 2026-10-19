---
'@raywhite/async-hofs': major
---

`createRateLimitedFn`:

- Breaking: `queued` is now the number of queued calls, as for the other hofs, rather than the queue array.
- Fix: queued calls run in the order they were made; the most recent ran first, so under load the earliest could wait indefinitely.
