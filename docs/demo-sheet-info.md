# Demo Google Sheet Info (POS Import)

Use this when configuring **Settings → Google Sheets** or the **POS Import → Google Sheets** flow for demos.

## OAuth vs Shared Sheet

- **OAuth (Sign in with Google)**  
  You connect once; the app uses your Google account to list and read spreadsheets. Reconnect only if you revoke access or the token expires.

- **Shared Sheet (Service account)**  
  No Google sign-in. Share the spreadsheet with the service account email; the app lists all spreadsheets shared with that email so you can pick one. Same flow as OAuth (pick sheet → pick tab → map → confirm), but access is by sharing, not OAuth.

## 1. Sheet configuration

| Setting         | Demo value   | Notes                                      |
|----------------|-------------|---------------------------------------------|
| **Spreadsheet ID** | *(your sheet ID)* | From URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit` |
| **Sheet name (tab)** | `Sheet1`     | Default; use any tab name if you prefer.   |
| **Header row** | `1`         | Row that contains column headers.           |

## 2. Required columns (header row)

The POS import expects these **target fields**. Your sheet can use the headers below (mapping wizard will suggest them), or similar names.

| Target field   | Example header in sheet | Type / format   |
|----------------|-------------------------|-----------------|
| `date`        | `Date` or `DATE`        | `YYYY-MM-DD`    |
| `highTax`     | `High Tax` or `HIGH TAX`| number          |
| `lowTax`      | `Low Tax` or `LOW TAX`  | number          |
| `saleTax`     | `Sale Tax` or `SALE TAX`| number          |
| `gas`         | `Gas` or `GAS`          | number          |
| `lottery`     | `Lottery Sold`          | number          |
| `creditCard`  | `Credit Card`           | number          |
| `lotteryPayout` | `Lottery Payout Cash`  | number          |
| `cashExpenses`| `Cash Expenses`         | number          |
| `notes`       | `Description` or `Notes`| text (optional) |

## 3. Sample header row (copy into row 1)

```text
Date,High Tax,Low Tax,Sale Tax,Gas,Lottery Sold,Credit Card,Lottery Payout Cash,Cash Expenses,Notes
```

## 4. Sample data rows (row 2+)

```text
2026-02-01,5420.25,780.75,345.10,915.00,620.00,4120.00,120.00,45.00,Weekend start
2026-02-02,4988.20,710.50,318.20,870.00,580.00,3965.00,100.00,35.00,Normal day
2026-02-03,5105.10,735.40,326.80,905.00,640.00,4050.00,110.00,52.00,Promo day
```

## 5. Creating a demo sheet

1. Create a new Google Sheet.
2. Put the **Sample header row** in row 1.
3. Add a few **Sample data rows** in row 2 and below.
4. **Share** the sheet:
   - **OAuth path**: Sign in with the same Google account used in the app.
   - **Service account path**: Share the sheet with the service account email (e.g. `retailsync-run-sa@...gserviceaccount.com`) as Viewer (or Editor if you need write).
5. In RetailSync: **Dashboard → Settings → Google Sheets** (or POS Import → Google Sheets) → enter the **Spreadsheet ID** from the sheet URL, set **Sheet name** and **Header row** (usually `Sheet1`, `1`), then **Verify access** and run the import.

## 6. Spreadsheet ID format

- Full URL: `https://docs.google.com/spreadsheets/d/1ABC...xyz123/edit`
- **Spreadsheet ID**: `1ABC...xyz123` (the segment between `/d/` and `/edit`).

Use only the ID in the app; the backend accepts either the full URL or the ID.
