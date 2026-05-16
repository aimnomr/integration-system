# MQTT Topics Documentation Convention
> This file defines the documentation standard for `MQTT_TOPICS.md`. Keep `MQTT_TOPICS.md` consistent with this convention, and update this file if the project's documentation style changes.

---

## Table of Contents Structure

Every `MQTT_TOPICS.md` must open with a Table of Contents listing every topic as a linked entry. The TOC is the primary navigation aid — if a topic exists in the file, it must appear here.

```markdown
## Table of Contents
- [amr/cmd/raw](#amrcmdraw)
- [amr/cmd/goal](#amrcmdgoal)
```

Anchor links follow GitHub Markdown rules: lowercase, spaces replaced with `-`, slashes replaced with nothing.  
Example: `amr/cmd/raw` → `#amrcmdraw`

---

## Per-Topic Entry Structure

Each topic is a level-3 heading followed by its fields in this exact order:

```markdown
### {topic/name}

**Direction:** {Publisher} → {Broker} → {Subscriber}  
**QoS:** {0 | 1 | 2}  
**Purpose:** {One sentence describing what this topic carries and why it exists.}

**Message Format:**
\```json
{
  "field_name": <type>
}
\```
```

No fields may be omitted. If a value is unknown, use `TBD`.

---

## Field Rules

### Direction
- List every hop in order, separated by ` → `.
- Use service names, not file names: `FastAPI`, `Node-RED`, `roslib.js`, `Mosquitto`, `React`.
- Example: `FastAPI → Mosquitto → Node-RED`

### QoS
- Single integer: `0`, `1`, or `2`. No label, no explanation.

### Purpose
- One sentence. Must answer: *what does this topic carry, and what triggers a message on it?*
- Do not describe the pipeline — Direction already covers that.

### Message Format
- Use a fenced `json` code block.
- Field values show the **type**, not a real value: `<string>`, `<float>`, `<integer>`, `<boolean>`, `<object>`, `<array>`.
- Exception: enum fields show the allowed values as a string literal, e.g. `"goal" | "waypoints" | "cancel"`.
- Nested objects are written inline with the same type convention.

**Example entry:**

```markdown
### amr/cmd/raw

**Direction:** FastAPI → Mosquitto → Node-RED  
**QoS:** 2  
**Purpose:** Carries raw commands from the REST API before Node-RED validates and routes them.

**Message Format:**
\```json
{
  "command": "goal" | "waypoints" | "cancel",
  "payload": <object>
}
\```
```

---

## File-Level Rules

- Filename: `MQTT_TOPICS.md`
- Location: `docs/schema/`
- Encoding: UTF-8, LF line endings
- Topics are grouped by pipeline direction: **Inbound (commands to robot)** first, **Outbound (data from robot)** second. Each group has a level-2 heading.
- Within a group, topics are listed in pipeline order (upstream first).
- No topic may appear more than once.
