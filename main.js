const firebaseConfig = {
    apiKey: "AIzaSyDFidbgm44dWH38fzbYoTnRyUVkz9QSNcM",
    authDomain: "taptrade-c39da.firebaseapp.com",
    projectId: "taptrade-c39da",
    storageBucket: "taptrade-c39da.firebasestorage.app",
    messagingSenderId: "587028572053",
    appId: "1:587028572053:web:255d390c390a423b80b89c",
    measurementId: "G-30WZ67FEM7"
  };
  
  // Initialize Firebase v7.20.0
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Initialize Analytics (optional)
firebase.analytics();


// ========== GLOBAL STATE ==========
const state = {
    currentUser: null,
    isAdmin: false,
    balance: 500000.00, // Sets default home page state to 500,000 TZS for demo tracking
    activeTrades: [],
    transactionHistory: [],
    chartData: [],
    signalOverride: null, // 'up', 'down', or null
    signalStrength: 70,
    currentTrade: {
        type: 'buy',
        amount: 100,
        expirySeconds: 60,
        startTime: null,
        timerInterval: null,
        activeSignal: null,      // current signal for user trades
        signalListeners: null
    }
};


// ========== DOM ELEMENTS ==========
const userDashboard = document.getElementById('userDashboard');
const adminPanel = document.getElementById('adminPanel');
const loginModal = document.getElementById('loginModal');
const chartContainer = document.getElementById('chartContainer');
const miniChartContainer = document.getElementById('miniChartContainer');

// Form Element Hooks
const authForm = document.getElementById('authForm');
const modalTitle = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');
const submitBtnText = document.getElementById('submitBtnText');
const toggleAuthLink = document.getElementById('toggleAuthLink');

// Form Group Elements
const usernameFieldGroup = document.getElementById('usernameFieldGroup');
const confirmPasswordFieldGroup = document.getElementById('confirmPasswordFieldGroup');
const termsFieldGroup = document.getElementById('termsFieldGroup');

// Growth & Promotional Target Elements
const promoFieldGroup = document.getElementById('promoFieldGroup');
const authPromoCode = document.getElementById('authPromoCode');
const authTerms = document.getElementById('authTerms');
const referralLinkDisplay = document.getElementById('referralLinkDisplay');
const copyReferralLinkBtn = document.getElementById('copyReferralLinkBtn');

// Header Premium Control Updates
const topLoginBtn = document.getElementById('topLoginBtn');
const userProfileGroup = document.getElementById('userProfileGroup');
const logoutBtn = document.getElementById('logoutBtn');

// Core Chart Context & Authentication Tracking State
let isLoginMode = true;
let mainChart = null;
let candlestickSeries = null;
let lineSeries1 = null;
let lineSeries2 = null;
let upperBandSeries = null;
let lowerBandSeries = null;

// =========================================================================
// INBOUND PARSING ROUTINE & URL LOGIC CONTROL INTERCEPTOR
// =========================================================================
function extractInboundReferralVector() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        
        if (refCode) {
            const sanitizedCode = refCode.trim().toUpperCase();
            console.log(`[NETWORK GROWTH LOGIC] Inbound affiliate node captured: ${sanitizedCode}`);
            
            if (authPromoCode) {
                authPromoCode.value = sanitizedCode;
                authPromoCode.setAttribute('disabled', 'true'); // Lock dynamic input elements from changes
                authPromoCode.style.borderColor = 'var(--green-accent)';
            }
            
            setTimeout(() => {
                if (state.currentUser === null && toggleAuthLink) {
                    showToast(`Affiliate promo node applied: ${sanitizedCode}`, 'info');
                    if (isLoginMode) toggleAuthLink.click(); // Automatically adjust layout space to Registration
                }
            }, 1200);
        }
    } catch (e) {
        console.error("Referral context extraction vector failed:", e);
    }
}

function updateBalanceDisplay() {
    // Update header balance
    const textTarget = document.getElementById('userBalance');
    if (textTarget) {
        textTarget.textContent = Number(state.balance).toLocaleString('en-US', { minimumFractionDigits: 2 }) + " TZS";
    }
    
    // Update wallet balance
    const walletBalanceSpan = document.getElementById('walletBalanceAmount');
    if (walletBalanceSpan) {
        walletBalanceSpan.textContent = Number(state.balance).toLocaleString('en-US');
    }
    
    // Update any other balance displays
    const minorElements = document.querySelectorAll('.user-balance-value');
    minorElements.forEach(el => {
        el.textContent = Number(state.balance).toLocaleString('en-US', { minimumFractionDigits: 2 }) + " TZS";
    });
    
    // Update wallet balance if on wallet tab
    const walletBalance = document.getElementById('walletBalanceAmount');
    if (walletBalance) {
        walletBalance.textContent = Number(state.balance).toLocaleString('en-US');
    }
    
    // Also update in Firestore if user is logged in (but don't await to avoid blocking)
    if (state.currentUser && !state.isAdmin) {
        db.collection('users').doc(state.currentUser.uid).update({
            balance: state.balance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error("Error saving balance:", err));
    }
}

function syncGlobalPlatformMetrics() {
    // Read the aggregated metric from a public document instead of scanning all user records
    db.collection('system_settings').doc('metrics').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            state.collectivePool = parseFloat(data.totalPool || 0);
        } else {
            state.collectivePool = 0.00;
        }
        updateBalanceDisplay();
    }, error => {
        console.error("Failed to sync structural pool assets metric:", error);
    });
}


function syncActiveSignalsDisplay() {
    const signalIndicator = document.getElementById('signalIndicator');
    const currentSignalMode = document.getElementById('currentSignalMode');
    const overrideStatus = document.getElementById('overrideStatus');
    const overrideDirection = document.getElementById('overrideDirection');
    
    if (state.signalOverride) {
        if (signalIndicator) {
            signalIndicator.textContent = state.signalOverride === 'up' ? 'FORCE UP ▲' : 'FORCE DOWN ▼';
            signalIndicator.style.color = state.signalOverride === 'up' ? '#00e676' : '#ff1744';
        }
        if (currentSignalMode) {
            currentSignalMode.textContent = state.signalOverride === 'up' ? 'Forced Uptrend Active' : 'Forced Downtrend Active';
            currentSignalMode.className = 'status-value';
        }
        if (overrideStatus) overrideStatus.classList.remove('hidden');
        if (overrideDirection) {
            overrideDirection.textContent = state.signalOverride === 'up' ? 'UP ▲' : 'DOWN ▼';
            overrideDirection.style.color = state.signalOverride === 'up' ? '#00e676' : '#ff1744';
        }
    } else {
        if (signalIndicator) {
            signalIndicator.textContent = 'ORGANIC';
            signalIndicator.style.color = '#ffd700';
        }
        if (currentSignalMode) {
            currentSignalMode.textContent = 'Organic Market Execution';
            currentSignalMode.className = 'status-value organic';
        }
        if (overrideStatus) overrideStatus.classList.add('hidden');
    }
}

function attachTransactionLedgerListener(userId) {
    let query = db.collection('transactions');
    
    if (!state.isAdmin) {
        query = query.where('uid', '==', userId);
    }
    
    query.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        state.transactionHistory = [];
        snapshot.forEach(doc => {
            state.transactionHistory.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        renderTransactionTable();
        // Also load user-specific transaction history for wallet tab
        if (!state.isAdmin && userId === state.currentUser?.uid) {
            loadUserTransactionHistory();
            loadWalletStats();
        }
    }, error => {
        console.error("Transaction ledger synchronization pipeline failure:", error);
    });
}

function renderTransactionTable() {
    const tableBody = document.getElementById('transactionTableBody');
    if (!tableBody) {
        // Silently returns if user hasn't switched to the wallet/history view layout tab yet
        return;
    }

    tableBody.innerHTML = '';

    if (state.transactionHistory.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-4 text-center text-sm text-slate-500">
                    No transactions found
                </td>
            </tr>
        `;
        return;
    }

    state.transactionHistory.forEach(tx => {
        const row = document.createElement('tr');
        row.className = 'border-b border-slate-800 hover:bg-slate-800/40 transition-colors';

        let formattedDate = 'Pending...';
        if (tx.createdAt) {
            const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
            formattedDate = d.toLocaleString('en-US', { hour12: true });
        }

        let statusBadge = '';
        if (tx.status === 'approved' || tx.status === 'success') {
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400">Approved</span>`;
        } else if (tx.status === 'rejected' || tx.status === 'failed') {
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400">Rejected</span>`;
        } else {
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400">Pending</span>`;
        }

        const typeColor = tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">${formattedDate}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium uppercase tracking-wider ${typeColor}">${tx.type || 'Trade'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-100 font-mono font-medium">
                ${Number(tx.amount || 0).toLocaleString('en-US')} TZS
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${statusBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400 font-mono text-xs">${tx.id.substring(0, 8)}...</td>
        `;
        tableBody.appendChild(row);
    });
}



function updateLedgerDisplay(filter = 'all') {
    const tbody = document.getElementById('ledgerBody');
    if (!tbody) return;
    
    let transactions = state.transactionHistory;
    if (filter !== 'all') transactions = transactions.filter(t => t.status === filter);
    
    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-gray-500 py-4">No structural accounting entries found.</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = transactions.map(t => `
        <tr>
            <td class="text-sm">${new Date(t.timestamp).toLocaleTimeString()}</td>
            <td>
                <span class="font-bold ${t.type === 'buy' || t.type === 'deposit' ? 'text-green-400' : 'text-red-400'}">
                    ${t.type.toUpperCase()}
                </span>
            </td>
            <td>${t.amount.toLocaleString()} TZS</td>
            <td>${t.direction || (t.type === 'buy' ? '▲ Up' : '▼ Down')}</td>
            <td>
                <span class="status-${t.status}">
                    ${t.status.toUpperCase()}
                </span>
            </td>
            <td class="${t.status === 'win' || t.status === 'APPROVED' ? 'text-green-400' : 'text-red-400'}">
                ${t.payout ? `+${t.payout.toLocaleString()} TZS` : `-${t.amount.toLocaleString()} TZS`}
            </td>
        </tr>
    `).join('');
}

// =========================================================================
// ADMINISTRATIVE PROFILE SEARCH MODULE: LOAD USER BY ID
// =========================================================================
function loadProfileByUserId(targetUid) {
    if (!targetUid || targetUid.trim() === "") {
        showToast("Please provide a valid system User Identification Token.", "error");
        return;
    }

    const cleanUid = targetUid.trim();
    showToast("Querying directory registry mapping...", "info");

    db.collection('users').doc(cleanUid).get()
        .then(doc => {
            if (!doc.exists) {
                showToast("No account matching that explicit User ID exists.", "error");
                return;
            }

            const userData = doc.data();
            
            // Populate administrative workspace profile parameters
            const targetNameBox = document.getElementById('adminTargetUsername');
            const targetBalanceBox = document.getElementById('adminTargetBalance');
            const targetReferrerBox = document.getElementById('adminTargetReferrer');
            
            if (targetNameBox) targetNameBox.textContent = userData.username || "Unknown Node";
            if (targetBalanceBox) targetBalanceBox.textContent = Number(userData.balance || 0).toLocaleString() + " TZS";
            if (targetReferrerBox) targetReferrerBox.textContent = userData.referredBy || "DIRECT";

            showToast(`Profile registry parsed for: ${userData.username}`, "success");
            
            // Bind historical snapshot context for searched user
            attachAdminHistoryContextInspection(cleanUid);
        })
        .catch(err => {
            showToast("Database retrieval error: " + err.message, "error");
        });
}

function attachAdminHistoryContextInspection(uid) {
    const adminTbody = document.getElementById('adminUserLedgerBody');
    if (!adminTbody) return;

    db.collection('users').doc(uid).collection('transactions')
        .orderBy('timestamp', 'desc')
        .limit(15)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                adminTbody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-2">No historical ledger records.</td></tr>`;
                return;
            }

            adminTbody.innerHTML = snapshot.docs.map(doc => {
                const t = doc.data();
                const timeStr = t.timestamp ? t.timestamp.toDate().toLocaleDateString() : 'N/A';
                return `
                    <tr>
                        <td>${timeStr}</td>
                        <td class="font-bold">${(t.type || 'TRADE').toUpperCase()}</td>
                        <td>${Number(t.amount || 0).toLocaleString()} TZS</td>
                        <td><span class="status-${t.status || 'complete'}">${(t.status || 'COMPLETE').toUpperCase()}</span></td>
                        <td>${Number(t.payout || 0).toLocaleString()} TZS</td>
                    </tr>
                `;
            }).join('');
        });
}

// =========================================================================
// LIGHTWEIGHT CHARTS MODULE INITIALIZATION
// =========================================================================
function initMainChart() {
    const chartElement = chartContainer;
    if (!chartElement) return;
    
    mainChart = LightweightCharts.createChart(chartElement, {
        width: chartElement.clientWidth,
        height: chartElement.clientHeight,
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#8b949e',
        },
        grid: {
            vertLines: { color: 'rgba(48, 54, 61, 0.3)' },
            horzLines: { color: 'rgba(48, 54, 61, 0.3)' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: 'rgba(48, 54, 61, 0.5)' },
        timeScale: {
            borderColor: 'rgba(48, 54, 61, 0.5)',
            timeVisible: true,
            secondsVisible: false,
        },
    });

    candlestickSeries = mainChart.addCandlestickSeries({
        upColor: '#00e676',
        downColor: '#ff1744',
        borderDownColor: '#ff1744',
        borderUpColor: '#00e676',
        wickDownColor: '#ff1744',
        wickUpColor: '#00e676',
    });

    lineSeries1 = mainChart.addLineSeries({ color: '#00e5ff', lineWidth: 2, priceLineVisible: false });
    lineSeries2 = mainChart.addLineSeries({ color: '#ffffff', lineWidth: 1, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
    upperBandSeries = mainChart.addLineSeries({ color: '#ffd700', lineWidth: 1.5, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });
    lowerBandSeries = mainChart.addLineSeries({ color: '#ff1744', lineWidth: 1.5, priceLineVisible: false, lineStyle: LightweightCharts.LineStyle.Dashed });

    generateInitialChartData();
    startChartUpdates();
}

function generateInitialChartData() {
    const data = [];
    let price = 1.0850;
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 200; i >= 0; i--) {
        const time = now - (i * 60);
        const open = price;
        const close = open + (Math.random() - 0.5) * 0.002;
        const high = Math.max(open, close) + Math.random() * 0.001;
        const low = Math.min(open, close) - Math.random() * 0.001;
        
        data.push({ time, open, high, low, close });
        price = close;
    }
    
    state.chartData = data;
    updateChartSeries();
}

function updateChartSeries() {
    if (!candlestickSeries) return;
    
    const data = state.chartData;
    candlestickSeries.setData(data);
    
    const ma1Data = calculateMA(data, 7);
    const ma2Data = calculateMA(data, 20);
    const bollingerBands = calculateBollingerBands(data, 20);
    
    lineSeries1.setData(ma1Data);
    lineSeries2.setData(ma2Data);
    upperBandSeries.setData(bollingerBands.upper);
    lowerBandSeries.setData(bollingerBands.lower);
}

function calculateMA(data, period) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        result.push({ time: data[i].time, value: sum / period });
    }
    return result;
}

function calculateBollingerBands(data, period) {
    const upper = [];
    const lower = [];
    
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        const ma = sum / period;
        
        let variance = 0;
        for (let j = 0; j < period; j++) {
            variance += Math.pow(data[i - j].close - ma, 2);
        }
        const std = Math.sqrt(variance / period);
        
        upper.push({ time: data[i].time, value: ma + (2 * std) });
        lower.push({ time: data[i].time, value: ma - (2 * std) });
    }
    
    return { upper, lower };
}

function addNewCandle() {
    if (state.chartData.length === 0) return;
    const lastCandle = state.chartData[state.chartData.length - 1];
    const now = Math.floor(Date.now() / 1000);
    let newPrice;
    
    // More realistic Forex price movement (smaller, more volatile changes)
    if (state.signalOverride === 'up') {
        // Forced uptrend
        newPrice = lastCandle.close + (Math.random() * 0.0005 + 0.0001);
    } else if (state.signalOverride === 'down') {
        // Forced downtrend
        newPrice = lastCandle.close - (Math.random() * 0.0005 + 0.0001);
    } else {
        // Normal market - random walk with slight trend bias
        const trendBias = (Math.random() - 0.5) * 0.0003;
        const volatility = Math.random() * 0.0008;
        newPrice = lastCandle.close + trendBias + (Math.random() - 0.5) * volatility;
        
        // Add occasional spikes (market news)
        if (Math.random() < 0.05) { // 5% chance of spike
            const spike = (Math.random() - 0.5) * 0.002;
            newPrice += spike;
        }
    }
    
    // Ensure price doesn't go negative
    newPrice = Math.max(newPrice, 0.0001);
    
    const open = lastCandle.close;
    const close = newPrice;
    const high = Math.max(open, close) + Math.random() * 0.0005;
    const low = Math.min(open, close) - Math.random() * 0.0005;
    
    const newCandle = { time: now, open, high, low, close };
    state.chartData.push(newCandle);
    
    if (state.chartData.length > 200) {
        state.chartData.shift();
    }
    
    updateChartSeries();
}

function startChartUpdates() {
    setInterval(() => { addNewCandle(); }, 2000);
}

async function executeTrade() {
    const { type, amount, expirySeconds } = state.currentTrade;
    
    // Validation checks
    if (amount > state.balance) {
        showToast('Insufficient balance.', 'error');
        return false;
    }
    if (amount < 2500) {
        showToast('Minimum trade is 2,500 TZS', 'error');
        return false;
    }
    
    const executeBtn = document.getElementById('executeTrade');
    if (executeBtn) {
        executeBtn.disabled = true;
        executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }
    
    // Get current market price for entry
    const entryPrice = state.chartData[state.chartData.length - 1].close;
    
    // Check for active signal window
    let signalInfo = {
        hasActiveSignal: false,
        isFollowingSignal: false,
        isSignalAlreadyUsed: false,
        signalId: null,
        signalDirection: null,
        signalMultiplier: null
    };
    
    // IMPORTANT: Check if there's an ACTIVE signal (within time window)
    if (activeSignal && activeSignal.id) {
        const now = new Date();
        let endTime;
        let startTime;
        
        // Parse endTime
        if (activeSignal.endTime && typeof activeSignal.endTime.toDate === 'function') {
            endTime = activeSignal.endTime.toDate();
        } else if (activeSignal.endTime) {
            endTime = new Date(activeSignal.endTime);
        }
        
        // Parse startTime
        if (activeSignal.startTime && typeof activeSignal.startTime.toDate === 'function') {
            startTime = activeSignal.startTime.toDate();
        } else if (activeSignal.startTime) {
            startTime = new Date(activeSignal.startTime);
        }
        
        // Check if current time is WITHIN the signal window
        const isWithinSignalWindow = (startTime && now >= startTime) && (endTime && now <= endTime);
        
        if (isWithinSignalWindow && state.currentUser) {
            // Check if user already used THIS SPECIFIC signal (by its unique ID)
            const userSignalRef = db.collection('users').doc(state.currentUser.uid).collection('used_signals').doc(activeSignal.id);
            const checkResult = await userSignalRef.get().catch(() => ({ exists: false }));
            
            if (checkResult.exists) {
                // User already used this exact signal!
                signalInfo.isSignalAlreadyUsed = true;
                showToast(`⏰ You have already participated in this signal! Trading in normal Forex market.`, 'warning');
                signalInfo.hasActiveSignal = false;
                signalInfo.isFollowingSignal = false;
            } else {
                // Signal is ACTIVE and user hasn't used this specific signal yet
                signalInfo.hasActiveSignal = true;
                signalInfo.signalId = activeSignal.id;
                signalInfo.signalDirection = activeSignal.direction;
                signalInfo.signalMultiplier = activeSignal.multiplier || 10;
                
                const isFollowing = (activeSignal.direction === 'buy' && type === 'buy') ||
                    (activeSignal.direction === 'sell' && type === 'sell');
                
                signalInfo.isFollowingSignal = isFollowing;
                
                if (isFollowing) {
                    showToast(`✅ SIGNAL ACTIVE! Following ${activeSignal.direction.toUpperCase()} - GUARANTEED ${signalInfo.signalMultiplier}% WIN!`, 'success');
                } else {
                    showToast(`⚠️ SIGNAL ACTIVE! Signal says ${activeSignal.direction.toUpperCase()} - You chose ${type.toUpperCase()} - This trade will LOSE!`, 'error');
                }
            }
        } else if (isWithinSignalWindow && !state.currentUser) {
            showToast(`📊 Signal active but you're in demo mode. Login to participate!`, 'info');
        } else {
            if (activeSignal && !isWithinSignalWindow) {
                showToast(`⏰ Signal window has ended. Trading in normal Forex market.`, 'info');
            }
        }
    }
    
    // DEDUCT BALANCE IMMEDIATELY
    const newBalance = state.balance - amount;
    state.balance = newBalance;
    updateBalanceDisplay();
    
    const tradeId = Date.now();
    const trade = {
        id: tradeId,
        type: type,
        amount: amount,
        entryPrice: entryPrice,
        expirySeconds: expirySeconds,
        expiryTime: Date.now() + (expirySeconds * 1000),
        startTime: Date.now(),
        status: 'pending',
        balanceBeforeTrade: newBalance + amount,
        balanceAfterTrade: newBalance,
        followedSignal: signalInfo.isFollowingSignal,
        hasActiveSignal: signalInfo.hasActiveSignal && !signalInfo.isSignalAlreadyUsed,
        signalId: signalInfo.signalId,
        signalDirection: signalInfo.signalDirection,
        signalMultiplier: signalInfo.signalMultiplier,
        signalUsed: !signalInfo.isSignalAlreadyUsed && signalInfo.hasActiveSignal
    };
    
    state.activeTrades.push(trade);
    updateActiveTradesDisplay();
    
    if (state.currentUser) {
        try {
            // Update user balance in Firestore FIRST
            await db.collection('users').doc(state.currentUser.uid).update({
                balance: state.balance,
                lastTradeAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastTradeAmount: amount,
                lastTradeType: type
            });
            
            // Save transaction record
            await db.collection('users').doc(state.currentUser.uid).collection('transactions').doc(tradeId.toString()).set({
                type: type,
                amount: amount,
                direction: type === 'buy' ? '▲ BUY' : '▼ SELL',
                status: 'pending',
                entryPrice: entryPrice,
                balanceAfter: state.balance,
                followedSignal: signalInfo.isFollowingSignal,
                hasActiveSignal: signalInfo.hasActiveSignal && !signalInfo.isSignalAlreadyUsed,
                signalId: signalInfo.signalId,
                signalDirection: signalInfo.signalDirection,
                signalMultiplier: signalInfo.signalMultiplier,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // CRITICAL: Mark this SPECIFIC signal as used IMMEDIATELY after trade is placed
            if (signalInfo.hasActiveSignal && !signalInfo.isSignalAlreadyUsed && signalInfo.signalId) {
                await db.collection('users').doc(state.currentUser.uid).collection('used_signals').doc(signalInfo.signalId).set({
                    signalId: signalInfo.signalId,
                    direction: signalInfo.signalDirection,
                    userChoice: type,
                    followedSignal: signalInfo.isFollowingSignal,
                    stakeAmount: amount,
                    tradeId: tradeId,
                    balanceAtTrade: state.balance,
                    usedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    signalEndTime: activeSignal ? activeSignal.endTime : null,
                    signalStartTime: activeSignal ? activeSignal.startTime : null,
                    signalDuration: activeSignal ? activeSignal.duration : null
                });
                
                console.log(`Signal ${signalInfo.signalId} marked as used for user ${state.currentUser.uid}`);
            }
        } catch (error) {
            console.error("Error saving trade data:", error);
            showToast("Error processing trade. Please try again.", "error");
            
            // Revert balance on error
            state.balance = newBalance + amount;
            updateBalanceDisplay();
            
            if (executeBtn) {
                executeBtn.disabled = false;
                executeBtn.innerHTML = '<i class="fas fa-bolt"></i> Place Trade';
            }
            return false;
        }
    }
    
    startTradeTimer(expirySeconds);
    
    // Show appropriate toast message
    if (signalInfo.isSignalAlreadyUsed) {
        showToast(`📊 You already used this signal. Trading normal Forex at ${entryPrice.toFixed(5)}.`, 'info');
    } else if (signalInfo.hasActiveSignal && signalInfo.isFollowingSignal) {
        showToast(`🚀 SIGNAL TRADE! Following ${signalInfo.signalDirection.toUpperCase()} - Guaranteed ${signalInfo.signalMultiplier}% win!`, 'success');
    } else if (!signalInfo.hasActiveSignal) {
        showToast(`📊 FOREX TRADE! ${type.toUpperCase()} at ${entryPrice.toFixed(5)}. Win/loss depends on market movement.`, 'success');
    } else if (signalInfo.hasActiveSignal && !signalInfo.isFollowingSignal) {
        showToast(`⚠️ Signal trade placed against signal! You will lose your stake.`, 'info');
    }
    
    if (executeBtn) {
        setTimeout(() => {
            executeBtn.disabled = false;
            executeBtn.innerHTML = '<i class="fas fa-bolt"></i> Place Trade';
        }, 1000);
    }
    
    return true;
}

function startTradeTimer(seconds) {
    const timerDisplay = document.getElementById('timerDisplay');
    const tradeTimer = document.getElementById('tradeTimer');
    const executeBtn = document.getElementById('executeTrade');
    
    if (tradeTimer) tradeTimer.classList.remove('hidden');
    if (executeBtn) executeBtn.disabled = true;
    
    let remaining = seconds;
    state.currentTrade.startTime = Date.now();
    state.currentTrade.expirySeconds = seconds;
    
    if (state.currentTrade.timerInterval) clearInterval(state.currentTrade.timerInterval);
    
    state.currentTrade.timerInterval = setInterval(() => {
        remaining--;
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        if (timerDisplay) timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (remaining <= 0) {
            clearInterval(state.currentTrade.timerInterval);
            if (tradeTimer) tradeTimer.classList.add('hidden');
            if (executeBtn) executeBtn.disabled = false;
        }
    }, 1000);
}

function resolveActiveTrades(currentPrice, previousPrice) {
    // Handling automated calculations shifted inside checkTradeOutcomes workflow context loop
}

// =========================================================================
// ADMINISTRATIVE RISK SIGNAL MANAGEMENT
// =========================================================================
function setAdminSignal(direction) {
    state.signalOverride = direction;
    syncActiveSignalsDisplay();
    addAdminLog(`Signal override set: ${direction ? direction.toUpperCase() : 'ORGANIC'}`);
}

function resetAdminSignal() {
    setAdminSignal(null);
}

// =========================================================================
// USER INTERFACE DISPLAY MODULATION LOGIC
// =========================================================================
function updateActiveTradesDisplay() {
    const container = document.getElementById('activeTradesList');
    if (!container) return;
    
    if (state.activeTrades.length === 0) {
        container.innerHTML = `
            <div class="empty-trades">
                <i class="fas fa-inbox"></i>
                <span>No active transaction matrices running.</span>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.activeTrades.map(trade => `
        <div class="p-2 border-b border-gray-700 flex justify-between items-center">
            <div>
                <span class="font-bold ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}">
                    ${trade.type.toUpperCase()}
                </span>
                <span class="text-sm text-gray-400 ml-2">${trade.amount.toLocaleString()} TZS</span>
            </div>
            <div class="text-sm text-gray-400">
                ${Math.max(0, Math.floor((trade.expiryTime - Date.now()) / 1000))}s remaining
            </div>
        </div>
    `).join('');
}

function syncProfileReferralWidgets(userRecord) {
    if (!userRecord || !referralLinkDisplay) return;
    
    // Use the generated promoCode from the user record
    const referralCode = userRecord.promoCode || userRecord.username;
    const generatedNodeLink = `https://taptrade-c39da.firebaseapp.com/?ref=${referralCode}`;
    referralLinkDisplay.value = generatedNodeLink;
}

function initializeReferralClipboardControls() {
    if (copyReferralLinkBtn && referralLinkDisplay) {
        copyReferralLinkBtn.addEventListener('click', () => {
            referralLinkDisplay.select();
            referralLinkDisplay.setSelectionRange(0, 99999); 
            
            navigator.clipboard.writeText(referralLinkDisplay.value)
                .then(() => { showToast('Referral link copied to clipboard.', 'success'); })
                .catch(() => { showToast('Failed to copy. Highlight the input box manually.', 'error'); });
        });
    }
}

// Dynamic view layout router based on Roles & Auth Status
function handleDashboardRouting(userRecord) {
    if (!userRecord) {
        // GUEST MODE ACTIVE (HOME PAGE DEMO BALANCE MODE)
        if (userDashboard) userDashboard.style.display = 'block';
        if (adminPanel) adminPanel.style.display = 'none';
        if (loginModal) loginModal.classList.add('hidden');
        
        if (topLoginBtn) topLoginBtn.classList.remove('hidden');
        if (userProfileGroup) userProfileGroup.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        
        // Load default home page allocation configuration
        state.balance = 500000.00;
        updateBalanceDisplay();
        
        if (!mainChart && typeof initMainChart === 'function') {
            initMainChart();
        }
        
        // ========== HIDE AUTH-ONLY NAVIGATION BUTTONS ==========
        const authNavButtons = document.querySelectorAll('.nav-auth-only');
        authNavButtons.forEach(btn => {
            btn.classList.add('hidden');
        });
        
        // Make sure Home and Trades are visible
        const homeBtn = document.getElementById('navHome');
        const tradesBtn = document.getElementById('navTrades');
        if (homeBtn) homeBtn.classList.remove('hidden');
        if (tradesBtn) tradesBtn.classList.remove('hidden');
        
        // Switch to home section
        switchTab('home');
        
        return;
    }
    
    // AUTHENTICATED REAL USER ACCOUNT PROFILE ACTIVE
    if (topLoginBtn) topLoginBtn.classList.add('hidden');
    if (userProfileGroup) userProfileGroup.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (loginModal) loginModal.classList.add('hidden');
    
    // ========== SHOW ALL AUTH-ONLY NAVIGATION BUTTONS ==========
    const authNavButtons = document.querySelectorAll('.nav-auth-only');
    authNavButtons.forEach(btn => {
        btn.classList.remove('hidden');
    });
    
    // Make sure Home and Trades are visible
    const homeBtn = document.getElementById('navHome');
    const tradesBtn = document.getElementById('navTrades');
    if (homeBtn) homeBtn.classList.remove('hidden');
    if (tradesBtn) tradesBtn.classList.remove('hidden');
    
    if (userRecord.role === 'admin' || userRecord.role === 'SUPERADMIN') {
        state.isAdmin = true;
        if (userDashboard) userDashboard.style.display = 'none';
        if (adminPanel) adminPanel.style.display = 'block';
        showToast('Admin node access verified.', 'info');
    } else {
        state.isAdmin = false;
        if (adminPanel) adminPanel.style.display = 'none';
        if (userDashboard) userDashboard.style.display = 'block';
        
        // Strip out demo balance assignment values and serve exact database parameters
        state.balance = userRecord.balance !== undefined ? parseFloat(userRecord.balance) : 0.00;
        updateBalanceDisplay();
        
        loadUserProfileData();
        loadWalletStats();
        
        if (!mainChart && typeof initMainChart === 'function') {
            initMainChart();
        }
    }
}

// Single Auth State Observer
auth.onAuthStateChanged(user => {
    console.log('Auth state changed:', user ? 'User logged in' : 'No user'); // Debug log
    
    if (user) {
        state.currentUser = user;
        db.collection('users').doc(user.uid).get()
            .then(doc => {
                console.log('User document exists:', doc.exists); // Debug log
                
                if (doc.exists) {
                    const userData = doc.data();
                    const role = userData.role || 'user';
                    state.userRole = role;
                    
                    console.log('User role:', role); // Debug log
                    
                    // Show appropriate dashboard
                    showDashboardByRole(role, userData);
                    
                    if (typeof syncProfileReferralWidgets === 'function') {
                        syncProfileReferralWidgets(userData);
                    }
                    
                    // Attach transaction listener for non-admin users
                    if (role !== 'admin' && role !== 'SUPERADMIN') {
                        if (typeof attachTransactionLedgerListener === 'function') {
                            attachTransactionLedgerListener(user.uid);
                        }
                    }
                } else {
                    console.error('User document not found for UID:', user.uid);
                    showToast('User registry parameters not discovered.', 'error');
                    auth.signOut();
                }
            })
            .catch(error => {
                console.error('Error fetching user document:', error);
                showToast(error.message, 'error');
                auth.signOut();
            });
    } else {
        // User is logged out - show guest mode
        console.log('Showing guest mode'); // Debug log
        state.currentUser = null;
        state.userRole = null;
        state.isAdmin = false;
        
        // Show user dashboard in guest mode
        const userDashboardEl = document.getElementById('userDashboard');
        const adminPanelEl = document.getElementById('adminPanel');
        const superAdminPanelEl = document.getElementById('superAdminPanel');
        
        if (userDashboardEl) userDashboardEl.style.display = 'block';
        if (adminPanelEl) adminPanelEl.style.display = 'none';
        if (superAdminPanelEl) superAdminPanelEl.classList.add('hidden');
        
        // Update header for guest
        if (topLoginBtn) topLoginBtn.classList.remove('hidden');
        if (userProfileGroup) userProfileGroup.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        
        // Set demo balance
        state.balance = 500000.00;
        if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
        
        // Hide auth-only navigation buttons
        const authNavButtons = document.querySelectorAll('.nav-auth-only');
        authNavButtons.forEach(btn => {
            btn.classList.add('hidden');
        });
        
        // Show home and trades buttons
        const homeBtn = document.getElementById('navHome');
        const tradesBtn = document.getElementById('navTrades');
        if (homeBtn) homeBtn.classList.remove('hidden');
        if (tradesBtn) tradesBtn.classList.remove('hidden');
        
        // Initialize chart if not exists
        if (!mainChart && typeof initMainChart === 'function') {
            initMainChart();
        }
        
        // Switch to home section
        if (typeof switchTab === 'function') {
            switchTab('home');
        }
    }
});

// Single Auth State Observer
auth.onAuthStateChanged(user => {
    if (user) {
        state.currentUser = user;
        db.collection('users').doc(user.uid).get()
            .then(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    const role = userData.role || 'user';
                    state.userRole = role;
                    
                    // Show appropriate dashboard
                    showDashboardByRole(role, userData);
                    syncProfileReferralWidgets(userData);
                    
                    // Attach transaction listener for non-admin users
                    if (role !== 'admin' && role !== 'SUPERADMIN') {
                        attachTransactionLedgerListener(user.uid);
                    }
                } else {
                    showToast('User registry parameters not discovered.', 'error');
                    auth.signOut();
                }
            })
            .catch(error => {
                showToast(error.message, 'error');
                auth.signOut();
            });
    } else {
        // User is logged out - show guest mode
        state.currentUser = null;
        state.userRole = null;
        state.isAdmin = false;
        
        // Show user dashboard in guest mode
        const userDashboardEl = document.getElementById('userDashboard');
        const adminPanelEl = document.getElementById('adminPanel');
        const superAdminPanelEl = document.getElementById('superAdminPanel');
        
        if (userDashboardEl) userDashboardEl.style.display = 'block';
        if (adminPanelEl) adminPanelEl.style.display = 'none';
        if (superAdminPanelEl) superAdminPanelEl.classList.add('hidden');
        
        // Update header for guest
        if (topLoginBtn) topLoginBtn.classList.remove('hidden');
        if (userProfileGroup) userProfileGroup.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        
        // Set demo balance
        state.balance = 500000.00;
        updateBalanceDisplay();
        
        // Hide auth-only navigation buttons
        const authNavButtons = document.querySelectorAll('.nav-auth-only');
        authNavButtons.forEach(btn => {
            btn.classList.add('hidden');
        });
        
        // Show home and trades buttons
        const homeBtn = document.getElementById('navHome');
        const tradesBtn = document.getElementById('navTrades');
        if (homeBtn) homeBtn.classList.remove('hidden');
        if (tradesBtn) tradesBtn.classList.remove('hidden');
        
        // Initialize chart if not exists
        if (!mainChart && typeof initMainChart === 'function') {
            initMainChart();
        }
        
        // Switch to home section
        switchTab('home');
    }
});

// Login with either email or username
function loginWithEmailOrUsername(identifier, password) {
    // Check if identifier is an email (contains @)
    if (identifier.includes('@')) {
        // Login with email
        return handleLogin(identifier, password);
    } else {
        // Login with username - need to find email first
        db.collection('users').where('username', '==', identifier.toLowerCase()).get()
            .then(snapshot => {
                if (snapshot.empty) {
                    showToast('Username not found', 'error');
                    return;
                }
                const userData = snapshot.docs[0].data();
                const email = userData.email;
                return handleLogin(email, password);
            })
            .catch(error => {
                showToast(error.message, 'error');
            });
    }
}

// View Switch Template Management Framework
if (toggleAuthLink) {
    toggleAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        
        const cachedPromo = authPromoCode ? authPromoCode.value : '';
        authForm.reset();
        if (authPromoCode && cachedPromo) authPromoCode.value = cachedPromo;
        
        if (isLoginMode) {
            modalTitle.textContent = "Welcome to TapTrade";
            modalSubtitle.textContent = "Sign in to access your dashboard";
            if (usernameFieldGroup) usernameFieldGroup.classList.add('hidden');
            if (confirmPasswordFieldGroup) confirmPasswordFieldGroup.classList.add('hidden');
            if (promoFieldGroup) promoFieldGroup.classList.add('hidden');
            if (termsFieldGroup) termsFieldGroup.classList.add('hidden');
            submitBtnText.textContent = "Access Dashboard";
            toggleAuthLink.textContent = "Create Account";
            document.getElementById('toggleAuthText').firstChild.textContent = "Don't have an account? ";
            document.getElementById('loginConfirmPassword').removeAttribute('required');
        } else {
            modalTitle.textContent = "Create Trader Node";
            modalSubtitle.textContent = "Pool capital, accelerate collective growth";
            if (usernameFieldGroup) usernameFieldGroup.classList.remove('hidden');
            if (confirmPasswordFieldGroup) confirmPasswordFieldGroup.classList.remove('hidden');
            if (promoFieldGroup) promoFieldGroup.classList.remove('hidden');
            if (termsFieldGroup) termsFieldGroup.classList.remove('hidden');
            submitBtnText.textContent = "Deploy Node Permanently";
            toggleAuthLink.textContent = "Sign In";
            document.getElementById('toggleAuthText').firstChild.textContent = "Already registered? ";
            document.getElementById('loginConfirmPassword').setAttribute('required', 'true');
        }
    });
}

if (authForm) {
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const identifier = document.getElementById('loginEmail').value.trim(); // Can be email or username
        const password = document.getElementById('loginPassword').value;
        
        if (isLoginMode) {
            loginWithEmailOrUsername(identifier, password);
        } else {
            const username = document.getElementById('authUsername').value.trim();
            const confirmPassword = document.getElementById('loginConfirmPassword').value;
            const promoValue = authPromoCode ? authPromoCode.value.trim().toUpperCase() : '';
            const isTermsAccepted = authTerms ? authTerms.checked : false;
            
            handleSignupExtended(identifier, password, confirmPassword, username, promoValue, isTermsAccepted);
        }
    });
}

function handleLogin(email, password) {
    const submitBtn = document.getElementById('loginSubmit');
    showButtonLoading(submitBtn, 'Logging in...');
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            return db.collection('users').doc(user.uid).get()
                .then(doc => {
                    if (!doc.exists) throw new Error('User data not found');
                    const userData = doc.data();
                    const role = userData.role || 'user';
                    state.currentUser = user;
                    state.userRole = role;
                    showDashboardByRole(role, userData);
                    showToast(`Welcome back, ${userData.username || email}!`, 'success');
                    if (loginModal) loginModal.classList.add('hidden');
                });
        })
        .catch(error => {
            showToast(error.message, 'error');
        })
        .finally(() => {
            hideButtonLoading(submitBtn);
        });
}

function showDashboardByRole(role, userData) {
    console.log('Showing dashboard for role:', role); // Debug log
    
    // Get all dashboard containers
    const userDashboardEl = document.getElementById('userDashboard');
    const adminPanelEl = document.getElementById('adminPanel');
    const superAdminPanelEl = document.getElementById('superAdminPanel');
    
    console.log('Elements found:', {
        userDashboard: !!userDashboardEl,
        adminPanel: !!adminPanelEl,
        superAdminPanel: !!superAdminPanelEl
    }); // Debug log
    
    // Hide all dashboards first
    if (userDashboardEl) userDashboardEl.style.display = 'none';
    if (adminPanelEl) adminPanelEl.style.display = 'none';
    if (superAdminPanelEl) superAdminPanelEl.classList.add('hidden');
    
    // Hide auth-only navigation buttons
    const authNavButtons = document.querySelectorAll('.nav-auth-only');
    authNavButtons.forEach(btn => {
        btn.classList.add('hidden');
    });
    
    // Show dashboard based on role
    if (role === 'SUPERADMIN') {
        console.log('Showing Super Admin Dashboard');
        if (superAdminPanelEl) {
            superAdminPanelEl.classList.remove('hidden');
            superAdminPanelEl.style.display = 'block';
        }
        if (adminPanelEl) adminPanelEl.style.display = 'none';
        if (userDashboardEl) userDashboardEl.style.display = 'none';
        
        // Initialize super admin data
        currentSuperAdmin = userData;
        const superAdminNameSpan = document.getElementById('superAdminName');
        if (superAdminNameSpan) {
            superAdminNameSpan.textContent = userData.username || 'Super Admin';
        }
        
        // Initialize super admin functions if they exist
        if (typeof initSuperAdmin === 'function') {
            initSuperAdmin();
        } else {
            console.warn('initSuperAdmin function not found');
            // Load data manually
            if (typeof loadAllUsers === 'function') loadAllUsers();
            if (typeof loadAllAdmins === 'function') loadAllAdmins();
            if (typeof loadProfitStats === 'function') loadProfitStats();
            if (typeof loadPendingDepositsSuper === 'function') loadPendingDepositsSuper();
            if (typeof loadPendingWithdrawalsSuper === 'function') loadPendingWithdrawalsSuper();
        }
        
        showToast('Super Admin access granted.', 'info');
        
    } else if (role === 'admin' || role === 'moderator') {
        console.log('Showing Admin Dashboard');
        if (adminPanelEl) {
            adminPanelEl.style.display = 'block';
            adminPanelEl.classList.remove('hidden');
        }
        if (userDashboardEl) userDashboardEl.style.display = 'none';
        if (superAdminPanelEl) superAdminPanelEl.classList.add('hidden');
        
        state.isAdmin = true;
        if (typeof addAdminLog === 'function') {
            addAdminLog('Admin access granted');
        }
        showToast('Admin panel activated', 'info');
        
        // Load admin data
        if (typeof loadBankAccounts === 'function') loadBankAccounts();
        if (typeof loadWithdrawalFeeSettings === 'function') loadWithdrawalFeeSettings();
        if (typeof loadPendingDeposits === 'function') loadPendingDeposits();
        if (typeof loadPendingWithdrawals === 'function') loadPendingWithdrawals();
        
    } else {
        console.log('Showing User Dashboard');
        if (userDashboardEl) {
            userDashboardEl.style.display = 'block';
        }
        if (adminPanelEl) adminPanelEl.style.display = 'none';
        if (superAdminPanelEl) superAdminPanelEl.classList.add('hidden');
        
        state.isAdmin = false;
        state.balance = userData.balance !== undefined ? parseFloat(userData.balance) : 0.00;
        
        if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
        
        // Show all auth-only navigation buttons
        authNavButtons.forEach(btn => {
            btn.classList.remove('hidden');
        });
        
        // Load user data
        if (typeof loadUserProfileData === 'function') loadUserProfileData();
        if (typeof loadWalletStats === 'function') loadWalletStats();
        if (typeof attachTransactionLedgerListener === 'function') {
            attachTransactionLedgerListener(state.currentUser.uid);
        }
        
        if (!mainChart && typeof initMainChart === 'function') {
            initMainChart();
        }
        
        if (typeof switchTab === 'function') {
            switchTab('home');
        }
    }
    
    // Update header UI
    if (topLoginBtn) topLoginBtn.classList.add('hidden');
    if (userProfileGroup) userProfileGroup.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
}

// Update header when user is logged in
function updateHeaderForLoggedInUser(userData) {
    if (topLoginBtn) topLoginBtn.classList.add('hidden');
    if (userProfileGroup) userProfileGroup.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    
    // Update balance display
    updateBalanceDisplay();
}

function handleSignupExtended(email, password, confirmPassword, username, promoValue, isTermsAccepted) {
    if (!username || username.length < 3) {
        showToast('Identification Fault: Username requires at least 3 characters.', 'error');
        return;
    }
    if (password !== confirmPassword) {
        showToast('Validation Error: Structural password entries do not match.', 'error');
        return;
    }
    if (password.length < 6) {
        showToast('Security Rule Matrix: Passwords must possess 6 tokens minimal.', 'error');
        return;
    }
    if (!isTermsAccepted) {
        showToast('Compliance Warning: You must accept the operational matrix policies to initialize.', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('loginSubmit');
    if (submitBtn) submitBtn.disabled = true;
    if (submitBtnText) submitBtnText.textContent = "Deploying Matrix Node...";
    
    let identifiedReferrerUid = "DIRECT";
    
    const lookupPromise = (promoValue !== "") ?
        db.collection('users').where('promoCode', '==', promoValue.toLowerCase()).get() :
        Promise.resolve({ empty: true });
    
    lookupPromise
        .then(snapshot => {
            if (!snapshot.empty) {
                identifiedReferrerUid = snapshot.docs[0].id;
                console.log(`[ATTRIBUTION ENGINE] New account matches parent ID code: ${identifiedReferrerUid}`);
            }
            return auth.createUserWithEmailAndPassword(email, password);
        })
        .then(cred => {
            return generateUniqueReferralCode().then(referralCode => {
                return db.collection('users').doc(cred.user.uid).set({
                    uid: cred.user.uid,
                    username: username.toLowerCase().replace(/\s+/g, ''),
                    email: email,
                    role: 'user', // Default role is 'user'
                    balance: 0.00,
                    promoCode: referralCode,
                    referredBy: identifiedReferrerUid,
                    referralCount: 0,
                    commissionEarned: 0,
                    isActive: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        })
        .then(() => {
            showToast('Account deployment complete! Your referral code has been generated.', 'success');
            authForm.reset();
            if (loginModal) loginModal.classList.add('hidden');
        })
        .catch(error => {
            showToast(error.message, 'error');
            console.error("Registration pipeline crashed:", error);
        })
        .finally(() => {
            if (submitBtn) submitBtn.disabled = false;
            if (submitBtnText) submitBtnText.textContent = "Deploy Node Permanently";
        hideButtonLoading(submitBtn);
        });
}

// =========================================================================
// TRANSACTION-SAFE 15% REVENUE ALLOCATION SYSTEM (ADMIN ONLY)
// =========================================================================
function processDepositTransactionApproval(transactionId) {
    if (!transactionId) return;
    
    const transactionRef = db.collection('deposits').doc(transactionId);
    showToast('Executing matrix accounting validation...', 'info');
    
    return db.runTransaction(async (transaction) => {
        const transDoc = await transaction.get(transactionRef);
        if (!transDoc.exists) throw new Error("Target ledger deposit row token item not found.");
        
        // Inside your processDepositTransactionApproval transaction block:
const metricsRef = db.collection('system_settings').doc('metrics');
const metricsDoc = await transaction.get(metricsRef);

let currentTotalPool = 0;
if (metricsDoc.exists) {
    currentTotalPool = parseFloat(metricsDoc.data().totalPool || 0);
}

transaction.set(metricsRef, {
    totalPool: currentTotalPool + depositCashMagnitudeValue
}, { merge: true });

        
        const depositData = transDoc.data();
        if (depositData.status !== 'PENDING') throw new Error("Concurrency Conflict: Transaction is already finalized.");
        
        const targetUserUid = depositData.userUid;
        const depositCashMagnitudeValue = parseFloat(depositData.amount || 0);
        if (depositCashMagnitudeValue <= 0) throw new Error("Accounting Violation: Deposit value must exceed zero.");
        
        const userRef = db.collection('users').doc(targetUserUid);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("Attribution Error: Depositing user profile missing.");
        
        const userData = userDoc.data();
        let updatedUserBalance = parseFloat(userData.balance || 0) + depositCashMagnitudeValue;
        
        let networkReferralBonusCommissionsValue = 0;
        let parentReferrerUserRef = null;
        let parentReferrerCurrentBalance = 0;
        
        const userPastDepositsSnapshot = await db.collection('deposits')
            .where('userUid', '==', targetUserUid)
            .where('status', '==', 'APPROVED')
            .limit(1)
            .get();
            
        const isFirstDepositNodeEvent = userPastDepositsSnapshot.empty;
        
        if (isFirstDepositNodeEvent && userData.referredBy && userData.referredBy !== "DIRECT") {
            parentReferrerUserRef = db.collection('users').doc(userData.referredBy);
            const referrerDoc = await transaction.get(parentReferrerUserRef);
            
            if (referrerDoc.exists) {
                parentReferrerCurrentBalance = parseFloat(referrerDoc.data().balance || 0);
                networkReferralBonusCommissionsValue = depositCashMagnitudeValue * 0.15; // Complete 15% metric payout applied
            }
        }
        
        transaction.update(transactionRef, {
            status: 'APPROVED',
            isFirstDeposit: isFirstDepositNodeEvent,
            commissionAllocated: networkReferralBonusCommissionsValue,
            finalizedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        transaction.update(userRef, { balance: updatedUserBalance });
        
        if (networkReferralBonusCommissionsValue > 0 && parentReferrerUserRef) {
            transaction.update(parentReferrerUserRef, {
                balance: parentReferrerCurrentBalance + networkReferralBonusCommissionsValue
            });
            
            const commissionLogRef = db.collection('commissions').doc();
            transaction.set(commissionLogRef, {
                referrerUid: userData.referredBy,
                refereeUid: targetUserUid,
                sourceDepositId: transactionId,
                depositAmountAmount: depositCashMagnitudeValue,
                commissionPayoutAmount: networkReferralBonusCommissionsValue,
                currencyCode: "TZS",
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        return { userBalance: updatedUserBalance, commission: networkReferralBonusCommissionsValue, referrer: userData.referredBy };
    })
    .then((result) => {
        showToast(`Deposit Approved! Funds initialized successfully.`, 'success');
        if (result.commission > 0) {
            showToast(`Growth Matrix Yield Applied! Node matching ID ${result.referrer} rewarded +${result.commission.toLocaleString()} TZS.`, 'info');
        }
    })
    .catch((error) => {
        showToast(error.message, 'error');
        console.error("Operational ledger transaction failed to execute:", error);
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

function addAdminLog(message) {
    const logsContainer = document.getElementById('adminLogs');
    if (!logsContainer) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsContainer.prepend(logEntry);
}

// WITHDRAWAL FEE SETTINGS
function loadWithdrawalFeeSettings() {
    db.collection('system_settings').doc('withdrawal_fees').onSnapshot(doc => {
        if (doc.exists) {
            state.withdrawalFeePercent = parseFloat(doc.data().feePercent || 10);
        } else {
            state.withdrawalFeePercent = 10;
        }
        
        const feePercentDisplay = document.getElementById('feePercentDisplay');
        if (feePercentDisplay) feePercentDisplay.textContent = state.withdrawalFeePercent;
        
        const currentFeeDisplay = document.getElementById('currentFeeDisplay');
        if (currentFeeDisplay) currentFeeDisplay.textContent = state.withdrawalFeePercent;
        
        const feeInput = document.getElementById('withdrawalFeePercent');
        if (feeInput) feeInput.value = state.withdrawalFeePercent;
    });
}

function saveWithdrawalFeeSettings() {
    const feeInput = document.getElementById('withdrawalFeePercent');
    const newFee = parseFloat(feeInput.value);
    
    if (isNaN(newFee) || newFee < 0 || newFee > 100) {
        showToast('Please enter a valid fee percentage (0-100)', 'error');
        return;
    }
    
    db.collection('system_settings').doc('withdrawal_fees').set({
        feePercent: newFee,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast(`Withdrawal fee set to ${newFee}%`, 'success');
        state.withdrawalFeePercent = newFee;
    }).catch(err => showToast(err.message, 'error'));
}

// BANK ACCOUNT MANAGEMENT
function loadBankAccounts() {
    db.collection('bank_accounts').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('bankAccountsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No bank accounts added yet.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const account = { id: doc.id, ...doc.data() };
            const accountDiv = document.createElement('div');
            accountDiv.className = `bank-account-item ${!account.isActive ? 'inactive' : ''}`;
            accountDiv.innerHTML = `
                <div class="bank-info">
                    <div class="bank-name">
                        ${account.providerName}
                        <span class="status-badge ${account.isActive ? 'active' : 'inactive'}">${account.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div class="bank-details-small">
                        ${account.accountType === 'mobile' ? '📱 Mobile' : '🏦 Bank'} | ${account.accountNumber}
                    </div>
                    <div class="bank-details-small">Holder: ${account.accountHolder}</div>
                </div>
                <div class="bank-actions">
                    <button class="bank-action-icon edit" onclick="editBankAccount('${account.id}')"><i class="fas fa-edit"></i></button>
                    <button class="bank-action-icon toggle" onclick="toggleBankAccountStatus('${account.id}', ${!account.isActive})"><i class="fas ${account.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
                    <button class="bank-action-icon delete" onclick="deleteBankAccount('${account.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            container.appendChild(accountDiv);
        });
    });
}

function initBankAccountModalFields() {
    const mobileFields = document.getElementById('mobileMoneyFields');
    const accountNumberLabel = document.getElementById('accountNumberLabel');
    
    // Make sure mobile fields are visible
    if (mobileFields) {
        mobileFields.classList.remove('hidden');
    }
    
    // Set label and placeholder for mobile money
    if (accountNumberLabel) {
        accountNumberLabel.textContent = 'Phone Number';
    }
    
    const accountNumberInput = document.getElementById('bankAccountNumber');
    if (accountNumberInput) {
        accountNumberInput.placeholder = 'Enter phone number (e.g., 0712345678)';
    }
    
    // Initialize mobile provider dropdown
    const mobileProvider = document.getElementById('mobileProvider');
    if (mobileProvider) {
        // Set default value if not set
        if (!mobileProvider.value) {
            mobileProvider.value = 'M-PESA';
        }
        
        mobileProvider.addEventListener('change', function() {
            updatePhonePlaceholder(this.value);
        });
        
        updatePhonePlaceholder(mobileProvider.value);
    }
}

function updatePhonePlaceholder(provider) {
    const phoneInput = document.getElementById('bankAccountNumber');
    if (!phoneInput) return;
    
    switch (provider) {
        case 'M-PESA':
            phoneInput.placeholder = 'Enter M-PESA registered phone number (e.g., 0712345678)';
            break;
        case 'Airtel Money':
            phoneInput.placeholder = 'Enter Airtel Money registered phone number (e.g., 0712345678)';
            break;
        case 'Tigo Pesa':
            phoneInput.placeholder = 'Enter Tigo Pesa registered phone number (e.g., 0712345678)';
            break;
        case 'Halopesa':
            phoneInput.placeholder = 'Enter Halopesa registered phone number (e.g., 0712345678)';
            break;
        case 'Azam Pesa':
            phoneInput.placeholder = 'Enter Azam Pesa registered phone number (e.g., 0712345678)';
            break;
        default:
            phoneInput.placeholder = 'Enter phone number (e.g., 0712345678)';
    }
}

function openBankAccountModal(accountId = null) {
    const modal = document.getElementById('bankAccountModal');
    const form = document.getElementById('bankAccountForm');
    const title = document.getElementById('bankModalTitle');
    const deleteContainer = document.getElementById('deleteBankBtnContainer');
    
    if (!modal) return;
    form.reset();
    
    const activeCheckbox = document.getElementById('bankIsActive');
    if (activeCheckbox) activeCheckbox.checked = true;
    
    // Initialize mobile money fields
    initBankAccountModalFields();
    
    if (accountId) {
        title.textContent = 'Edit Bank Account';
        if (deleteContainer) deleteContainer.classList.remove('hidden');
        document.getElementById('bankAccountId').value = accountId;
        
        db.collection('bank_accounts').doc(accountId).get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                
                // Set mobile provider
                const mobileProvider = document.getElementById('mobileProvider');
                if (mobileProvider && data.providerName) {
                    mobileProvider.value = data.providerName;
                    updatePhonePlaceholder(data.providerName);
                }
                
                document.getElementById('bankAccountNumber').value = data.accountNumber || '';
                document.getElementById('bankAccountHolder').value = data.accountHolder || '';
                document.getElementById('bankInstructions').value = data.instructions || '';
                
                if (activeCheckbox) activeCheckbox.checked = data.isActive !== false;
            }
        });
    } else {
        title.textContent = 'Add Bank Account';
        if (deleteContainer) deleteContainer.classList.add('hidden');
        document.getElementById('bankAccountId').value = '';
        
        // Reset to default provider
        const mobileProvider = document.getElementById('mobileProvider');
        if (mobileProvider) {
            mobileProvider.value = 'M-PESA';
            updatePhonePlaceholder('M-PESA');
        }
    }
    
    modal.classList.remove('hidden');
}

function closeBankAccountModal() {
    const modal = document.getElementById('bankAccountModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('bankAccountForm');
    if (form) form.reset();
}

function saveBankAccount() {
    const accountId = document.getElementById('bankAccountId').value;
    
    // Get mobile provider - with null check (no bankAccountType needed since all are mobile)
    const mobileProviderElement = document.getElementById('mobileProvider');
    let providerName = 'M-PESA'; // Default value
    
    if (mobileProviderElement) {
        providerName = mobileProviderElement.value;
    }
    
    const accountNumberElement = document.getElementById('bankAccountNumber');
    const accountHolderElement = document.getElementById('bankAccountHolder');
    const instructionsElement = document.getElementById('bankInstructions');
    const isActiveElement = document.getElementById('bankIsActive');
    
    // Validate elements exist
    if (!accountNumberElement) {
        showToast('Form element not found', 'error');
        return;
    }
    
    const accountNumber = accountNumberElement.value;
    const accountHolder = accountHolderElement ? accountHolderElement.value : '';
    const instructions = instructionsElement ? instructionsElement.value : '';
    const isActive = isActiveElement ? isActiveElement.checked : true;
    
    // Validate required fields
    if (!accountNumber) {
        showToast('Please enter phone number', 'error');
        return;
    }
    
    // Validate phone number format (basic validation)
    const phoneRegex = /^[0-9]{10,12}$/;
    const cleanNumber = accountNumber.replace(/\D/g, '');
    if (!phoneRegex.test(cleanNumber)) {
        showToast('Please enter a valid phone number (10-12 digits)', 'error');
        return;
    }
    
    if (!accountHolder) {
        showToast('Please enter account holder name', 'error');
        return;
    }
    
    const accountData = {
        accountType: 'mobile', // Always mobile since all are mobile money
        providerName: providerName,
        accountNumber: accountNumber,
        accountHolder: accountHolder,
        instructions: instructions,
        isActive: isActive,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (accountId) {
        db.collection('bank_accounts').doc(accountId).update(accountData)
            .then(() => {
                showToast('Bank account updated successfully', 'success');
                closeBankAccountModal();
                loadBankAccounts();
            })
            .catch(err => showToast(err.message, 'error'));
    } else {
        accountData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        db.collection('bank_accounts').add(accountData)
            .then(() => {
                showToast('Bank account added successfully', 'success');
                closeBankAccountModal();
                loadBankAccounts();
            })
            .catch(err => showToast(err.message, 'error'));
    }
}

function editBankAccount(accountId) {
    openBankAccountModal(accountId);
}

function toggleBankAccountStatus(accountId, newStatus) {
    db.collection('bank_accounts').doc(accountId).update({
        isActive: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast(`Account ${newStatus ? 'activated' : 'deactivated'}`, 'success');
        loadBankAccounts(); // Refresh the list
    }).catch(err => showToast(err.message, 'error'));
}

function deleteBankAccount(accountId) {
    if (confirm('Are you sure you want to delete this bank account permanently?')) {
        db.collection('bank_accounts').doc(accountId).delete()
            .then(() => {
                showToast('Bank account deleted', 'success');
                loadBankAccounts(); // Refresh the list
            })
            .catch(err => showToast(err.message, 'error'));
    }
}

// Load and display bank accounts in admin panel
function loadBankAccounts() {
    db.collection('bank_accounts').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('bankAccountsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No bank accounts added yet.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const account = { id: doc.id, ...doc.data() };
            const accountDiv = document.createElement('div');
            accountDiv.className = `bank-account-item ${!account.isActive ? 'inactive' : ''}`;
            
            // Get emoji for provider
            let providerEmoji = '📱';
            switch(account.providerName) {
                case 'M-PESA': providerEmoji = '📱 M-PESA'; break;
                case 'Airtel Money': providerEmoji = '📱 Airtel Money'; break;
                case 'Tigo Pesa': providerEmoji = '📱 Tigo Pesa'; break;
                case 'Halopesa': providerEmoji = '📱 Halopesa'; break;
                case 'Azam Pesa': providerEmoji = '📱 Azam Pesa'; break;
                default: providerEmoji = '📱 ' + account.providerName;
            }
            
            accountDiv.innerHTML = `
                <div class="bank-info">
                    <div class="bank-name">
                        ${providerEmoji}
                        <span class="status-badge ${account.isActive ? 'active' : 'inactive'}">${account.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div class="bank-details-small">
                        📞 ${account.accountNumber}
                    </div>
                    <div class="bank-details-small">👤 ${account.accountHolder}</div>
                </div>
                <div class="bank-actions">
                    <button class="bank-action-icon edit" onclick="editBankAccount('${account.id}')"><i class="fas fa-edit"></i></button>
                    <button class="bank-action-icon toggle" onclick="toggleBankAccountStatus('${account.id}', ${!account.isActive})"><i class="fas ${account.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
                    <button class="bank-action-icon delete" onclick="deleteBankAccount('${account.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            container.appendChild(accountDiv);
        });
    });
}

// Update the deposit modal to show mobile money accounts
function loadBankAccountsForDeposit() {
    db.collection('bank_accounts').where('isActive', '==', true).get().then(snapshot => {
        const container = document.getElementById('bankAccountsSelect');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400">No payment methods available. Please contact support.</p>';
        } else {
            container.innerHTML = '';
            snapshot.forEach(doc => {
                const account = { id: doc.id, ...doc.data() };
                const optionDiv = document.createElement('div');
                optionDiv.className = 'bank-option';
                
                // Get emoji for provider
                let providerEmoji = '📱';
                switch(account.providerName) {
                    case 'M-PESA': providerEmoji = '📱 M-PESA'; break;
                    case 'Airtel Money': providerEmoji = '📱 Airtel Money'; break;
                    case 'Tigo Pesa': providerEmoji = '📱 Tigo Pesa'; break;
                    case 'Halopesa': providerEmoji = '📱 Halopesa'; break;
                    case 'Azam Pesa': providerEmoji = '📱 Azam Pesa'; break;
                    default: providerEmoji = '📱 ' + account.providerName;
                }
                
                optionDiv.innerHTML = `
                    <div class="bank-option-info">
                        <span class="bank-provider">${providerEmoji}</span>
                        <span class="bank-details">📞 ${account.accountNumber}</span>
                        <span class="bank-details">👤 ${account.accountHolder}</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                `;
                optionDiv.onclick = () => selectBankAccount(account);
                container.appendChild(optionDiv);
            });
        }
    });
}

// Update openDepositModal to use the new function
function openDepositModal() {
    depositState = {
        selectedBankAccount: null,
        fullName: '',
        senderAccount: '',
        amount: 0,
        transactionCode: ''
    };
    
    loadBankAccountsForDeposit();
    
    const modal = document.getElementById('depositModal');
    if (modal) modal.classList.remove('hidden');
    goToDepositStep1();
}



// DEPOSIT FLOW
let depositState = {
    selectedBankAccount: null,
    fullName: '',
    senderAccount: '',
    amount: 0,
    transactionCode: ''
};

function openDepositModal() {
    depositState = {
        selectedBankAccount: null,
        fullName: '',
        senderAccount: '',
        amount: 0,
        transactionCode: ''
    };
    
    db.collection('bank_accounts').where('isActive', '==', true).get().then(snapshot => {
        const container = document.getElementById('bankAccountsSelect');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400">No payment methods available. Please contact support.</p>';
        } else {
            container.innerHTML = '';
            snapshot.forEach(doc => {
                const account = { id: doc.id, ...doc.data() };
                const optionDiv = document.createElement('div');
                optionDiv.className = 'bank-option';
                optionDiv.innerHTML = `
                    <div class="bank-option-info">
                        <span class="bank-provider">${account.providerName}</span>
                        <span class="bank-details">${account.accountType === 'mobile' ? '📱' : '🏦'} ${account.accountNumber}</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                `;
                optionDiv.onclick = () => selectBankAccount(account);
                container.appendChild(optionDiv);
            });
        }
    });
    
    const modal = document.getElementById('depositModal');
    if (modal) modal.classList.remove('hidden');
    goToDepositStep1();
}

function selectBankAccount(account) {
    depositState.selectedBankAccount = account;
    goToDepositStep2();
}

function goToDepositStep1() {
    const step1 = document.getElementById('depositStep1');
    const step2 = document.getElementById('depositStep2');
    const step3 = document.getElementById('depositStep3');
    const step4 = document.getElementById('depositStep4');
    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    if (step3) step3.classList.add('hidden');
    if (step4) step4.classList.add('hidden');
}

function goToDepositStep2() {
    if (!depositState.selectedBankAccount) {
        showToast('Please select a payment method', 'error');
        return;
    }
    const step1 = document.getElementById('depositStep1');
    const step2 = document.getElementById('depositStep2');
    const step3 = document.getElementById('depositStep3');
    const step4 = document.getElementById('depositStep4');
    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.remove('hidden');
    if (step3) step3.classList.add('hidden');
    if (step4) step4.classList.add('hidden');
    
    const fullNameInput = document.getElementById('depositFullName');
    const senderInput = document.getElementById('depositSenderAccount');
    const amountInput = document.getElementById('depositAmount');
    if (fullNameInput) fullNameInput.value = depositState.fullName;
    if (senderInput) senderInput.value = depositState.senderAccount;
    if (amountInput) amountInput.value = depositState.amount || '';
}

function goToDepositStep3() {
    const fullNameInput = document.getElementById('depositFullName');
    const senderInput = document.getElementById('depositSenderAccount');
    const amountInput = document.getElementById('depositAmount');
    
    depositState.fullName = fullNameInput ? fullNameInput.value : '';
    depositState.senderAccount = senderInput ? senderInput.value : '';
    depositState.amount = amountInput ? parseFloat(amountInput.value) : 0;
    
    if (!depositState.fullName) {
        showToast('Please enter your full name', 'error');
        return;
    }
    if (!depositState.senderAccount) {
        showToast('Please enter your account number', 'error');
        return;
    }
    if (!depositState.amount || depositState.amount < 1000) {
        showToast('Minimum deposit amount is 1,000 TZS', 'error');
        return;
    }
    
    const instructionsDiv = document.getElementById('paymentInstructions');
    const account = depositState.selectedBankAccount;
    if (instructionsDiv && account) {
        instructionsDiv.innerHTML = `
            <h4><i class="fas fa-info-circle"></i> Payment Instructions</h4>
            <p>Please send <strong>${depositState.amount.toLocaleString()} TZS</strong> to the following account:</p>
            <div class="bank-details-display">
                <p><strong>Provider:</strong> ${account.providerName}</p>
                <p><strong>Account Type:</strong> ${account.accountType === 'mobile' ? 'Mobile Money' : 'Bank Account'}</p>
                <p><strong>Account Number:</strong> ${account.accountNumber}</p>
                <p><strong>Account Holder:</strong> ${account.accountHolder}</p>
            </div>
            <p style="margin-top: 10px;"><strong>Note:</strong> ${account.instructions || 'Include your transaction reference for faster verification.'}</p>
            <p style="margin-top: 10px; color: #ffd700;">After sending the money, proceed to the next step to confirm your transaction.</p>
        `;
    }
    
    const step2 = document.getElementById('depositStep2');
    const step3 = document.getElementById('depositStep3');
    const step4 = document.getElementById('depositStep4');
    if (step2) step2.classList.add('hidden');
    if (step3) step3.classList.remove('hidden');
    if (step4) step4.classList.add('hidden');
}

function goToDepositStep4() {
    const step2 = document.getElementById('depositStep2');
    const step3 = document.getElementById('depositStep3');
    const step4 = document.getElementById('depositStep4');
    if (step2) step2.classList.add('hidden');
    if (step3) step3.classList.add('hidden');
    if (step4) step4.classList.remove('hidden');
    
    const summaryDiv = document.getElementById('depositSummary');
    if (summaryDiv) {
        summaryDiv.innerHTML = `
            <p><strong>Payment Method:</strong> ${depositState.selectedBankAccount.providerName}</p>
            <p><strong>Full Name:</strong> ${depositState.fullName}</p>
            <p><strong>Sender Account:</strong> ${depositState.senderAccount}</p>
            <p><strong>Amount:</strong> ${depositState.amount.toLocaleString()} TZS</p>
            <p><strong>Transaction Code:</strong> <span id="txCodePreview">${depositState.transactionCode || 'Not entered yet'}</span></p>
        `;
    }
    
    const txCodeInput = document.getElementById('depositTransactionCode');
    if (txCodeInput) {
        txCodeInput.value = depositState.transactionCode || '';
        txCodeInput.oninput = () => {
            depositState.transactionCode = txCodeInput.value;
            const preview = document.getElementById('txCodePreview');
            if (preview) preview.textContent = depositState.transactionCode || 'Not entered yet';
        };
    }
}

function submitDepositRequest() {
    if (!depositState.transactionCode) {
        showToast('Please enter your transaction reference code', 'error');
        return;
    }
    
    if (!state.currentUser) {
        showToast('Please login to submit deposit', 'error');
        closeDepositModal();
        return;
    }
    
    const depositData = {
        userId: state.currentUser.uid,
        userEmail: state.currentUser.email,
        fullName: depositState.fullName,
        senderAccount: depositState.senderAccount,
        amount: depositState.amount,
        transactionCode: depositState.transactionCode,
        bankAccountId: depositState.selectedBankAccount.id,
        bankProvider: depositState.selectedBankAccount.providerName,
        bankAccountNumber: depositState.selectedBankAccount.accountNumber,
        status: 'PENDING',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('deposits').add(depositData)
        .then(() => {
            showToast('Deposit request submitted! Awaiting admin approval.', 'success');
            closeDepositModal();
            depositState = {
                selectedBankAccount: null,
                fullName: '',
                senderAccount: '',
                amount: 0,
                transactionCode: ''
            };
        })
        .catch(err => showToast(err.message, 'error'));
        hideButtonLoading(submitBtn);
}

function closeDepositModal() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.classList.add('hidden');
}

// WITHDRAWAL FLOW
function openWithdrawModal() {
    const amountInput = document.getElementById('withdrawAmount');
    const fullNameInput = document.getElementById('withdrawFullName');
    const accountInput = document.getElementById('withdrawAccountNumber');
    
    if (amountInput) amountInput.value = '';
    if (fullNameInput) fullNameInput.value = '';
    if (accountInput) accountInput.value = '';
    
    const modal = document.getElementById('withdrawModal');
    if (modal) modal.classList.remove('hidden');
    
    const amountCalcInput = document.getElementById('withdrawAmount');
    if (amountCalcInput) {
        amountCalcInput.oninput = updateWithdrawalCalculator;
    }
    updateWithdrawalCalculator();
}

function updateWithdrawalCalculator() {
    const amountInput = document.getElementById('withdrawAmount');
    const amount = amountInput ? (parseFloat(amountInput.value) || 0) : 0;
    const feePercent = state.withdrawalFeePercent;
    const fee = amount * (feePercent / 100);
    const netAmount = amount - fee;
    
    const grossSpan = document.getElementById('calcGrossAmount');
    const feeSpan = document.getElementById('calcFeeAmount');
    const netSpan = document.getElementById('calcNetAmount');
    
    if (grossSpan) grossSpan.textContent = amount.toLocaleString() + ' TZS';
    if (feeSpan) feeSpan.textContent = fee.toLocaleString() + ' TZS';
    if (netSpan) netSpan.textContent = netAmount.toLocaleString() + ' TZS';
}

function submitWithdrawalRequest() {
    const amountInput = document.getElementById('withdrawAmount');
    const fullNameInput = document.getElementById('withdrawFullName');
    const accountInput = document.getElementById('withdrawAccountNumber');
    
    const amount = amountInput ? parseFloat(amountInput.value) : 0;
    const fullName = fullNameInput ? fullNameInput.value : '';
    const accountNumber = accountInput ? accountInput.value : '';
    const feePercent = state.withdrawalFeePercent;
    const fee = amount * (feePercent / 100);
    const netAmount = amount - fee;
    
    if (!amount || amount < 10000) {
        showToast('Minimum withdrawal amount is 10,000 TZS', 'error');
        return;
    }
    if (amount > state.balance) {
        showToast('Insufficient balance', 'error');
        return;
    }
    if (!fullName) {
        showToast('Please enter your full name', 'error');
        return;
    }
    if (!accountNumber) {
        showToast('Please enter your account number', 'error');
        return;
    }
    
    const withdrawalData = {
        userId: state.currentUser.uid,
        userEmail: state.currentUser.email,
        amount: amount,
        fee: fee,
        feePercent: feePercent,
        netAmount: netAmount,
        fullName: fullName,
        accountNumber: accountNumber,
        status: 'PENDING',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('withdrawals').add(withdrawalData)
        .then(() => {
            showToast(`Withdrawal request submitted! Net amount: ${netAmount.toLocaleString()} TZS`, 'success');
            closeWithdrawModal();
        })
        .catch(err => showToast(err.message, 'error'));
        hideButtonLoading(submitBtn);
}

function closeWithdrawModal() {
    const modal = document.getElementById('withdrawModal');
    if (modal) modal.classList.add('hidden');
}

// ADMIN APPROVALS
function loadPendingDeposits() {
    db.collection('deposits').where('status', '==', 'PENDING').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('pendingDepositsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No pending deposits.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const deposit = { id: doc.id, ...doc.data() };
            const depositDiv = document.createElement('div');
            depositDiv.className = 'pending-item';
            depositDiv.innerHTML = `
                <div class="pending-header">
                    <span class="pending-user">${deposit.fullName || deposit.userEmail}</span>
                    <span class="pending-amount">${deposit.amount.toLocaleString()} TZS</span>
                </div>
                <div class="pending-details">
                    📱 ${deposit.senderAccount || 'N/A'} | Provider: ${deposit.bankProvider}
                </div>
                <div class="pending-details">
                    TX Code: ${deposit.transactionCode}
                </div>
                <div class="pending-actions">
                    <button class="approve-btn" onclick="approveDeposit('${deposit.id}', ${deposit.amount})">✓ Approve</button>
                    <button class="reject-btn" onclick="rejectDeposit('${deposit.id}')">✗ Reject</button>
                </div>
            `;
            container.appendChild(depositDiv);
        });
    });
}

function approveDeposit(depositId, amount) {
    if (!confirm(`Approve deposit of ${amount.toLocaleString()} TZS?`)) return;
    
    const depositRef = db.collection('deposits').doc(depositId);
    
    db.runTransaction(async (transaction) => {
        const depositDoc = await transaction.get(depositRef);
        if (!depositDoc.exists) throw new Error("Deposit not found");
        if (depositDoc.data().status !== 'PENDING') throw new Error("Deposit already processed");
        
        const userId = depositDoc.data().userId;
        const userRef = db.collection('users').doc(userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists) throw new Error("User not found");
        
        const currentBalance = parseFloat(userDoc.data().balance || 0);
        const newBalance = currentBalance + amount;
        
        transaction.update(userRef, { balance: newBalance });
        transaction.update(depositRef, { 
            status: 'APPROVED', 
            processedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        const transRef = db.collection('transactions').doc();
        transaction.set(transRef, {
            uid: userId,
            type: 'deposit',
            amount: amount,
            status: 'approved',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            depositId: depositId
        });
        
        return newBalance;
    }).then(() => {
        showToast('Deposit approved! Balance updated.', 'success');
        if (state.currentUser && state.currentUser.uid) {
            updateBalanceDisplay();
        }
    }).catch(err => showToast(err.message, 'error'));
    if (approveBtn) hideButtonLoading(approveBtn);
}

function rejectDeposit(depositId) {
    if (!confirm('Reject this deposit request?')) return;
    
    db.collection('deposits').doc(depositId).update({
        status: 'REJECTED',
        processedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Deposit rejected', 'info');
    }).catch(err => showToast(err.message, 'error'));
}

function loadPendingWithdrawals() {
    db.collection('withdrawals').where('status', '==', 'PENDING').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('pendingWithdrawalsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No pending withdrawals.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const withdrawal = { id: doc.id, ...doc.data() };
            const withdrawalDiv = document.createElement('div');
            withdrawalDiv.className = 'pending-item';
            withdrawalDiv.innerHTML = `
                <div class="pending-header">
                    <span class="pending-user">${withdrawal.fullName}</span>
                    <span class="pending-amount">${withdrawal.amount.toLocaleString()} TZS</span>
                </div>
                <div class="pending-details">
                    Account: ${withdrawal.accountNumber} | Fee: ${withdrawal.feePercent}% (${withdrawal.fee.toLocaleString()} TZS)
                </div>
                <div class="pending-details">
                    Net payout: <strong>${withdrawal.netAmount.toLocaleString()} TZS</strong>
                </div>
                <div class="pending-actions">
                    <button class="approve-btn" onclick="approveWithdrawal('${withdrawal.id}', ${withdrawal.amount}, '${withdrawal.userId}')">✓ Approve</button>
                    <button class="reject-btn" onclick="rejectWithdrawal('${withdrawal.id}')">✗ Reject</button>
                </div>
            `;
            container.appendChild(withdrawalDiv);
        });
    });
}

function approveWithdrawal(withdrawalId, amount, userId) {
    if (!confirm(`Approve withdrawal of ${amount.toLocaleString()} TZS? This will deduct from user balance.`)) return;
    
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    const userRef = db.collection('users').doc(userId);
    
    db.runTransaction(async (transaction) => {
        const withdrawalDoc = await transaction.get(withdrawalRef);
        if (!withdrawalDoc.exists) throw new Error("Withdrawal not found");
        if (withdrawalDoc.data().status !== 'PENDING') throw new Error("Withdrawal already processed");
        
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("User not found");
        
        const currentBalance = parseFloat(userDoc.data().balance || 0);
        if (currentBalance < amount) throw new Error("Insufficient balance");
        
        transaction.update(userRef, { balance: currentBalance - amount });
        transaction.update(withdrawalRef, { 
            status: 'APPROVED', 
            processedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        const transRef = db.collection('transactions').doc();
        transaction.set(transRef, {
            uid: userId,
            type: 'withdrawal',
            amount: amount,
            status: 'approved',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            withdrawalId: withdrawalId
        });
        
    }).then(() => {
        showToast('Withdrawal approved! Balance updated.', 'success');
        if (state.currentUser && state.currentUser.uid) {
            updateBalanceDisplay();
        }
    }).catch(err => showToast(err.message, 'error'));
}

function rejectWithdrawal(withdrawalId) {
    if (!confirm('Reject this withdrawal request?')) return;
    
    db.collection('withdrawals').doc(withdrawalId).update({
        status: 'REJECTED',
        processedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Withdrawal rejected', 'info');
    }).catch(err => showToast(err.message, 'error'));
}

// USER PROFILE FUNCTIONS
function loadUserProfileData() {
    if (!state.currentUser) return;
    
    db.collection('users').doc(state.currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            const profileUsername = document.getElementById('profileUsername');
            const profileEmail = document.getElementById('profileEmail');
            const referralCount = document.getElementById('referralCount');
            const commissionEarned = document.getElementById('commissionEarned');
            
            if (profileUsername) profileUsername.textContent = data.username || 'User';
            if (profileEmail) profileEmail.textContent = data.email || '';
            if (referralCount) referralCount.textContent = data.referralCount || 0;
            if (commissionEarned) commissionEarned.textContent = (data.commissionEarned || 0).toLocaleString();
            
            const promoCode = data.promoCode || data.username;
            const referralLink = `${window.location.origin}${window.location.pathname}?ref=${promoCode}`;
            const referralInput = document.getElementById('referralLinkDisplay');
            if (referralInput) referralInput.value = referralLink;
        }
    });
}

function loadWalletStats() {
    if (!state.currentUser) return;
    
    db.collection('transactions')
        .where('uid', '==', state.currentUser.uid)
        .where('type', '==', 'deposit')
        .where('status', '==', 'approved')
        .get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            const totalDepositsElem = document.getElementById('totalDeposits');
            if (totalDepositsElem) totalDepositsElem.textContent = total.toLocaleString() + ' TZS';
        });
    
    db.collection('transactions')
        .where('uid', '==', state.currentUser.uid)
        .where('type', '==', 'withdrawal')
        .where('status', '==', 'approved')
        .get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            const totalWithdrawalsElem = document.getElementById('totalWithdrawals');
            if (totalWithdrawalsElem) totalWithdrawalsElem.textContent = total.toLocaleString() + ' TZS';
        });
    
    Promise.all([
        db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'PENDING').get(),
        db.collection('withdrawals').where('userId', '==', state.currentUser.uid).where('status', '==', 'PENDING').get()
    ]).then(([deposits, withdrawals]) => {
        const count = deposits.size + withdrawals.size;
        const pendingCountElem = document.getElementById('pendingRequestsCount');
        if (pendingCountElem) pendingCountElem.textContent = count;
    });
}

function loadUserTransactionHistory() {
    if (!state.currentUser) return;
    
    db.collection('transactions')
        .where('uid', '==', state.currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            const tbody = document.getElementById('transactionTableBody');
            if (!tbody) return;
            
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500">No transactions found</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            snapshot.forEach(doc => {
                const tx = doc.data();
                let formattedDate = 'Pending...';
                if (tx.createdAt) {
                    const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
                    formattedDate = d.toLocaleString();
                }
                
                let statusBadge = '';
                if (tx.status === 'approved') {
                    statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400">Approved</span>';
                } else if (tx.status === 'rejected') {
                    statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-rose-500/10 text-rose-400">Rejected</span>';
                } else {
                    statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400">Pending</span>';
                }
                
                const typeColor = tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-6 py-4 text-sm">${formattedDate}</td>
                    <td class="px-6 py-4 text-sm font-medium uppercase ${typeColor}">${tx.type || 'Trade'}</td>
                    <td class="px-6 py-4 text-sm">${(tx.amount || 0).toLocaleString()} TZS</td>
                    <td class="px-6 py-4 text-sm">${statusBadge}</td>
                    <td class="px-6 py-4 text-xs text-slate-400">${doc.id.substring(0, 8)}...</td>
                `;
                tbody.appendChild(row);
            });
        });
}

// =========================================================================
// APPLICATION ENVIRONMENT RUNTIME HANDLERS
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Admin Load Profile Trigger Hook Integration
    const loadUserBtn = document.getElementById('adminLoadUserBtn');
    const targetIdInput = document.getElementById('adminTargetUserIdInput');
    if (loadUserBtn && targetIdInput) {
        loadUserBtn.addEventListener('click', () => {
            loadProfileByUserId(targetIdInput.value);
        });
    }

    if (topLoginBtn) {
        topLoginBtn.addEventListener('click', () => {
            isLoginMode = true;
            if (usernameFieldGroup) usernameFieldGroup.classList.add('hidden');
            if (confirmPasswordFieldGroup) confirmPasswordFieldGroup.classList.add('hidden');
            if (promoFieldGroup) promoFieldGroup.classList.add('hidden');
            if (termsFieldGroup) termsFieldGroup.classList.add('hidden');
            if (modalTitle) modalTitle.textContent = "Welcome to TapTrade";
            if (submitBtnText) submitBtnText.textContent = "Access Dashboard";
            if (loginModal) loginModal.classList.remove('hidden');
        });
    }

    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) loginModal.classList.add('hidden');
        });
    }

    const adminAccessBtn = document.getElementById('adminAccess');
    if (adminAccessBtn) {
        adminAccessBtn.addEventListener('click', () => {
            if (loginModal) loginModal.classList.add('hidden');
            if (adminPanel) adminPanel.classList.remove('hidden');
            if (userDashboard) userDashboard.classList.add('hidden');
            state.isAdmin = true;
            addAdminLog('Admin access granted');
            showToast('Admin panel activated', 'info');
        });
    }



// Exit Admin button - now logs out instead of just hiding
const exitAdmin = document.getElementById('exitAdmin');
if (exitAdmin) {
    exitAdmin.addEventListener('click', () => {
        logoutUser();
    });
}
    
    // Trade Type Listeners
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    if (buyBtn && sellBtn) {
        buyBtn.addEventListener('click', function() {
            this.classList.add('active-trade');
            sellBtn.classList.remove('active-trade');
            state.currentTrade.type = 'buy';
        });
        sellBtn.addEventListener('click', function() {
            this.classList.add('active-trade');
            buyBtn.classList.remove('active-trade');
            state.currentTrade.type = 'sell';
        });
    }

    document.querySelectorAll('.quick-amt').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.quick-amt').forEach(b => b.classList.remove('active-quick'));
            this.classList.add('active-quick');
            const amount = parseFloat(this.dataset.amount);
            const amtInput = document.getElementById('tradeAmount');
            if (amtInput) amtInput.value = amount;
            state.currentTrade.amount = amount;
        });
    });
    
    const tradeAmtInput = document.getElementById('tradeAmount');
    if (tradeAmtInput) {
        tradeAmtInput.addEventListener('input', function() {
            state.currentTrade.amount = parseFloat(this.value) || 0;
        });
    }
    
    document.querySelectorAll('.expiry-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.expiry-option').forEach(b => b.classList.remove('active-expiry'));
            this.classList.add('active-expiry');
            state.currentTrade.expirySeconds = parseInt(this.dataset.seconds);
        });
    });
    
    const executeTradeBtn = document.getElementById('executeTrade');
    if (executeTradeBtn) {
        executeTradeBtn.addEventListener('click', () => { executeTrade(); });
    }
    
    const refreshBalance = document.getElementById('refreshBalance');
    if (refreshBalance) {
        refreshBalance.addEventListener('click', () => {
            updateBalanceDisplay();
            showToast('Balance refreshed', 'info');
        });
    }
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
            this.classList.add('active-filter');
            updateLedgerDisplay(this.dataset.filter);
        });
    });
    
    // Core Admin Logic Hooks
    const adminSetUp = document.getElementById('adminSetUp');
    const adminSetDown = document.getElementById('adminSetDown');
    const adminResetSignal = document.getElementById('adminResetSignal');
    if (adminSetUp) adminSetUp.addEventListener('click', () => setAdminSignal('up'));
    if (adminSetDown) adminSetDown.addEventListener('click', () => setAdminSignal('down'));
    if (adminResetSignal) adminResetSignal.addEventListener('click', () => resetAdminSignal());
    
    const forceUpTrend = document.getElementById('forceUpTrend');
    const forceDownTrend = document.getElementById('forceDownTrend');
    const clearOverride = document.getElementById('clearOverride');
    if (forceUpTrend) forceUpTrend.addEventListener('click', () => setAdminSignal('up'));
    if (forceDownTrend) forceDownTrend.addEventListener('click', () => setAdminSignal('down'));
    if (clearOverride) clearOverride.addEventListener('click', () => resetAdminSignal());
    
    const sigStrengthInput = document.getElementById('signalStrength');
    if (sigStrengthInput) {
        sigStrengthInput.addEventListener('input', function() {
            state.signalStrength = parseInt(this.value);
            const strVal = document.getElementById('strengthValue');
            if (strVal) strVal.textContent = this.value + '%';
        });
    }
    
    const syncFirebase = document.getElementById('syncFirebase');
    if (syncFirebase) {
        syncFirebase.addEventListener('click', () => {
            addAdminLog('Data synced successfully');
            showToast('System synchronized', 'success');
        });
    }
    
    const resetSystem = document.getElementById('resetSystem');
    if (resetSystem) {
        resetSystem.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset current operational caches?')) {
                state.activeTrades = [];
                state.transactionHistory = [];
                state.balance = 0;
                updateBalanceDisplay();
                updateActiveTradesDisplay();
                updateLedgerDisplay();
                addAdminLog('System reset performed');
                showToast('System reset complete', 'info');
            }
        });
    }
    
    window.addEventListener('resize', () => {
        if (mainChart && chartContainer) {
            mainChart.applyOptions({
                width: chartContainer.clientWidth,
                height: chartContainer.clientHeight,
            });
        }
    });
    
    // Begin Context Execution Loops
    setInterval(checkTradeOutcomes, 1000);
    extractInboundReferralVector();
    initializeReferralClipboardControls();
    syncGlobalPlatformMetrics();
    syncActiveSignalsDisplay();

    state.currentTrade.amount = 2500;
    state.currentTrade.expirySeconds = 60;
    

    // Wallet buttons
    const walletDepositBtn = document.getElementById('walletDepositBtn');
    const walletWithdrawBtn = document.getElementById('walletWithdrawBtn');
    
    if (walletDepositBtn) {
        walletDepositBtn.addEventListener('click', () => {
            if (!state.currentUser) {
                showToast('Please login first', 'error');
                if (topLoginBtn) topLoginBtn.click();
                return;
            }
            openDepositModal();
        });
    }
    
    if (walletWithdrawBtn) {
        walletWithdrawBtn.addEventListener('click', () => {
            if (!state.currentUser) {
                showToast('Please login first', 'error');
                if (topLoginBtn) topLoginBtn.click();
                return;
            }
            openWithdrawModal();
        });
    }
    
    // Admin Bank Account Management
    const addBankAccountBtn = document.getElementById('addBankAccountBtn');
    if (addBankAccountBtn) {
        addBankAccountBtn.addEventListener('click', () => openBankAccountModal());
    }
    
    // Bank account form submission
    const bankAccountForm = document.getElementById('bankAccountForm');
    if (bankAccountForm) {
        bankAccountForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveBankAccount();
        });
    }
    
    // Withdrawal fee settings
    const saveFeeSettings = document.getElementById('saveFeeSettings');
    if (saveFeeSettings) {
        saveFeeSettings.addEventListener('click', saveWithdrawalFeeSettings);
    }
    
    // Delete bank account button
    const deleteBankAccountBtn = document.getElementById('deleteBankAccountBtn');
    if (deleteBankAccountBtn) {
        deleteBankAccountBtn.addEventListener('click', () => {
            const accountId = document.getElementById('bankAccountId').value;
            if (accountId && confirm('Delete this bank account permanently?')) {
                deleteBankAccount(accountId);
                closeBankAccountModal();
            }
        });
    }
    
    // Inside DOMContentLoaded, add:

// Load Trade History when trades tab is selected
document.getElementById('navTrades')?.addEventListener('click', () => {
    loadTradeHistory(currentTradeFilter);
});

// Trade history filters
document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentTradeFilter = this.dataset.filter;
        loadTradeHistory(currentTradeFilter, true);
    });
});

// Transaction ledger filters
document.querySelectorAll('.ledger-filter').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.ledger-filter').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        loadTransactionLedger(this.dataset.filter);
    });
});

// Load More Trades button
document.getElementById('loadMoreTrades')?.addEventListener('click', () => {
    currentTradePage++;
    loadTradeHistory(currentTradeFilter, false);
});

// Load all history when user is logged in
if (state.currentUser) {
    loadSignalHistory();
    loadTransactionLedger('all');
    loadTradeHistory('all', true);
}
    
    // Add to your DOMContentLoaded event listener
if (state.currentUser) {
    loadUserUsedSignals();
}
    
    // Load initial data
    loadBankAccounts();
    loadWithdrawalFeeSettings();
    loadPendingDeposits();
    loadPendingWithdrawals();
    initBankAccountModalFields();
    listenForActiveSignals();
loadAdminSignals();
switchAdminTab('approvals'); // default tab
});


function checkTradeOutcomes() {
    if (state.activeTrades.length === 0) return;
    
    const now = Date.now();
    let updated = false;
    
    state.activeTrades = state.activeTrades.filter(trade => {
        const elapsed = Math.floor((now - trade.startTime) / 1000);
        trade.timeLeft = Math.max(0, trade.expirySeconds - elapsed);
        
        if (trade.timeLeft <= 0) {
            let isWin = false;
            let calculatedPayout = 0;
            let structuralStatus = 'loss';
            let profitAmount = 0;
            let priceChangePercent = 0;
            
            // Check if trade was placed DURING an active signal window
            if (trade.followedSignal === true && trade.signalMultiplier) {
                // SIGNAL FOLLOWING TRADE - GUARANTEED WIN
                isWin = true;
                const profitPercent = trade.signalMultiplier;
                profitAmount = trade.amount * (profitPercent / 100);
                calculatedPayout = trade.amount + profitAmount;
                structuralStatus = 'win';
                showToast(`🎯 SIGNAL WIN! You earned ${profitAmount.toLocaleString()} TZS (${profitPercent}% profit)`, 'success');
            }
            else if (trade.hasActiveSignal === true && trade.followedSignal === false) {
                // TRADED AGAINST SIGNAL - GUARANTEED LOSS
                isWin = false;
                calculatedPayout = 0;
                profitAmount = 0;
                structuralStatus = 'loss';
                showToast(`💀 SIGNAL REJECTED! You lost ${trade.amount.toLocaleString()} TZS.`, 'error');
            }
            else {
                // ========== FOREX STYLE NORMAL TRADING ==========
                const currentPrice = state.chartData[state.chartData.length - 1].close;
                const entryPrice = trade.entryPrice;
                
                if (trade.type === 'buy') {
                    priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                } else {
                    priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
                }
                
                const leverage = 5;
                const leveragedChangePercent = priceChangePercent * leverage;
                const isMarketWin = leveragedChangePercent > 0.03;
                
                if (isMarketWin) {
                    isWin = true;
                    let profitPercent = Math.min(leveragedChangePercent, 150);
                    profitAmount = trade.amount * (profitPercent / 100);
                    calculatedPayout = trade.amount + profitAmount;
                    structuralStatus = 'win';
                    showToast(`📈 FOREX WIN! ${trade.type.toUpperCase()} moved ${priceChangePercent.toFixed(3)}% → +${profitAmount.toLocaleString()} TZS`, 'success');
                } else {
                    isWin = false;
                    let lossPercent = Math.min(Math.abs(leveragedChangePercent), 100);
                    profitAmount = -(trade.amount * (lossPercent / 100));
                    calculatedPayout = 0;
                    structuralStatus = 'loss';
                    showToast(`📉 FOREX LOSS! ${trade.type.toUpperCase()} moved ${priceChangePercent.toFixed(3)}% → -${Math.abs(profitAmount).toLocaleString()} TZS`, 'error');
                }
            }
            
            // UPDATE BALANCE with winnings
            if (isWin && calculatedPayout > 0) {
                state.balance += calculatedPayout;
            }
            
            updated = true;
            
            // SAVE to Firestore immediately
            if (state.currentUser) {
                const batch = db.batch();
                const userRef = db.collection('users').doc(state.currentUser.uid);
                const transRef = userRef.collection('transactions').doc(trade.id.toString());
                
                // Update user balance
                batch.update(userRef, {
                    balance: state.balance,
                    lastTradeAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Save transaction record
                batch.update(transRef, {
                    status: structuralStatus,
                    payout: calculatedPayout,
                    profitAmount: isWin ? profitAmount : -trade.amount,
                    profitPercent: isWin ? (trade.signalMultiplier || (priceChangePercent * 5).toFixed(2)) : 0,
                    stakeAmount: trade.amount,
                    entryPrice: trade.entryPrice,
                    exitPrice: state.chartData[state.chartData.length - 1].close,
                    priceMovementPercent: priceChangePercent,
                    followedSignal: trade.followedSignal || false,
                    signalId: trade.signalId || null,
                    signalDirection: trade.signalDirection || null,
                    closedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                batch.commit().then(() => {
                    console.log(`Trade ${trade.id} saved. New balance: ${state.balance}`);
                }).catch(err => console.error("Error saving trade:", err));
            }
            
            return false;
        }
        return true;
    });
    
    if (updated) {
        // Update all balance displays
        updateBalanceDisplay();
        updateActiveTradesDisplay();
        
        // Also update wallet stats
        if (typeof loadWalletStats === 'function' && state.currentUser) {
            loadWalletStats();
        }
        if (typeof loadUserTransactionHistory === 'function' && state.currentUser) {
            loadUserTransactionHistory();
        }
    }
}

function switchTab(activeTabId) {
    // Prevent access to restricted sections when not logged in
    const restrictedTabs = ['signals', 'wallet', 'profile'];
    
    if (!state.currentUser && restrictedTabs.includes(activeTabId)) {
        showToast('Please login to access this section', 'error');
        if (topLoginBtn) topLoginBtn.click();
        return;
    }
    
    // Map tab IDs to section IDs
    const tabToSection = {
        'home': 'sectionHome',
        'trades': 'sectionTrades',
        'signals': 'sectionSignals',
        'wallet': 'sectionWallet',
        'profile': 'sectionProfile'
    };
    
    // Hide ALL sections first
    const allSections = ['sectionHome', 'sectionTrades', 'sectionSignals', 'sectionWallet', 'sectionProfile'];
    allSections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.add('hidden');
        }
    });
    
    // Show the selected section
    const targetSectionId = tabToSection[activeTabId];
    if (targetSectionId) {
        const targetSection = document.getElementById(targetSectionId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }
    }
    
    // Update navigation buttons
    const navButtons = ['navHome', 'navTrades', 'navSignals', 'navWallet', 'navProfile'];
    navButtons.forEach(btnId => {
        const button = document.getElementById(btnId);
        if (button) {
            button.classList.remove('text-emerald-500', 'bg-emerald-500/10');
            button.classList.add('text-slate-400');
        }
    });
    
    // Add active styles to the selected button
    const activeButton = document.getElementById(`nav${activeTabId.charAt(0).toUpperCase() + activeTabId.slice(1)}`);
    if (activeButton) {
        activeButton.classList.remove('text-slate-400');
        activeButton.classList.add('text-emerald-500', 'bg-emerald-500/10');
    }
    
    // Special handling for wallet tab - refresh data
    if (activeTabId === 'wallet' && state.currentUser) {
        setTimeout(() => {
            if (typeof renderTransactionTable === 'function') renderTransactionTable();
            if (typeof loadWalletStats === 'function') loadWalletStats();
            if (typeof loadUserTransactionHistory === 'function') loadUserTransactionHistory();
        }, 50);
    }
    
    // Special handling for profile tab - refresh user data
    if (activeTabId === 'profile' && state.currentUser) {
        setTimeout(() => {
            if (typeof loadUserProfileData === 'function') loadUserProfileData();
        }, 50);
    }
}

// =========================================================================
// TRANSACTION HISTORY RENDERING ENGINE
// =========================================================================
function renderTransactionTable() {
    // 1. Locate the table body inside your HTML layout
    const tableBody = document.getElementById('transactionTableBody');
    if (!tableBody) {
        console.warn("HTML element #transactionTableBody not found in the DOM.");
        return;
    }

    // 2. Clear out any old rows inside the table before rendering
    tableBody.innerHTML = '';

    if (state.transactionHistory.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-4 text-center text-sm text-slate-500">
                    No transactions found
                </td>
            </tr>
        `;
        return;
    }

    // 3. Build rows for each record in the state array
    state.transactionHistory.forEach(tx => {
        const row = document.createElement('tr');
        row.className = 'border-b border-slate-800 hover:bg-slate-800/40 transition-colors';

        // Format dates nicely
        let formattedDate = 'Pending...';
        if (tx.createdAt) {
            const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
            formattedDate = d.toLocaleString('en-US', { hour12: true });
        }

        // Apply badges based on transaction status
        let statusBadge = '';
        if (tx.status === 'approved' || tx.status === 'success') {
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400">Approved</span>`;
        } else if (tx.status === 'rejected' || tx.status === 'failed') {
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400">Rejected</span>`;
        } else {
            statusBadge = `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400">Pending</span>`;
        }

        // Apply color depending on type (Deposit vs Withdraw vs Trade)
        const typeColor = tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">${formattedDate}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium uppercase tracking-wider ${typeColor}">${tx.type || 'Trade'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-100 font-mono font-medium">
                ${Number(tx.amount || tx.investment || 0).toLocaleString('en-US')} TZS
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${statusBadge}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-400 font-mono text-xs">${tx.id.substring(0, 8)}...</td>
        `;

        tableBody.appendChild(row);
    });
}

// =========================================================================
// BANK ACCOUNT MANAGEMENT (ADMIN)
// =========================================================================

// Load and display bank accounts in admin panel
function loadBankAccounts() {
    db.collection('bank_accounts').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('bankAccountsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No bank accounts added yet.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const account = { id: doc.id, ...doc.data() };
            const accountDiv = document.createElement('div');
            accountDiv.className = `bank-account-item ${!account.isActive ? 'inactive' : ''}`;
            accountDiv.innerHTML = `
                <div class="bank-info">
                    <div class="bank-name">
                        ${account.providerName}
                        <span class="status-badge ${account.isActive ? 'active' : 'inactive'}">${account.isActive ? 'Active' : 'Inactive'}</span>
                    </div>
                    <div class="bank-details-small">
                        ${account.accountType === 'mobile' ? '📱 Mobile' : '🏦 Bank'} | ${account.accountNumber}
                    </div>
                    <div class="bank-details-small">Holder: ${account.accountHolder}</div>
                </div>
                <div class="bank-actions">
                    <button class="bank-action-icon edit" onclick="editBankAccount('${account.id}')"><i class="fas fa-edit"></i></button>
                    <button class="bank-action-icon toggle" onclick="toggleBankAccountStatus('${account.id}', ${!account.isActive})"><i class="fas ${account.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
                    <button class="bank-action-icon delete" onclick="deleteBankAccount('${account.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
            container.appendChild(accountDiv);
        });
    });
}

function selectBankAccount(account) {
    depositState.selectedBankAccount = account;
    goToDepositStep2();
}

function goToDepositStep1() {
    document.getElementById('depositStep1').classList.remove('hidden');
    document.getElementById('depositStep2').classList.add('hidden');
    document.getElementById('depositStep3').classList.add('hidden');
    document.getElementById('depositStep4').classList.add('hidden');
}

function goToDepositStep2() {
    if (!depositState.selectedBankAccount) {
        showToast('Please select a payment method', 'error');
        return;
    }
    document.getElementById('depositStep1').classList.add('hidden');
    document.getElementById('depositStep2').classList.remove('hidden');
    document.getElementById('depositStep3').classList.add('hidden');
    document.getElementById('depositStep4').classList.add('hidden');
    
    // Pre-fill if returning
    document.getElementById('depositFullName').value = depositState.fullName;
    document.getElementById('depositSenderAccount').value = depositState.senderAccount;
    document.getElementById('depositAmount').value = depositState.amount || '';
}

function goToDepositStep3() {
    depositState.fullName = document.getElementById('depositFullName').value;
    depositState.senderAccount = document.getElementById('depositSenderAccount').value;
    depositState.amount = parseFloat(document.getElementById('depositAmount').value);
    
    if (!depositState.fullName) {
        showToast('Please enter your full name', 'error');
        return;
    }
    if (!depositState.senderAccount) {
        showToast('Please enter your account number', 'error');
        return;
    }
    if (!depositState.amount || depositState.amount < 1000) {
        showToast('Minimum deposit amount is 1,000 TZS', 'error');
        return;
    }
    
    // Display payment instructions
    const instructionsDiv = document.getElementById('paymentInstructions');
    const account = depositState.selectedBankAccount;
    instructionsDiv.innerHTML = `
        <h4><i class="fas fa-info-circle"></i> Payment Instructions</h4>
        <p>Please send <strong>${depositState.amount.toLocaleString()} TZS</strong> to the following account:</p>
        <div class="bank-details-display">
            <p><strong>Provider:</strong> ${account.providerName}</p>
            <p><strong>Account Type:</strong> ${account.accountType === 'mobile' ? 'Mobile Money' : 'Bank Account'}</p>
            <p><strong>Account Number:</strong> ${account.accountNumber}</p>
            <p><strong>Account Holder:</strong> ${account.accountHolder}</p>
        </div>
        <p style="margin-top: 10px;"><strong>Note:</strong> ${account.instructions || 'Include your transaction reference for faster verification.'}</p>
        <p style="margin-top: 10px; color: #ffd700;">After sending the money, proceed to the next step to confirm your transaction.</p>
    `;
    
    document.getElementById('depositStep2').classList.add('hidden');
    document.getElementById('depositStep3').classList.remove('hidden');
    document.getElementById('depositStep4').classList.add('hidden');
}

function goToDepositStep4() {
    document.getElementById('depositStep2').classList.add('hidden');
    document.getElementById('depositStep3').classList.add('hidden');
    document.getElementById('depositStep4').classList.remove('hidden');
    
    // Show summary
    const summaryDiv = document.getElementById('depositSummary');
    summaryDiv.innerHTML = `
        <p><strong>Payment Method:</strong> ${depositState.selectedBankAccount.providerName}</p>
        <p><strong>Full Name:</strong> ${depositState.fullName}</p>
        <p><strong>Sender Account:</strong> ${depositState.senderAccount}</p>
        <p><strong>Amount:</strong> ${depositState.amount.toLocaleString()} TZS</p>
        <p><strong>Transaction Code:</strong> <span id="txCodePreview">${depositState.transactionCode || 'Not entered yet'}</span></p>
    `;
    
    const txCodeInput = document.getElementById('depositTransactionCode');
    txCodeInput.value = depositState.transactionCode || '';
    txCodeInput.oninput = () => {
        depositState.transactionCode = txCodeInput.value;
        document.getElementById('txCodePreview').textContent = depositState.transactionCode || 'Not entered yet';
    };
}

function submitDepositRequest() {
    if (!depositState.transactionCode) {
        showToast('Please enter your transaction reference code', 'error');
        return;
    }
    
    if (!state.currentUser) {
        showToast('Please login to submit deposit', 'error');
        closeDepositModal();
        return;
    }
    
    const depositData = {
        userId: state.currentUser.uid,
        userEmail: state.currentUser.email,
        fullName: depositState.fullName,
        senderAccount: depositState.senderAccount,
        amount: depositState.amount,
        transactionCode: depositState.transactionCode,
        bankAccountId: depositState.selectedBankAccount.id,
        bankProvider: depositState.selectedBankAccount.providerName,
        bankAccountNumber: depositState.selectedBankAccount.accountNumber,
        status: 'PENDING',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('deposits').add(depositData)
        .then(() => {
            showToast('Deposit request submitted! Awaiting admin approval.', 'success');
            closeDepositModal();
            // Reset deposit state
            depositState = {
                selectedBankAccount: null,
                fullName: '',
                senderAccount: '',
                amount: 0,
                transactionCode: ''
            };
        })
        .catch(err => showToast(err.message, 'error'));
}

function closeDepositModal() {
    document.getElementById('depositModal').classList.add('hidden');
}

// =========================================================================
// WITHDRAWAL FLOW (USER)
// =========================================================================

function openWithdrawModal() {
    // Reset form
    document.getElementById('withdrawAmount').value = '';
    document.getElementById('withdrawFullName').value = '';
    document.getElementById('withdrawAccountNumber').value = '';
    
    document.getElementById('withdrawModal').classList.remove('hidden');
    
    // Add calculator listener
    const amountInput = document.getElementById('withdrawAmount');
    amountInput.oninput = updateWithdrawalCalculator;
    updateWithdrawalCalculator();
}

function updateWithdrawalCalculator() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value) || 0;
    const feePercent = state.withdrawalFeePercent;
    const fee = amount * (feePercent / 100);
    const netAmount = amount - fee;
    
    document.getElementById('calcGrossAmount').textContent = amount.toLocaleString() + ' TZS';
    document.getElementById('calcFeeAmount').textContent = fee.toLocaleString() + ' TZS';
    document.getElementById('calcNetAmount').textContent = netAmount.toLocaleString() + ' TZS';
}

function submitWithdrawalRequest() {
    const amountInput = document.getElementById('withdrawAmount');
    const fullNameInput = document.getElementById('withdrawFullName');
    const accountInput = document.getElementById('withdrawAccountNumber');
    
    const amount = amountInput ? parseFloat(amountInput.value) : 0;
    const fullName = fullNameInput ? fullNameInput.value : '';
    const accountNumber = accountInput ? accountInput.value : '';
    const feePercent = state.withdrawalFeePercent;
    const fee = amount * (feePercent / 100);
    const netAmount = amount - fee;
    
    if (!amount || amount < 10000) {
        showToast('Minimum withdrawal amount is 10,000 TZS', 'error');
        return;
    }
    if (amount > state.balance) {
        showToast('Insufficient balance', 'error');
        return;
    }
    if (!fullName) {
        showToast('Please enter your full name', 'error');
        return;
    }
    if (!accountNumber) {
        showToast('Please enter your account number', 'error');
        return;
    }
    
    // DEDUCT AMOUNT IMMEDIATELY from user balance
    const newBalance = state.balance - amount;
    
    // Update local state immediately
    state.balance = newBalance;
    updateBalanceDisplay();
    
    // Create withdrawal request with status 'PENDING' but balance already deducted
    const withdrawalData = {
        userId: state.currentUser.uid,
        userEmail: state.currentUser.email,
        amount: amount,
        fee: fee,
        feePercent: feePercent,
        netAmount: netAmount,
        fullName: fullName,
        accountNumber: accountNumber,
        status: 'PENDING',
        balanceBeforeDeduction: state.balance + amount, // Store original balance
        balanceAfterDeduction: newBalance,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Update Firestore: deduct balance AND create withdrawal request in a transaction
    db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(state.currentUser.uid);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists) throw new Error("User not found");
        
        const currentBalance = parseFloat(userDoc.data().balance || 0);
        if (currentBalance < amount) throw new Error("Insufficient balance");
        
        // Deduct balance
        transaction.update(userRef, {
            balance: currentBalance - amount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Create withdrawal request
        const withdrawalRef = db.collection('withdrawals').doc();
        transaction.set(withdrawalRef, {
            ...withdrawalData,
            id: withdrawalRef.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return withdrawalRef.id;
    }).then((withdrawalId) => {
        showToast(`Withdrawal request submitted! Amount ${amount.toLocaleString()} TZS deducted from your balance. Pending approval.`, 'info');
        closeWithdrawModal();
        
        // Refresh user balance from server
        db.collection('users').doc(state.currentUser.uid).get().then(doc => {
            if (doc.exists) {
                state.balance = parseFloat(doc.data().balance || 0);
                updateBalanceDisplay();
            }
        });
    }).catch(err => {
        // Revert local balance on error
        state.balance = state.balance + amount;
        updateBalanceDisplay();
        showToast(err.message, 'error');
    });
}

function closeWithdrawModal() {
    document.getElementById('withdrawModal').classList.add('hidden');
}

// =========================================================================
// ADMIN DEPOSIT & WITHDRAWAL APPROVALS
// =========================================================================

function loadPendingDeposits() {
    db.collection('deposits').where('status', '==', 'PENDING').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('pendingDepositsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No pending deposits.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const deposit = { id: doc.id, ...doc.data() };
            const depositDiv = document.createElement('div');
            depositDiv.className = 'pending-item';
            depositDiv.innerHTML = `
                <div class="pending-header">
                    <span class="pending-user">${deposit.fullName || deposit.userEmail}</span>
                    <span class="pending-amount">${deposit.amount.toLocaleString()} TZS</span>
                </div>
                <div class="pending-details">
                    📱 ${deposit.senderAccount || 'N/A'} | Provider: ${deposit.bankProvider}
                </div>
                <div class="pending-details">
                    TX Code: ${deposit.transactionCode}
                </div>
                <div class="pending-actions">
                    <button class="approve-btn" onclick="approveDeposit('${deposit.id}', ${deposit.amount})">✓ Approve</button>
                    <button class="reject-btn" onclick="rejectDeposit('${deposit.id}')">✗ Reject</button>
                </div>
            `;
            container.appendChild(depositDiv);
        });
    });
}

function approveDeposit(depositId, amount) {
    if (!confirm(`Approve deposit of ${amount.toLocaleString()} TZS?`)) return;
    
    const depositRef = db.collection('deposits').doc(depositId);
    
    db.runTransaction(async (transaction) => {
        const depositDoc = await transaction.get(depositRef);
        if (!depositDoc.exists) throw new Error("Deposit not found");
        if (depositDoc.data().status !== 'PENDING') throw new Error("Deposit already processed");
        
        const userId = depositDoc.data().userId;
        const userRef = db.collection('users').doc(userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists) throw new Error("User not found");
        
        const currentBalance = parseFloat(userDoc.data().balance || 0);
        const newBalance = currentBalance + amount;
        
        transaction.update(userRef, { balance: newBalance });
        transaction.update(depositRef, { 
            status: 'APPROVED', 
            processedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        // Record transaction
        const transRef = db.collection('transactions').doc();
        transaction.set(transRef, {
            uid: userId,
            type: 'deposit',
            amount: amount,
            status: 'approved',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            depositId: depositId
        });
        
        return newBalance;
    }).then(() => {
        showToast('Deposit approved! Balance updated.', 'success');
    }).catch(err => showToast(err.message, 'error'));
}

function rejectDeposit(depositId) {
    if (!confirm('Reject this deposit request?')) return;
    
    db.collection('deposits').doc(depositId).update({
        status: 'REJECTED',
        processedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        showToast('Deposit rejected', 'info');
    }).catch(err => showToast(err.message, 'error'));
}

function loadPendingWithdrawals() {
    db.collection('withdrawals').where('status', '==', 'PENDING').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const container = document.getElementById('pendingWithdrawalsList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-400 text-sm">No pending withdrawals.</p>';
            return;
        }
        
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const withdrawal = { id: doc.id, ...doc.data() };
            const withdrawalDiv = document.createElement('div');
            withdrawalDiv.className = 'pending-item';
            withdrawalDiv.innerHTML = `
                <div class="pending-header">
                    <span class="pending-user">${withdrawal.fullName}</span>
                    <span class="pending-amount">${withdrawal.amount.toLocaleString()} TZS</span>
                </div>
                <div class="pending-details">
                    Account: ${withdrawal.accountNumber} | Fee: ${withdrawal.feePercent}% (${withdrawal.fee.toLocaleString()} TZS)
                </div>
                <div class="pending-details">
                    Net payout: <strong>${withdrawal.netAmount.toLocaleString()} TZS</strong>
                </div>
                <div class="pending-actions">
                    <button class="approve-btn" onclick="approveWithdrawal('${withdrawal.id}', ${withdrawal.amount}, '${withdrawal.userId}')">✓ Approve</button>
                    <button class="reject-btn" onclick="rejectWithdrawal('${withdrawal.id}')">✗ Reject</button>
                </div>
            `;
            container.appendChild(withdrawalDiv);
        });
    });
}

function approveWithdrawal(withdrawalId, amount, userId) {
    if (!confirm(`Approve withdrawal of ${amount.toLocaleString()} TZS? Amount is already deducted from user balance.`)) return;
    
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    const userRef = db.collection('users').doc(userId);
    
    db.runTransaction(async (transaction) => {
        const withdrawalDoc = await transaction.get(withdrawalRef);
        if (!withdrawalDoc.exists) throw new Error("Withdrawal not found");
        if (withdrawalDoc.data().status !== 'PENDING') throw new Error("Withdrawal already processed");
        
        // Balance already deducted, just update status to APPROVED
        transaction.update(withdrawalRef, {
            status: 'APPROVED',
            processedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: firebase.auth().currentUser?.uid || 'admin'
        });
        
        // Record transaction in history
        const transRef = db.collection('transactions').doc();
        transaction.set(transRef, {
            uid: userId,
            type: 'withdrawal',
            amount: amount,
            status: 'approved',
            withdrawalId: withdrawalId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    }).then(() => {
        showToast('Withdrawal approved! Balance already deducted.', 'success');
        
        // Refresh admin view
        if (typeof loadPendingWithdrawals === 'function') loadPendingWithdrawals();
        if (typeof loadProfitStats === 'function') loadProfitStats();
        
        // If current user is the one who made withdrawal, update their balance display
        if (state.currentUser && state.currentUser.uid === userId) {
            db.collection('users').doc(userId).get().then(doc => {
                if (doc.exists) {
                    state.balance = parseFloat(doc.data().balance || 0);
                    updateBalanceDisplay();
                }
            });
        }
    }).catch(err => showToast(err.message, 'error'));
}

function rejectWithdrawal(withdrawalId) {
    if (!confirm('Reject this withdrawal request? Amount will be REFUNDED to user balance.')) return;
    
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    
    db.runTransaction(async (transaction) => {
        const withdrawalDoc = await transaction.get(withdrawalRef);
        if (!withdrawalDoc.exists) throw new Error("Withdrawal not found");
        if (withdrawalDoc.data().status !== 'PENDING') throw new Error("Withdrawal already processed");
        
        const userId = withdrawalDoc.data().userId;
        const amount = withdrawalDoc.data().amount;
        const userRef = db.collection('users').doc(userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists) throw new Error("User not found");
        
        // REFUND the amount back to user balance
        const currentBalance = parseFloat(userDoc.data().balance || 0);
        const newBalance = currentBalance + amount;
        
        transaction.update(userRef, {
            balance: newBalance,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        transaction.update(withdrawalRef, {
            status: 'REJECTED',
            processedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: firebase.auth().currentUser?.uid || 'admin',
            refundAmount: amount
        });
        
        // Record rejected transaction
        const transRef = db.collection('transactions').doc();
        transaction.set(transRef, {
            uid: userId,
            type: 'withdrawal_rejected',
            amount: amount,
            status: 'rejected',
            refunded: true,
            withdrawalId: withdrawalId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    }).then(() => {
        showToast('Withdrawal rejected! Amount refunded to user balance.', 'warning');
        
        // Refresh admin view
        if (typeof loadPendingWithdrawals === 'function') loadPendingWithdrawals();
        if (typeof loadProfitStats === 'function') loadProfitStats();
        
        // If current user is the one who made withdrawal, update their balance display
        const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
        withdrawalRef.get().then(doc => {
            if (doc.exists && state.currentUser && state.currentUser.uid === doc.data().userId) {
                db.collection('users').doc(state.currentUser.uid).get().then(userDoc => {
                    if (userDoc.exists) {
                        state.balance = parseFloat(userDoc.data().balance || 0);
                        updateBalanceDisplay();
                        showToast(`Your withdrawal was rejected. ${doc.data().amount.toLocaleString()} TZS has been refunded.`, 'info');
                    }
                });
            }
        });
    }).catch(err => showToast(err.message, 'error'));
}

// =========================================================================
// USER TRANSACTION HISTORY
// =========================================================================

function loadUserTransactionHistory() {
    if (!state.currentUser) return;
    
    db.collection('transactions')
        .where('uid', '==', state.currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            const tbody = document.getElementById('transactionTableBody');
            if (!tbody) return;
            
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500">No transactions found</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            snapshot.forEach(doc => {
                const tx = doc.data();
                let formattedDate = 'Pending...';
                if (tx.createdAt) {
                    const d = tx.createdAt.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
                    formattedDate = d.toLocaleString();
                }
                
                let statusBadge = '';
                if (tx.status === 'approved') {
                    statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400">Approved</span>';
                } else if (tx.status === 'rejected') {
                    statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-rose-500/10 text-rose-400">Rejected</span>';
                } else {
                    statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400">Pending</span>';
                }
                
                const typeColor = tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400';
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-6 py-4 text-sm">${formattedDate}</td>
                    <td class="px-6 py-4 text-sm font-medium uppercase ${typeColor}">${tx.type || 'Trade'}</td>
                    <td class="px-6 py-4 text-sm">${(tx.amount || 0).toLocaleString()} TZS</td>
                    <td class="px-6 py-4 text-sm">${statusBadge}</td>
                    <td class="px-6 py-4 text-xs text-slate-400">${doc.id.substring(0, 8)}...</td>
                `;
                tbody.appendChild(row);
            });
        });
}

// =========================================================================
// USER PROFILE DATA
// =========================================================================

function loadUserProfileData() {
    if (!state.currentUser) return;
    
    db.collection('users').doc(state.currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('profileUsername').textContent = data.username || 'User';
            document.getElementById('profileEmail').textContent = data.email || '';
            document.getElementById('referralCount').textContent = data.referralCount || 0;
            document.getElementById('commissionEarned').textContent = (data.commissionEarned || 0).toLocaleString();
            
            // Generate referral link
            const promoCode = data.promoCode || data.username;
            const referralLink = `${window.location.origin}${window.location.pathname}?ref=${promoCode}`;
            const referralInput = document.getElementById('referralLinkDisplay');
            if (referralInput) referralInput.value = referralLink;
        }
    });
}

// =========================================================================
// WALLET STATS
// =========================================================================

function loadWalletStats() {
    if (!state.currentUser) return;
    
    // Total deposits approved
    db.collection('transactions')
        .where('uid', '==', state.currentUser.uid)
        .where('type', '==', 'deposit')
        .where('status', '==', 'approved')
        .get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            document.getElementById('totalDeposits').textContent = total.toLocaleString() + ' TZS';
        });
    
    // Total withdrawals approved
    db.collection('transactions')
        .where('uid', '==', state.currentUser.uid)
        .where('type', '==', 'withdrawal')
        .where('status', '==', 'approved')
        .get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            document.getElementById('totalWithdrawals').textContent = total.toLocaleString() + ' TZS';
        });
    
    // Pending requests count
    Promise.all([
        db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'PENDING').get(),
        db.collection('withdrawals').where('userId', '==', state.currentUser.uid).where('status', '==', 'PENDING').get()
    ]).then(([deposits, withdrawals]) => {
        const count = deposits.size + withdrawals.size;
        document.getElementById('pendingRequestsCount').textContent = count;
    });
}

// =========================================================================
// REFERRAL CODE GENERATION
// =========================================================================

function generateReferralCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    
    return result;
}

function generateUniqueReferralCode() {
    const maxAttempts = 5;
    let attempts = 0;
    
    function attemptGeneration() {
        const newCode = generateReferralCode(8);
        
        return db.collection('users').where('promoCode', '==', newCode).get()
            .then(snapshot => {
                if (snapshot.empty) {
                    // Code is unique
                    return newCode;
                } else if (attempts < maxAttempts) {
                    // Try again with a different code
                    attempts++;
                    return attemptGeneration();
                } else {
                    // Fallback to timestamp-based code
                    return 'REF' + Date.now().toString(36).toUpperCase();
                }
            });
    }
    
    return attemptGeneration();
}

function regenerateReferralCode(userId) {
    if (!userId) return Promise.reject('User ID required');
    
    return generateUniqueReferralCode().then(newCode => {
        return db.collection('users').doc(userId).update({
            promoCode: newCode,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast(`New referral code generated: ${newCode}`, 'success');
            return newCode;
        });
    }).catch(err => {
        showToast('Failed to generate new code: ' + err.message, 'error');
        throw err;
    });
}

// =========================================================================
// SUPER ADMIN DASHBOARD FUNCTIONS
// =========================================================================

let currentSuperAdmin = null;

function initSuperAdmin() {
    // Tab switching
    document.querySelectorAll('.super-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchSuperAdminTab(tabId);
        });
    });

    // Load all data
    loadAllUsers();
    loadAllAdmins();
    loadProfitStats();
    loadPendingDepositsSuper();
    loadPendingWithdrawalsSuper();
}

function switchSuperAdminTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.super-tab').forEach(tab => {
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update content
    const tabs = ['users', 'admins', 'profit', 'transactions'];
    tabs.forEach(id => {
        const element = document.getElementById(`${id}Tab`);
        if (element) {
            if (id === tabId) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        }
    });

    // Refresh data when switching tabs
    if (tabId === 'users') loadAllUsers();
    if (tabId === 'admins') loadAllAdmins();
    if (tabId === 'profit') loadProfitStats();
    if (tabId === 'transactions') {
        loadPendingDepositsSuper();
        loadPendingWithdrawalsSuper();
    }
}

// ========== USER MANAGEMENT ==========
function loadAllUsers(searchTerm = '') {
    let query = db.collection('users');
    
    if (searchTerm) {
        // Search by username or email
        query = query.where('username', '>=', searchTerm).where('username', '<=', searchTerm + '\uf8ff');
    }
    
    query.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const user = { id: doc.id, ...doc.data() };
            const isActive = user.isActive !== false;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="text-xs">${user.id.substring(0, 12)}...</td>
                <td>${user.username || 'N/A'}</td>
                <td>${user.email || 'N/A'}</td>
                <td>${(user.balance || 0).toLocaleString()} TZS</td>
                <td>${user.referralCount || 0}</td>
                <td><span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                <td class="action-buttons">
                    <button class="action-btn edit" onclick="editUser('${user.id}')"><i class="fas fa-edit"></i></button>
                    <button class="action-btn reset" onclick="resetUserPassword('${user.id}', '${user.email}')"><i class="fas fa-key"></i></button>
                    <button class="action-btn ${isActive ? 'deactivate' : 'activate'}" onclick="toggleUserStatus('${user.id}', ${!isActive})">
                        <i class="fas ${isActive ? 'fa-ban' : 'fa-check-circle'}"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteUser('${user.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    });
}

// Search user
document.getElementById('searchUserBtn')?.addEventListener('click', () => {
    const searchTerm = document.getElementById('searchUserInput').value;
    loadAllUsers(searchTerm);
});

document.getElementById('searchUserInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const searchTerm = e.target.value;
        loadAllUsers(searchTerm);
    }
});

function editUser(userId) {
    db.collection('users').doc(userId).get().then(doc => {
        if (doc.exists) {
            const user = doc.data();
            document.getElementById('editUserId').value = userId;
            document.getElementById('editUsername').value = user.username || '';
            document.getElementById('editEmail').value = user.email || '';
            document.getElementById('editBalance').value = user.balance || 0;
            document.getElementById('editIsActive').checked = user.isActive !== false;
            
            document.getElementById('userEditModal').classList.remove('hidden');
        }
    });
}

function closeUserEditModal() {
    document.getElementById('userEditModal').classList.add('hidden');
}

document.getElementById('userEditForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value;
    const email = document.getElementById('editEmail').value;
    const balance = parseFloat(document.getElementById('editBalance').value);
    const isActive = document.getElementById('editIsActive').checked;
    const newPassword = document.getElementById('editPassword').value;
    
    const updateData = {
        username: username,
        email: email,
        balance: balance,
        isActive: isActive,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('users').doc(userId).update(updateData)
        .then(() => {
            if (newPassword) {
                // Update auth password
                const user = firebase.auth().currentUser;
                if (user && user.uid === userId) {
                    return user.updatePassword(newPassword);
                }
                // For other users, need admin SDK (server-side)
                showToast('User updated. Password change requires admin SDK.', 'warning');
            }
            showToast('User updated successfully', 'success');
            closeUserEditModal();
            loadAllUsers();
        })
        .catch(err => showToast(err.message, 'error'));
});

function resetUserPassword(userId, email) {
    if (confirm(`Reset password for ${email}? A reset email will be sent.`)) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => showToast(`Password reset email sent to ${email}`, 'success'))
            .catch(err => showToast(err.message, 'error'));
    }
}

function toggleUserStatus(userId, newStatus) {
    const action = newStatus ? 'activate' : 'deactivate';
    if (confirm(`Are you sure you want to ${action} this user?`)) {
        db.collection('users').doc(userId).update({
            isActive: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast(`User ${action}d successfully`, 'success');
            loadAllUsers();
        }).catch(err => showToast(err.message, 'error'));
    }
}

function deleteUser(userId) {
    if (confirm('⚠️ WARNING: This will permanently delete the user! Are you ABSOLUTELY sure?')) {
        db.collection('users').doc(userId).delete()
            .then(() => {
                showToast('User deleted successfully', 'success');
                loadAllUsers();
            })
            .catch(err => showToast(err.message, 'error'));
    }
}

// ========== ADMIN MANAGEMENT ==========
function loadAllAdmins() {
    const tbody = document.getElementById('adminsTableBody');
    if (!tbody) return;
    
    // Show loading state
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading admins...</td></tr>';
    
    // Get all users first, then filter client-side to avoid composite index requirement
    db.collection('users').get()
        .then(snapshot => {
            // Filter admins manually
            const admins = [];
            snapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.role === 'admin' || userData.role === 'moderator' || userData.role === 'SUPERADMIN') {
                    admins.push({
                        id: doc.id,
                        ...userData
                    });
                }
            });
            
            // Sort manually by createdAt (newest first)
            admins.sort((a, b) => {
                const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
                const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
                return dateB - dateA;
            });
            
            if (admins.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No admins found</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            admins.forEach(admin => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="text-xs">${admin.id.substring(0, 12)}...</td>
                    <td>${escapeHtml(admin.username || 'N/A')}</td>
                    <td>${escapeHtml(admin.email || 'N/A')}</td>
                    <td><span class="status-badge status-active">${admin.role || 'admin'}</span></td>
                    <td><span class="status-badge ${admin.isActive !== false ? 'status-active' : 'status-inactive'}">${admin.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                    <td class="action-buttons">
                        <button class="action-btn edit" onclick="editAdmin('${admin.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn reset" onclick="resetAdminPassword('${escapeHtml(admin.email)}')"><i class="fas fa-key"></i></button>
                        <button class="action-btn ${admin.isActive !== false ? 'deactivate' : 'activate'}" onclick="toggleAdminStatus('${admin.id}', ${admin.isActive === false})">
                            <i class="fas ${admin.isActive !== false ? 'fa-ban' : 'fa-check-circle'}"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteAdmin('${admin.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        })
        .catch(error => {
            console.error("Error loading admins:", error);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-red-400">Error loading admins: ${error.message}</td></tr>`;
            showToast('Error loading admins: ' + error.message, 'error');
        });
}

function openAddAdminModal() {
    document.getElementById('addAdminModal').classList.remove('hidden');
}

function closeAddAdminModal() {
    document.getElementById('addAdminModal').classList.add('hidden');
    document.getElementById('addAdminForm').reset();
}

document.getElementById('addAdminBtn')?.addEventListener('click', openAddAdminModal);

document.getElementById('addAdminForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value;
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    const role = document.getElementById('adminRole').value;
    
    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(cred => {
            return db.collection('users').doc(cred.user.uid).set({
                uid: cred.user.uid,
                username: username,
                email: email,
                role: role,
                isActive: true,
                balance: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            showToast('Admin created successfully', 'success');
            closeAddAdminModal();
            loadAllAdmins();
        })
        .catch(err => showToast(err.message, 'error'));
});

function editAdmin(adminId) {
    // Similar to editUser but for admins
    editUser(adminId);
}

function resetAdminPassword(email) {
    if (confirm(`Reset password for admin ${email}?`)) {
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => showToast(`Password reset email sent to ${email}`, 'success'))
            .catch(err => showToast(err.message, 'error'));
    }
}

function toggleAdminStatus(adminId, newStatus) {
    toggleUserStatus(adminId, newStatus);
}

function deleteAdmin(adminId) {
    if (confirm('⚠️ WARNING: This will permanently delete this admin! Are you sure?')) {
        db.collection('users').doc(adminId).delete()
            .then(() => {
                showToast('Admin deleted successfully', 'success');
                loadAllAdmins();
            })
            .catch(err => showToast(err.message, 'error'));
    }
}

// ========== PROFIT STATISTICS ==========
function loadProfitStats() {
    // Total deposits approved
    db.collection('transactions').where('type', '==', 'deposit').where('status', '==', 'approved').get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            document.getElementById('totalDepositsAmount').textContent = total.toLocaleString() + ' TZS';
        });
    
    // Total withdrawals approved
    db.collection('transactions').where('type', '==', 'withdrawal').where('status', '==', 'approved').get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            document.getElementById('totalWithdrawalsAmount').textContent = total.toLocaleString() + ' TZS';
            document.getElementById('totalFeesCollected').textContent = (total * 0.1).toLocaleString() + ' TZS';
            document.getElementById('netProfit').textContent = (total * 0.1).toLocaleString() + ' TZS';
        });
}

// ========== DEPOSIT/WITHDRAWAL MANAGEMENT ==========
function loadPendingDepositsSuper() {
    db.collection('deposits').where('status', '==', 'PENDING').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const tbody = document.getElementById('superPendingDeposits');
        if (!tbody) return;
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No pending deposits</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const deposit = { id: doc.id, ...doc.data() };
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${deposit.fullName || deposit.userEmail}</td>
                <td><strong>${deposit.amount.toLocaleString()} TZS</strong></td>
                <td>${deposit.bankProvider || 'N/A'}</td>
                <td class="text-xs">${deposit.transactionCode}</td>
                <td class="text-xs">${deposit.createdAt?.toDate().toLocaleDateString() || 'N/A'}</td>
                <td class="action-buttons">
                    <button class="action-btn approve" onclick="approveDepositSuper('${deposit.id}', ${deposit.amount})"><i class="fas fa-check"></i> Approve</button>
                    <button class="action-btn delete" onclick="rejectDepositSuper('${deposit.id}')"><i class="fas fa-times"></i> Reject</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    });
}

function loadPendingWithdrawalsSuper() {
    db.collection('withdrawals').where('status', '==', 'PENDING').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        const tbody = document.getElementById('superPendingWithdrawals');
        if (!tbody) return;
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No pending withdrawals</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const withdrawal = { id: doc.id, ...doc.data() };
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${withdrawal.fullName}</td>
                <td>${withdrawal.amount.toLocaleString()} TZS</td>
                <td>${withdrawal.fee.toLocaleString()} TZS</td>
                <td><strong>${withdrawal.netAmount.toLocaleString()} TZS</strong></td>
                <td>${withdrawal.accountNumber}</td>
                <td class="action-buttons">
                    <button class="action-btn approve" onclick="approveWithdrawalSuper('${withdrawal.id}', ${withdrawal.amount}, '${withdrawal.userId}')"><i class="fas fa-check"></i> Approve</button>
                    <button class="action-btn delete" onclick="rejectWithdrawalSuper('${withdrawal.id}')"><i class="fas fa-times"></i> Reject</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    });
}

function approveDepositSuper(depositId, amount) {
    if (confirm(`Approve deposit of ${amount.toLocaleString()} TZS?`)) {
        approveDeposit(depositId, amount);
        setTimeout(() => {
            loadPendingDepositsSuper();
            loadProfitStats();
        }, 1000);
    }
}

function rejectDepositSuper(depositId) {
    if (confirm('Reject this deposit request?')) {
        rejectDeposit(depositId);
        setTimeout(() => loadPendingDepositsSuper(), 1000);
    }
}

function approveWithdrawalSuper(withdrawalId, amount, userId) {
    if (confirm(`Approve withdrawal of ${amount.toLocaleString()} TZS? Amount is already deducted from user balance.`)) {
        approveWithdrawal(withdrawalId, amount, userId);
        setTimeout(() => {
            if (typeof loadPendingWithdrawalsSuper === 'function') loadPendingWithdrawalsSuper();
            if (typeof loadProfitStats === 'function') loadProfitStats();
        }, 1000);
    }
}

function rejectWithdrawalSuper(withdrawalId) {
    rejectWithdrawal(withdrawalId);
    setTimeout(() => {
        if (typeof loadPendingWithdrawalsSuper === 'function') loadPendingWithdrawalsSuper();
        if (typeof loadProfitStats === 'function') loadProfitStats();
    }, 1000);
}

// ========== SUPER ADMIN ACCESS ==========
function openSuperAdminDashboard() {
    if (state.currentUser) {
        db.collection('users').doc(state.currentUser.uid).get().then(doc => {
            if (doc.exists && (doc.data().role === 'SUPERADMIN' || doc.data().role === 'admin')) {
                document.getElementById('userDashboard').classList.add('hidden');
                document.getElementById('adminPanel')?.classList.add('hidden');
                document.getElementById('superAdminPanel').classList.remove('hidden');
                currentSuperAdmin = doc.data();
                document.getElementById('superAdminName').textContent = currentSuperAdmin.username || 'Super Admin';
                initSuperAdmin();
            } else {
                showToast('Access denied. Super Admin privileges required.', 'error');
            }
        });
    } else {
        showToast('Please login first', 'error');
    }
}

// Exit Super Admin button - logs out
const exitSuperAdmin = document.getElementById('exitSuperAdmin');
if (exitSuperAdmin) {
    exitSuperAdmin.addEventListener('click', () => {
        logoutUser();
    });
}

function logoutUser() {
    if (confirm('Are you sure you want to logout?')) {
        auth.signOut().then(() => {
        showToast('Logged out successfully', 'info');
        
        // Reset all state
        state.currentUser = null;
        state.userRole = null;
        state.isAdmin = false;
        state.balance = 500000.00;
        
        // Hide all panels
        const userDashboardEl = document.getElementById('userDashboard');
        const adminPanelEl = document.getElementById('adminPanel');
        const superAdminPanelEl = document.getElementById('superAdminPanel');
        
        if (userDashboardEl) userDashboardEl.style.display = 'block';
        if (adminPanelEl) adminPanelEl.style.display = 'none';
        if (superAdminPanelEl) superAdminPanelEl.classList.add('hidden');
        
        // Update header for guest
        if (topLoginBtn) topLoginBtn.classList.remove('hidden');
        if (userProfileGroup) userProfileGroup.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        
        // Hide auth-only navigation buttons
        const authNavButtons = document.querySelectorAll('.nav-auth-only');
        authNavButtons.forEach(btn => {
            btn.classList.add('hidden');
        });
        
        // Ensure Home and Trades are visible
        const homeBtn = document.getElementById('navHome');
        const tradesBtn = document.getElementById('navTrades');
        if (homeBtn) homeBtn.classList.remove('hidden');
        if (tradesBtn) tradesBtn.classList.remove('hidden');
        
        // Update balance display
        updateBalanceDisplay();
        
        // Reset chart if needed
        if (!mainChart && typeof initMainChart === 'function') {
            initMainChart();
        }
        
        // Switch to home section
        switchTab('home');
        
     }).catch(error => {
         showToast('Logout error: ' + error.message, 'error');
     });
    }
}
// Logout button listener
if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =========================================================================
// BUTTON LOADING STATES
// =========================================================================

function setButtonLoading(button, isLoading, originalText = null) {
    if (!button) return;
    
    if (isLoading) {
        // Store original text if not already stored
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
        }
        button.disabled = true;
        button.classList.add('btn-loading');
        // Keep the button text visible but add spinner
        button.style.position = 'relative';
    } else {
        button.disabled = false;
        button.classList.remove('btn-loading');
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
        button.style.position = '';
    }
}

function showButtonLoading(button, loadingText = 'Processing...') {
    if (!button) return;
    
    // Store original content
    if (!button.dataset.originalContent) {
        button.dataset.originalContent = button.innerHTML;
    }
    
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
    button.classList.add('opacity-70', 'cursor-not-allowed');
}

function hideButtonLoading(button) {
    if (!button) return;
    
    button.disabled = false;
    if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
    }
    button.classList.remove('opacity-70', 'cursor-not-allowed');
}


// =========================================================================
// SIGNAL MANAGEMENT SYSTEM (UPDATED - NO COMPLEX QUERIES)
// =========================================================================

let activeSignal = null;
let signalCountdownInterval = null;

function listenForActiveSignals() {
    db.collection('system_settings')
        .where('type', '==', 'signal')
        .onSnapshot(async snapshot => {
            const now = new Date();
            let currentActiveSignal = null;
            const upcomingSignals = [];
            const completedSignals = [];
            
            // Get user's used signals if logged in
            let userUsedSignalIds = new Set();
            if (state.currentUser) {
                const usedSignalsSnapshot = await db.collection('users')
                    .doc(state.currentUser.uid)
                    .collection('used_signals')
                    .get()
                    .catch(() => ({ empty: true }));
                
                if (!usedSignalsSnapshot.empty) {
                    usedSignalsSnapshot.forEach(doc => {
                        userUsedSignalIds.add(doc.id);
                    });
                }
            }
            
            snapshot.forEach(doc => {
                const signal = { id: doc.id, ...doc.data() };
                const endTime = signal.endTime?.toDate() || new Date(signal.endTime);
                const startTime = signal.startTime?.toDate() || new Date(signal.startTime);
                
                // Add flag to indicate if user already used this signal
                signal.isAlreadyUsedByUser = userUsedSignalIds.has(signal.id);
                
                if (signal.status === 'active' && endTime > now) {
                    currentActiveSignal = signal;
                } else if (signal.status === 'scheduled' && startTime > now) {
                    upcomingSignals.push(signal);
                } else if (signal.status === 'completed' || endTime < now) {
                    completedSignals.push(signal);
                }
            });
            
            // Update active signal
            if (currentActiveSignal) {
                activeSignal = currentActiveSignal;
                
                // Show warning if user already used this signal
                if (currentActiveSignal.isAlreadyUsedByUser) {
                    showToast(`⚠️ You have already used this signal! Trading will be normal market.`, 'warning');
                }
                
                updateUserSignalDisplay(activeSignal);
                startSignalCountdown(activeSignal.endTime);
            } else {
                activeSignal = null;
                hideUserSignalDisplay();
                if (signalCountdownInterval) {
                    clearInterval(signalCountdownInterval);
                    signalCountdownInterval = null;
                }
            }
            
            displayUpcomingSignals(upcomingSignals.slice(0, 5));
            displaySignalHistory(completedSignals.slice(0, 10));
        }, error => {
            console.error("Error listening for signals:", error);
        });
}

function displayUpcomingSignals(signals) {
    const container = document.getElementById('upcomingSignalsList');
    if (!container) return;
    
    if (!signals || signals.length === 0) {
        container.innerHTML = '<div class="empty-signals"><i class="fas fa-bell-slash"></i><span>No upcoming signals scheduled</span></div>';
        return;
    }
    
    container.innerHTML = '';
    signals.forEach(signal => {
        const startTime = signal.startTime?.toDate() || new Date(signal.startTime);
        const direction = signal.direction === 'buy' ? 'BUY ▲' : 'SELL ▼';
        
        const signalDiv = document.createElement('div');
        signalDiv.className = 'signal-item upcoming';
        signalDiv.innerHTML = `
            <div class="signal-time">Starts: ${startTime.toLocaleTimeString()}</div>
            <div class="signal-direction ${signal.direction}">${direction}</div>
            <div class="signal-duration">${signal.duration || 5} min</div>
            <div class="signal-payout">+${signal.multiplier || 85}%</div>
        `;
        container.appendChild(signalDiv);
    });
}

function displaySignalHistory(signals) {
    const container = document.getElementById('signalHistoryList');
    if (!container) return;
    
    if (!signals || signals.length === 0) {
        container.innerHTML = '<div class="empty-signals"><i class="fas fa-chart-line"></i><span>No signal history available</span></div>';
        return;
    }
    
    container.innerHTML = '';
    signals.forEach(signal => {
        const endTime = signal.endTime?.toDate() || new Date(signal.endTime);
        const direction = signal.direction === 'buy' ? 'BUY ▲' : 'SELL ▼';
        
        const signalDiv = document.createElement('div');
        signalDiv.className = 'signal-item history';
        signalDiv.innerHTML = `
            <div class="signal-time">${endTime.toLocaleDateString()}</div>
            <div class="signal-direction ${signal.direction}">${direction}</div>
            <div class="signal-result ${signal.outcome || 'completed'}">${signal.outcome === 'win' ? 'WIN' : 'Completed'}</div>
        `;
        container.appendChild(signalDiv);
    });
}

// Update loadAdminSignals to avoid complex queries
function loadAdminSignals() {
    db.collection('system_settings')
        .where('type', '==', 'signal')
        .onSnapshot(snapshot => {
            const container = document.getElementById('adminSignalsList');
            if (!container) return;
            
            const signals = [];
            snapshot.forEach(doc => {
                signals.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort by createdAt descending
            signals.sort((a, b) => {
                const dateA = a.createdAt?.toDate() || new Date(a.createdAt);
                const dateB = b.createdAt?.toDate() || new Date(b.createdAt);
                return dateB - dateA;
            });
            
            if (signals.length === 0) {
                container.innerHTML = '<div class="empty-signals">No signals created yet</div>';
                return;
            }
            
            container.innerHTML = '';
            signals.slice(0, 20).forEach(signal => {
                const startTime = signal.startTime?.toDate() || new Date(signal.startTime);
                const statusClass = signal.status === 'active' ? 'active' : (signal.status === 'scheduled' ? 'scheduled' : 'completed');
                const directionClass = signal.direction === 'buy' ? 'buy' : 'sell';
                
                const signalDiv = document.createElement('div');
                signalDiv.className = `admin-signal-item ${statusClass}`;
                signalDiv.innerHTML = `
                    <div class="signal-header">
                        <span class="signal-status ${statusClass}">${signal.status.toUpperCase()}</span>
                        <span class="signal-direction ${directionClass}">${signal.direction.toUpperCase()}</span>
                    </div>
                    <div class="signal-details">
                        <span>⏱️ ${signal.duration} min</span>
                        <span>💰 +${signal.multiplier}%</span>
                        <span>🕐 ${startTime.toLocaleTimeString()}</span>
                    </div>
                    ${signal.status === 'active' ? `<button class="cancel-signal-btn" onclick="cancelSignal('${signal.id}')">Cancel Signal</button>` : ''}
                `;
                container.appendChild(signalDiv);
            });
        });
}

function updateUserSignalDisplay(signal) {
    const activeSignalCard = document.getElementById('activeSignalCard');
    const signalDirectionDisplay = document.getElementById('signalDirectionDisplay');
    const signalMultiplierDisplay = document.getElementById('signalMultiplierDisplay');
    const signalInstructions = document.getElementById('signalInstructions');
    
    if (!activeSignalCard) return;
    
    activeSignalCard.classList.remove('hidden');
    
    const direction = signal.direction === 'buy' ? 'BUY ▲' : 'SELL ▼';
    const payoutPercent = signal.multiplier || 10;
    
    if (signalDirectionDisplay) {
        signalDirectionDisplay.textContent = direction;
        signalDirectionDisplay.className = `direction-value ${signal.direction}`;
    }
    if (signalMultiplierDisplay) {
        signalMultiplierDisplay.textContent = `${payoutPercent}% Payout`;
    }
    
    // Show different message if user already used this signal
    if (signal.isAlreadyUsedByUser) {
        if (signalInstructions) {
            signalInstructions.innerHTML = `<i class="fas fa-ban"></i>⚠️ You have already used this signal! Trading will be normal market (no guaranteed win).`;
            signalInstructions.style.color = '#ffd700';
        }
        // Change card border to warning color
        activeSignalCard.style.borderColor = '#ffd700';
    } else {
        if (signalInstructions) {
            signalInstructions.innerHTML = `<i class="fas fa-bullhorn"></i> Execute a ${direction} trade within the time window to get ${payoutPercent}% profit on your stake!`;
            signalInstructions.style.color = '';
        }
        activeSignalCard.style.borderColor = '';
    }
    
    startSignalCountdown(signal.endTime);
    updateTradeUISignalInfluence(signal);
}

function hideUserSignalDisplay() {
    const activeSignalCard = document.getElementById('activeSignalCard');
    if (activeSignalCard) activeSignalCard.classList.add('hidden');
    updateTradeUISignalInfluence(null);
}

function updateTradeUISignalInfluence(signal) {
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    const tradeMessage = document.getElementById('tradeMessage');
    const signalHint = document.getElementById('activeSignalHint');
    
    if (signal) {
        // Highlight the recommended direction with strong visual cues
        if (signal.direction === 'buy') {
            buyBtn.style.border = '3px solid #00e676';
            buyBtn.style.boxShadow = '0 0 20px rgba(0,230,118,0.6)';
            buyBtn.style.transform = 'scale(1.02)';
            sellBtn.style.border = '1px solid rgba(255,23,68,0.3)';
            sellBtn.style.boxShadow = 'none';
            sellBtn.style.transform = 'scale(1)';
            
            if (tradeMessage) {
                tradeMessage.innerHTML = '<i class="fas fa-bullhorn"></i> 🔥 SIGNAL ACTIVE! Follow BUY to guarantee +' + (signal.multiplier || 85) + '% WIN! 🔥';
                tradeMessage.classList.remove('hidden', 'error');
                tradeMessage.classList.add('success');
                tradeMessage.style.background = 'rgba(0,230,118,0.2)';
                tradeMessage.style.border = '1px solid #00e676';
                tradeMessage.style.fontWeight = 'bold';
            }
        } else {
            sellBtn.style.border = '3px solid #ff1744';
            sellBtn.style.boxShadow = '0 0 20px rgba(255,23,68,0.6)';
            sellBtn.style.transform = 'scale(1.02)';
            buyBtn.style.border = '1px solid rgba(0,230,118,0.3)';
            buyBtn.style.boxShadow = 'none';
            buyBtn.style.transform = 'scale(1)';
            
            if (tradeMessage) {
                tradeMessage.innerHTML = '<i class="fas fa-bullhorn"></i> 🔥 SIGNAL ACTIVE! Follow SELL to guarantee +' + (signal.multiplier || 85) + '% WIN! 🔥';
                tradeMessage.classList.remove('hidden', 'error');
                tradeMessage.classList.add('success');
                tradeMessage.style.background = 'rgba(255,23,68,0.15)';
                tradeMessage.style.border = '1px solid #ff1744';
                tradeMessage.style.fontWeight = 'bold';
            }
        }
        
        // Also update the trade timer to show signal info
        const timerDisplay = document.getElementById('timerDisplay');
        if (timerDisplay && timerDisplay.parentElement) {
            timerDisplay.parentElement.style.border = '1px solid #ffd700';
            timerDisplay.parentElement.style.boxShadow = '0 0 10px rgba(255,215,0,0.3)';
        }
    } else {
        // Reset styles
        buyBtn.style.border = '';
        buyBtn.style.boxShadow = '';
        buyBtn.style.transform = '';
        sellBtn.style.border = '';
        sellBtn.style.boxShadow = '';
        sellBtn.style.transform = '';
        
        if (tradeMessage && tradeMessage.classList.contains('success')) {
            tradeMessage.classList.add('hidden');
            tradeMessage.style.background = '';
            tradeMessage.style.border = '';
        }
        
        const timerDisplay = document.getElementById('timerDisplay');
        if (timerDisplay && timerDisplay.parentElement) {
            timerDisplay.parentElement.style.border = '';
            timerDisplay.parentElement.style.boxShadow = '';
        }
    }
}

function startSignalCountdown(endTime) {
    // Clear existing interval
    if (signalCountdownInterval) {
        clearInterval(signalCountdownInterval);
        signalCountdownInterval = null;
    }
    
    // Validate endTime exists
    if (!endTime) {
        console.error("No endTime provided for signal countdown");
        return;
    }
    
    // Parse endTime correctly - handle both Firestore Timestamp and Date
    let endDate;
    try {
        if (typeof endTime.toDate === 'function') {
            // Firestore Timestamp
            endDate = endTime.toDate();
        } else if (endTime instanceof Date) {
            // Already a Date object
            endDate = endTime;
        } else if (typeof endTime === 'string') {
            // ISO string
            endDate = new Date(endTime);
        } else if (endTime.seconds) {
            // Firestore Timestamp object with seconds
            endDate = new Date(endTime.seconds * 1000);
        } else {
            // Try to convert directly
            endDate = new Date(endTime);
        }
        
        // Validate the date is valid
        if (isNaN(endDate.getTime())) {
            console.error("Invalid endTime value:", endTime);
            return;
        }
    } catch (error) {
        console.error("Error parsing endTime:", error);
        return;
    }
    
    // Update timer every second
    signalCountdownInterval = setInterval(() => {
        const now = new Date();
        const diff = endDate - now;
        
        // Check if signal has expired
        if (diff <= 0) {
            clearInterval(signalCountdownInterval);
            signalCountdownInterval = null;
            
            // Signal expired - hide it
            activeSignal = null;
            hideUserSignalDisplay();
            
            // Update timer display to 00:00
            const timerDisplay = document.getElementById('signalTimer');
            if (timerDisplay) {
                timerDisplay.textContent = "00:00";
            }
            return;
        }
        
        // Calculate minutes and seconds
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        // Update display with leading zeros
        const timerDisplay = document.getElementById('signalTimer');
        if (timerDisplay) {
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

// =========================================================================
// ADMIN SIGNAL MANAGEMENT
// =========================================================================

let currentAdminTab = 'approvals';



function generateSignalPreview() {
    const direction = document.querySelector('#signalDirectionBuy').classList.contains('active') ? 'BUY ▲' : 'SELL ▼';
    const duration = document.getElementById('signalDuration').value;
    const multiplier = document.getElementById('signalMultiplier').value;
    const startTimeInput = document.getElementById('signalStartTime').value;
    
    let startTimeText = 'STARTING SOON';
    if (startTimeInput) {
        const startDate = new Date(startTimeInput);
        startTimeText = startDate.toLocaleTimeString();
    }
    
    const message = `🎯 *TAPTRADE SIGNAL* 🎯\n\n📈 *DIRECTION:* ${direction}\n⏱️ *DURATION:* ${duration} MIN\n💰 *PAYOUT:* +${multiplier}%\n⏰ *START:* ${startTimeText}\n\nFollow the signal to guarantee your win!`;
    
    const previewDiv = document.getElementById('signalMessagePreview');
    if (previewDiv) {
        previewDiv.innerHTML = message.replace(/\n/g, '<br>');
    }
    
    return message;
}

// Signal direction toggle
document.getElementById('signalDirectionBuy')?.addEventListener('click', () => {
    document.getElementById('signalDirectionBuy').classList.add('active');
    document.getElementById('signalDirectionSell').classList.remove('active');
    generateSignalPreview();
});

document.getElementById('signalDirectionSell')?.addEventListener('click', () => {
    document.getElementById('signalDirectionSell').classList.add('active');
    document.getElementById('signalDirectionBuy').classList.remove('active');
    generateSignalPreview();
});

// Signal inputs change listeners
document.getElementById('signalDuration')?.addEventListener('change', generateSignalPreview);
document.getElementById('signalMultiplier')?.addEventListener('input', generateSignalPreview);
document.getElementById('signalStartTime')?.addEventListener('change', generateSignalPreview);

// Copy signal message
document.getElementById('copySignalMessage')?.addEventListener('click', () => {
    const message = generateSignalPreview();
    navigator.clipboard.writeText(message).then(() => {
        showToast('Signal message copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy message', 'error');
    });
});

document.getElementById('createSignalBtn')?.addEventListener('click', async () => {
    const direction = document.getElementById('signalDirectionBuy').classList.contains('active') ? 'buy' : 'sell';
    const duration = parseInt(document.getElementById('signalDuration').value);
    const payoutPercent = parseFloat(document.getElementById('signalMultiplier').value); // This is percentage now
    const startTimeInput = document.getElementById('signalStartTime').value;
    
    let startTime = new Date();
    let endTime = new Date();
    
    if (startTimeInput) {
        startTime = new Date(startTimeInput);
        endTime = new Date(startTime.getTime() + (duration * 60000));
    } else {
        endTime = new Date(Date.now() + (duration * 60000));
    }
    
    const signalData = {
        type: 'signal',
        direction: direction,
        duration: duration,
        multiplier: payoutPercent, // This is the percentage payout (e.g., 10 = 10% profit)
        startTime: firebase.firestore.Timestamp.fromDate(startTime),
        endTime: firebase.firestore.Timestamp.fromDate(endTime),
        status: startTime <= new Date() ? 'active' : 'scheduled',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: state.currentUser?.uid || 'admin'
    };
    
    try {
        await db.collection('system_settings').add(signalData);
        showToast(`Signal launched! ${direction.toUpperCase()} signal active for ${duration} minutes. Users earn ${payoutPercent}% profit!`, 'success');
        generateSignalPreview();
    } catch (error) {
        showToast('Error creating signal: ' + error.message, 'error');
    }
});

function cancelSignal(signalId) {
    if (confirm('Are you sure you want to cancel this active signal?')) {
        db.collection('system_settings').doc(signalId).update({
            status: 'cancelled',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast('Signal cancelled successfully', 'success');
        }).catch(err => showToast(err.message, 'error'));
    }
}

// =========================================================================
// INITIALIZATION - Add to DOMContentLoaded
// =========================================================================

// Add to your existing DOMContentLoaded event listener:
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    
    // Initialize signal listeners
    listenForActiveSignals();
    loadAdminSignals();
    
    // Setup admin bottom navigation
    const adminApprovalsPanel = document.getElementById('adminApprovalsPanel');
    const adminSignalsPanel = document.getElementById('adminSignalsPanel');
    const adminUsersPanel = document.getElementById('adminUsersPanel');
    
    // Move existing content to appropriate panels
    if (adminApprovalsPanel) {
        // Move deposit and withdrawal approval cards into approvals panel
        const depositApprovals = document.querySelector('.deposit-approvals');
        const withdrawalApprovals = document.querySelector('.withdrawal-approvals');
        if (depositApprovals) adminApprovalsPanel.appendChild(depositApprovals);
        if (withdrawalApprovals) adminApprovalsPanel.appendChild(withdrawalApprovals);
    }
    
    if (adminUsersPanel) {
        // Move user management content into users panel
        const poolManagement = document.querySelector('.pool-management');
        if (poolManagement) adminUsersPanel.appendChild(poolManagement);
    }
    
    // Set default admin tab
    switchAdminTab('approvals');
});

// =========================================================================
// ADMIN TAB SWITCHING
// =========================================================================

function switchAdminTab(tabId) {
    // Update bottom nav buttons
    const navButtons = ['approvals', 'signals', 'users'];
    navButtons.forEach(id => {
        const btn = document.getElementById(`adminNav${id.charAt(0).toUpperCase() + id.slice(1)}`);
        if (btn) {
            if (id === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    
    // Show/hide panels
    const approvalsPanel = document.getElementById('adminApprovalsPanel');
    const signalsPanel = document.getElementById('adminSignalsPanel');
    const usersPanel = document.getElementById('adminUsersPanel');
    
    if (approvalsPanel) {
        approvalsPanel.classList.toggle('hidden', tabId !== 'approvals');
    }
    if (signalsPanel) {
        signalsPanel.classList.toggle('hidden', tabId !== 'signals');
    }
    if (usersPanel) {
        usersPanel.classList.toggle('hidden', tabId !== 'users');
    }
    
    // Refresh data when switching tabs
    if (tabId === 'approvals') {
        if (typeof loadPendingDeposits === 'function') loadPendingDeposits();
        if (typeof loadPendingWithdrawals === 'function') loadPendingWithdrawals();
        if (typeof loadBankAccounts === 'function') loadBankAccounts();
    }
    if (tabId === 'signals') {
        if (typeof loadAdminSignals === 'function') loadAdminSignals();
    }
    if (tabId === 'users') {
        if (typeof loadAdminUsers === 'function') loadAdminUsers();
    }
}

// Check if user has already used a specific signal
async function hasUserUsedSignal(signalId) {
    if (!state.currentUser) return false;
    
    const userSignalRef = db.collection('users').doc(state.currentUser.uid).collection('used_signals').doc(signalId);
    const doc = await userSignalRef.get();
    return doc.exists;
}

function loadUserUsedSignals() {
    if (!state.currentUser) return;
    
    console.log("Loading used signals for user:", state.currentUser.uid);
    
    db.collection('users')
        .doc(state.currentUser.uid)
        .collection('used_signals')
        .onSnapshot(snapshot => {
            const usedSignalsContainer = document.getElementById('usedSignalsList');
            if (!usedSignalsContainer) return;
            
            console.log("Used signals count:", snapshot.size);
            
            if (snapshot.empty) {
                usedSignalsContainer.innerHTML = '<div class="empty-signals"><i class="fas fa-history"></i><span>No signals used yet</span></div>';
                return;
            }
            
            usedSignalsContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const signal = doc.data();
                const usedDate = signal.usedAt?.toDate() || new Date();
                const resultClass = signal.followedSignal ? 'win' : 'loss';
                const resultText = signal.followedSignal ? 'WON' : 'LOST';
                
                console.log("Used signal:", signal.signalId, resultText);
                
                const signalDiv = document.createElement('div');
                signalDiv.className = `used-signal-item ${resultClass}`;
                signalDiv.innerHTML = `
                    <div class="signal-info">
                        <span class="signal-direction ${signal.direction}">${signal.direction === 'buy' ? 'BUY ▲' : 'SELL ▼'}</span>
                        <span class="signal-stake">${signal.stakeAmount.toLocaleString()} TZS</span>
                    </div>
                    <div class="signal-result ${resultClass}">${resultText}</div>
                    <div class="signal-date">${usedDate.toLocaleTimeString()}</div>
                `;
                usedSignalsContainer.appendChild(signalDiv);
            });
        }, error => {
            console.error("Error loading used signals:", error);
        });
}

// Check if user has already used a specific signal
async function isSignalUsedByUser(signalId) {
    if (!state.currentUser) return false;
    
    try {
        const signalRef = db.collection('users').doc(state.currentUser.uid).collection('used_signals').doc(signalId);
        const doc = await signalRef.get();
        return doc.exists;
    } catch (error) {
        console.error("Error checking signal usage:", error);
        return false;
    }
}

// Get all used signals for a user (to display in UI)
async function getUserUsedSignals() {
    if (!state.currentUser) return [];
    
    try {
        const snapshot = await db.collection('users')
            .doc(state.currentUser.uid)
            .collection('used_signals')
            .orderBy('usedAt', 'desc')
            .get();
        
        const usedSignals = [];
        snapshot.forEach(doc => {
            usedSignals.push({ id: doc.id, ...doc.data() });
        });
        return usedSignals;
    } catch (error) {
        console.error("Error getting used signals:", error);
        return [];
    }
}

function syncUserBalanceFromFirestore() {
    if (!state.currentUser || state.isAdmin) return;
    
    db.collection('users').doc(state.currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            const userData = doc.data();
            const serverBalance = parseFloat(userData.balance || 0);
            
            // Only update if there's a significant difference
            if (Math.abs(state.balance - serverBalance) > 1) {
                state.balance = serverBalance;
                updateBalanceDisplay();
                console.log("Balance synced from server:", state.balance);
            }
        }
    }, error => {
        console.error("Error syncing balance:", error);
    });
}

// =========================================================================
// TRADE HISTORY FUNCTIONS
// =========================================================================

let currentTradePage = 0;
const TRADES_PER_PAGE = 20;
let allTrades = [];
let currentTradeFilter = 'all';

function loadTradeHistory(filter = 'all', reset = true) {
    if (!state.currentUser) return;
    
    if (reset) {
        currentTradePage = 0;
        allTrades = [];
    }
    
    let query = db.collection('users')
        .doc(state.currentUser.uid)
        .collection('transactions')
        .orderBy('timestamp', 'desc')
        .limit(TRADES_PER_PAGE);
    
    if (currentTradePage > 0) {
        // For pagination, we'll handle client-side filtering
    }
    
    query.get().then(snapshot => {
        const trades = [];
        snapshot.forEach(doc => {
            const trade = { id: doc.id, ...doc.data() };
            trades.push(trade);
        });
        
        if (reset) {
            allTrades = trades;
        } else {
            allTrades = [...allTrades, ...trades];
        }
        
        displayTradeHistory(filter);
        
        // Show/hide load more button
        const loadMoreBtn = document.getElementById('loadMoreTrades');
        if (loadMoreBtn) {
            loadMoreBtn.classList.toggle('hidden', trades.length < TRADES_PER_PAGE);
        }
    }).catch(err => console.error("Error loading trade history:", err));
}

function displayTradeHistory(filter) {
    const tbody = document.getElementById('tradeHistoryBody');
    if (!tbody) return;
    
    let filteredTrades = [...allTrades];
    
    if (filter === 'win') {
        filteredTrades = filteredTrades.filter(t => t.status === 'win');
    } else if (filter === 'loss') {
        filteredTrades = filteredTrades.filter(t => t.status === 'loss');
    } else if (filter === 'pending') {
        filteredTrades = filteredTrades.filter(t => t.status === 'pending');
    } else if (filter === 'signal') {
        filteredTrades = filteredTrades.filter(t => t.followedSignal === true);
    }
    
    if (filteredTrades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8">No trade history found</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    filteredTrades.forEach(trade => {
        const row = document.createElement('tr');
        const formattedDate = trade.timestamp?.toDate() ? trade.timestamp.toDate().toLocaleString() : 'Pending';
        const statusClass = trade.status === 'win' ? 'status-win' : (trade.status === 'loss' ? 'status-loss' : 'status-pending');
        const profitClass = trade.profitAmount > 0 ? 'text-green-400' : 'text-red-400';
        const profitText = trade.profitAmount ? (trade.profitAmount > 0 ? `+${trade.profitAmount.toLocaleString()}` : trade.profitAmount.toLocaleString()) : '-';
        const movementClass = trade.priceMovementPercent > 0 ? 'positive' : 'negative';
        
        row.innerHTML = `
            <td class="text-sm">${formattedDate}</td>
            <td class="text-sm font-medium ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}">${trade.type === 'buy' ? 'BUY ▲' : 'SELL ▼'}</td>
            <td class="text-sm">${trade.amount.toLocaleString()} TZS</td>
            <td class="text-xs font-mono">${trade.entryPrice?.toFixed(5) || '-'}</td>
            <td class="text-xs font-mono">${trade.exitPrice?.toFixed(5) || '-'}</td>
            <td><span class="price-movement ${movementClass}">${trade.priceMovementPercent?.toFixed(3) || 0}%</span></td>
            <td><span class="status-badge ${statusClass}">${trade.status?.toUpperCase() || 'PENDING'}</span></td>
            <td class="${profitClass} font-medium">${profitText} TZS</td>
        `;
        tbody.appendChild(row);
    });
}

// =========================================================================
// SIGNAL HISTORY FUNCTIONS
// =========================================================================

function loadSignalHistory() {
    if (!state.currentUser) return;
    
    // Load used signals
    db.collection('users')
        .doc(state.currentUser.uid)
        .collection('used_signals')
        .orderBy('usedAt', 'desc')
        .onSnapshot(snapshot => {
            const container = document.getElementById('signalHistoryList');
            if (!container) return;
            
            let totalSignals = 0;
            let signalsWon = 0;
            let signalsLost = 0;
            let totalProfit = 0;
            
            if (snapshot.empty) {
                container.innerHTML = '<div class="empty-signals"><i class="fas fa-bell-slash"></i><span>No signals used yet</span></div>';
                document.getElementById('totalSignalsUsed').textContent = '0';
                document.getElementById('signalsWon').textContent = '0';
                document.getElementById('signalsLost').textContent = '0';
                document.getElementById('signalProfit').textContent = '0 TZS';
                return;
            }
            
            container.innerHTML = '';
            snapshot.forEach(doc => {
                const signal = doc.data();
                const usedDate = signal.usedAt?.toDate() || new Date();
                const resultClass = signal.followedSignal ? 'won' : 'lost';
                const profitClass = signal.followedSignal ? 'win' : 'loss';
                const profitAmount = signal.followedSignal ? (signal.stakeAmount * (signal.signalMultiplier || 10) / 100) : -signal.stakeAmount;
                
                totalSignals++;
                if (signal.followedSignal) {
                    signalsWon++;
                    totalProfit += profitAmount;
                } else {
                    signalsLost++;
                    totalProfit += profitAmount;
                }
                
                const signalDiv = document.createElement('div');
                signalDiv.className = `signal-history-item ${resultClass}`;
                signalDiv.innerHTML = `
                    <div class="signal-info">
                        <span class="signal-direction ${signal.direction}">${signal.direction === 'buy' ? 'BUY ▲' : 'SELL ▼'}</span>
                        <span class="signal-stake">Stake: ${signal.stakeAmount.toLocaleString()} TZS</span>
                        <span class="signal-date">${usedDate.toLocaleString()}</span>
                    </div>
                    <div class="signal-result">
                        <div class="signal-profit ${profitClass}">${signal.followedSignal ? `+${profitAmount.toLocaleString()}` : `-${Math.abs(profitAmount).toLocaleString()}`} TZS</div>
                        <div class="signal-outcome">${signal.followedSignal ? 'WON ✓' : 'LOST ✗'}</div>
                    </div>
                `;
                container.appendChild(signalDiv);
            });
            
            // Update stats
            document.getElementById('totalSignalsUsed').textContent = totalSignals;
            document.getElementById('signalsWon').textContent = signalsWon;
            document.getElementById('signalsLost').textContent = signalsLost;
            document.getElementById('signalProfit').textContent = totalProfit.toLocaleString() + ' TZS';
        }, error => {
            console.error("Error loading signal history:", error);
        });
}

// =========================================================================
// TRANSACTION LEDGER FUNCTIONS
// =========================================================================

let currentLedgerFilter = 'all';
let allTransactions = [];

function loadTransactionLedger(filter = 'all') {
    if (!state.currentUser) return;
    
    currentLedgerFilter = filter;
    
    // Get deposits and withdrawals
    Promise.all([
        db.collection('deposits').where('userId', '==', state.currentUser.uid).orderBy('createdAt', 'desc').limit(50).get(),
        db.collection('withdrawals').where('userId', '==', state.currentUser.uid).orderBy('createdAt', 'desc').limit(50).get(),
        db.collection('users').doc(state.currentUser.uid).collection('transactions').orderBy('timestamp', 'desc').limit(50).get()
    ]).then(([deposits, withdrawals, trades]) => {
        const transactions = [];
        
        deposits.forEach(doc => {
            const data = doc.data();
            transactions.push({
                id: doc.id,
                type: 'deposit',
                amount: data.amount,
                status: data.status,
                date: data.createdAt?.toDate() || new Date(),
                reference: doc.id.substring(0, 8)
            });
        });
        
        withdrawals.forEach(doc => {
            const data = doc.data();
            transactions.push({
                id: doc.id,
                type: 'withdrawal',
                amount: data.amount,
                status: data.status,
                date: data.createdAt?.toDate() || new Date(),
                reference: doc.id.substring(0, 8)
            });
        });
        
        trades.forEach(doc => {
            const data = doc.data();
            if (data.type === 'buy' || data.type === 'sell') {
                transactions.push({
                    id: doc.id,
                    type: 'trade',
                    amount: data.amount,
                    status: data.status || 'pending',
                    date: data.timestamp?.toDate() || new Date(),
                    reference: doc.id.substring(0, 8),
                    direction: data.direction
                });
            }
        });
        
        // Sort by date descending
        transactions.sort((a, b) => b.date - a.date);
        allTransactions = transactions;
        displayTransactionLedger(filter);
        
        // Update stats
        updateWalletStats();
    }).catch(err => console.error("Error loading transaction ledger:", err));
}

function displayTransactionLedger(filter) {
    const tbody = document.getElementById('transactionLedgerBody');
    if (!tbody) return;
    
    let filtered = [...allTransactions];
    
    if (filter !== 'all') {
        filtered = filtered.filter(t => t.type === filter);
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8">No transactions found</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    filtered.forEach(tx => {
        const row = document.createElement('tr');
        const formattedDate = tx.date.toLocaleString();
        
        let statusBadge = '';
        if (tx.status === 'approved' || tx.status === 'win') {
            statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400">Approved</span>';
        } else if (tx.status === 'rejected' || tx.status === 'loss') {
            statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-rose-500/10 text-rose-400">Rejected</span>';
        } else {
            statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400">Pending</span>';
        }
        
        let typeIcon = '';
        let typeClass = '';
        if (tx.type === 'deposit') {
            typeIcon = '<i class="fas fa-arrow-down text-emerald-400"></i>';
            typeClass = 'text-emerald-400';
        } else if (tx.type === 'withdrawal') {
            typeIcon = '<i class="fas fa-arrow-up text-rose-400"></i>';
            typeClass = 'text-rose-400';
        } else {
            typeIcon = tx.direction === '▲ BUY' ? '<i class="fas fa-arrow-up text-emerald-400"></i>' : '<i class="fas fa-arrow-down text-rose-400"></i>';
            typeClass = tx.direction?.includes('BUY') ? 'text-emerald-400' : 'text-rose-400';
        }
        
        row.innerHTML = `
            <td class="text-sm">${formattedDate}</td>
            <td class="text-sm font-medium ${typeClass}">${typeIcon} ${tx.type.toUpperCase()}</td>
            <td class="text-sm">${tx.amount.toLocaleString()} TZS</td>
            <td class="text-sm">${statusBadge}</td>
            <td class="text-xs text-slate-400">${tx.reference}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateWalletStats() {
    if (!state.currentUser) return;
    
    // Total deposits approved
    db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'APPROVED').get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            document.getElementById('totalDeposits').textContent = total.toLocaleString() + ' TZS';
        });
    
    // Total withdrawals approved
    db.collection('withdrawals').where('userId', '==', state.currentUser.uid).where('status', '==', 'APPROVED').get()
        .then(snapshot => {
            let total = 0;
            snapshot.forEach(doc => total += doc.data().amount || 0);
            document.getElementById('totalWithdrawals').textContent = total.toLocaleString() + ' TZS';
        });
    
    // Pending requests
    Promise.all([
        db.collection('deposits').where('userId', '==', state.currentUser.uid).where('status', '==', 'PENDING').get(),
        db.collection('withdrawals').where('userId', '==', state.currentUser.uid).where('status', '==', 'PENDING').get()
    ]).then(([deposits, withdrawals]) => {
        const count = deposits.size + withdrawals.size;
        document.getElementById('pendingRequestsCount').textContent = count;
    });
    
    // Total trades
    db.collection('users').doc(state.currentUser.uid).collection('transactions').get()
        .then(snapshot => {
            document.getElementById('totalTradesCount').textContent = snapshot.size;
        });
}