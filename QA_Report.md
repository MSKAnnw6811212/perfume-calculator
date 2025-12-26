# Pixel & Pour Engineering Task List (v1.1.0 Fixes)

This document contains specific technical instructions for the AI Agent to fix bugs and implement features in the current codebase.

## PRIORITY 1: CRITICAL BUG FIXES (Safety & Data Integrity)
*These issues are blockers and must be fixed immediately.*

### 1. Fix Decimal Parsing & Locale Validation (Issue F-B1)
**Context:** The current parser fails with European formats (e.g., "33,3" becomes "333").
**Action Required:**
- Modify the numeric input parsing logic in JS/Python to handle both commas (`,`) and dots (`.`) as decimal separators.
- Ensure "33,3" is interpreted as "33.3".
- If the user enters a comma, auto-convert it to a dot or handle it correctly in calculations.

### 2. Prevent Negative Values (Issue F-B2)
**Context:** Users can enter negative numbers (e.g., "-5") into weight/density fields, breaking math.
**Action Required:**
- Update all numeric HTML input fields to include `min="0"`.
- Add JavaScript validation to strictly reject or sanitise negative inputs before calculation.
- Display a small error message if a negative value is attempted.

### 3. Fix CSV Importer Deduplication (Issue F-B4)
**Context:** Importing a CSV file twice creates duplicate ingredients.
**Action Required:**
- Modify the CSV import function to check if an ingredient already exists (match by Name or CAS number).
- If a match is found, update the existing entry OR skip it. Do NOT create a duplicate entry.

### 4. Fix CSV Delimiter Handling (Issue F-B3)
**Context:** Semicolon-delimited files are imported incorrectly as a single long string.
**Action Required:**
- Update the CSV parser to detect the delimiter automatically (comma vs. semicolon) OR strictly reject non-comma files with a clear error message: "Invalid format. Please use a comma-separated CSV."

---

## PRIORITY 2: REGULATORY DATA FIXES
*These issues undermine trust in the safety features.*

### 5. Fix Missing Regulatory Data Mapping (Issue F-B5, F-B6)
**Context:** Specific ingredients are failing to trigger IFRA/EU flags.
**Action Required:**
- **Rose Ketone (CAS 23696-85-7):** Ensure this maps to the correct IFRA category limits (approx 0.02–0.04%). Currently showing as "Compliant/No Limit."
- **Fig Leaf Absolute (CAS 68916-52-9):** Ensure this is flagged as PROHIBITED (0%).
- **Verbena Oil & Alanroot:** Ensure these trigger the "EU PROHIBITED" flag.
- Check the JSON/Data structure to ensure these specific CAS numbers are linked to their regulatory warnings.

---

## PRIORITY 3: UI & USABILITY IMPROVEMENTS
*High value "Quick Wins" to improve the user experience.*

### 6. Add "Active vs Solvent" Transparency (Issue F-M1)
**Context:** Users only see the final %, making it hard to understand dilution math.
**Action Required:**
- In the Pro Mode table, add visual indicators (columns or tooltips) that show the calculated **Active Mass (g)** and **Solvent Mass (g)** for each row.

### 7. Improve Recipe Deletion (Issue F-M2)
**Context:** Deleting a recipe is awkward and UI doesn't refresh.
**Action Required:**
- Add a "Confirm Deletion" popup/modal when clicking delete.
- Ensure the dropdown menu refreshes immediately after deletion so the old recipe name disappears.

### 8. Fix "Note Balance" Empty State (Issue F-L1)
**Context:** Shows "0% (N/A)" when empty.
**Action Required:**
- If no notes are assigned, hide the Note Balance card OR display a neutral state like "Unassigned."

---

## INSTRUCTIONS FOR AI AGENT
1. Read the priorities above.
2. Execute **Priority 1** fixes first. Verify that math is correct.
3. Execute **Priority 2** fixes.
4. Execute **Priority 3** fixes.
5. Do not delete any existing CSS styling unless necessary for the fix.
