# Dean Book — Anomaly Appearance Rules

All rules governing how anomaly pages appear in the Dean Coverage book.

---

## 1. Master Toggle

| Condition | Result |
|:---|:---|
| `isEasterEggsEnabled = false` | **No anomalies spawn at all.** Every department gets only its normal dean page. |
| `isEasterEggsEnabled = true` | Anomalies can spawn according to the rules below. |

---

## 2. Anomaly Pool

- There are **52 total anomaly types** (numbered 1–52), each corresponding to a unique visual easter egg.
- The pool is split into two groups each time a chunk pattern is generated:
  - **Forced anomalies** — manually selected via the UI (`selectedAnomalies`). These are **guaranteed** to appear.
  - **Available anomalies** — all 52 minus the forced ones. These are drawn randomly and consumed as they're used (no repeats within a single chunk).

---

## 3. Per-Department Slot Rules

Each department slot is evaluated **once**, in order. The first matching rule wins:

| Priority | Condition | Spawn Rate | Placement |
|:---:|:---|:---:|:---|
| 1 | Slot has a **forced anomaly** assigned | **100%** | Anomaly page paired with the dept page; 50/50 whether anomaly is on the left or right of the pair |
| 2 | No forced anomaly, but easter eggs enabled and `availableEggs` pool is non-empty | **50%** | Same as above — anomaly page paired with dept page, random left/right order |
| 3 | Eggs disabled, or 50% roll failed, or pool is empty | **0%** | Department page only (1 item, no anomaly) |

> [!NOTE]
> When an anomaly spawns, it adds **2 items** to the pattern (anomaly + department). Without an anomaly, only **1 item** is added. This means the total pattern length varies.

---

## 4. Forced Anomaly Distribution

- The selected anomalies list is **shuffled** (Fisher-Yates) before assignment.
- Department slot indices are also **shuffled** independently.
- Each forced anomaly is mapped to a random department slot, up to `min(forcedCount, departmentCount)`.
- If there are more forced anomalies than departments, the excess are not placed.

---

## 5. Odd-Length Padding

| Condition | Result |
|:---|:---|
| Pattern has an **odd** number of items (last dept page lands on the left side) | A 50% chance for a **blank page** or a 50% chance for an **anomaly** is appended to the right side to complete the spread. |
| Pattern has an **even** number of items | No padding needed. |

> [!NOTE]
> If Easter Eggs are disabled, the padding page (if needed) will always be a blank page.

---

## 6. No Double-Anomaly Spreads

After the full pattern (including padding) is built, a post-processing pass enforces:

> **At most one anomaly per page spread (left + right pair).**

| Condition | Action |
|:---|:---|
| Both pages in a spread are anomalies | Swap one anomaly with the nearest non-anomaly item (search forward first, then backward). |
| Only one or zero anomalies in a spread | No change. |

---

## 7. Chunk Regeneration

- The book uses **3 repeating chunks** of the pattern to enable infinite looping.
- When the user flips past a chunk boundary, the **departed chunk is regenerated** with a fresh call to `generateChunkPattern`.
- This means anomaly placement is **re-randomized** every time you loop back through a section — you won't see the same arrangement twice.

---

## 8. Anomaly Page Number

- Normal department pages get sequential numeric page numbers (`1, 2, 3, ...`).
- Anomaly pages get **alien text** as their page number — a random 2–4 character string from the set: `⍼⎈⏣⍙Ω≈ç√∫µ∂∆∏∑ΩXÆA-12░▒▓█`

---

## Summary Flow

```
For each department slot:
  ├─ Forced anomaly? → 100% spawn, random L/R placement
  ├─ 50% roll + eggs enabled + pool available? → spawn, random L/R
  └─ Otherwise → dept page only

After all slots:
  ├─ Odd length? → append blank page
  └─ Scan pairs → break up any double-anomaly spreads

On chunk boundary cross:
  └─ Regenerate the old chunk with fresh randomness
```
