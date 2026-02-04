# Live Gold Price Dashboard - Nepal

A modern, high-performance dashboard built with **React 19** and **Tailwind CSS** that displays real-time gold prices in Nepali Rupees (NPR) per Tola.

## Features

- 📊 **Live Gold Price Chart** - Highcharts spline chart showing 30-day price history
- 🔄 **Auto-Refresh** - Updates every 10 minutes automatically
- 💰 **NPR Conversion** - Converts USD/Ounce to NPR/Tola with accurate calculations
- 🌙 **Dark Theme** - Modern, elegant dark UI design
- 📱 **Responsive** - Fully responsive for mobile and desktop
- 🔴 **Live Indicator** - Pulsing indicator showing live status
- ⚡ **Fast & Modern** - Built with React 19 and Vite

## Price Calculation Formula

The dashboard uses the following calculation steps:

1. Convert USD/Ounce to USD/Gram: `max_price / 31.1035`
2. Convert USD/Gram to NPR/Gram: `price_per_gm_usd × USD_TO_NPR_RATE`
3. Convert NPR/Gram to NPR/Tola: `price_per_gm_npr × 11.664`
4. Apply 10% Margin: `final_price = calculated_tola_price × 1.10`

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API Key:**
   
   Edit the `.env` file and add your Gold API key:
   ```
   VITE_GOLD_API_KEY=your_actual_api_key_here
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Technologies Used

- **React 19** - Latest React with modern hooks
- **Tailwind CSS** - Utility-first CSS framework
- **Highcharts** - Professional charting library
- **Vite** - Fast build tool and dev server
- **Lucide React** - Beautiful icons
- **Gold API** - Real-time gold price data
- **ExchangeRate API** - USD to NPR conversion

## API Sources

- Gold Prices: [gold-api.com](https://gold-api.com)
- Exchange Rates: [exchangerate-api.com](https://exchangerate-api.com)

## License

MIT
