# Add Schedule Modal: Missing Field Combinations

The following combinations will trigger the inline visual validation (a red `?`) in the Add Schedule Modal to warn the user about logically inconsistent or incomplete data entry for a schedule row:

## 1. Missing 2nd Session Time
- **Condition:** A **2nd Session Instructor** is selected, but a **2nd Session Time** is NOT selected.
- **Visual Indicator:** 
  - A red `?` appears next to the time in the closed Time cell (e.g., `09:00 AM - 10:30 AM / ?`).
  - A red `?` appears next to the "2nd Session Time" label when the Time dropdown is expanded.

## 4. Missing 2nd Session Day
- **Condition:** The 1st and 2nd sessions have the SAME time, but only 1 day (or 0 days) is selected.
- **Visual Indicator:** 
  - A red `?` appears in the closed Day cell (e.g., `Mon / ?` or `? / ?`).

## 2. Missing 1st Session Room
- **Condition:** A **1st Session Building** is selected, but a **1st Session Room** is NOT selected.
- **Visual Indicator:**
  - A red `?` appears in place of the 1st session room code in the closed Room cell.
  - A red `?` appears next to the "1st Session" label when the Room dropdown is expanded.

## 3. Missing 2nd Session Room
- **Condition:** A **2nd Session Building** is selected, but a **2nd Session Room** is NOT selected.
- **Visual Indicator:**
  - A red `?` appears in place of the 2nd session room code in the closed Room cell (e.g., `ITB 101 / ?`).
  - A red `?` appears next to the "2nd Session" label when the Room dropdown is expanded.
