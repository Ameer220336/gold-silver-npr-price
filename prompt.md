
Build a modern, high-performance dashboard using **React 19** and **Tailwind CSS**. The site should display a "Live Gold Price in Nepal (NPR)" chart using **Highcharts**.

### 1. Data Source & Processing logic:

* **API Fetching:** 
Fetch gold price history from `https://api.gold-api.com/history?symbol=XAU&groupBy=day&startTimestamp=[30_DAYS_AGO_UNIX]&endTimestamp=[TODAY_UNIX]`.
* Replace `[30_DAYS_AGO_UNIX]` and `[TODAY_UNIX]` with appropriate Unix timestamps for the last 30 days.
* Use an API key stored in an environment variable `GOLD_API_KEY` for '--header 'x-api-key: '
* Data Response Example:
```json
{
    [
        { "day": "2026-02-03 00:00:00", "max_price": "4994.500000" },
        { "day": "2026-02-02 00:00:00", "max_price": "4882.100100" },
        { "day": "2026-02-01 00:00:00", "max_price": "4891.399900" },
    ]
}
```
Fetch USD_TO_NPR price from `https://v6.exchangerate-api.com/v6/04924f3c8c51c3b925904ec3/latest/USD`.
* Data Response Example:
```json
{
  "result": "success",
  "documentation": "https://www.exchangerate-api.com/docs",
  "terms_of_use": "https://www.exchangerate-api.com/terms",
  "time_last_update_unix": 1770163202,
  "time_last_update_utc": "Wed, 04 Feb 2026 00:00:02 +0000",
  "time_next_update_unix": 1770249602,
  "time_next_update_utc": "Thu, 05 Feb 2026 00:00:02 +0000",
  "base_code": "USD",
  "conversion_rates": {
    "NPR": 144.5737,
  }
}
```
* **Constants:** - 
* Use `OZ_TO_GM = 31.1035`.
* Use `GM_TO_TOLA = 11.664`.


* **Calculation Formula:** For every object in the API response, calculate a new field `price_per_tola` using this exact logic:
1. Convert `max_price` (USD/Ounce) to USD/Gram: `(max_price / 31.1035)`.
2. Convert USD/Gram to NPR/Gram: `(price_per_gm_usd * 144.50)`.
3. Convert NPR/Gram to NPR/Tola: `(price_per_gm_npr * 11.664)`.
4. Apply 10% Margin: `final_price = calculated_tola_price * 1.10`.


* **Transformation:** The final array should look like: `{ day: "YYYY-MM-DD", price_per_tola: number }`.

### 2. UI Features:

* **Highcharts Integration:** Render a Spline (curved line) chart.
* X-axis: Dates.
* Y-axis: Price in NPR per Tola.
* Enable tooltips to show the price formatted with Nepalese currency (e.g., `Rs. 1,45,000`).


* **Auto-Refresh:** Use `setInterval` to re-fetch and re-calculate the data every **10 minutes**.
* **Modern Design:** Use a dark theme for the dashboard. Add a "Live" status indicator (pulsing red dot) and a "Last Updated" timestamp.
* **Loading State:** Show a clean skeleton loader or spinner while the initial data is being processed.

### 3. Technical Specs:

* Use **React 19** functional components, and new hooks like 'use' instead of `useEffect` where applicable.
* Use `lucide-react` for icons.
* Ensure the chart is fully responsive for mobile views.
* Handle the API key via a `.env` variable or a clear constant at the top of the file.

---

### Key Formulas Used in the Prompt:

To ensure the AI gets the math exactly right, I've embedded these steps:

### Next Step

Would you like me to generate the **actual React code** for the main `GoldDashboard.jsx` component right now?