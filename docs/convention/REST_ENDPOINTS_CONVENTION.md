# REST Endpoints Documentation Convention
> This file defines the documentation standard for `REST_ENDPOINTS.md`. Keep `REST_ENDPOINTS.md` consistent with this convention, and update this file if the project's documentation style changes.

---

## Table of Contents Structure

Every `REST_ENDPOINTS.md` must open with a Table of Contents grouped by HTTP method. Each entry links to its endpoint section.

```markdown
## Table of Contents

**POST**
- [POST /amr/goal](#post-amrgoal)

**GET**
- [GET /system/status](#get-systemstatus)
```

Anchor links follow GitHub Markdown rules: lowercase, spaces and slashes replaced with `-`.  
Example: `POST /amr/goal` → `#post-amrgoal`

---

## Per-Endpoint Entry Structure

Each endpoint is a level-3 heading using the format `### {METHOD} {/path}`, followed by its fields in this exact order:

```markdown
### {METHOD} {/path}

**Purpose:** {One sentence describing what this endpoint does and what triggers a call to it.}

**Path Parameters:**
| Name | Type | Description |
|------|------|-------------|
| {name} | {type} | {description} |

**Request Body:**
\```json
{
  "field_name": <type>
}
\```

**Response Body:**
\```json
{
  "field_name": <type>
}
\```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | {success condition} |
| 422 | Request body failed schema validation |
```

---

## Field Rules

### Purpose
- One sentence. Must answer: *what does this endpoint do, and who calls it?*
- Do not describe internal implementation — focus on the caller's perspective.

### Path Parameters
- **Include only if the endpoint has path parameters.** Omit the section entirely for endpoints with no path parameters.
- Use a markdown table with columns: `Name`, `Type`, `Description`.
- Types are plain strings: `string`, `integer`, `float`, `boolean`.

### Request Body
- Use a fenced `json` code block.
- Field values show the **type**, not a real value: `<string>`, `<float>`, `<integer>`, `<boolean>`, `<object>`, `<array>`.
- Exception: enum fields show allowed values as string literals, e.g. `"left" | "right"`.
- Nested objects are written inline with the same type convention.
- For `GET` endpoints with no body, write `**Request Body:** None` (no code block).

### Response Body
- Same formatting rules as Request Body.
- Always document the success response (HTTP 200).
- If a field is always a fixed string (e.g. a status label), show it as a string literal: `"ok"`.

### Status Codes
- Use a markdown table with columns: `Code`, `Condition`.
- Always include `200` and `422` at minimum for POST endpoints.
- For GET endpoints, `422` is omitted if there is no request body or query parameters.
- List codes in ascending order.

---

## File-Level Rules

- Filename: `REST_ENDPOINTS.md`
- Location: `schema/`
- Encoding: UTF-8, LF line endings
- Endpoints are grouped by HTTP method: `POST` group first, `GET` group second. Each group has a level-2 heading.
- Within a group, endpoints are listed in the order they appear in `schema/REST_ENDPOINTS.md`.
- An endpoint appears in this file only if it is listed in `schema/REST_ENDPOINTS.md`. That file is the source of truth for what exists.
