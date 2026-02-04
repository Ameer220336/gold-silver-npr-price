import { useState, useEffect, useCallback } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { RefreshCw, TrendingUp, Table, LineChart, Coins } from "lucide-react";

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

const formatNPR = (value) => {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "NPR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

// Calculate price per tola with margin
const calculatePricePerTola = (maxPriceUSD, usdToNprRate) => {
    const pricePerGmUSD = maxPriceUSD / OZ_TO_GM;
    const pricePerGmNPR = pricePerGmUSD * usdToNprRate;
    const pricePerTolaNPR = pricePerGmNPR * GM_TO_TOLA;
    return Math.round(pricePerTolaNPR * 1.105); // 10.5% margin
};

function App() {
    const [goldData, setGoldData] = useState([]);
    const [silverData, setSilverData] = useState([]);
    const [loadingGold, setLoadingGold] = useState(true);
    const [loadingSilver, setLoadingSilver] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [usdToNpr, setUsdToNpr] = useState(null);
    const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'

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
                if (cachedData) {
                    setData(cachedData.chartData);
                    if (metal === 'XAU') {
                        setUsdToNpr(cachedData.usdToNpr);
                        setLastUpdated(new Date(cachedData.lastUpdated));
                    }
                    setLoading(false);
                    return;
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

            // Process and calculate NPR per Tola
            const processedData = metalPriceData
                .map((item) => {
                    const maxPrice = parseFloat(item.max_price);
                    return {
                        day: item.day.split(" ")[0], // Extract date (YYYY-MM-DD)
                        price_usd: maxPrice,
                        price_per_tola: calculatePricePerTola(maxPrice, USD_TO_NPR),
                    };
                })
                .filter(item => !isNaN(item.price_per_tola) && item.price_per_tola > 0)
                .sort((a, b) => new Date(a.day) - new Date(b.day));

            // Calculate percentage change after sorting
            const dataWithPercentChange = processedData.map((item, index) => {
                let percentChange = 0;
                if (index > 0 && processedData[index - 1].price_per_tola > 0) {
                    const prevPrice = processedData[index - 1].price_per_tola;
                    const currentPrice = item.price_per_tola;
                    percentChange = ((currentPrice - prevPrice) / prevPrice) * 100;
                }
                return {
                    ...item,
                    percentChange: isNaN(percentChange) ? 0 : percentChange,
                };
            });

            const now = new Date();
            
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
            text: `${metal === 'XAU' ? 'Gold' : 'Silver'} Price per Tola (NPR)`,
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
            categories: chartData.map((item) => item.day),
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
                text: "Price (NPR)",
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
                    return formatNPR(this.value);
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
                return `<b>${this.x}</b><br/>Price: ${formatNPR(this.y)}<br/>USD/oz: $${dataPoint?.price_usd?.toFixed(2)}`;
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
                data: chartData.map((item) => item.price_per_tola),
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
                    <div className={`mb-4 bg-gradient-to-br ${isGold ? 'from-yellow-600 to-yellow-500' : 'from-gray-600 to-gray-500'} rounded-lg p-4 shadow-xl`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`${isGold ? 'text-yellow-100' : 'text-gray-100'} text-xs mb-1`}>
                                    Current {metalName} Price
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-white text-2xl md:text-3xl font-bold">
                                        {formatNPR(chartData[chartData.length - 1].price_per_tola)}
                                    </p>
                                    {chartData[chartData.length - 1].percentChange !== 0 && (
                                        <span className={`text-sm font-semibold ${
                                            chartData[chartData.length - 1].percentChange > 0
                                                ? 'text-green-300'
                                                : 'text-red-300'
                                        }`}>
                                            {chartData[chartData.length - 1].percentChange > 0 ? '↑' : '↓'}
                                            {Math.abs(chartData[chartData.length - 1].percentChange).toFixed(2)}%
                                        </span>
                                    )}
                                </div>
                                <p className={`${isGold ? 'text-yellow-100' : 'text-gray-100'} text-xs mt-1`}>
                                    per Tola (with 10.5% margin)
                                </p>
                            </div>
                            <Coins className={`w-12 h-12 ${isGold ? 'text-yellow-200' : 'text-gray-200'} opacity-50`} />
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
                    /* Chart or Table View */
                    <div className="bg-gray-800 rounded-lg p-4 shadow-xl">
                        {chartData.length > 0 ? (
                            viewMode === 'chart' ? (
                                <HighchartsReact
                                    highcharts={Highcharts}
                                    options={createChartOptions(chartData, metal)}
                                />
                            ) : (
                                /* Data Table */
                                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="sticky top-0 bg-gray-800">
                                            <tr className="border-b border-gray-700">
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-xs">#</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-xs">Date</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-right text-xs">USD/oz</th>
                                                <th className="px-2 py-2 text-gray-300 font-semibold text-right text-xs">NPR/Tola</th>
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
                                                    <td className="px-2 py-2 text-gray-100 text-xs">{item.day}</td>
                                                    <td className="px-2 py-2 text-right text-gray-100 text-xs">
                                                        ${item.price_usd.toFixed(2)}
                                                    </td>
                                                    <td className={`px-2 py-2 text-right font-semibold text-xs ${isGold ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                        {formatNPR(item.price_per_tola)}
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
                            )
                        ) : (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                No data available
                            </div>
                        )}
                    </div>
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
                            <h1 className="text-3xl md:text-4xl font-bold text-white">
                               Bajracharya Jyaasa - Live Commodity Prices
                            </h1>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Live Indicator */}
                            <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
                                <div className="w-3 h-3 bg-red-500 rounded-full pulse-red"></div>
                                <span className="text-sm font-medium">
                                    LIVE
                                </span>
                            </div>

                            {/* View Toggle */}
                            <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('chart')}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                                        viewMode === 'chart'
                                            ? 'bg-yellow-500 text-gray-900'
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    <LineChart className="w-4 h-4" />
                                    <span className="hidden sm:inline text-sm font-medium">Chart</span>
                                </button>
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                                        viewMode === 'table'
                                            ? 'bg-yellow-500 text-gray-900'
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    <Table className="w-4 h-4" />
                                    <span className="hidden sm:inline text-sm font-medium">Table</span>
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
                    <p className="text-gray-400 mt-1">
                        {disclaimer}
                    </p>
                    {/* Last Updated */}
                    {lastUpdated && (
                        <p className="text-gray-400 text-sm mt-2">
                            Last updated:{" "}
                            {lastUpdated.toLocaleString("en-US", {
                                dateStyle: "medium",
                                timeStyle: "short",
                            })}
                        </p>
                    )}
                </div>

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

                {/* Exchange Rate & Info Footer */}
                {usdToNpr && (
                    <div className="mt-6 bg-gray-800 rounded-lg p-4 shadow-lg">
                        <div className="flex items-center justify-center gap-3">
                            <span className="text-gray-400 text-sm">Exchange Rate:</span>
                            <span className="text-yellow-400 font-bold text-lg">
                                1 USD = {usdToNpr.toFixed(2)} NPR
                            </span>
                        </div>
                    </div>
                )}

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
                        USD to NPR) × {GM_TO_TOLA} grams + (10% tax margin) + (0.5% bank margin)
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
