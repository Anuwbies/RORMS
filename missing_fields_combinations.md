# Add Schedule Modal: Missing Field Combinations

The following combinations will trigger visual validation indicators (such as a red `?` or red label text) in the Add Schedule Modal to warn the user about logically inconsistent or incomplete data entry for a schedule row:

## 1. Missing Subject Code
- **Condition:** A **Subject Title** is provided, but a **Subject Code** is NOT provided.
- **Visual Indicator:** The input placeholder for Subject Code changes to a red `?`.

## 2. Missing Subject Title
- **Condition:** A **Subject Code** is provided, but a **Subject Title** is NOT provided.
- **Visual Indicator:** The input placeholder for Subject Title changes to a red `?`.

## 3. Missing Section
- **Condition:** An **Instructor** is selected, but a **Section** is NOT provided.
- **Visual Indicator:** The input placeholder for Section changes to a red `?`.

## 4. Missing 1st Session Time
- **Condition:** A **2nd Session Instructor** is selected, but a **1st Session Time** is NOT selected.
- **Visual Indicator:** 
  - A red `?` appears next to the time in the closed Time cell (e.g., `?` instead of "Select").

## 5. Missing 2nd Session Time
- **Condition:** A **2nd Session Instructor** is selected, but a **2nd Session Time** is NOT selected.
- **Visual Indicator:** 
  - A red `?` appears next to the time in the closed Time cell (e.g., `09:00 AM - 10:30 AM / ?`).
  - The "2nd Session" label turns red when the Time dropdown is expanded.

## 6. Missing 1st Session Day
- **Condition:** A **1st Session Time** or **2nd Session Time** is selected, but NO days are selected.
- **Visual Indicator:** 
  - A red `?` appears in the closed Day cell.
  - The "1st Session" label turns red when the Day dropdown is expanded.

## 7. Missing 2nd Session Day
- **Condition:** The 1st and 2nd sessions have the SAME time, but only 1 day is selected.
- **Visual Indicator:** 
  - A red `?` appears in the closed Day cell (e.g., `Mon / ?`).
  - The "2nd Session" label turns red when the Day dropdown is expanded.

## 8. Missing 1st Session Room
- **Condition:** A **1st Session Building** is selected, but a **1st Session Room** is NOT selected.
- **Visual Indicator:**
  - A red `?` appears in place of the 1st session room code in the closed Room cell.
  - The "1st Session" label turns red when the Room dropdown is expanded.

## 9. Missing 2nd Session Room
- **Condition:** A **2nd Session Building** is selected, but a **2nd Session Room** is NOT selected.
- **Visual Indicator:**
  - A red `?` appears in place of the 2nd session room code in the closed Room cell (e.g., `ITB 101 / ?`).
  - The "2nd Session" label turns red when the Room dropdown is expanded.

## 10. Missing 2nd Session Format
- **Condition:** A **1st Session Format** is selected, but a **2nd Session Format** is NOT selected.
- **Visual Indicator:**
  - A red `?` appears in place of the 2nd session format in the closed Format cell (e.g., `Lec / ?`).
  - The "2nd Session" label turns red when the Format dropdown is expanded.
