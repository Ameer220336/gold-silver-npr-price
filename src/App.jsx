import { useState, useEffect, useCallback } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { RefreshCw, TrendingUp, Table, LineChart, Coins } from "lucide-react";
import NepaliDate from "nepali-date-converter";

// Constants
// const OZ_TO_GM = 28.3495;
const OZ_TO_GM = 31.1035; // Troy ounce to grams
const GM_TO_TOLA = 11.664;
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes cache duration
const disclaimer = "!!! Disclaimer: For informational use only. Prices are based on daily peak rates and may vary from local market prices.  !!!";

// Cache utilities
const getCachedData = (metal) => {
    try {
        const cached = localStorage.getItem(`priceData_${metal}`);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();
            if (now - timestamp < CACHE_DURATION) {
                return data;
            }
        }
    } catch (error) {
        console.error('Error reading cache:', error);
    }
    return null;
};

const setCachedData = (metal, data) => {
    try {
        localStorage.setItem(`priceData_${metal}`, JSON.stringify({
            data,
            timestamp: Date.now(),
        }));
    } catch (error) {
        console.error('Error writing cache:', error);
    }
};

// Utility functions
const get30DaysAgoTimestamp = () => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return Math.floor(date.getTime() / 1000);
};

const getTodayTimestamp = () => Math.floor(Date.now() / 1000);

const formatRS = (value) => {
    // Nepali number formatting: first group of 3 from right, then groups of 2
    const numStr = Math.round(value).toString();
    let result = '';
    let count = 0;
    
    for (let i = numStr.length - 1; i >= 0; i--) {
        if (count === 3 || (count > 3 && (count - 3) % 2 === 0)) {
            result = ',' + result;
        }
        result = numStr[i] + result;
        count++;
    }
    
    return 'RS ' + result;
};

// Convert AD date string (YYYY-MM-DD) to BS format
const convertToNepaliDate = (adDateString) => {
    try {
        const [year, month, day] = adDateString.split('-').map(Number);
        const nepaliDate = new NepaliDate(new Date(year, month - 1, day));
        return nepaliDate.format('YYYY-MM-DD', 'np'); // BS format
    } catch (error) {
        console.error('Error converting to Nepali date:', error);
        return adDateString; // Fallback to AD date
    }
};

// Format Nepali date for display (YYYY Magh DD)
const formatNepaliDateDisplay = (adDateString) => {
    try {
        const [year, month, day] = adDateString.split('-').map(Number);
        const nepaliDate = new NepaliDate(new Date(year, month - 1, day));
        const nepaliMonths = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
        const bsYear = nepaliDate.getYear();
        const bsMonth = nepaliDate.getMonth();
        const bsDay = nepaliDate.getDate();
        return `${bsYear} ${nepaliMonths[bsMonth]} ${bsDay}`;
    } catch (error) {
        console.error('Error formatting Nepali date:', error);
        return adDateString;
    }
};

// Calculate price per tola with margin
const calculatePricePerTola = (maxPriceUSD, usdToNprRate) => {
    return Math.round(calculatePricePerGram(maxPriceUSD, usdToNprRate) * GM_TO_TOLA); 
};

// Calculate price per gram with margin
const calculatePricePerGram = (maxPriceUSD, usdToNprRate) => {
    const pricePerGmUSD = maxPriceUSD / OZ_TO_GM;
    const pricePerGmNPR = pricePerGmUSD * usdToNprRate;
    return Math.round(pricePerGmNPR * 1.105); // 10.5% margin
};

function App() {
    const [goldData, setGoldData] = useState([]);
    const [silverData, setSilverData] = useState([]);
    const [loadingGold, setLoadingGold] = useState(true);
    const [loadingSilver, setLoadingSilver] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [usdToNpr, setUsdToNpr] = useState(null);
    const [viewMode, setViewMode] = useState('tola'); // 'tola' or 'gms'

    // Fetch and process metal price data
    const fetchMetalData = useCallback(async (metal, forceRefresh = false) => {
        try {
            const setLoading = metal === 'XAU' ? setLoadingGold : setLoadingSilver;
            const setData = metal === 'XAU' ? setGoldData : setSilverData;
            
            setLoading(true);
            setError(null); // Clear any previous errors
            
            // Check cache first if not forcing refresh
            if (!forceRefresh) {
                const cachedData = getCachedData(metal);
                if (cachedData && cachedData.chartData) {
                    // Validate that cached data has all required fields
                    const hasValidData = cachedData.chartData.every(item => 
                        item.price_per_tola !== undefined && 
                        item.price_per_gram !== undefined &&
                        !isNaN(item.price_per_gram) &&
                        item.price_per_gram > 0
                    );
                    
                    if (hasValidData) {
                        setData(cachedData.chartData);
                        if (metal === 'XAU') {
                            setUsdToNpr(cachedData.usdToNpr);
                            setLastUpdated(new Date(cachedData.lastUpdated));
                        }
                        setLoading(false);
                        return;
                    } else {
                        // Invalid cache, clear it
                        localStorage.removeItem(`priceData_${metal}`);
                        console.log(`Cleared invalid cache for ${metal}`);
                    }
                }
            }

            // Fetch both APIs in parallel for better performance
            const [exchangeResponse, metalResponse] = await Promise.all([
                fetch(
                    "https://v6.exchangerate-api.com/v6/04924f3c8c51c3b925904ec3/latest/USD",
                ),
                fetch(
                    `/api/gold/history?symbol=${metal}&startTimestamp=${get30DaysAgoTimestamp()}&endTimestamp=${getTodayTimestamp()}&groupBy=day`,
                ),
            ]);
            
            if (!exchangeResponse.ok || !metalResponse.ok) {
                throw new Error(`Failed to fetch ${metal} data from API`);
            }

            const [exchangeData, metalPriceData] = await Promise.all([
                exchangeResponse.json(),
                metalResponse.json(),
            ]);

            const USD_TO_NPR = exchangeData.conversion_rates.NPR;
            
            if (metal === 'XAU') {
                setUsdToNpr(USD_TO_NPR);
            }

            // Process and calculate NPR per Tola and Gram
            const processedData = metalPriceData
                .map((item) => {
                    const maxPrice = parseFloat(item.max_price);
                    const pricePerTola = calculatePricePerTola(maxPrice, USD_TO_NPR);
                    const pricePerGram = calculatePricePerGram(maxPrice, USD_TO_NPR);
                    
                    return {
                        day: item.day.split(" ")[0], // Extract date (YYYY-MM-DD)
                        price_usd: maxPrice,
                        price_per_tola: pricePerTola,
                        price_per_gram: pricePerGram,
                    };
                })
                .filter(item => 
                    !isNaN(item.price_usd) && item.price_usd > 0 &&
                    !isNaN(item.price_per_tola) && item.price_per_tola > 0 &&
                    !isNaN(item.price_per_gram) && item.price_per_gram > 0
                )
                .sort((a, b) => new Date(a.day) - new Date(b.day));

            // Calculate percentage change after sorting (based on tola - same % for both units)
            const dataWithPercentChange = processedData.map((item, index) => {
                let percentChange = 0;
                if (index > 0) {
                    const prevPrice = processedData[index - 1].price_per_tola;
                    const currentPrice = item.price_per_tola;
                    if (prevPrice > 0 && !isNaN(prevPrice) && !isNaN(currentPrice)) {
                        percentChange = ((currentPrice - prevPrice) / prevPrice) * 100;
                    }
                }
                return {
                    ...item,
                    percentChange: isNaN(percentChange) ? 0 : percentChange,
                };
            });

            const now = new Date();
            
            // Validate data before setting state
            if (dataWithPercentChange.length === 0) {
                throw new Error(`No valid ${metal} price data after processing`);
            }
            
            // Log sample data for debugging (only in development)
            if (process.env.NODE_ENV !== 'production' && dataWithPercentChange.length > 0) {
                const lastItem = dataWithPercentChange[dataWithPercentChange.length - 1];
                console.log(`${metal} Latest:`, {
                    date: lastItem.day,
                    usd: lastItem.price_usd,
                    tola: lastItem.price_per_tola,
                    gram: lastItem.price_per_gram,
                    change: lastItem.percentChange
                });
            }
            
            setData(dataWithPercentChange);
            if (metal === 'XAU') {
                setLastUpdated(now);
            }
            setError(null); // Clear error on success
            setLoading(false);
            
            // Cache the data
            setCachedData(metal, {
                chartData: dataWithPercentChange,
                usdToNpr: USD_TO_NPR,
                lastUpdated: now.toISOString(),
            });
        } catch (err) {
            console.error(`Error fetching ${metal} data:`, err);
            setError(err.message || "Failed to fetch data");
            const setLoading = metal === 'XAU' ? setLoadingGold : setLoadingSilver;
            setLoading(false);
        }
    }, []);

    // Fetch both metals data
    const fetchAllData = useCallback((forceRefresh = false) => {
        fetchMetalData('XAU', forceRefresh);
        fetchMetalData('XAG', forceRefresh);
    }, [fetchMetalData]);

    // Initial fetch and setup auto-refresh
    useEffect(() => {
        fetchAllData();
        const interval = setInterval(() => fetchAllData(true), REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchAllData]);

    // Create chart options for a specific metal
    const createChartOptions = (chartData, metal) => ({
        chart: {
            type: "spline",
            backgroundColor: "#1f2937",
            style: {
                fontFamily: "inherit",
            },
            height: 300,
        },
        title: {
            text: `${metal === 'XAU' ? 'Gold' : 'Silver'} Price per ${viewMode === 'tola' ? 'Tola' : 'Gram'} (RS)`,
            style: {
                color: "#f9fafb",
                fontSize: "18px",
                fontWeight: "bold",
            },
        },
        subtitle: {
            text: "Last 30 Days",
            style: {
                color: "#9ca3af",
                fontSize: "12px",
            },
        },
        xAxis: {
            categories: chartData.map((item) => formatNepaliDateDisplay(item.day)),
            labels: {
                style: {
                    color: "#9ca3af",
                    fontSize: "10px",
                },
                rotation: -45,
            },
            gridLineColor: "#374151",
        },
        yAxis: {
            title: {
                text: "Price (RS)",
                style: {
                    color: "#9ca3af",
                },
            },
            labels: {
                style: {
                    color: "#9ca3af",
                    fontSize: "10px",
                },
                formatter: function () {
                    return formatRS(this.value);
                },
            },
            gridLineColor: "#374151",
        },
        tooltip: {
            backgroundColor: "#111827",
            borderColor: "#4b5563",
            style: {
                color: "#f9fafb",
            },
            formatter: function () {
                const dataIndex = this.point.index;
                const dataPoint = chartData[dataIndex];
                return `<b>${this.x}</b><br/>Price: ${formatRS(this.y)}<br/>USD/oz: $${dataPoint?.price_usd?.toFixed(2)}`;
            },
        },
        plotOptions: {
            spline: {
                lineWidth: 2,
                marker: {
                    enabled: true,
                    radius: 3,
                },
            },
        },
        series: [
            {
                name: `${metal === 'XAU' ? 'Gold' : 'Silver'} Price`,
                data: chartData.map((item) => viewMode === 'tola' ? item.price_per_tola : item.price_per_gram),
                color: metal === 'XAU' ? "#fbbf24" : "#cbd5e1",
                marker: {
                    fillColor: metal === 'XAU' ? "#fbbf24" : "#cbd5e1",
                },
            },
        ],
        credits: {
            enabled: false,
        },
        legend: {
            enabled: false,
        },
    });

    // Render metal card (chart or table)
    const renderMetalCard = (chartData, metal, loading) => {
        const isGold = metal === 'XAU';
        const metalName = isGold ? 'Gold' : 'Silver';
        const colorClass = isGold ? 'yellow' : 'gray';

        return (
            <div className="flex-1 min-w-[300px]">
                {/* Current Price Card at Top */}
                {chartData.length > 0 && (
                    <div className={`mb-4 rounded-lg p-4 shadow-lg relative overflow-hidden ${
                        isGold ? 'gold-shimmer' : 'silver-shimmer'
                    }`}>
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex-1">
                                <p className={`${
                                    isGold ? 'text-amber-900' : 'text-slate-700'
                                } font-bold mb-1 drop-shadow-sm`}>
                                    USD/oz: ${chartData[chartData.length - 1].price_usd.toFixed(2)}
                                </p>
                                <p className={`${
                                    isGold ? 'text-amber-800' : 'text-slate-600'
                                } text-xs mb-2 font-semibold`}>
                                    Current {metalName} Price
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <p className={`${
                                        isGold ? 'text-amber-950' : 'text-slate-900'
                                    } text-2xl md:text-3xl font-bold drop-shadow-md`}>
                                        {formatRS(viewMode === 'tola' ? chartData[chartData.length - 1].price_per_tola : chartData[chartData.length - 1].price_per_gram)}
                                    </p>
                                    {chartData[chartData.length - 1].percentChange !== 0 && (
                                        <span className={`text-sm font-semibold drop-shadow ${
                                            chartData[chartData.length - 1].percentChange > 0
                                                ? 'text-green-700'
                                                : 'text-red-700'
                                        }`}>
                                            {chartData[chartData.length - 1].percentChange > 0 ? '↑' : '↓'}
                                            {Math.abs(chartData[chartData.length - 1].percentChange).toFixed(2)}%
                                        </span>
                                    )}
                                </div>
                                <p className={`${
                                    isGold ? 'text-amber-800' : 'text-slate-600'
                                } text-xs mt-1 font-semibold`}>
                                    per {viewMode === 'tola' ? 'Tola' : 'Gram'}
                                </p>
                            </div>
                            <Coins className={`w-12 h-12 ${
                                isGold ? 'text-amber-700' : 'text-slate-600'
                            } opacity-40 drop-shadow-lg`} />
                        </div>
                    </div>
                )}

                {/* Loading State */}
                {loading && chartData.length === 0 ? (
                    <div className="bg-gray-800 rounded-lg p-6">
                        <div className="animate-pulse space-y-3">
                            <div className="h-6 bg-gray-700 rounded w-1/2"></div>
                            <div className="h-48 bg-gray-700 rounded"></div>
                        </div>
                    </div>
                ) : (
                    /* Chart and Table View */
                    <>
                        {/* Chart */}
                        <div className="bg-gray-800 rounded-lg p-4 shadow-lg mb-4">
                            {chartData.length > 0 ? (
                                <HighchartsReact
                                    highcharts={Highcharts}
                                    options={createChartOptions(chartData, metal)}
                                />
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    No data available
                                </div>
                            )}
                        </div>
                        
                        {/* Data Table */}
                        {chartData.length > 0 && (
                            <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
                                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-gray-800">
                                            <tr className="border-b border-gray-700">
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-xs">#</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-xs">Date</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-right text-xs">USD/oz</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-right text-xs">RS/{viewMode === 'tola' ? 'Tola' : 'Gram'}</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-right text-xs">Change %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...chartData].reverse().map((item, index) => (
                                                <tr
                                                    key={item.day}
                                                    className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                                                >
                                                    <td className="px-2 py-2 text-gray-400 text-xs">{index + 1}</td>
                                                    <td className="px-2 py-2 text-gray-100 text-xs">{formatNepaliDateDisplay(item.day)}</td>
                                                    <td className="px-2 py-2 text-right text-gray-100 text-xs">
                                                        ${item.price_usd.toFixed(2)}
                                                    </td>
                                                    <td className={`px-2 py-2 text-right font-semibold text-xs ${isGold ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                        {formatRS(viewMode === 'tola' ? item.price_per_tola : item.price_per_gram)}
                                                    </td>
                                                    <td className={`px-2 py-2 text-right font-semibold text-xs ${
                                                        !item.percentChange || isNaN(item.percentChange) || item.percentChange === 0 ? 'text-gray-500' :
                                                        item.percentChange > 0 ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {!item.percentChange || isNaN(item.percentChange) || item.percentChange === 0 ? '-' : (
                                                            <span>
                                                                {item.percentChange > 0 ? '↑' : '↓'}
                                                                {Math.abs(item.percentChange).toFixed(2)}%
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="w-8 h-8 text-yellow-400" />
                            <h1 className="text-3xl font-bold text-white">
                               Bajracharya Jyaasa - Live Commodity Prices
                            </h1>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Live Indicator */}
                            <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
                                <div className="w-3 h-3 bg-red-500 rounded-full pulse-red"></div>
                                <span className="text-sm font-medium">
                                    Every 30 mins
                                </span>
                            </div>

                            {/* Unit Toggle */}
                            <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('tola')}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                                        viewMode === 'tola'
                                            ? 'bg-yellow-500 text-gray-900'
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    <span className="text-sm font-medium">TOLA</span>
                                </button>
                                <button
                                    onClick={() => setViewMode('gms')}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                                        viewMode === 'gms'
                                            ? 'bg-yellow-500 text-gray-900'
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    <span className="text-sm font-medium">GRAM</span>
                                </button>
                            </div>

                            {/* Refresh Button */}
                            <button
                                onClick={() => fetchAllData(true)}
                                disabled={loadingGold || loadingSilver}
                                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${(loadingGold || loadingSilver) ? "animate-spin" : ""}`}
                                />
                                <span className="hidden sm:inline">
                                    Refresh
                                </span>
                            </button>
                        </div>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                        {disclaimer}
                    </p>
                    {/* Last Updated */}
                    {lastUpdated && (
                        <p className="text-gray-400 text-sm mt-2">
                            Last updated:{" "}
                            {formatNepaliDateDisplay(
                                lastUpdated.toISOString().split("T")[0]
                            )}{" "}
                            {lastUpdated.toLocaleTimeString("en-NP", {
                                hour: "2-digit",
                                minute: "2-digit",
                            })} {" "}
                            ( {lastUpdated.toLocaleString("en-US", {
                                dateStyle: "medium",
                                timeStyle: "short",
                            })} )
                        </p>
                    )}
                </div>

                {/* Exchange Rate */}
                {usdToNpr && (
                    <div className="mb-6 bg-gray-800 rounded-lg p-4 shadow-lg">
                        <div className="flex items-center justify-center gap-3">
                            <span className="text-gray-400 text-sm">Exchange Rate:</span>
                            <span className="text-yellow-400 font-bold text-lg">
                                1 USD = RS {usdToNpr.toFixed(2)} 
                            </span>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
                        <p className="font-semibold">Error loading data</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {/* Gold and Silver Charts Side by Side */}
                <div className="flex flex-col lg:flex-row gap-6 mb-6">
                    {renderMetalCard(goldData, 'XAU', loadingGold)}
                    {renderMetalCard(silverData, 'XAG', loadingSilver)}
                </div>

                {/* Info Footer */}
                <div className="mt-8 text-center text-gray-500 text-sm">
                    <p>
                        Data updates every 30 minutes • Prices include 10.5%
                        TAX margin + Bank Margin
                    </p>
                    <p className="mt-1">
                        1 Tola = {GM_TO_TOLA.toFixed(3)} grams • 1 Ounce ={" "}
                        {OZ_TO_GM.toFixed(4)} grams
                    </p>
                    <p className="mt-1">
                        Methodology: 
                        1 Tola Price = ((Price USD/Ounce ÷ {OZ_TO_GM} grams) ×
                        USD to RS) × {GM_TO_TOLA} grams + (10% tax margin) + (0.5% bank margin)
                    </p>
                    <p className="mt-1">
                        {disclaimer}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default App;
