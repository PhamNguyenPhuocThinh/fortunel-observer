# Secret rotation log

One line per rotation. Never log the secret value itself — only the name, env,
date, actor, and reason. Append, never edit historical rows.

Format:

```
| YYYY-MM-DD | env     | secret name           | actor            | reason                         |
```

| Date       | Env     | Secret name           | Actor            | Reason                          |
|------------|---------|-----------------------|------------------|---------------------------------|
| _example_  | staging | `BETTER_AUTH_SECRET`  | hongphuc         | scheduled 90-day rotation       |

See `docs/deployment-guide.md` → "Secret rotation" for the procedure.
