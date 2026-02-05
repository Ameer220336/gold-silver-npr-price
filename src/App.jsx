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
const disclaimer = '<span className="font-semibold">⚠️ Disclaimer:</span> For informational use only. Prices are based on up-to-date US market rates and may vary from local market prices.';

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

// Current price cache utilities (30 min cache)
const getCachedCurrentPrice = (metal) => {
    try {
        const cached = localStorage.getItem(`currentPrice_${metal}`);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();
            if (now - timestamp < CACHE_DURATION) {
                return data;
            }
        }
    } catch (error) {
        console.error('Error reading current price cache:', error);
    }
    return null;
};

const setCachedCurrentPrice = (metal, data) => {
    try {
        localStorage.setItem(`currentPrice_${metal}`, JSON.stringify({
            data,
            timestamp: Date.now(),
        }));
    } catch (error) {
        console.error('Error writing current price cache:', error);
    }
};

// Exchange rate cache utilities
const getCachedExchangeRate = () => {
    try {
        const cached = localStorage.getItem('exchangeRateData');
        if (cached) {
            const { rate, timeNextUpdateUnix } = JSON.parse(cached);
            const now = Math.floor(Date.now() / 1000); // Current time in Unix seconds
            if (now < timeNextUpdateUnix) {
                return { rate, timeNextUpdateUnix };
            }
        }
    } catch (error) {
        console.error('Error reading exchange rate cache:', error);
    }
    return null;
};

const setCachedExchangeRate = (rate, timeNextUpdateUnix) => {
    try {
        localStorage.setItem('exchangeRateData', JSON.stringify({
            rate,
            timeNextUpdateUnix,
            timestamp: Date.now(),
        }));
    } catch (error) {
        console.error('Error writing exchange rate cache:', error);
    }
};

// Last refresh time utilities
const getLastRefreshTime = () => {
    try {
        const lastRefresh = localStorage.getItem('lastRefreshTime');
        return lastRefresh ? parseInt(lastRefresh, 10) : null;
    } catch (error) {
        console.error('Error reading last refresh time:', error);
        return null;
    }
};

const setLastRefreshTime = () => {
    try {
        localStorage.setItem('lastRefreshTime', Date.now().toString());
    } catch (error) {
        console.error('Error writing last refresh time:', error);
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
    
    return 'Rs. ' + result;
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

// Calculate price per gram with metal-specific margin
const calculatePricePerGram = (maxPriceUSD, usdToNprRate, metal) => {
    const pricePerGmUSD = maxPriceUSD / OZ_TO_GM;
    const pricePerGmNPR = pricePerGmUSD * usdToNprRate;
    
    if (metal === 'XAU') {
        // Gold: 10% margin + Rs. 5000/11.664 per gram
        return Math.round(pricePerGmNPR * 1.10 + (5000 / GM_TO_TOLA));
    } else {
        // Silver: 16% margin + Rs. 50/11.664 per gram
        return Math.round(pricePerGmNPR * 1.16 + (50 / GM_TO_TOLA));
    }
};

// Calculate price per tola based on gram price
const calculatePricePerTola = (maxPriceUSD, usdToNprRate, metal) => {
    const pricePerGram = calculatePricePerGram(maxPriceUSD, usdToNprRate, metal);
    return Math.round(pricePerGram * GM_TO_TOLA);
};

function App() {
    const [goldData, setGoldData] = useState([]);
    const [silverData, setSilverData] = useState([]);
    const [currentGoldPrice, setCurrentGoldPrice] = useState(null);
    const [currentSilverPrice, setCurrentSilverPrice] = useState(null);
    const [loadingGold, setLoadingGold] = useState(true);
    const [loadingSilver, setLoadingSilver] = useState(true);
    const [loadingCurrentPrices, setLoadingCurrentPrices] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [error, setError] = useState(null);
    const [usdToNpr, setUsdToNpr] = useState(null);
    const [exchangeRateNextUpdate, setExchangeRateNextUpdate] = useState(null);
    const [viewMode, setViewMode] = useState('tola'); // 'tola' or 'gms'

    // Fetch current price for a metal (updates every 30 min or on manual refresh)
    const fetchCurrentPrice = useCallback(async (metal, forceRefresh = false) => {
        try {
            setLoadingCurrentPrices(true);
            
            // Check cache first if not forcing refresh
            if (!forceRefresh) {
                const cachedPrice = getCachedCurrentPrice(metal);
                if (cachedPrice) {
                    if (metal === 'XAU') {
                        setCurrentGoldPrice(cachedPrice);
                    } else {
                        setCurrentSilverPrice(cachedPrice);
                    }
                    console.log(`[${metal}] Using cached current price: $${cachedPrice.price_usd}/oz`);
                    setLoadingCurrentPrices(false);
                    return;
                }
            }
            
            console.log(`[${metal}] Fetching current price from API...`);
            
            // Fetch exchange rate
            let USD_TO_NPR;
            let timeNextUpdateUnix;
            const cachedExchangeRate = getCachedExchangeRate();
            
            if (cachedExchangeRate) {
                USD_TO_NPR = cachedExchangeRate.rate;
                timeNextUpdateUnix = cachedExchangeRate.timeNextUpdateUnix;
                if (metal === 'XAU') {
                    setExchangeRateNextUpdate(timeNextUpdateUnix * 1000);
                }
            } else {
                const exchangeResponse = await fetch(
                    "https://v6.exchangerate-api.com/v6/04924f3c8c51c3b925904ec3/latest/USD"
                );
                
                if (!exchangeResponse.ok) {
                    throw new Error('Failed to fetch exchange rate');
                }
                
                const exchangeData = await exchangeResponse.json();
                USD_TO_NPR = exchangeData.conversion_rates.NPR;
                timeNextUpdateUnix = exchangeData.time_next_update_unix;
                
                setCachedExchangeRate(USD_TO_NPR, timeNextUpdateUnix);
                if (metal === 'XAU') {
                    setUsdToNpr(USD_TO_NPR);
                    setExchangeRateNextUpdate(timeNextUpdateUnix * 1000);
                }
            }
            
            // Fetch current price from proxy API
            const priceResponse = await fetch(`/api/gold/price/${metal}`);
            
            if (!priceResponse.ok) {
                throw new Error(`Failed to fetch current ${metal} price`);
            }
            
            const priceData = await priceResponse.json();
            const currentPriceUSD = parseFloat(priceData.price);
            
            const priceInfo = {
                price_usd: currentPriceUSD,
                price_per_tola: calculatePricePerTola(currentPriceUSD, USD_TO_NPR, metal),
                price_per_gram: calculatePricePerGram(currentPriceUSD, USD_TO_NPR, metal),
                timestamp: Date.now(),
            };
            
            // Set state
            if (metal === 'XAU') {
                setCurrentGoldPrice(priceInfo);
                setUsdToNpr(USD_TO_NPR);
            } else {
                setCurrentSilverPrice(priceInfo);
            }
            
            // Cache the current price
            setCachedCurrentPrice(metal, priceInfo);
            
            console.log(`[${metal}] Current price fetched: $${currentPriceUSD}/oz = ${formatRS(priceInfo.price_per_tola)}/tola`);
            setLoadingCurrentPrices(false);
        } catch (err) {
            console.error(`Error fetching current ${metal} price:`, err);
            setLoadingCurrentPrices(false);
        }
    }, [setUsdToNpr, setExchangeRateNextUpdate]);

    // Fetch and process metal historical price data (for charts/tables)
    const fetchMetalData = useCallback(async (metal) => {
        try {
            const setLoading = metal === 'XAU' ? setLoadingGold : setLoadingSilver;
            const setData = metal === 'XAU' ? setGoldData : setSilverData;
            
            setLoading(true);
            setError(null); // Clear any previous errors

            // Check if we need to fetch exchange rate (only updates daily based on API's time_next_update_unix)
            let USD_TO_NPR;
            let timeNextUpdateUnix;
            const cachedExchangeRate = getCachedExchangeRate();
            
            if (cachedExchangeRate) {
                // Use cached exchange rate if still valid (checked against API's time_next_update_unix)
                USD_TO_NPR = cachedExchangeRate.rate;
                timeNextUpdateUnix = cachedExchangeRate.timeNextUpdateUnix;
                if (metal === 'XAU') {
                    setExchangeRateNextUpdate(timeNextUpdateUnix * 1000); // Convert to milliseconds
                }
                console.log(`[${metal}] Using cached exchange rate: ${USD_TO_NPR} NPR (valid until ${new Date(timeNextUpdateUnix * 1000).toLocaleString()})`);
            } else {
                // Fetch exchange rate only if cache is expired or missing
                const exchangeResponse = await fetch(
                    "https://v6.exchangerate-api.com/v6/04924f3c8c51c3b925904ec3/latest/USD",
                );
                
                if (!exchangeResponse.ok) {
                    throw new Error('Failed to fetch exchange rate');
                }
                
                const exchangeData = await exchangeResponse.json();
                USD_TO_NPR = exchangeData.conversion_rates.NPR;
                timeNextUpdateUnix = exchangeData.time_next_update_unix;
                
                // Cache the exchange rate with its expiration time from the API
                setCachedExchangeRate(USD_TO_NPR, timeNextUpdateUnix);
                if (metal === 'XAU') {
                    setExchangeRateNextUpdate(timeNextUpdateUnix * 1000); // Convert to milliseconds
                }
                console.log(`[${metal}] Fetched FRESH exchange rate: ${USD_TO_NPR} NPR (valid until ${new Date(timeNextUpdateUnix * 1000).toLocaleString()})`);
            }
            
            // Fetch metal prices from API
            console.log(`[${metal}] Fetching fresh metal price data from API...`);
            const metalResponse = await fetch(
                `/api/gold/history?symbol=${metal}&startTimestamp=${get30DaysAgoTimestamp()}&endTimestamp=${getTodayTimestamp()}&groupBy=day`,
            );
            
            if (!metalResponse.ok) {
                throw new Error(`Failed to fetch ${metal} data from API`);
            }

            const metalPriceData = await metalResponse.json();
            
            if (metal === 'XAU') {
                setUsdToNpr(USD_TO_NPR);
            }

            // Process and calculate NPR per Tola and Gram
            const processedData = metalPriceData
                .map((item) => {
                    const maxPrice = parseFloat(item.max_price);
                    const pricePerTola = calculatePricePerTola(maxPrice, USD_TO_NPR, metal);
                    const pricePerGram = calculatePricePerGram(maxPrice, USD_TO_NPR, metal);
                    
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
                setUsdToNpr(USD_TO_NPR);
            }
            setError(null); // Clear error on success
            setLoading(false);
            
            // Cache the data with current timestamp
            setCachedData(metal, {
                chartData: dataWithPercentChange,
                usdToNpr: USD_TO_NPR,
                lastUpdated: now.toISOString(),
            });
            
            console.log(`[${metal}] Successfully fetched and cached ${dataWithPercentChange.length} days of data. Latest price: ${formatRS(dataWithPercentChange[dataWithPercentChange.length - 1].price_per_tola)}/tola`);
        } catch (err) {
            console.error(`Error fetching ${metal} data:`, err);
            setError(err.message || "Failed to fetch data");
            const setLoading = metal === 'XAU' ? setLoadingGold : setLoadingSilver;
            setLoading(false);
        }
    }, [setLoadingGold, setLoadingSilver, setGoldData, setSilverData, setError, setLastUpdated, setUsdToNpr, setExchangeRateNextUpdate]);

    // Fetch both current prices and historical data
    const fetchAllData = useCallback((forceRefresh = false) => {
        console.log(`🔄 Fetching all data... ${forceRefresh ? '(Force Refresh)' : ''}`);
        
        // Fetch current prices (can be force refreshed)
        fetchCurrentPrice('XAU', forceRefresh);
        fetchCurrentPrice('XAG', forceRefresh);
        
        // Fetch historical data
        fetchMetalData('XAU');
        fetchMetalData('XAG');
        
        if (forceRefresh) {
            setLastRefreshTime(); // Track manual refresh time
        }
    }, [fetchMetalData, fetchCurrentPrice]);

    // Initial fetch and setup auto-refresh with persistent timing
    useEffect(() => {
        const lastRefresh = getLastRefreshTime();
        const now = Date.now();
        
        // Always load historical data from cache if available
        const cachedGold = getCachedData('XAU');
        const cachedSilver = getCachedData('XAG');
        
        if (cachedGold?.chartData) {
            setGoldData(cachedGold.chartData);
            setLoadingGold(false);
            console.log('[XAU] Loaded historical data from cache');
        } else {
            fetchMetalData('XAU');
        }
        
        if (cachedSilver?.chartData) {
            setSilverData(cachedSilver.chartData);
            setLoadingSilver(false);
            console.log('[XAG] Loaded historical data from cache');
        } else {
            fetchMetalData('XAG');
        }
        
        // Handle current prices with 30-min auto-refresh
        if (!lastRefresh) {
            // First time loading - fetch current prices immediately
            console.log('📥 First load - fetching current prices');
            fetchCurrentPrice('XAU');
            fetchCurrentPrice('XAG');
            setLastRefreshTime();
            
            // Set up regular 30-minute auto-refresh for current prices
            const interval = setInterval(() => {
                console.log('⏰ Auto-refresh triggered (30 min elapsed) - fetching current prices');
                fetchCurrentPrice('XAU', true);
                fetchCurrentPrice('XAG', true);
                setLastRefreshTime();
            }, REFRESH_INTERVAL);
            
            return () => clearInterval(interval);
        } else {
            const timeSinceLastRefresh = now - lastRefresh;
            const timeUntilNextRefresh = REFRESH_INTERVAL - timeSinceLastRefresh;
            
            if (timeUntilNextRefresh <= 0) {
                // More than 30 minutes since last refresh - fetch immediately
                console.log(`⏰ Last refresh was ${Math.round(timeSinceLastRefresh / 1000 / 60)} minutes ago - fetching current prices`);
                fetchCurrentPrice('XAU', true);
                fetchCurrentPrice('XAG', true);
                setLastRefreshTime();
                
                // Set up regular interval from now
                const interval = setInterval(() => {
                    console.log('⏰ Auto-refresh triggered (30 min elapsed) - fetching current prices');
                    fetchCurrentPrice('XAU', true);
                    fetchCurrentPrice('XAG', true);
                    setLastRefreshTime();
                }, REFRESH_INTERVAL);
                
                return () => clearInterval(interval);
            } else {
                // Less than 30 minutes - load from cache and schedule next refresh
                const minutesRemaining = Math.round(timeUntilNextRefresh / 1000 / 60);
                console.log(`⏳ Last refresh was ${Math.round(timeSinceLastRefresh / 1000 / 60)} minutes ago. Next refresh in ${minutesRemaining} minutes`);
                
                // Load current prices from cache
                const cachedGoldPrice = getCachedCurrentPrice('XAU');
                const cachedSilverPrice = getCachedCurrentPrice('XAG');
                
                if (cachedGoldPrice) {
                    setCurrentGoldPrice(cachedGoldPrice);
                    setLoadingCurrentPrices(false);
                    console.log('[XAU] Loaded current price from cache');
                    
                    // Load exchange rate info
                    const cachedExchangeRate = getCachedExchangeRate();
                    if (cachedExchangeRate) {
                        setUsdToNpr(cachedExchangeRate.rate);
                        setExchangeRateNextUpdate(cachedExchangeRate.timeNextUpdateUnix * 1000);
                    }
                } else {
                    fetchCurrentPrice('XAU');
                }
                
                if (cachedSilverPrice) {
                    setCurrentSilverPrice(cachedSilverPrice);
                    console.log('[XAG] Loaded current price from cache');
                } else {
                    fetchCurrentPrice('XAG');
                }
                
                // Schedule refresh at the correct time
                const firstTimeout = setTimeout(() => {
                    console.log('⏰ Auto-refresh triggered (scheduled refresh time reached) - fetching current prices');
                    fetchCurrentPrice('XAU', true);
                    fetchCurrentPrice('XAG', true);
                    setLastRefreshTime();
                    
                    // Then set up regular interval
                    const interval = setInterval(() => {
                        console.log('⏰ Auto-refresh triggered (30 min elapsed) - fetching current prices');
                        fetchCurrentPrice('XAU', true);
                        fetchCurrentPrice('XAG', true);
                        setLastRefreshTime();
                    }, REFRESH_INTERVAL);
                    
                    return () => clearInterval(interval);
                }, timeUntilNextRefresh);
                
                return () => clearTimeout(firstTimeout);
            }
        }
    }, [fetchMetalData, fetchCurrentPrice]);

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
    const renderMetalCard = (chartData, metal, loading, currentPrice, loadingPrice) => {
        const isGold = metal === 'XAU';
        const metalName = isGold ? 'Gold' : 'Silver';

        return (
            <div className="flex-1 min-w-[300px]">
                {/* Current Price Card at Top */}
                {loadingPrice && !currentPrice ? (
                    <div className={`mb-4 rounded-lg p-4 shadow-lg relative overflow-hidden ${
                        isGold ? 'gold-shimmer' : 'silver-shimmer'
                    }`}>
                        <div className="animate-pulse space-y-3">
                            <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                            <div className="h-8 bg-gray-700 rounded w-2/3"></div>
                        </div>
                    </div>
                ) : currentPrice ? (
                    <div className={`mb-4 rounded-lg p-4 shadow-lg relative overflow-hidden ${
                        isGold ? 'gold-shimmer' : 'silver-shimmer'
                    }`}>
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex-1">
                                <p className={`${
                                    isGold ? 'text-amber-900' : 'text-slate-700'
                                } font-bold mb-1 drop-shadow-sm`}>
                                    USD/oz: ${currentPrice.price_usd.toFixed(2)}
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
                                        {formatRS(viewMode === 'tola' ? currentPrice.price_per_tola : currentPrice.price_per_gram)}
                                    </p>
                                    {chartData.length > 0 && (() => {
                                        const latestHistorical = chartData[chartData.length - 1];
                                        const historicalPrice = viewMode === 'tola' ? latestHistorical.price_per_tola : latestHistorical.price_per_gram;
                                        const currentPriceValue = viewMode === 'tola' ? currentPrice.price_per_tola : currentPrice.price_per_gram;
                                        const absoluteChange = currentPriceValue - historicalPrice;
                                        const percentChange = (absoluteChange / historicalPrice) * 100;
                                        
                                        return percentChange !== 0 && !isNaN(percentChange) ? (
                                            <span className={`text-md font-semibold drop-shadow ${
                                                percentChange > 0 ? 'text-green-700' : 'text-red-700'
                                            }`}>
                                                {percentChange > 0 ? '↑' : '↓'}
                                                {Math.abs(percentChange).toFixed(2)}% ({formatRS(Math.abs(absoluteChange))})
                                            </span>
                                        ) : null;
                                    })()}
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
                ) : null}

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
        <div className="min-h-screen bg-gray-900 text-gray-100 p-2 sm:p-4">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-4 sm:mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                            <img src="/logo.png" alt="Gold and Silver Price in nepal" className="w-16 h-16 sm:w-20 sm:h-20 object-contain" />
                            <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-bold text-white">
                               Bajracharya Jyaasa - Gold and Silver Prices In Nepal
                            </h1>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-end">
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
                                disabled={loadingCurrentPrices}
                                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RefreshCw
                                    className={`w-4 h-4 ${loadingCurrentPrices ? "animate-spin" : ""}`}
                                />
                                <span className="hidden sm:inline">
                                    Refresh
                                </span>
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mt-3 text-xs sm:text-sm">
                        {/* Last Updated Info */}
                        {currentGoldPrice && (
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-md">
                                    <span className="text-gray-500">Last Updated:</span>
                                    <span className="text-yellow-400 font-semibold">
                                        {formatNepaliDateDisplay(new Date(currentGoldPrice.timestamp).toISOString().split("T")[0])}
                                    </span>
                                    <span className="text-gray-400">•</span>
                                    <span className="text-yellow-400 font-semibold">
                                        {new Date(currentGoldPrice.timestamp).toLocaleTimeString("en-NP", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            timeZone: "Asia/Kathmandu",
                                        })}
                                        <span className="text-gray-500 text-[9px] sm:text-[10px] ml-0.5"> NPT</span>
                                    </span>
                                </div>
                                <div className="text-gray-500 text-xs">
                                    ({new Date(currentGoldPrice.timestamp).toLocaleDateString("en-US", { 
                                        month: "short", 
                                        day: "numeric", 
                                        year: "numeric" 
                                    })})
                                </div>
                                <div className="flex items-center gap-1 text-green-400 text-xs">
                                    <RefreshCw className="w-3 h-3 animate-pulse" />
                                    <span className="font-semibold">Auto-refresh: 30 min</span>
                                </div>
                            </div>
                        )}
                        
                        {/* Exchange Rate */}
                        {usdToNpr && (
                            <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-md">
                                <span className="text-yellow-400 font-bold text-sm sm:text-base">
                                    1 USD = RS {usdToNpr.toFixed(2)}
                                    {exchangeRateNextUpdate && (
                                        <span className="text-green-400 text-xs ml-1">
                                            (<RefreshCw className="w-3 h-3 inline animate-pulse" />{' '}
                                            {formatNepaliDateDisplay(new Date(exchangeRateNextUpdate).toISOString().split("T")[0])}{' '}
                                            {new Date(exchangeRateNextUpdate).toLocaleTimeString('en-NP', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                timeZone: 'Asia/Kathmandu'
                                            })})
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mt-3">
                        <p className="text-red-300 text-[10px] sm:text-xs text-center leading-relaxed">
                            <span dangerouslySetInnerHTML={{ __html: disclaimer }} />
                        </p>
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
                        <p className="font-semibold">Error loading data</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {/* Gold and Silver Charts Side by Side */}
                <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 mb-6">
                    {renderMetalCard(goldData, 'XAU', loadingGold, currentGoldPrice, loadingCurrentPrices)}
                    {renderMetalCard(silverData, 'XAG', loadingSilver, currentSilverPrice, loadingCurrentPrices)}
                </div>

                {/* Info Footer */}
                <div className="space-y-4 mb-6">
                    {/* Quick Info Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Conversions Card */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="text-yellow-400 font-semibold text-sm mb-2 flex items-center gap-2">
                                <span>📏</span> Unit Conversions
                            </h3>
                            <div className="space-y-1 text-gray-400 text-xs">
                                <p>• 1 Tola = <span className="text-gray-200 font-medium">{GM_TO_TOLA.toFixed(3)} grams</span></p>
                                <p>• 1 Troy Ounce = <span className="text-gray-200 font-medium">{OZ_TO_GM.toFixed(4)} grams</span></p>
                            </div>
                        </div>

                        {/* Pricing Info Card */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="text-yellow-400 font-semibold text-sm mb-2 flex items-center gap-2">
                                <span>💰</span> Pricing Margins
                            </h3>
                            <div className="space-y-1 text-gray-400 text-xs">
                                <p>• Gold: <span className="text-gray-200 font-medium">10% (TAX) + Rs. 5,000/tola (Bank Margin)</span></p>
                                <p>• Silver: <span className="text-gray-200 font-medium">16% (TAX) + Rs. 50/tola (Bank Margin)</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Methodology Card */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-yellow-400 font-semibold text-sm mb-3 flex items-center gap-2">
                            <span>🧮</span> Calculation Methodology
                        </h3>
                        <div className="space-y-3 text-xs">
                            {/* Gold Formula */}
                            <div className="bg-gray-900 rounded p-3 border-l-4 border-yellow-500">
                                <p className="text-yellow-400 font-semibold mb-2">Gold (per Tola)</p>
                                <div className="text-gray-300 space-y-1">
                                    <p className="font-mono text-[10px] sm:text-xs">
                                        = [(USD/oz ÷ {OZ_TO_GM}) × USD-to-NPR × {GM_TO_TOLA}] × 1.10 + 5,000
                                    </p>
                                    <p className="text-gray-500 text-[9px] sm:text-[10px] mt-1">
                                        (Base price × 10% TAX + Rs. 5,000 Bank Margin)
                                    </p>
                                </div>
                            </div>

                            {/* Silver Formula */}
                            <div className="bg-gray-900 rounded p-3 border-l-4 border-slate-400">
                                <p className="text-slate-400 font-semibold mb-2">Silver (per Tola)</p>
                                <div className="text-gray-300 space-y-1">
                                    <p className="font-mono text-[10px] sm:text-xs">
                                        = [(USD/oz ÷ {OZ_TO_GM}) × USD-to-NPR × {GM_TO_TOLA}] × 1.16 + 50
                                    </p>
                                    <p className="text-gray-500 text-[9px] sm:text-[10px] mt-1">
                                        (Base price × 16% TAX + Rs. 50 Bank Margin)
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                        <p className="text-red-300 text-[10px] sm:text-xs text-center leading-relaxed">
                            <span dangerouslySetInnerHTML={{ __html: disclaimer }} />
                        </p>
                    </div>

                    {/* Copyright Footer */}
                    <div className="mt-6 pt-4 border-t border-gray-700">
                        <p className="text-center text-gray-500 text-xs">
                            © {new Date().getFullYear()} Bajracharya Jyaasa. All rights reserved.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
