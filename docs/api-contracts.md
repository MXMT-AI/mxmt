# API Contracts

## Error Envelope

API errors should use this JSON shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": ["optional validation detail"]
}
```

Common codes:

| Code | Status | Meaning |
| --- | ---: | --- |
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `VALIDATION_ERROR` | 400 | Request body is syntactically valid but does not match the route contract |
| `UNAUTHORIZED` | 401 | User is not authenticated |
| `FORBIDDEN` | 403 | User does not have the required role |
| `NOT_FOUND` | 404 | Requested tenant-scoped resource does not exist |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server failure |

Validation errors include `details` with field-level messages.

## Validated Mutation Routes

| Route | Method | Contract |
| --- | --- | --- |
| `/api/ai` | `POST` | `messages[]` with `role` and `content`; optional `systemPrompt` |
| `/api/onboarding` | `POST` | `businessModel` enum and `answers` object |
| `/api/export/sheets` | `POST` | `title`, `values` 2D array, optional `sheetName` |
| `/api/planner/cart` | `PUT` | `items` array |
| `/api/planner/brands` | `POST` | required `name`, optional numeric/commercial fields |
| `/api/planner/brands/:id` | `PUT` | optional brand fields with numeric bounds |
| `/api/calendar/events` | `POST` | `weekKey`, `rowKey`, `type`, `label` |
| `/api/calendar/events/:id` | `PATCH` | at least one of `type` or `label` |
| `/api/agents/reordering/simulate` | `POST` | `brandId`, positive `qtyMultiplier`, optional dates |
| `/api/agents/repricing/simulate` | `POST` | `brandId`, discount/duration bounds, optional dates |
| `/api/planner/catalogs/upload` | `POST` | non-empty file up to 10 MB and tenant-owned `brandId` |

## Implementation Notes

- Use helpers from `lib/api-contracts.ts` for new API routes.
- Do not call `request.json()` directly in mutation routes; use `parseJsonBody`.
- Return `validationError(details)` for invalid payloads.
- Return `apiError(message, status, code)` for expected failures.
- Return `serverError()` or `serverError(message)` for unexpected failures.
