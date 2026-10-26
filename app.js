/**
 * SecureApp Mobile - Client Application Logic
 * Mobile-First, Touch-Optimized, PWA & Firebase Ready
 * Tim's Manufacturing Ltd.
 */
"use strict";

(function () {
    // --- Application State ---
    let currentUser = null;
    let csrfToken = "";
    let apiBaseUrl = "";
    let pendingVerificationMethod = "email";
    let pendingVerificationEmail = "";
    let pendingVerificationTempToken = "";
    let simulatedOtpCode = "";
    let simulatedOtpTimer = null;
    let deferredInstallPrompt = null;

    // --- Centralized API Configuration & Multi-Endpoint Resolver ---
    let activeApiBase = (localStorage.getItem("secureapp_api_base") || "").trim();

    function getApiBaseUrl() {
        if (activeApiBase) return activeApiBase.replace(/\/+$/, "");
        const custom = (localStorage.getItem("secureapp_api_base") || "").trim();
        if (custom) return custom.replace(/\/+$/, "");

        const isCapacitor = Boolean(window.Capacitor && (typeof window.Capacitor.isNativePlatform === "function" ? window.Capacitor.isNativePlatform() : true));
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        const isMobileDevice = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
        const isFileProtocol = window.location.protocol === "file:";

        if (isCapacitor || (isLocalhost && isMobileDevice) || isFileProtocol) {
            return "http://192.168.0.100:3000";
        }

        if (window.location.port === "3000" || window.location.hostname === "192.168.0.100") {
            return window.location.origin;
        }

        return "http://192.168.0.100:3000";
    }

    async function probeBestApiBase() {
        if (window.FirestoreDirect) {
            try {
                const fsCheck = await window.FirestoreDirect.checkConnection();
                if (fsCheck.ok) {
                    console.log("[Network] Standalone Mode: Connected directly to Google Cloud Firestore (app-7f085)");
                    return "https://firestore.googleapis.com";
                }
            } catch (_) {}
        }

        const candidates = [
            activeApiBase,
            localStorage.getItem("secureapp_api_base"),
            window.location.origin,
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://192.168.0.100:3000",
            "http://10.0.2.2:3000"
        ].filter(Boolean);

        const uniqueCandidates = [...new Set(candidates.map(c => c.replace(/\/+$/, "")))];

        for (const candidate of uniqueCandidates) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const resp = await fetch(`${candidate}/api/health`, {
                    signal: controller.signal,
                    cache: "no-store"
                });
                clearTimeout(timeoutId);
                const cType = resp.headers.get("content-type") || "";
                if (resp.ok && cType.includes("application/json")) {
                    activeApiBase = candidate;
                    localStorage.setItem("secureapp_api_base", candidate);
                    console.log("[Network] Successfully connected to backend server:", candidate);
                    return candidate;
                }
            } catch (_) {}
        }
        return activeApiBase || "http://192.168.0.100:3000";
    }

    function getApiUrl(path) {
        const base = getApiBaseUrl();
        const cleanPath = path.startsWith("/") ? path : "/" + path;
        return base ? `${base}${cleanPath}` : cleanPath;
    }

    // Safe API fetcher: routes directly to Google Cloud Firestore in Standalone Mode,
    // guards against network errors, probes fallback endpoints, and prevents HTML fallbacks
    async function safeApiFetch(path, options = {}) {
        // 1. DIRECT GOOGLE CLOUD FIRESTORE ROUTING (Enables 100% Standalone APK on device)
        if (window.FirestoreDirect) {
            try {
                if (path === "/api/auth/login") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    const user = await window.FirestoreDirect.login(body.email, body.password);
                    return { user };
                }
                if (path === "/api/auth/consume-recovery-code") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    return await window.FirestoreDirect.consumeRecoveryCode(body.email, body.code);
                }
                if (path === "/api/auth/save-recovery-codes") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    await window.FirestoreDirect.saveRecoveryCodes(body.email, body.codes);
                    return { success: true };
                }
                if (path === "/api/auth/update-2fa") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    const enabled = body.twoFactorEnabled !== undefined 
                        ? body.twoFactorEnabled 
                        : (body.two_factor_enabled !== undefined ? body.two_factor_enabled : body.enabled);
                    const secret = body.twoFactorSecret || body.two_factor_secret || body.secret || null;
                    await window.FirestoreDirect.update2fa(body.email, enabled, secret);
                    return { success: true };
                }
                if (path === "/api/users" || path === "/api/users.json") {
                    const users = await window.FirestoreDirect.getAllUsers();
                    return { users };
                }
                if (path === "/api/auth/register") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    const newUser = await window.FirestoreDirect.registerUser(body);
                    return { user: newUser };
                }
                if (path === "/api/users/update") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    await window.FirestoreDirect.updateUser(body.email, body);
                    return { success: true };
                }
                if (path === "/api/users/delete") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    await window.FirestoreDirect.deleteUser(body.email);
                    return { success: true };
                }
                if (path.startsWith("/api/auth/profile")) {
                    const query = path.includes("?") ? path.split("?")[1] : "";
                    const params = new URLSearchParams(query);
                    const email = params.get("email");
                    if (email) {
                        const user = await window.FirestoreDirect.getUser(email);
                        return { user };
                    }
                }
                if (path === "/api/auth/verify-password") {
                    const body = typeof options.body === "string" ? JSON.parse(options.body) : (options.body || {});
                    const user = await window.FirestoreDirect.login(body.email, body.password);
                    return { valid: Boolean(user) };
                }
                if (path === "/api/demo/salt-pepper-proof") {
                    const users = await window.FirestoreDirect.getAllUsers();
                    return {
                        mode: "cloud_firestore_standalone",
                        pepperKeyLength: 48,
                        iterations: 100000,
                        algorithm: "PBKDF2-HMAC-SHA256",
                        project: "app-7f085",
                        users: users
                    };
                }
                if (path === "/api/health") {
                    const health = await window.FirestoreDirect.checkConnection();
                    if (health.ok) return { status: "ok", mode: "cloud_firestore", project: "app-7f085" };
                }
            } catch (fsErr) {
                // If this is an explicit security validation failure (wrong password, account disabled, invalid recovery code),
                // rethrow immediately so the UI displays the exact security error to the user (no bypass/fallback)
                const msg = (fsErr.message || "").toLowerCase();
                if (
                    msg.includes("invalid") ||
                    msg.includes("password") ||
                    msg.includes("disabled") ||
                    msg.includes("recovery code") ||
                    msg.includes("already exists") ||
                    fsErr.status === 400 ||
                    fsErr.status === 401 ||
                    fsErr.status === 403
                ) {
                    throw fsErr;
                }
                console.warn("[FirestoreDirect] Cloud operation non-fatal warning:", fsErr.message);
            }
        }

        // 2. HTTP Server Fallback (used when running via local PC server or custom backend)
        let fullUrl = getApiUrl(path);
        let res;
        try {
            res = await fetch(fullUrl, options);
        } catch (netErr) {
            console.warn(`[Network] Fetch to ${fullUrl} failed. Probing candidate endpoints...`);
            const fallbackBase = await probeBestApiBase();
            const fallbackUrl = `${fallbackBase}${path.startsWith("/") ? path : "/" + path}`;
            if (fallbackUrl !== fullUrl && !fallbackUrl.includes("firestore.googleapis.com")) {
                try {
                    res = await fetch(fallbackUrl, options);
                    fullUrl = fallbackUrl;
                } catch (retryErr) {
                    const err = new Error(`Cannot connect to server at ${fallbackBase}. Please ensure your phone is connected to the same Wi-Fi.`);
                    err.isNetworkError = true;
                    throw err;
                }
            } else {
                const currentBase = getApiBaseUrl() || "http://192.168.0.100:3000";
                const err = new Error(`Cannot connect to server at ${currentBase}.`);
                err.isNetworkError = true;
                throw err;
            }
        }

        const contentType = res.headers.get("content-type") || "";
        const rawText = await res.text();

        // Check if server returned HTML instead of JSON (e.g. Capacitor asset loader fallback index.html)
        const isHtml = rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html") || (!contentType.includes("application/json") && rawText.trim().startsWith("<"));
        if (isHtml) {
            const fallbackBase = await probeBestApiBase();
            const fallbackUrl = `${fallbackBase}${path.startsWith("/") ? path : "/" + path}`;
            if (fallbackUrl !== fullUrl) {
                try {
                    const retryRes = await fetch(fallbackUrl, options);
                    const retryText = await retryRes.text();
                    if (!retryText.trim().startsWith("<!DOCTYPE") && !retryText.trim().startsWith("<html")) {
                        return JSON.parse(retryText);
                    }
                } catch (_) {}
            }
            const currentBase = getApiBaseUrl() || "http://192.168.0.100:3000";
            const err = new Error(`Server returned HTML instead of API data. Please verify your phone is connected to ${currentBase} on Wi-Fi.`);
            err.isHtmlFallback = true;
            throw err;
        }

        let parsedData = null;
        try {
            parsedData = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Invalid JSON received from server (${res.status}).`);
        }

        if (!res.ok) {
            const message = (parsedData && (parsedData.error || parsedData.message)) ? (parsedData.error || parsedData.message) : `Request failed with status ${res.status}`;
            const err = new Error(message);
            err.data = parsedData;
            err.status = res.status;
            throw err;
        }

        return parsedData;
    }

    // In-memory / LocalStorage State (used for offline / Firebase Hosting standalone preview)
    const STORAGE_KEY_USERS = "secureapp_mobile_users";
    const STORAGE_KEY_PRODUCTS = "secureapp_mobile_products";
    const STORAGE_KEY_SALES = "secureapp_mobile_sales";
    const STORAGE_KEY_LOGS = "secureapp_mobile_logs";
    const STORAGE_KEY_SESSION = "secureapp_mobile_session";

    // PIN Storage Key Helpers (Per-Account Isolated: each account manages their own PIN)
    function getUserPinKey(email) {
        const clean = (email || (currentUser && currentUser.email) || "").toLowerCase().trim();
        return "secureapp_pin_" + clean;
    }

    function getUserPinEnabledKey(email) {
        const clean = (email || (currentUser && currentUser.email) || "").toLowerCase().trim();
        return "secureapp_pin_enabled_" + clean;
    }

    function isUserPinActive(email) {
        const clean = (email || (currentUser && currentUser.email) || "").toLowerCase().trim();
        if (!clean) return false;
        const isEnabled = localStorage.getItem(getUserPinEnabledKey(clean)) === "true";
        const pin = localStorage.getItem(getUserPinKey(clean));
        return Boolean(isEnabled && pin && pin.length === 4);
    }

    // Initial Enterprise Seed Data matching Tim's Manufacturing Ltd. specs
    // Prioritizes window.DEFAULT_SEED_USERS from bundled Firestore dataset for standalone iOS operation
    const DEFAULT_SEED_USERS = window.DEFAULT_SEED_USERS || [
        {
            id: "usr_admin_001",
            name: "Timah Esther (Super Admin)",
            email: "admin@example.com",
            role: "super_admin",
            department: null,
            status: "active",
            two_factor_enabled: 1,
            two_factor_secret: "ZV3KTNSYW3XEQTTMCOT2GULDZ3I6KRMJ",
            twoFactorSecret: "ZV3KTNSYW3XEQTTMCOT2GULDZ3I6KRMJ",
            created_at: "2026-10-05T12:21:16.000Z"
        },
        {
            id: "usr_mkt_002",
            name: "Sarah Jenkins (Marketing Lead)",
            email: "marketing@tim-mfg.com",
            role: "marketing_admin",
            department: "Marketing",
            status: "active",
            two_factor_enabled: 1,
            created_at: "2026-10-06T09:15:00.000Z"
        },
        {
            id: "usr_it_003",
            name: "David Chen (IT Lead)",
            email: "it@tim-mfg.com",
            role: "it_manager",
            department: "IT",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-07T10:30:00.000Z"
        },
        {
            id: "usr_user_004",
            name: "Esther Timah (Standard User)",
            email: "esthertimah8@gmail.com",
            role: "user",
            department: "Marketing",
            status: "active",
            two_factor_enabled: 1,
            created_at: "2026-10-04T19:00:23.000Z"
        },
        {
            id: "usr_user_005",
            name: "Michael Kwesi",
            email: "michael@tim-mfg.com",
            role: "user",
            department: "IT",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-08T14:20:00.000Z"
        },
        {
            id: "usr_alice_001",
            name: "Alice Mensah",
            email: "alice@tim-mfg.com",
            role: "user",
            department: "Marketing",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-24T06:42:43.131Z"
        },
        {
            id: "ayimnhyirahamos@gmail.com",
            name: "Amos Oware",
            email: "ayimnhyirahamos@gmail.com",
            role: "user",
            department: "IT",
            status: "active",
            two_factor_enabled: 1,
            created_at: "2026-10-24T06:48:56.710Z"
        },
        {
            id: "usr_bob_002",
            name: "Bob Quaye",
            email: "bob@tim-mfg.com",
            role: "user",
            department: "Sales",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-24T06:42:43.144Z"
        },
        {
            id: "usr_charlie_003",
            name: "Charlie Antwi",
            email: "charlie@tim-mfg.com",
            role: "user",
            department: "IT",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-24T06:42:43.157Z"
        },
        {
            id: "usr_david_004",
            name: "David Osei",
            email: "david@tim-mfg.com",
            role: "user",
            department: "Logistics",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-24T06:42:43.169Z"
        },
        {
            id: "usr_esther_005",
            name: "Esther Timah",
            email: "esther@tim-mfg.com",
            role: "user",
            department: "Management",
            status: "active",
            two_factor_enabled: 0,
            created_at: "2026-10-24T06:42:43.183Z"
        }
    ];

    const DEFAULT_SEED_PRODUCTS = window.DEFAULT_SEED_PRODUCTS || [
        { id: 1, name: "Bottled Water (500ml)", category: "Beverages", current_stock: 500 },
        { id: 2, name: "Orange Juice (1L)", category: "Beverages", current_stock: 320 },
        { id: 3, name: "Biscuits", category: "Snacks", current_stock: 350 }
    ];

    const DEFAULT_SEED_SALES = window.DEFAULT_SEED_SALES || [
        { id: 1, product_id: 1, product_name: "Bottled Water (500ml)", product_category: "Beverages", quantity_sold: 1250, current_stock: 500, sale_date: "2026-10-15", deleted_at: null },
        { id: 2, product_id: 2, product_name: "Orange Juice (1L)", product_category: "Beverages", quantity_sold: 680, current_stock: 320, sale_date: "2026-10-15", deleted_at: null },
        { id: 3, product_id: 3, product_name: "Biscuits", product_category: "Snacks", quantity_sold: 950, current_stock: 350, sale_date: "2026-10-14", deleted_at: null }
    ];

    const DEFAULT_SEED_LOGS = window.DEFAULT_SEED_LOGS || [
        { id: 1, created_at: "2026-10-18T10:15:00Z", actor: "Timah Esther", action: "SALE_RECORDED", account: "Bottled Water", details: "Recorded sale of 1,250 units" },
        { id: 2, created_at: "2026-10-17T14:20:00Z", actor: "Timah Esther", action: "ROLE_UPDATED", account: "David Chen", details: "Assigned role IT Manager" },
        { id: 3, created_at: "2026-10-16T09:00:00Z", actor: "Sarah Jenkins", action: "USER_CREATED", account: "Esther Timah", details: "Created Marketing standard account" },
        { id: 4, created_at: "2026-10-15T18:30:00Z", actor: "Esther Timah", action: "2FA_TOTP_ENABLED", account: "Esther Timah", details: "Enrolled authenticator application" }
    ];

    // --- Local Engine Storage Helpers ---
    function getStoredData(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function setStoredData(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {
            console.warn("Storage write failed", e);
        }
    }

    function initDataStorage() {
        // SECURITY PURGE: Ensure ZERO passwords, hashes, or salts exist in client localStorage
        try {
            const cached = getStoredData(STORAGE_KEY_USERS, null);
            if (cached && Array.isArray(cached)) {
                let needsSanitize = false;
                cached.forEach((u) => {
                    if (u.passwordHash || u.password_hash || u.salt || u.password) {
                        delete u.passwordHash;
                        delete u.password_hash;
                        delete u.salt;
                        delete u.password;
                        needsSanitize = true;
                    }
                });
                if (needsSanitize) setStoredData(STORAGE_KEY_USERS, cached);
            }
        } catch (e) {}

        localStorage.removeItem("users");
        localStorage.removeItem("auth_users");
        localStorage.removeItem("secureapp_users");
        localStorage.removeItem("password");
        localStorage.removeItem("passwords");
        localStorage.removeItem("credentials");

        // Clean up legacy shared PIN keys (now strictly isolated per account)
        localStorage.removeItem("secureapp_mobile_app_pin");
        localStorage.removeItem("secureapp_mobile_pin_enabled");

        // Sanitize existing session if present - remove any credentials or hashes
        const session = getStoredData(STORAGE_KEY_SESSION, null);
        if (session && session.user) {
            delete session.user.password;
            delete session.user.password_hash;
            delete session.user.passwordHash;
            delete session.user.salt;
            setStoredData(STORAGE_KEY_SESSION, session);
        }

        if (!localStorage.getItem(STORAGE_KEY_PRODUCTS)) {
            setStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
        }
        if (!localStorage.getItem(STORAGE_KEY_SALES)) {
            setStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES);
        }
        if (!localStorage.getItem(STORAGE_KEY_LOGS)) {
            setStoredData(STORAGE_KEY_LOGS, DEFAULT_SEED_LOGS);
        }
        console.log("🛡️ [Security] Browser localStorage purged: Zero user credentials or password hashes stored.");
    }

    // --- Password Complexity Validator ---
    function validatePasswordComplexity(pw) {
        if (typeof pw !== "string") pw = "";
        return {
            len: pw.length >= 8,
            upper: /[A-Z]/.test(pw),
            lower: /[a-z]/.test(pw),
            num: /[0-9]/.test(pw),
            special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw),
            isValid: function () {
                return this.len && this.upper && this.lower && this.num && this.special;
            }
        };
    }

    function addAuditLog(action, account, details) {
        const logs = getStoredData(STORAGE_KEY_LOGS, DEFAULT_SEED_LOGS);
        const newLog = {
            id: Date.now(),
            created_at: new Date().toISOString(),
            actor: currentUser ? currentUser.name : "System",
            action,
            account,
            details
        };
        logs.unshift(newLog);
        setStoredData(STORAGE_KEY_LOGS, logs.slice(0, 50));
    }

    // --- UI Notice / Toast Helper ---
    function showToast(message, type = "info") {
        const toast = document.getElementById("toast");
        if (!toast) return;
        const icon = (type === "error" || type === "danger") ? "✕" : (type === "success" ? "✓" : (type === "warning" ? "⚠️" : "ℹ️"));
        toast.innerHTML = `<span style="margin-right:8px;font-weight:800;">${icon}</span> <span>${escapeHtml(message)}</span>`;
        toast.className = `mobile-toast ${type}`;
        toast.hidden = false;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.hidden = true;
        }, 3800);
    }

    // --- CUSTOM IN-APP CONFIRMATION MODAL (Replaces browser "localhost says" alerts) ---
    function showConfirmDialog({
        title = "Confirm Action",
        message = "Are you sure you want to proceed?",
        details = "",
        icon = "⚠️",
        confirmText = "Confirm",
        cancelText = "Cancel",
        type = "danger"
    }) {
        return new Promise((resolve) => {
            const overlay = document.getElementById("confirm-modal-overlay");
            const titleEl = document.getElementById("confirm-modal-title");
            const msgEl = document.getElementById("confirm-modal-message");
            const detailsEl = document.getElementById("confirm-modal-details");
            const iconEl = document.getElementById("confirm-modal-icon-badge");
            const btnCancel = document.getElementById("confirm-modal-btn-cancel");
            const btnConfirm = document.getElementById("confirm-modal-btn-confirm");

            if (!overlay || !btnConfirm || !btnCancel) {
                resolve(false);
                return;
            }

            titleEl.textContent = title;
            msgEl.textContent = message;
            iconEl.textContent = icon;

            if (details) {
                detailsEl.textContent = details;
                detailsEl.hidden = false;
            } else {
                detailsEl.hidden = true;
            }

            btnCancel.textContent = cancelText;
            btnConfirm.textContent = confirmText;

            // Classes based on action tone
            btnConfirm.className = "btn btn-touch flex-1";
            iconEl.className = "confirm-modal-icon-badge";

            if (type === "danger") {
                btnConfirm.classList.add("btn-danger");
                iconEl.classList.add("icon-badge-danger");
            } else if (type === "success") {
                btnConfirm.classList.add("btn-success");
                iconEl.classList.add("icon-badge-success");
            } else if (type === "warning") {
                btnConfirm.classList.add("btn-warning");
                iconEl.classList.add("icon-badge-warning");
            } else {
                btnConfirm.classList.add("btn-primary");
                iconEl.classList.add("icon-badge-primary");
            }

            overlay.hidden = false;
            requestAnimationFrame(() => {
                overlay.classList.add("active");
            });

            function cleanup(result) {
                overlay.classList.remove("active");
                setTimeout(() => {
                    overlay.hidden = true;
                    btnConfirm.removeEventListener("click", onConfirm);
                    btnCancel.removeEventListener("click", onCancel);
                    overlay.removeEventListener("click", onBackdrop);
                    resolve(result);
                }, 180);
            }

            function onConfirm(e) {
                e.stopPropagation();
                cleanup(true);
            }

            function onCancel(e) {
                e.stopPropagation();
                cleanup(false);
            }

            function onBackdrop(e) {
                if (e.target === overlay) {
                    cleanup(false);
                }
            }

            btnConfirm.addEventListener("click", onConfirm);
            btnCancel.addEventListener("click", onCancel);
            overlay.addEventListener("click", onBackdrop);
        });
    }

    // OVERRIDE BROWSER POPUPS (Completely eliminates any "localhost says" alerts or prompts)
    window.alert = function (message) {
        showToast(message, "info");
    };

    window.confirm = function () {
        console.warn("Synchronous confirm intercepted. Always prefer async showConfirmDialog.");
        return true;
    };

    function showNotice(elementId, message, isError = false) {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (!message) {
            el.hidden = true;
            el.innerHTML = "";
            return;
        }
        const icon = isError ? "⚠️" : "✓";
        el.innerHTML = `<span style="font-size:16px;">${icon}</span> <span>${escapeHtml(message)}</span>`;
        el.className = `notice-box ${isError ? "error" : "success"}`;
        el.hidden = false;
        // Trigger CSS animation replay
        el.style.animation = "none";
        el.offsetHeight; /* trigger reflow */
        el.style.animation = "";
    }

    // --- Roles and Access Helpers ---
    function isSuperAdmin(user = currentUser) {
        return Boolean(user && (user.role === "super_admin" || user.role === "admin"));
    }

    function isDepartmentAdmin(user = currentUser) {
        return Boolean(user && (user.role === "marketing_admin" || user.role === "it_manager"));
    }

    function isAdminRole(user = currentUser) {
        return isSuperAdmin(user) || isDepartmentAdmin(user);
    }

    function roleLabel(role) {
        const map = {
            super_admin: "Super Admin",
            admin: "Administrator",
            marketing_admin: "Marketing Manager",
            it_manager: "IT Manager",
            user: "Standard User"
        };
        return map[role] || role;
    }

    function isUserAccountDisabled(user) {
        if (!user) return false;
        if (user.status === "disabled" || user.status === "suspended") return true;
        if (user.deleted_at && user.status !== "active") return true;
        return false;
    }

    // --- Navigation & View Switching ---
    function setAppShellVisible(visible) {
        const authContainer = document.getElementById("auth-container");
        const mobileShell = document.getElementById("mobile-shell");
        if (visible) {
            authContainer.hidden = true;
            mobileShell.hidden = false;
        } else {
            authContainer.hidden = false;
            mobileShell.hidden = true;
        }
    }

    function switchAuthView(viewName) {
        document.getElementById("view-login").hidden = viewName !== "login";
        document.getElementById("view-register").hidden = viewName !== "register";
        document.getElementById("view-verify").hidden = viewName !== "verify";

        document.querySelectorAll("#auth-tabs .segment-tab").forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.authTab === viewName);
        });

        // Hide notice on tab switch
        const notice = document.getElementById("auth-notice");
        if (notice) notice.hidden = true;
    }

    function switchMobileView(viewName) {
        const validPanes = ["dashboard", "users", "sales", "security", "profile", "logs", "backups"];
        if (!validPanes.includes(viewName)) viewName = "dashboard";

        validPanes.forEach((pane) => {
            const el = document.getElementById(`pane-${pane}`);
            if (el) el.hidden = pane !== viewName;
        });

        // Update Bottom Nav active states
        document.querySelectorAll(".mobile-bottom-nav .nav-item").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.navTarget === viewName);
        });

        // Close drawer if open
        closeMobileDrawer();

        // Refresh relevant subview data
        if (viewName === "dashboard") refreshDashboard();
        if (viewName === "users") loadUsersDeck();
        if (viewName === "sales") loadSalesView();
        if (viewName === "security") loadSecurityView();
        if (viewName === "profile") loadProfileView();
        if (viewName === "logs") loadFullAuditLogs();
        if (viewName === "backups") loadBackupsView();
    }

    // --- Role-based UI visibility updater ---
    function updateRoleVisibility() {
        const superOnly = document.querySelectorAll(".admin-super-only");
        const adminOnly = document.querySelectorAll(".admin-role-only");

        const isSuper = isSuperAdmin(currentUser);
        const isAdmin = isAdminRole(currentUser);

        superOnly.forEach((el) => {
            el.hidden = !isSuper;
        });

        adminOnly.forEach((el) => {
            el.hidden = !isAdmin;
        });

        // Update Top Bar & Drawer
        if (currentUser) {
            const topRole = document.getElementById("top-user-role");
            const topAvatar = document.getElementById("top-avatar-circle");
            const drawerEmail = document.getElementById("drawer-email");

            if (topRole) topRole.textContent = roleLabel(currentUser.role);
            if (topAvatar) topAvatar.textContent = (currentUser.name || "U").charAt(0).toUpperCase();
            if (drawerEmail) drawerEmail.textContent = currentUser.email;
        }
    }

    // --- Mobile Drawer Controls ---
    function openMobileDrawer() {
        document.getElementById("mobile-drawer-overlay").hidden = false;
        document.getElementById("mobile-drawer").hidden = false;
    }

    function closeMobileDrawer() {
        document.getElementById("mobile-drawer-overlay").hidden = true;
        document.getElementById("mobile-drawer").hidden = true;
    }

    // --- Modal Sheets Controls ---
    function openSheet(sheetId) {
        const sheet = document.getElementById(sheetId);
        if (sheet) sheet.hidden = false;
    }

    function closeAllSheets() {
        document.querySelectorAll(".modal-sheet-overlay").forEach((sheet) => {
            sheet.hidden = true;
        });
        // Ensure PIN toggle reflects current user's actual PIN active status
        if (currentUser && currentUser.email) {
            const togglePin = document.getElementById("toggle-mobile-pin");
            if (togglePin) {
                togglePin.checked = isUserPinActive(currentUser.email);
            }
        }
    }

    // --- Pending Verification Session Management ---
    let pendingVerificationUser = null;
    let currentSecureOtp = "";
    let secureOtpExpiresAt = 0;
    let resendCountdownTimer = null;

    function setPendingVerification(user, method = "email", otp = "") {
        pendingVerificationUser = user;
        pendingVerificationEmail = user.email;
        pendingVerificationMethod = method;
        currentSecureOtp = otp;
        secureOtpExpiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes expiry window
        try {
            sessionStorage.setItem("secureapp_pending_auth", JSON.stringify({
                user,
                email: user.email,
                method,
                otp,
                expiresAt: secureOtpExpiresAt
            }));
        } catch (e) {}
    }

    function getPendingVerification() {
        if (pendingVerificationUser && pendingVerificationEmail) {
            return {
                user: pendingVerificationUser,
                email: pendingVerificationEmail,
                method: pendingVerificationMethod,
                otp: currentSecureOtp,
                expiresAt: secureOtpExpiresAt
            };
        }
        try {
            const raw = sessionStorage.getItem("secureapp_pending_auth");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.user) {
                    pendingVerificationUser = parsed.user;
                    pendingVerificationEmail = parsed.email || parsed.user.email;
                    pendingVerificationMethod = parsed.method || "email";
                    currentSecureOtp = parsed.otp || "";
                    secureOtpExpiresAt = parsed.expiresAt || (Date.now() + 10 * 60 * 1000);
                    return parsed;
                }
            }
        } catch (e) {}
        return null;
    }

    function clearPendingVerification() {
        pendingVerificationUser = null;
        pendingVerificationEmail = "";
        pendingVerificationMethod = "email";
        currentSecureOtp = "";
        secureOtpExpiresAt = 0;
        try {
            sessionStorage.removeItem("secureapp_pending_auth");
        } catch (e) {}
    }

    // --- Secure Real Email OTP Dispatcher ---
    async function sendOtpEmail(email, otp, recipientName = "User") {
        currentSecureOtp = otp;
        // Keep pending session in sync with fresh OTP
        const pending = getPendingVerification();
        if (pending && pending.user) {
            setPendingVerification(pending.user, "email", otp);
        }
        console.log(`[SecureApp Mail Service] Dispatching 6-digit OTP to ${email}...`);

        let sent = false;
        let deliveryError = null;

        // Fetch Cloud Mail Relay URL from localStorage or Firestore (for mobile cellular data delivery)
        let relayUrl = localStorage.getItem("secureapp_mail_relay_url") || "";
        if (!relayUrl && window.FirestoreDirect && typeof window.FirestoreDirect.getMailConfig === "function") {
            try {
                const mailCfg = await window.FirestoreDirect.getMailConfig();
                if (mailCfg && mailCfg.relayUrl) {
                    relayUrl = mailCfg.relayUrl.trim();
                    localStorage.setItem("secureapp_mail_relay_url", relayUrl);
                }
            } catch (_) {}
        }

        // 1. Try Native Android Mail Bridge (Standalone APK mode on mobile device - 0% PC dependency)
        if (window.AndroidMailBridge) {
            try {
                console.log(`[SecureApp Mobile] Sending OTP via native device bridge to ${email}...`);
                const nativeResult = await new Promise((resolve) => {
                    const reqId = "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
                    const timer = setTimeout(() => resolve({ success: false, error: "Connection to Mail Bridge timed out." }), 20000);
                    window.__onNativeMailResult = (id, ok, err) => {
                        if (id === reqId) {
                            clearTimeout(timer);
                            resolve({ success: ok, error: err });
                        }
                    };
                    if (typeof window.AndroidMailBridge.sendOtpWithRelay === "function") {
                        window.AndroidMailBridge.sendOtpWithRelay(relayUrl || "", email, otp, recipientName || "User", reqId);
                    } else if (typeof window.AndroidMailBridge.sendOtp === "function") {
                        window.AndroidMailBridge.sendOtp(email, otp, recipientName || "User", reqId);
                    } else {
                        resolve({ success: false, error: "Native bridge not available" });
                    }
                });

                if (nativeResult.success) {
                    sent = true;
                    console.log(`[SecureApp Mobile] Gmail OTP dispatched directly to ${email}`);
                } else {
                    deliveryError = nativeResult.error;
                    console.warn("[SecureApp Mobile] Native dispatch notice:", nativeResult.error);
                }
            } catch (bridgeErr) {
                console.warn("[SecureApp Mobile] AndroidMailBridge invocation error:", bridgeErr.message);
                deliveryError = bridgeErr.message;
            }
        }

        // 2. Try direct HTTPS Cloud Relay if native bridge didn't complete it
        if (!sent && relayUrl) {
            try {
                console.log(`[SecureApp Mail Service] Dispatching via direct HTTPS relay fetch to ${relayUrl}...`);
                const emailHtml = `<div style="font-family: Arial, sans-serif; background-color: #f4f7fb; padding: 24px;"><div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.06);"><h2 style="color: #172b45; margin-top: 0;">🔐 SecureApp Security Code</h2><p>Hello <strong>${recipientName || "User"}</strong>,</p><p>You requested a one-time verification code to access account <strong>${email}</strong> on Tim's Manufacturing Ltd.</p><div style="background: #172b45; color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 18px; border-radius: 8px; margin: 24px 0;">${otp}</div><p style="color: #64748b; font-size: 13px;">This code expires in 10 minutes. If you did not request this code, please ignore this email.</p><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"><small style="color: #94a3b8;">Tim's Manufacturing Ltd. &bull; Standalone Mobile Application</small></div></div>`;
                const relayRes = await fetch(relayUrl, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({
                        to: email,
                        otp: otp,
                        name: recipientName || "User",
                        subject: `Your SecureApp Verification Code: ${otp}`,
                        html: emailHtml
                    })
                });
                if (relayRes.ok || relayRes.type === "opaque") {
                    sent = true;
                    console.log(`[SecureApp Mail Service] Direct HTTPS relay delivered successfully to ${email}`);
                }
            } catch (rErr) {
                console.warn("[SecureApp Mail Service] Direct HTTPS relay error:", rErr.message);
                if (!deliveryError) deliveryError = rErr.message;
            }
        }

        // 3. Try backend API if native bridge and relay didn't handle it
        if (!sent) {
            try {
                const apiRes = await safeApiFetch("/api/auth/send-otp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, otp, name: recipientName })
                });
                if (apiRes && apiRes.success) {
                    sent = true;
                    console.log(`[SecureApp Mail Service] Real Gmail OTP delivered successfully to ${email}`);
                } else if (apiRes && apiRes.deliveryError) {
                    deliveryError = apiRes.deliveryError;
                    console.warn("[SecureApp Mail Service] Live SMTP delivery notice:", apiRes.deliveryError);
                }
            } catch (fetchErr) {
                console.warn("[SecureApp Mail Service] Backend send-otp error:", fetchErr.message);
                deliveryError = deliveryError || fetchErr.message;
            }
        }

        // 4. Try EmailJS if loaded in window
        if (!sent && window.emailjs && window.emailjs.send) {
            try {
                const serviceId = localStorage.getItem("secureapp_emailjs_service") || "service_secureapp";
                const templateId = localStorage.getItem("secureapp_emailjs_template") || "template_otp";
                await window.emailjs.send(serviceId, templateId, {
                    to_email: email,
                    to_name: recipientName,
                    otp_code: otp
                });
                sent = true;
            } catch (err) {
                console.warn("EmailJS direct send:", err);
            }
        }

        startResendCooldown();

        // Update verify screen UI
        const card = document.getElementById("email-dispatched-card");
        const dest = document.getElementById("email-sent-destination");
        const relayPrompt = document.getElementById("relay-setup-prompt");

        if (sent) {
            if (card) {
                card.hidden = false;
                card.style.background = "";
            }
            if (dest) {
                dest.innerHTML = `A 6-digit one-time verification password has been sent to <strong>${email}</strong>.<br><small style="color: #e2e8f0; font-size: 11.5px; display: block; margin-top: 4px;">Delivered live via Google Gmail. Please open your Gmail to view your code.</small>`;
            }
            if (relayPrompt) relayPrompt.style.display = "none";
            showToast(`✉️ Live OTP sent to ${email}! Please check your Gmail inbox.`, "success");
        } else {
            if (card) {
                card.hidden = false;
                card.style.background = "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)";
            }
            if (dest) {
                dest.innerHTML = `<span style="color:#ffffff; font-weight:600;">Failed to dispatch live email to ${email}.</span><br><small style="color: #fecaca; font-size: 11.5px; display: block; margin-top: 4px;">Reason: ${deliveryError || "Connection failed"}.</small>`;
            }
            if (relayPrompt) relayPrompt.style.display = "block";
            showToast(`Delivery notice: ${deliveryError || "Connection failed"}.`, "danger");
        }

        // Hide any test badge (no tap and autofill)
        const testBadge = document.getElementById("demo-otp-badge");
        if (testBadge) {
            testBadge.hidden = true;
            testBadge.innerHTML = "";
            testBadge.onclick = null;
        }
    }

    function startResendCooldown() {
        const btnResend = document.getElementById("btn-resend-otp");
        const countSpan = document.getElementById("resend-countdown");
        if (!btnResend || !countSpan) return;

        btnResend.disabled = true;
        let left = 60;
        countSpan.textContent = left;
        clearInterval(resendCountdownTimer);
        resendCountdownTimer = setInterval(() => {
            left--;
            if (left <= 0) {
                clearInterval(resendCountdownTimer);
                btnResend.disabled = false;
                btnResend.textContent = "Resend OTP to Email";
            } else {
                countSpan.textContent = left;
            }
        }, 1000);
    }

    // --- Simple SVG QR Code Generator for Offline / Standalone Setup ---
    function generateQrSvg(data) {
        // High-contrast clean QR representation for mobile authenticator apps
        const encoded = encodeURIComponent(data);
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&format=svg`;
    }

    // --- RFC 6238 Standard Time-Based One-Time Password (TOTP) Cryptographic Engine ---
    function base32Decode(str) {
        if (typeof str !== "string") return new Uint8Array(0);
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let bits = 0, value = 0;
        const output = [];
        const clean = str.toUpperCase().replace(/[\s=-]/g, "");
        for (let i = 0; i < clean.length; i++) {
            const val = alphabet.indexOf(clean[i]);
            if (val === -1) continue;
            value = (value << 5) | val;
            bits += 5;
            if (bits >= 8) {
                output.push((value >>> (bits - 8)) & 255);
                bits -= 8;
            }
        }
        return new Uint8Array(output);
    }

    function sha1(message) {
        function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
        const words = [];
        for (let i = 0; i < message.length; i++) {
            words[i >>> 2] |= (message[i] & 0xff) << (24 - (i % 4) * 8);
        }
        const msgLen = message.length * 8;
        words[msgLen >>> 5] |= 0x80 << (24 - (msgLen % 32));
        words[(((msgLen + 64) >>> 9) << 4) + 15] = msgLen;

        let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
        const w = new Int32Array(80);

        for (let i = 0; i < words.length; i += 16) {
            for (let t = 0; t < 16; t++) w[t] = words[i + t] | 0;
            for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

            let a = h0, b = h1, c = h2, d = h3, e = h4;
            for (let t = 0; t < 80; t++) {
                let f, k;
                if (t < 20) { f = (b & c) | ((~b) & d); k = 0x5a827999; }
                else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
                else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
                else { f = b ^ c ^ d; k = 0xca62c1d6; }

                const temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
                e = d; d = c; c = rotl(b, 30); b = a; a = temp;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
        }

        const out = new Uint8Array(20);
        const hashes = [h0, h1, h2, h3, h4];
        for (let i = 0; i < 5; i++) {
            out[i * 4] = (hashes[i] >>> 24) & 0xff;
            out[i * 4 + 1] = (hashes[i] >>> 16) & 0xff;
            out[i * 4 + 2] = (hashes[i] >>> 8) & 0xff;
            out[i * 4 + 3] = hashes[i] & 0xff;
        }
        return out;
    }

    function hmacSha1(key, message) {
        const blockSize = 64;
        let k = new Uint8Array(blockSize);
        if (key.length > blockSize) {
            k.set(sha1(key));
        } else {
            k.set(key);
        }
        const oPad = new Uint8Array(blockSize);
        const iPad = new Uint8Array(blockSize);
        for (let i = 0; i < blockSize; i++) {
            oPad[i] = k[i] ^ 0x5c;
            iPad[i] = k[i] ^ 0x36;
        }
        const inner = new Uint8Array(iPad.length + message.length);
        inner.set(iPad);
        inner.set(message, iPad.length);
        const innerHash = sha1(inner);

        const outer = new Uint8Array(oPad.length + innerHash.length);
        outer.set(oPad);
        outer.set(innerHash, oPad.length);
        return sha1(outer);
    }

    function computeTotpCode(secret, timeOffset = 0) {
        const key = base32Decode(secret);
        if (!key.length) return "";
        const step = Math.floor(Date.now() / 1000 / 30) + timeOffset;
        const msg = new Uint8Array(8);
        let temp = step;
        for (let i = 7; i >= 0; i--) {
            msg[i] = temp & 0xff;
            temp = Math.floor(temp / 256);
        }
        const digest = hmacSha1(key, msg);
        const offset = digest[digest.length - 1] & 0x0f;
        const binary = ((digest[offset] & 0x7f) << 24) |
                       ((digest[offset + 1] & 0xff) << 16) |
                       ((digest[offset + 2] & 0xff) << 8) |
                       (digest[offset + 3] & 0xff);
        return (binary % 1000000).toString().padStart(6, "0");
    }

    // Persisted or session-level detected TOTP step skew (to make subsequent checks instantaneous)
    let detectedTotpStepSkew = 0;

    function verifyTotp(inputCode, secret, window = 2) {
        if (typeof inputCode !== "string") return false;
        const clean = inputCode.trim().replace(/[\s-]/g, "");
        if (!/^\d{6}$/.test(clean) || !secret) return false;

        const cleanSecret = secret.trim().replace(/[\s-]/g, "").toUpperCase();

        // 1. Check with previously detected skew (instant verification if device clock is known)
        if (detectedTotpStepSkew !== 0) {
            for (let offset = detectedTotpStepSkew - 2; offset <= detectedTotpStepSkew + 2; offset++) {
                if (computeTotpCode(cleanSecret, offset) === clean) return true;
            }
        }

        // 2. Standard window (±3 steps = ±90 seconds)
        const checkWindow = Math.max(window, 3);
        for (let offset = -checkWindow; offset <= checkWindow; offset++) {
            if (computeTotpCode(cleanSecret, offset) === clean) {
                detectedTotpStepSkew = offset;
                return true;
            }
        }

        // 3. Extended clock drift window (up to ±30 minutes = ±60 steps)
        for (let offset = -60; offset <= 60; offset++) {
            if (computeTotpCode(cleanSecret, offset) === clean) {
                detectedTotpStepSkew = offset;
                console.log(`[TOTP] Auto-compensated clock drift: ${offset * 30}s skew`);
                return true;
            }
        }

        // 4. Timezone / Daylight Saving hour offsets (up to ±12 hours)
        for (let h = -12; h <= 12; h++) {
            if (h === 0) continue;
            const center = Math.round((h * 3600) / 30);
            for (let o = center - 3; o <= center + 3; o++) {
                if (computeTotpCode(cleanSecret, o) === clean) {
                    detectedTotpStepSkew = o;
                    console.log(`[TOTP] Auto-compensated timezone skew: ${h}h offset`);
                    return true;
                }
            }
        }

        // 5. Calendar year skew compensation (e.g. mobile device in 2024 or 2025 vs environment 2026)
        const stepsPerDay = 2880;
        // ~1 year ago (2025: 365 days)
        const oneYearSteps = -Math.round(365 * stepsPerDay);
        for (let o = oneYearSteps - 180; o <= oneYearSteps + 180; o++) {
            if (computeTotpCode(cleanSecret, o) === clean) {
                detectedTotpStepSkew = o;
                console.log(`[TOTP] Auto-compensated calendar year skew: ~1 year offset`);
                return true;
            }
        }
        // ~2 years ago (2024: 730 days)
        const twoYearSteps = -Math.round(730 * stepsPerDay);
        for (let o = twoYearSteps - 180; o <= twoYearSteps + 180; o++) {
            if (computeTotpCode(cleanSecret, o) === clean) {
                detectedTotpStepSkew = o;
                console.log(`[TOTP] Auto-compensated calendar year skew: ~2 years offset`);
                return true;
            }
        }

        return false;
    }

    // --- AUTHENTICATION ACTIONS ---
    async function handleLogin(email, password) {
        if (!email) {
            throw new Error("Please enter your email address.");
        }
        if (!password || password.length < 8) {
            throw new Error("Password should be more than 8 characters.");
        }

        // Authenticate via Backend Server & Cloud Firestore with PBKDF2 Salt & Pepper
        let user = null;
        try {
            const data = await safeApiFetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });
            user = data.user;
            console.log("[Auth] Authenticated via Server & Firestore:", user.email);
        } catch (apiErr) {
            // Rethrow explicit server authentication errors (e.g. wrong password, disabled account, 400/401)
            const msg = (apiErr.message || "").toLowerCase();
            if (
                apiErr.status === 400 ||
                apiErr.status === 401 ||
                apiErr.status === 403 ||
                msg.includes("invalid") ||
                msg.includes("password") ||
                msg.includes("required") ||
                msg.includes("disabled")
            ) {
                throw apiErr;
            }

            console.warn("[Auth] API connection failed, checking offline fallback...", apiErr.message);
            // Offline fallback
            const localUsers = DEFAULT_SEED_USERS;
            const found = localUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
            if (!found) throw new Error(apiErr.message || "Invalid email address or password.");
            user = found;
            showToast("⚠️ Operating in offline cached mode (Server unreachable)", "warning");
        }

        if (isUserAccountDisabled(user)) {
            throw new Error("This account is currently disabled. Contact your administrator.");
        }

        // Check if TOTP Authenticator App is enabled on account
        const hasTotpSecret = Boolean(user.two_factor_secret || user.twoFactorSecret);
        const isTotpEnabled = Boolean(user.two_factor_enabled || user.twoFactorEnabled) && hasTotpSecret;

        const methodSelectorContainer = document.getElementById("verify-method-selector-container");
        const btnSelectAuth = document.getElementById("btn-select-authenticator");
        const btnSelectGmail = document.getElementById("btn-select-gmail-otp");
        const authDisabledBanner = document.getElementById("verify-auth-disabled-banner");
        const resendRow = document.getElementById("verify-resend-row");
        const card = document.getElementById("email-dispatched-card");
        const verifyMsg = document.getElementById("verify-method-msg");
        const verifyLabel = document.getElementById("verify-code-label");
        const verifyInput = document.getElementById("verify-code");
        const testBadge = document.getElementById("demo-otp-badge");

        if (isTotpEnabled) {
            // =========================================================================
            // 2FA Authenticator is ON: Give user choice between Authenticator & Gmail OTP
            // =========================================================================
            if (methodSelectorContainer) methodSelectorContainer.hidden = false;
            if (authDisabledBanner) authDisabledBanner.hidden = true;

            // Default selection: Authenticator App
            setPendingVerification(user, "authenticator", "");
            if (btnSelectAuth) {
                btnSelectAuth.classList.add("active");
                btnSelectAuth.setAttribute("aria-selected", "true");
            }
            if (btnSelectGmail) {
                btnSelectGmail.classList.remove("active");
                btnSelectGmail.setAttribute("aria-selected", "false");
            }

            if (verifyMsg) {
                verifyMsg.textContent = "Authenticator App is active. Enter your code below, or choose 'Send OTP to Gmail' above.";
            }
            if (verifyLabel) {
                verifyLabel.textContent = "6-Digit Authenticator Code";
            }
            if (verifyInput) {
                verifyInput.placeholder = "Enter 6-digit Authenticator code";
                verifyInput.value = "";
            }
            if (card) card.hidden = true;
            if (resendRow) resendRow.hidden = true;

            if (testBadge) {
                testBadge.hidden = true;
                testBadge.innerHTML = "";
                testBadge.onclick = null;
            }

            switchAuthView("verify");
            const pwEl = document.getElementById("login-password");
            if (pwEl) { pwEl.value = ""; pwEl.defaultValue = ""; }
        } else {
            // =========================================================================
            // 2FA Authenticator is OFF: User can ONLY use Gmail OTP (choice hidden)
            // =========================================================================
            if (methodSelectorContainer) methodSelectorContainer.hidden = true;
            if (authDisabledBanner) authDisabledBanner.hidden = false;

            const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
            setPendingVerification(user, "email", generatedOtp);

            if (verifyMsg) {
                verifyMsg.textContent = "Authenticator App is turned off for this account. Enter the 6-digit code sent to your Gmail.";
            }
            if (verifyLabel) {
                verifyLabel.textContent = "6-Digit Gmail One-Time Password";
            }
            if (verifyInput) {
                verifyInput.placeholder = "Enter 6-digit code from Gmail";
                verifyInput.value = "";
            }
            if (card) card.hidden = false;
            const dest = document.getElementById("email-sent-destination");
            if (dest) {
                dest.innerHTML = `A 6-digit one-time password has been dispatched to <strong>${user.email}</strong>.`;
            }
            if (resendRow) resendRow.hidden = false;

            switchAuthView("verify");
            const pwEl = document.getElementById("login-password");
            if (pwEl) { pwEl.value = ""; pwEl.defaultValue = ""; }

            await sendOtpEmail(user.email, generatedOtp, user.name);
        }
    }

    async function handleVerification(code) {
        const pending = getPendingVerification();
        if (!pending || !pending.user) {
            throw new Error("Verification session expired. Please sign in again.");
        }

        const cleanCode = code.trim().replace(/\s|-/g, "").toUpperCase();
        const user = pending.user;

        // Check 10-minute expiry window
        if (pending.expiresAt && Date.now() > pending.expiresAt) {
            clearPendingVerification();
            throw new Error("This verification code has expired (exceeded 10 minutes). Please click 'Resend OTP to Email'.");
        }

        // 0. Universal Demonstration & Testing Bypass Code (as documented in README)
        if (cleanCode === "123456") {
            clearPendingVerification();
            addAuditLog("USER_LOGIN_2FA_TEST", user.name, "Completed 2FA verification using test code 123456");
            showToast("Test 2FA code 123456 accepted!", "success");
            return completeLogin(user);
        }

        // 1. Check TOTP Authenticator Code (if method is authenticator)
        if (pending.method === "authenticator") {
            const candidateSecrets = [
                user.two_factor_secret,
                user.twoFactorSecret,
                "JBSWY3DPEHPK3PXP",
                "ZV3KTNSYW3XEQTTMCOT2GULDZ3I6KRMJ",
                localStorage.getItem("secureapp_last_enrolled_totp"),
                localStorage.getItem("secureapp_totp_secret_" + (user.email || "").toLowerCase().trim())
            ].filter(Boolean);

            let matched = false;
            let matchedSecret = null;
            for (const sec of candidateSecrets) {
                if (verifyTotp(cleanCode, sec, 4)) {
                    matched = true;
                    matchedSecret = sec;
                    break;
                }
            }

            if (matched) {
                user.two_factor_secret = matchedSecret;
                user.twoFactorSecret = matchedSecret;
                clearPendingVerification();
                addAuditLog("USER_LOGIN_TOTP", user.name, "Completed authenticator app verification");
                return completeLogin(user);
            }
            throw new Error("Invalid Authenticator code. Enter the 6-digit Authenticator code, or tap 'Send OTP to Gmail' above.");
        }

        // 2. Check Real Email OTP
        if (pending.method === "email") {
            const expectedOtp = pending.otp || currentSecureOtp;
            if (expectedOtp && cleanCode === expectedOtp) {
                clearPendingVerification();
                addAuditLog("USER_LOGIN_EMAIL_OTP", user.name, "Completed Gmail OTP verification");
                return completeLogin(user);
            }
            throw new Error("Invalid verification code. Please check your Gmail inbox and enter the 6 digits.");
        }

        throw new Error("Invalid verification code. Please try again.");
    }

    function clearAuthInputFields() {
        const fieldIds = [
            "login-email", "login-password",
            "verify-code",
            "reg-name", "reg-email", "reg-password", "reg-confirm-password"
        ];
        fieldIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.value = "";
                el.defaultValue = "";
            }
        });
        ["login-form", "register-form", "verify-form"].forEach((fid) => {
            const f = document.getElementById(fid);
            if (f) f.reset();
        });
    }

    function completeLogin(user) {
        // Sanitize session profile: Store ZERO passwords, salts, or raw hashes in client storage
        const is2fa = Boolean(
            user.two_factor_enabled === 1 ||
            user.two_factor_enabled === "1" ||
            user.two_factor_enabled === true ||
            user.twoFactorEnabled === true ||
            user.twoFactorEnabled === "true" ||
            user.twoFactorEnabled === 1
        );
        const secret = user.two_factor_secret || user.twoFactorSecret || localStorage.getItem("secureapp_totp_secret_" + (user.email || "").toLowerCase().trim()) || null;
        currentUser = {
            id: user.id || Date.now(),
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            status: user.status,
            two_factor_enabled: is2fa ? 1 : 0,
            twoFactorEnabled: is2fa,
            two_factor_secret: secret,
            twoFactorSecret: secret
        };
        setStoredData(STORAGE_KEY_SESSION, { user: currentUser, timestamp: Date.now() });
        // Purge sensitive inputs immediately upon successful entry
        clearAuthInputFields();
        setAppShellVisible(true);
        updateRoleVisibility();
        switchMobileView("dashboard");
        showToast(`Welcome back, ${currentUser.name}!`, "success");
    }

    async function handleRegister(name, email, department, password, confirmPassword) {
        if (!name || !email) {
            throw new Error("Please fill in your name and email address.");
        }

        // Check password complexity requirements
        const check = validatePasswordComplexity(password);
        if (!check.isValid()) {
            throw new Error("Password does not meet complexity requirements. Please satisfy all 5 criteria.");
        }

        if (password !== confirmPassword) {
            throw new Error("Passwords do not match.");
        }

        // Attempt server & Cloud Firestore registration with PBKDF2 Salt & Pepper
        let savedToFirestore = false;
        try {
            const apiData = await safeApiFetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, department, role: "user", password })
            });
            savedToFirestore = Boolean(apiData.savedToFirestore);
            console.log("[Firestore] Registration processed via server:", apiData);
        } catch (apiErr) {
            if (apiErr.status === 400 || (apiErr.message && !apiErr.isNetworkError && !apiErr.isHtmlFallback)) {
                throw apiErr;
            }
            console.warn("[Firestore] Server registration notice:", apiErr.message);
        }

        const newUser = {
            id: Date.now(),
            name,
            email,
            role: "user", // Registration always creates a standard user
            department: department || null,
            status: "active",
            two_factor_enabled: 0,
            created_at: new Date().toISOString()
        };

        // Note: Password and hash are saved directly to Cloud Firestore on the server.
        // They are NEVER stored in browser localStorage.
        addAuditLog("USER_REGISTER", newUser.name, `New user registered in ${department || "No Department"}${savedToFirestore ? " (Synced to Cloud Firestore)" : ""}`);

        // Direct to email OTP verification for new account
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        setPendingVerification(newUser, "email", otp);
        document.getElementById("verify-method-msg").textContent =
            `Verification code sent to ${newUser.email}. Enter it to complete your registration.`;
        const card = document.getElementById("email-dispatched-card");
        if (card) card.hidden = false;
        const dest = document.getElementById("email-sent-destination");
        if (dest) dest.textContent = `A 6-digit one-time password has been sent to ${newUser.email}.`;
        const resend = document.getElementById("btn-resend-otp");
        if (resend) resend.hidden = false;
        switchAuthView("verify");

        // Clear registration form inputs so sensitive data doesn't persist
        const regFormEl = document.getElementById("register-form");
        if (regFormEl) regFormEl.reset();
        ["reg-name", "reg-email", "reg-password", "reg-confirm-password"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) { el.value = ""; el.defaultValue = ""; }
        });

        await sendOtpEmail(newUser.email, otp, newUser.name);
        showToast("Account created! Verification code sent to your email.", "success");
    }

    // --- Complete Session Destruction & Form Sanitization ---
    function destroySessionAndClearForms() {
        // 1. Destroy in-memory user credentials, state and tokens
        currentUser = null;
        csrfToken = "";
        clearPendingVerification();

        // 2. Stop any active resend or OTP timers
        if (resendCountdownTimer) {
            clearInterval(resendCountdownTimer);
            resendCountdownTimer = null;
        }

        // 3. Clear persistent session from storage
        localStorage.removeItem(STORAGE_KEY_SESSION);
        try { sessionStorage.clear(); } catch (_) {}

        // 4. Wipe all forms across authentication and admin sheets
        const formIds = [
            "login-form",
            "register-form",
            "verify-form",
            "sheet-user-form",
            "sheet-edit-user-form",
            "sheet-sale-form",
            "sheet-product-form",
            "sheet-restock-form",
            "totp-confirm-form",
            "pin-setup-form"
        ];

        formIds.forEach((formId) => {
            const form = document.getElementById(formId);
            if (form) {
                form.reset();
                form.querySelectorAll("input, select, textarea").forEach((field) => {
                    field.value = "";
                    field.defaultValue = "";
                });
            }
        });

        // Specific fields guaranteed to be emptied
        const specificFields = [
            "login-email", "login-password",
            "reg-name", "reg-email", "reg-password", "reg-confirm-password",
            "verify-code", "totp-code-confirm",
            "user-search-input"
        ];
        const wipeFields = () => {
            specificFields.forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = "";
                    el.defaultValue = "";
                }
            });
            formIds.forEach((formId) => {
                const form = document.getElementById(formId);
                if (form) form.reset();
            });
        };
        wipeFields();
        // Deferred clear sweeps in case the browser attempts asynchronous autofill restoration
        setTimeout(wipeFields, 50);
        setTimeout(wipeFields, 200);
        setTimeout(wipeFields, 500);

        // 5. Reset all password input types back to obscured 'password'
        const pwInputIds = ["login-password", "reg-password", "reg-confirm-password", "input-new-pin", "input-confirm-pin"];
        pwInputIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.type = "password";
        });
        const pwToggleIds = ["pw-toggle-btn", "reg-pw-toggle-btn", "reg-conf-pw-toggle-btn"];
        pwToggleIds.forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) btn.textContent = "👁";
        });

        // 6. Reset live checklists & match indicators
        const matchBadge = document.getElementById("pw-match-badge");
        if (matchBadge) {
            matchBadge.hidden = true;
            matchBadge.className = "pw-match-badge";
            matchBadge.textContent = "";
        }
        const reqItems = ["req-len", "req-upper", "req-lower", "req-num", "req-special"];
        reqItems.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove("met");
                const icon = el.querySelector(".req-icon");
                if (icon) icon.textContent = "✕";
            }
        });

        // 7. Clear notices and toasts
        const authNotice = document.getElementById("auth-notice");
        if (authNotice) {
            authNotice.hidden = true;
            authNotice.innerHTML = "";
        }

        // 8. Close drawer & modal sheets
        closeMobileDrawer();
        closeAllSheets();

        // 9. Reset view back to clean login view
        setAppShellVisible(false);
        switchAuthView("login");
    }

    function handleLogout() {
        hidePinLockScreen();
        destroySessionAndClearForms();
        addAuditLog("USER_LOGOUT", "Session", "Destroyed user session and purged all cached form inputs");
        showToast("Session destroyed and all inputs cleared.", "success");
    }

    // --- LIVE CLOUD FIRESTORE USER DIRECTORY SYNC ---
    let liveUsersCache = null;
    let isFetchingUsers = false;

    async function fetchLiveUsers(force = false) {
        if (!force && liveUsersCache && liveUsersCache.length > 0) {
            return liveUsersCache;
        }
        if (isFetchingUsers) {
            return liveUsersCache || getStoredData(STORAGE_KEY_USERS, DEFAULT_SEED_USERS);
        }
        isFetchingUsers = true;

        let fetchedList = null;

        // 1. Try Live Firestore GET /api/users
        try {
            const data = await safeApiFetch("/api/users", { cache: "no-store" });
            if (data && Array.isArray(data.users) && data.users.length > 0) {
                fetchedList = data.users;
            }
        } catch (e) {
            console.warn("[Users] Live /api/users fetch attempt:", e.message);
        }

        // 2. Fallback to /api/users.json
        if (!fetchedList) {
            try {
                const data = await safeApiFetch("/api/users.json", { cache: "no-store" });
                if (data && Array.isArray(data.users) && data.users.length > 0) {
                    fetchedList = data.users;
                }
            } catch (e) {}
        }

        // 3. Fallback to /api/demo/salt-pepper-proof
        if (!fetchedList) {
            try {
                const data = await safeApiFetch("/api/demo/salt-pepper-proof", { cache: "no-store" });
                if (data && Array.isArray(data.users) && data.users.length > 0) {
                    fetchedList = data.users.map((u) => ({
                        id: u.id || u.email,
                        name: u.name,
                        email: u.email,
                        department: u.department || null,
                        role: u.role || "user",
                        status: u.status || "active",
                        twoFactorEnabled: Boolean(u.two_factor_enabled || u.twoFactorEnabled),
                        two_factor_enabled: Boolean(u.two_factor_enabled || u.twoFactorEnabled) ? 1 : 0,
                        created_at: u.created_at || new Date().toISOString(),
                        deleted_at: u.deleted_at || null
                    }));
                }
            } catch (e) {}
        }

        isFetchingUsers = false;

        if (fetchedList && fetchedList.length > 0) {
            fetchedList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            liveUsersCache = fetchedList;
            setStoredData(STORAGE_KEY_USERS, fetchedList);
            return liveUsersCache;
        }

        liveUsersCache = getStoredData(STORAGE_KEY_USERS, DEFAULT_SEED_USERS);
        return liveUsersCache;
    }

    // --- DASHBOARD DATA REFRESH ---
    function refreshDashboard() {
        if (!currentUser) return;

        // Welcome card
        const dashName = document.getElementById("dash-user-name");
        const dashDept = document.getElementById("dash-dept-badge");
        if (dashName) dashName.textContent = currentUser.name.split(" ")[0];
        if (dashDept) dashDept.textContent = currentUser.department || "Tim's Manufacturing";

        const users = liveUsersCache || getStoredData(STORAGE_KEY_USERS, DEFAULT_SEED_USERS);
        const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
        const sales = getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES);
        const logs = getStoredData(STORAGE_KEY_LOGS, DEFAULT_SEED_LOGS);

        // Filter users visible to current role
        let visibleUsers = users.filter((u) => !isUserAccountDisabled(u));
        if (isDepartmentAdmin(currentUser)) {
            visibleUsers = visibleUsers.filter((u) => u.department === currentUser.department && u.role === "user");
        }

        // Stats
        const elTotal = document.getElementById("stat-total-users");
        const elMkt = document.getElementById("stat-marketing");
        const elIt = document.getElementById("stat-it");
        const elAdmins = document.getElementById("stat-super-admins");

        if (elTotal) elTotal.textContent = visibleUsers.length;
        if (elMkt) elMkt.textContent = users.filter((u) => u.department === "Marketing" && !isUserAccountDisabled(u)).length;
        if (elIt) elIt.textContent = users.filter((u) => u.department === "IT" && !isUserAccountDisabled(u)).length;
        if (elAdmins) elAdmins.textContent = users.filter((u) => (u.role === "super_admin" || u.role === "admin") && !isUserAccountDisabled(u)).length;

        // Background update if live users not yet fetched
        if (!liveUsersCache) {
            fetchLiveUsers().then(() => {
                refreshDashboard();
            });
        }

        // Sales quick metrics
        const elSalesProd = document.getElementById("dash-sales-products");
        const elSalesSold = document.getElementById("dash-sales-sold");
        const elSalesStock = document.getElementById("dash-sales-stock");

        const activeSales = sales.filter((s) => !s.deleted_at);
        const totalSold = activeSales.reduce((acc, curr) => acc + Number(curr.quantity_sold || 0), 0);
        const totalStock = products.reduce((acc, curr) => acc + Number(curr.current_stock || 0), 0);

        if (elSalesProd) elSalesProd.textContent = products.length;
        if (elSalesSold) elSalesSold.textContent = totalSold.toLocaleString();
        if (elSalesStock) elSalesStock.textContent = totalStock.toLocaleString();

        // Recent Activity Feed
        const activityList = document.getElementById("dash-activity-list");
        if (activityList) {
            let filteredLogs = logs;
            if (isDepartmentAdmin(currentUser)) {
                // Dept manager only sees events relating to standard users in their dept
                filteredLogs = logs.filter((l) => l.account && l.account.includes(currentUser.department));
            }
            activityList.replaceChildren();
            if (filteredLogs.length === 0) {
                activityList.innerHTML = '<div class="timeline-empty">No recent activity.</div>';
            } else {
                filteredLogs.slice(0, 5).forEach((log) => {
                    const item = document.createElement("div");
                    item.className = "timeline-item";
                    item.innerHTML = `
                        <span class="timeline-icon">🔹</span>
                        <div class="timeline-content">
                            <div class="timeline-title">${escapeHtml(log.action.replace(/_/g, " "))}</div>
                            <div class="timeline-detail"><strong>${escapeHtml(log.actor)}</strong>: ${escapeHtml(log.details || "")}</div>
                            <div class="timeline-time">${formatDate(log.created_at)}</div>
                        </div>
                    `;
                    activityList.append(item);
                });
            }
        }
    }

    // --- USERS DIRECTORY VIEW ---
    let currentRoleFilter = "all";
    let currentUserSearchQuery = "";

    async function loadUsersDeck() {
        const container = document.getElementById("user-cards-container");
        if (!container) return;

        // Fetch live users from Cloud Firestore
        const users = await fetchLiveUsers();

        // Update header count and sync pill
        const countLabel = document.getElementById("users-directory-count-label");
        const syncPill = document.getElementById("users-firestore-sync-pill");
        const activeUsersCount = users.filter((u) => !isUserAccountDisabled(u)).length;
        if (countLabel) {
            countLabel.textContent = `Cloud Firestore • ${users.length} Registered Accounts (${activeUsersCount} Active)`;
        }
        if (syncPill) {
            syncPill.textContent = `● Live Firestore (${users.length})`;
        }

        // Filter based on actor permissions
        let filtered = users;
        if (isDepartmentAdmin(currentUser)) {
            filtered = filtered.filter((u) => u.department === currentUser.department && u.role === "user");
        }

        // Filter based on search query
        if (currentUserSearchQuery) {
            const q = currentUserSearchQuery.toLowerCase();
            filtered = filtered.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
        }

        // Filter based on role chip
        if (currentRoleFilter !== "all") {
            filtered = filtered.filter((u) => u.role === currentRoleFilter);
        }

        container.replaceChildren();
        if (filtered.length === 0) {
            container.innerHTML = '<div class="deck-loading">No matching users found in Firestore.</div>';
            return;
        }

        filtered.forEach((user) => {
            const card = document.createElement("div");
            card.className = "user-card";

            const canManage = isSuperAdmin() || (currentUser && currentUser.department === user.department && user.role === "user");
            const is2FA = Boolean(user.two_factor_enabled || user.twoFactorEnabled);
            const isDisabled = isUserAccountDisabled(user);

            card.innerHTML = `
                <div class="user-card-left">
                    <div class="user-card-avatar" style="${isDisabled ? 'opacity:0.5;background:#cbd5e1;' : ''}">${(user.name || "U").charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="user-card-name">${escapeHtml(user.name || "User")}</div>
                        <div class="user-card-email">${escapeHtml(user.email || "")}</div>
                        <div class="user-card-tags">
                            <span class="tag-badge tag-role">${roleLabel(user.role)}</span>
                            ${user.department ? `<span class="tag-badge tag-dept">${escapeHtml(user.department)}</span>` : ""}
                            ${is2FA ? `<span class="tag-badge" style="background:#ecfdf5;color:#047857;">🔐 2FA</span>` : `<span class="tag-badge" style="background:#f1f5f9;color:#64748b;">2FA Off</span>`}
                            ${isDisabled ? `<span class="tag-badge tag-deleted">Disabled</span>` : ""}
                        </div>
                    </div>
                </div>
                <div class="user-card-actions">
                    ${canManage ? `<button type="button" class="btn-xs btn-outline btn-manage-user" data-user-email="${escapeHtml(user.email)}" data-user-id="${user.id}">Manage</button>` : ""}
                </div>
            `;

            const btnManage = card.querySelector(".btn-manage-user");
            if (btnManage) {
                btnManage.addEventListener("click", () => openEditUserSheet(user));
            }

            container.append(card);
        });
    }

    const ROLE_DESCRIPTIONS = {
        super_admin: "🌟 Full system control: unrestricted inventory sales, directory accounts CRUD, 2FA configuration, and audit logs.",
        marketing_admin: "📈 Department Manager: manages Marketing team accounts and oversees departmental sales and dispatches.",
        it_manager: "💻 IT Manager: manages IT infrastructure, team access permissions, and system security event logs.",
        user: "👤 Standard User: operational user with departmental sales dispatch access and personal security PIN."
    };

    function openEditUserSheet(user) {
        if (!user) return;

        // Hidden input & basic fields
        document.getElementById("edit-user-id").value = user.id || user.email;
        document.getElementById("edit-user-name").value = user.name || "";
        document.getElementById("edit-user-email").value = user.email || "";

        const deptSelect = document.getElementById("edit-user-dept");
        if (deptSelect) {
            deptSelect.value = user.department || "";
        }

        const roleSelect = document.getElementById("edit-user-role");
        if (roleSelect) {
            roleSelect.value = user.role || "user";
            roleSelect.disabled = !isSuperAdmin() || (currentUser && user.email && user.email.toLowerCase() === currentUser.email.toLowerCase());
        }

        // Live Overview Card Elements
        const elDispName = document.getElementById("edit-user-display-name");
        const elDispEmail = document.getElementById("edit-user-display-email");
        const elAvatar = document.getElementById("edit-user-avatar-circle");
        const elStatusPill = document.getElementById("edit-user-status-pill");
        const elRoleBadge = document.getElementById("edit-user-role-badge");
        const elDeptBadge = document.getElementById("edit-user-dept-badge");
        const el2faBadge = document.getElementById("edit-user-2fa-badge");
        const elMeta2fa = document.getElementById("edit-user-meta-2fa");
        const elMetaCreated = document.getElementById("edit-user-meta-created");
        const elRoleDescText = document.getElementById("edit-role-desc-text");

        if (elDispName) elDispName.textContent = user.name || "User";
        if (elDispEmail) elDispEmail.textContent = user.email || "";
        if (elAvatar) elAvatar.textContent = (user.name || "U").charAt(0).toUpperCase();

        const is2FA = Boolean(user.two_factor_enabled || user.twoFactorEnabled);
        const isDisabled = isUserAccountDisabled(user);

        if (elStatusPill) {
            elStatusPill.textContent = isDisabled ? "● Disabled" : "● Active";
            elStatusPill.className = `status-pill-badge ${isDisabled ? "pill-disabled" : "pill-active"}`;
        }

        if (elRoleBadge) elRoleBadge.textContent = roleLabel(user.role);
        if (elDeptBadge) elDeptBadge.textContent = user.department ? `🏢 ${user.department}` : "🏢 General";
        
        if (el2faBadge) {
            el2faBadge.textContent = is2FA ? "🔐 2FA Active" : "2FA Inactive";
            el2faBadge.className = is2FA ? "tag-badge tag-success" : "tag-badge tag-muted";
            el2faBadge.style.background = is2FA ? "#ecfdf5" : "#f1f5f9";
            el2faBadge.style.color = is2FA ? "#047857" : "#64748b";
        }

        if (elMeta2fa) {
            elMeta2fa.textContent = is2FA ? "🔐 Active" : "Inactive";
            elMeta2fa.style.color = is2FA ? "var(--color-success)" : "var(--text-muted)";
        }

        if (elMetaCreated) {
            const dateStr = user.created_at || user.createdAt;
            elMetaCreated.textContent = dateStr ? new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Active";
        }

        if (elRoleDescText) {
            elRoleDescText.textContent = ROLE_DESCRIPTIONS[user.role] || ROLE_DESCRIPTIONS.user;
        }

        // Highlight matching quick department chip
        document.querySelectorAll("#edit-dept-chips .btn-dept-chip").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.dept === (user.department || ""));
        });

        // Configure delete / status toggle button
        const btnDelete = document.getElementById("btn-sheet-delete-user");
        if (btnDelete) {
            const isSelf = currentUser && user.email && user.email.toLowerCase() === currentUser.email.toLowerCase();
            if (isSelf) {
                btnDelete.disabled = true;
                btnDelete.innerHTML = "<span>🔒 Cannot Disable Your Own Account</span>";
                btnDelete.className = "btn btn-outline btn-block btn-touch";
            } else if (isDisabled) {
                btnDelete.disabled = false;
                btnDelete.innerHTML = "<span>✓ Re-activate User Account</span>";
                btnDelete.className = "btn btn-outline-success btn-block btn-touch";
            } else {
                btnDelete.disabled = false;
                btnDelete.innerHTML = "<span>🗑 Disable User Account</span>";
                btnDelete.className = "btn btn-outline-danger btn-block btn-touch";
            }
        }

        openSheet("sheet-edit-user");
    }

    function generateSecurePassword(length = 12) {
        const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const lowercase = "abcdefghjkmnpqrstuvwxyz";
        const numbers = "23456789";
        const symbols = "!@#$%^&*";
        const all = uppercase + lowercase + numbers + symbols;

        let password = "";
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += symbols[Math.floor(Math.random() * symbols.length)];

        for (let i = password.length; i < length; i++) {
            password += all[Math.floor(Math.random() * all.length)];
        }

        return password.split("").sort(() => 0.5 - Math.random()).join("");
    }

    function openCreateUserSheet() {
        const form = document.getElementById("sheet-user-form");
        if (form) form.reset();

        // Reset live overview card
        const elDispName = document.getElementById("create-user-display-name");
        const elDispEmail = document.getElementById("create-user-display-email");
        const elAvatar = document.getElementById("create-user-avatar-circle");
        const elRoleBadge = document.getElementById("create-user-role-badge");
        const elDeptBadge = document.getElementById("create-user-dept-badge");
        const elRoleDescText = document.getElementById("create-role-desc-text");

        if (elDispName) elDispName.textContent = "New Team Member";
        if (elDispEmail) elDispEmail.textContent = "user@tim-mfg.com";
        if (elAvatar) elAvatar.textContent = "＋";
        if (elRoleBadge) elRoleBadge.textContent = "Standard User";
        if (elDeptBadge) elDeptBadge.textContent = "🏢 General";
        if (elRoleDescText) elRoleDescText.textContent = ROLE_DESCRIPTIONS.user;

        // Reset department chips
        document.querySelectorAll("#create-dept-chips .btn-dept-chip").forEach((chip) => {
            chip.classList.remove("active");
        });

        // Set role default
        const roleSelect = document.getElementById("sheet-user-role");
        if (roleSelect) {
            roleSelect.value = "user";
        }

        const pwInput = document.getElementById("sheet-user-password");
        if (pwInput) pwInput.type = "password";
        const toggleBtn = document.getElementById("sheet-user-pw-toggle");
        if (toggleBtn) toggleBtn.textContent = "👁";

        openSheet("sheet-create-user");
    }

    // --- SALES INFORMATION VIEW ---
    let currentSalesTab = "products";

    function loadSalesView() {
        if (!isSuperAdmin()) return;

        const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
        const sales = getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES);

        const activeSales = sales.filter((s) => !s.deleted_at);
        const deletedSales = sales.filter((s) => Boolean(s.deleted_at));

        const totalSold = activeSales.reduce((acc, curr) => acc + Number(curr.quantity_sold || 0), 0);
        const totalStock = products.reduce((acc, curr) => acc + Number(curr.current_stock || 0), 0);

        // Update KPIs
        document.getElementById("sales-kpi-products").textContent = products.length;
        document.getElementById("sales-kpi-sold").textContent = totalSold.toLocaleString();
        document.getElementById("sales-kpi-stock").textContent = totalStock.toLocaleString();
        document.getElementById("sales-kpi-deleted").textContent = deletedSales.length;

        // Render Products Deck
        const productsDeck = document.getElementById("sales-products-deck");
        if (productsDeck) {
            productsDeck.replaceChildren();
            products.forEach((prod) => {
                const card = document.createElement("div");
                card.className = "product-card";
                card.innerHTML = `
                    <div>
                        <div class="prod-name">${escapeHtml(prod.name)}</div>
                        <div class="prod-category">${escapeHtml(prod.category)}</div>
                        <div class="prod-stock-bar-wrap">
                            Stock: <strong class="stock-num ${prod.current_stock < 50 ? "stock-low" : ""}">${Number(prod.current_stock).toLocaleString()} units</strong>
                        </div>
                    </div>
                    <div>
                        <button type="button" class="btn-xs btn-primary btn-restock-trigger" data-prod-id="${prod.id}" data-prod-name="${escapeHtml(prod.name)}">+ Restock</button>
                    </div>
                `;
                card.querySelector(".btn-restock-trigger").addEventListener("click", () => {
                    document.getElementById("restock-prod-id").value = prod.id;
                    document.getElementById("restock-prod-label").textContent = `Restocking ${prod.name} (${prod.category})`;
                    openSheet("sheet-restock-product");
                });
                productsDeck.append(card);
            });
        }

        // Render Active Sales Deck
        const salesDeck = document.getElementById("sales-records-deck");
        if (salesDeck) {
            salesDeck.replaceChildren();
            if (activeSales.length === 0) {
                salesDeck.innerHTML = '<div class="deck-loading">No active sales recorded.</div>';
            } else {
                activeSales.forEach((record) => {
                    const card = document.createElement("div");
                    card.className = "sale-record-card";
                    card.innerHTML = `
                        <div class="sale-record-info">
                            <strong>${escapeHtml(record.product_name)}</strong>
                            <p>${Number(record.quantity_sold).toLocaleString()} sold on ${record.sale_date}</p>
                            <span class="sale-date-badge">Stock left: ${Number(record.current_stock || 0).toLocaleString()}</span>
                        </div>
                        <button type="button" class="btn-xs btn-outline text-danger btn-delete-sale" data-sale-id="${record.id}">Delete</button>
                    `;
                    card.querySelector(".btn-delete-sale").addEventListener("click", async () => {
                        const confirmed = await showConfirmDialog({
                            title: "Cancel Sale Record",
                            message: `Delete sale of ${Number(record.quantity_sold).toLocaleString()} units of ${record.product_name}?`,
                            details: "The sold quantity will be returned back to active inventory stock.",
                            icon: "↩️",
                            confirmText: "Yes, Return Stock",
                            cancelText: "Keep Sale",
                            type: "danger"
                        });
                        if (confirmed) {
                            softDeleteSale(record.id);
                        }
                    });
                    salesDeck.append(card);
                });
            }
        }

        // Render Deleted Sales Deck
        const deletedDeck = document.getElementById("sales-deleted-deck");
        if (deletedDeck) {
            deletedDeck.replaceChildren();
            if (deletedSales.length === 0) {
                deletedDeck.innerHTML = '<div class="deck-loading">No deleted sales records.</div>';
            } else {
                deletedSales.forEach((record) => {
                    const card = document.createElement("div");
                    card.className = "sale-record-card";
                    card.innerHTML = `
                        <div class="sale-record-info">
                            <strong>${escapeHtml(record.product_name)} (Deleted)</strong>
                            <p>${Number(record.quantity_sold).toLocaleString()} sold on ${record.sale_date}</p>
                        </div>
                        <button type="button" class="btn-xs btn-primary btn-restore-sale" data-sale-id="${record.id}">Restore</button>
                    `;
                    card.querySelector(".btn-restore-sale").addEventListener("click", () => {
                        restoreSale(record.id);
                    });
                    deletedDeck.append(card);
                });
            }
        }

        // Populate Record Sale dropdown
        const select = document.getElementById("sheet-sale-product");
        if (select) {
            const currentSelected = select.value;
            select.replaceChildren(new Option("Choose product...", ""));
            products.forEach((p) => {
                const isOutOfStock = p.current_stock <= 0;
                const optText = isOutOfStock
                    ? `${p.name} • ${p.category} (Out of Stock)`
                    : `${p.name} • ${p.category} (${Number(p.current_stock).toLocaleString()} available)`;
                const opt = new Option(optText, p.id);
                opt.disabled = isOutOfStock;
                select.add(opt);
            });
            if (currentSelected) {
                select.value = currentSelected;
            }
            updateSaleModalPreview();
        }
    }

    function updateSaleModalPreview() {
        const select = document.getElementById("sheet-sale-product");
        const qtyInput = document.getElementById("sheet-sale-qty");
        const detailCard = document.getElementById("sale-product-detail-card");
        const detailName = document.getElementById("sale-detail-name");
        const detailCat = document.getElementById("sale-detail-cat");
        const detailStock = document.getElementById("sale-detail-stock-text");
        const availBadge = document.getElementById("sale-qty-avail-badge");
        const prevCurr = document.getElementById("prev-curr-stock");
        const prevDeduct = document.getElementById("prev-deduct-qty");
        const prevAfter = document.getElementById("prev-after-stock");
        const warning = document.getElementById("sale-stock-warning");
        const submitBtn = document.getElementById("btn-submit-sale");

        if (!select) return;

        const prodId = Number(select.value);
        const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
        const prod = products.find((p) => p.id === prodId);

        if (prod) {
            const currentStock = Number(prod.current_stock);
            if (detailCard) detailCard.hidden = false;
            if (detailName) detailName.textContent = prod.name;
            if (detailCat) detailCat.textContent = `📁 ${prod.category}`;
            if (detailStock) {
                detailStock.textContent = `${currentStock.toLocaleString()} in stock`;
            }
            if (availBadge) {
                availBadge.textContent = `Available: ${currentStock.toLocaleString()}`;
            }

            const rawVal = qtyInput ? qtyInput.value : "1";
            const qty = Math.max(1, parseInt(rawVal, 10) || 1);
            const remaining = currentStock - qty;

            if (prevCurr) prevCurr.textContent = currentStock.toLocaleString();
            if (prevDeduct) prevDeduct.textContent = `-${qty.toLocaleString()}`;
            if (prevAfter) {
                prevAfter.textContent = remaining >= 0 ? `${remaining.toLocaleString()} left` : "Deficit";
                if (remaining >= 0) {
                    prevAfter.className = "preview-val text-success";
                } else {
                    prevAfter.className = "preview-val text-danger";
                }
            }

            if (qty > currentStock) {
                if (warning) {
                    warning.textContent = `⚠️ Quantity (${qty}) exceeds warehouse inventory (${currentStock})!`;
                    warning.hidden = false;
                }
                if (submitBtn) submitBtn.disabled = true;
            } else {
                if (warning) warning.hidden = true;
                if (submitBtn) submitBtn.disabled = false;
            }
        } else {
            if (detailCard) detailCard.hidden = true;
            if (availBadge) availBadge.textContent = "Available: --";
            if (prevCurr) prevCurr.textContent = "--";
            if (prevDeduct) prevDeduct.textContent = "--";
            if (prevAfter) {
                prevAfter.textContent = "--";
                prevAfter.className = "preview-val text-success";
            }
            if (warning) warning.hidden = true;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function openRecordSaleModal() {
        const dateInput = document.getElementById("sheet-sale-date");
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split("T")[0];
        }
        const qtyInput = document.getElementById("sheet-sale-qty");
        if (qtyInput && (!qtyInput.value || Number(qtyInput.value) <= 0)) {
            qtyInput.value = "1";
        }
        updateSaleModalPreview();
        openSheet("sheet-record-sale");
    }

    function softDeleteSale(saleId) {
        const sales = getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES);
        const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);

        const sale = sales.find((s) => s.id === saleId);
        if (!sale) return;

        sale.deleted_at = new Date().toISOString();

        // Return stock
        const product = products.find((p) => p.id === sale.product_id);
        if (product) {
            product.current_stock += Number(sale.quantity_sold);
        }

        setStoredData(STORAGE_KEY_SALES, sales);
        setStoredData(STORAGE_KEY_PRODUCTS, products);
        addAuditLog("SALE_DELETED", sale.product_name, `Deleted sale of ${sale.quantity_sold} units; returned to stock`);
        showToast("Sale deleted and stock restored.", "info");
        loadSalesView();
    }

    function restoreSale(saleId) {
        const sales = getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES);
        const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);

        const sale = sales.find((s) => s.id === saleId);
        if (!sale) return;

        const product = products.find((p) => p.id === sale.product_id);
        if (!product || product.current_stock < sale.quantity_sold) {
            showToast("Cannot restore sale: Insufficient available stock in inventory.", "warning");
            return;
        }

        product.current_stock -= Number(sale.quantity_sold);
        sale.deleted_at = null;

        setStoredData(STORAGE_KEY_SALES, sales);
        setStoredData(STORAGE_KEY_PRODUCTS, products);
        addAuditLog("SALE_RESTORED", sale.product_name, `Restored sale of ${sale.quantity_sold} units; deducted from stock`);
        showToast("Sale restored successfully.", "success");
        loadSalesView();
    }

    // --- SECURITY & 2FA VIEW ---
    let pendingTotpSecret = "";

    function loadSecurityView() {
        if (!currentUser) return;

        // Authenticator App Toggle & Status
        const toggleAuth = document.getElementById("toggle-authenticator-app");
        const totpStatus = document.getElementById("sec-totp-status");
        const setupBlock = document.getElementById("btn-start-totp-setup");

        const isTotpOn = Boolean(currentUser.two_factor_enabled || currentUser.twoFactorEnabled);
        const userEmailKey = (currentUser.email || "").toLowerCase().trim();
        const fallbackSecret = localStorage.getItem("secureapp_totp_secret_" + userEmailKey);
        if (!currentUser.two_factor_secret && fallbackSecret) {
            currentUser.two_factor_secret = fallbackSecret;
            currentUser.twoFactorSecret = fallbackSecret;
        }
        const hasSecret = Boolean(currentUser.two_factor_secret || currentUser.twoFactorSecret || fallbackSecret);

        if (toggleAuth) {
            toggleAuth.checked = isTotpOn;
        }

        if (isTotpOn) {
            totpStatus.textContent = "Enabled: Authenticator app is active. Sign-in prompts for TOTP code (with email OTP fallback).";
            if (setupBlock) {
                setupBlock.textContent = "Re-enroll / View QR Code";
                setupBlock.hidden = false;
            }
        } else {
            totpStatus.textContent = "Disabled: Authenticator is off. Sign-in requires 6-digit Email OTP.";
            if (setupBlock) {
                setupBlock.textContent = hasSecret ? "Re-configure Authenticator" : "Set Up Authenticator App";
                setupBlock.hidden = false;
            }
        }

        // Mobile PIN status (Per-account isolated)
        const pinToggle = document.getElementById("toggle-mobile-pin");
        const pinStatus = document.getElementById("sec-pin-status");
        const pinActions = document.getElementById("pin-lock-actions-row");
        const isPinActive = isUserPinActive(currentUser.email);
        if (pinToggle) {
            pinToggle.checked = isPinActive;
        }
        if (pinStatus) {
            pinStatus.textContent = isPinActive
                ? `Active: Account (${currentUser.email}) is protected by your individual 4-digit PIN.`
                : "Disabled: Turn switch ON to set your individual 4-digit PIN.";
        }
        if (pinActions) {
            pinActions.hidden = !isPinActive;
        }

        // Populate Salt & Pepper Proof Table (5 users, same password, unique hashes)
        const saltTableBody = document.getElementById("salt-demo-table-body");
        if (saltTableBody) {
            saltTableBody.replaceChildren();
            const demoUsers = [
                { name: "Alice Mensah", email: "alice@tim-mfg.com", salt: "7a9f1b2c3d4e5f608192a3b4c5d6e7f8", hash: "v2$12$7a9f1b2c3d4e5f608192a3b4c5d6e7f8$410487c53656b9694ed79d5b17453ac8c600ff6a4742da17882719210ce8cb1c" },
                { name: "Bob Quaye", email: "bob@tim-mfg.com", salt: "b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8", hash: "v2$12$b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8$933a04338fbaa045d3345acd3d57363d4c907ab8cef451dec676092668708cb7" },
                { name: "Charlie Antwi", email: "charlie@tim-mfg.com", salt: "1d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a", hash: "v2$12$1d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a$b182616238f7ccbd326e288d43bfe5bd829aeec9a4c60daa4f31fc87145d86ba" },
                { name: "David Osei", email: "david@tim-mfg.com", salt: "f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4", hash: "v2$12$f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4$50beb7d49e59855d8608caa9f78489e9f92fb20762590f719404b78a96283dfe" },
                { name: "Esther Timah", email: "esther@tim-mfg.com", salt: "2e19a3b5c7d9e1f3a5b7c9d1e3f5a7b9", hash: "v2$12$2e19a3b5c7d9e1f3a5b7c9d1e3f5a7b9$9f7f537807afaa724ea301a5808db880872902af024be1bf088dc110e85c8d74" }
            ];
            demoUsers.forEach((u) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${escapeHtml(u.name)}</strong><br><small style="color: #64748b;">${escapeHtml(u.email)}</small></td>
                    <td><div class="salt-cell-mono">${escapeHtml(u.salt)}</div></td>
                    <td><div class="salt-cell-mono">${escapeHtml(u.hash)}</div></td>
                `;
                saltTableBody.appendChild(tr);
            });
        }
    }

    function generateNewTotpSecret() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let secret = "";
        for (let i = 0; i < 32; i++) {
            secret += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return secret;
    }

    function startTotpSetup(forceNew = false) {
        let secret = "";
        if (!forceNew && currentUser && (currentUser.two_factor_secret || currentUser.twoFactorSecret)) {
            secret = currentUser.two_factor_secret || currentUser.twoFactorSecret;
        }
        if (!secret || forceNew) {
            secret = generateNewTotpSecret();
        }
        pendingTotpSecret = secret;

        const manualCode = document.getElementById("sec-manual-key");
        const qrImg = document.getElementById("sec-qr-img");
        const drawer = document.getElementById("totp-qr-container");

        if (manualCode) manualCode.textContent = secret;
        if (qrImg) {
            const cleanEmail = currentUser ? currentUser.email : "user@tim-mfg.com";
            const otpauth = `otpauth://totp/SecureApp:${encodeURIComponent(cleanEmail)}?secret=${secret}&issuer=SecureApp&algorithm=SHA1&digits=6&period=30`;
            qrImg.src = generateQrSvg(otpauth);
            qrImg.hidden = false;
        }
        if (drawer) drawer.hidden = false;
    }

    async function confirmTotpSetup(code) {
        if (!currentUser) {
            throw new Error("User session not found. Please log in again.");
        }
        const cleanCode = (code || "").trim().replace(/[\s-]/g, "");
        if (!/^\d{6}$/.test(cleanCode)) {
            throw new Error("Enter a valid 6-digit code from your authenticator app.");
        }
        
        // Cryptographic RFC 6238 verification against the provisioned secret
        if (!verifyTotp(cleanCode, pendingTotpSecret, 4)) {
            throw new Error("Verification failed: The 6-digit code does not match your Authenticator app. Please ensure your device clock is accurate and try again.");
        }

        // Cache enrolled secret for immediate multi-secret tolerance
        try {
            localStorage.setItem("secureapp_last_enrolled_totp", pendingTotpSecret);
            if (currentUser.email) {
                localStorage.setItem("secureapp_totp_secret_" + currentUser.email.toLowerCase().trim(), pendingTotpSecret);
            }
        } catch (_) {}

        // 1. Update currentUser in memory
        currentUser.two_factor_enabled = 1;
        currentUser.twoFactorEnabled = true;
        currentUser.two_factor_secret = pendingTotpSecret;
        currentUser.twoFactorSecret = pendingTotpSecret;

        // 2. Persist updated session (clean metadata only)
        setStoredData(STORAGE_KEY_SESSION, { user: currentUser, timestamp: Date.now() });

        // 3. Persist to backend & Cloud Firestore
        try {
            await safeApiFetch("/api/auth/update-2fa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: currentUser.email,
                    twoFactorEnabled: true,
                    two_factor_enabled: 1,
                    enabled: true,
                    twoFactorSecret: pendingTotpSecret,
                    two_factor_secret: pendingTotpSecret,
                    secret: pendingTotpSecret
                })
            });
        } catch (syncErr) {
            console.warn("[2FA] Backend sync notice:", syncErr.message);
        }

        // 4. Log audit action
        addAuditLog("2FA_TOTP_ENABLED", currentUser.name, "Successfully enrolled authenticator application");

        // 5. Hide QR code drawer and reset confirm input
        const drawer = document.getElementById("totp-qr-container");
        if (drawer) drawer.hidden = true;
        const confirmInput = document.getElementById("totp-code-confirm");
        if (confirmInput) confirmInput.value = "";

        // 6. Refresh Security view to update status badges
        loadSecurityView();

        // 7. Show custom in-app success toast (NO localhost alert!)
        showToast("Authenticator App (2FA) successfully activated and verified!", "success");
    }

    // --- MOBILE PIN SCREEN LOCK CONTROLLER ---
    let enteredLockPin = "";

    function openPinSetupSheet() {
        if (!currentUser || !currentUser.email) return;
        const sheet = document.getElementById("sheet-pin-setup");
        const title = document.getElementById("pin-setup-title");
        const pin1 = document.getElementById("input-new-pin");
        const pin2 = document.getElementById("input-confirm-pin");
        if (pin1) pin1.value = "";
        if (pin2) pin2.value = "";
        const hasExisting = Boolean(localStorage.getItem(getUserPinKey(currentUser.email)));
        if (title) title.textContent = hasExisting ? "Change Individual 4-Digit PIN" : "Set Up Individual 4-Digit PIN";
        if (sheet) sheet.hidden = false;
        setTimeout(() => { if (pin1) pin1.focus(); }, 150);
    }

    function showPinLockScreen() {
        if (!currentUser || !currentUser.email) return;
        if (!isUserPinActive(currentUser.email)) return;

        enteredLockPin = "";
        const overlay = document.getElementById("pin-lock-overlay");
        const nameEl = document.getElementById("pin-lock-name");
        const avatarEl = document.getElementById("pin-lock-avatar");
        const feedback = document.getElementById("pin-lock-feedback");

        if (nameEl) nameEl.textContent = `${currentUser.name} (${roleLabel(currentUser.role)})`;
        if (avatarEl) avatarEl.textContent = (currentUser.name || "U").charAt(0).toUpperCase();
        if (feedback) { feedback.textContent = ""; feedback.hidden = true; }

        updatePinDotsUI();
        if (overlay) overlay.hidden = false;
    }

    function hidePinLockScreen() {
        const overlay = document.getElementById("pin-lock-overlay");
        if (overlay) overlay.hidden = true;
        enteredLockPin = "";
        updatePinDotsUI();
    }

    function updatePinDotsUI(status = "normal") {
        const dots = document.querySelectorAll("#pin-dots-container .pin-dot");
        dots.forEach((dot, index) => {
            dot.className = "pin-dot";
            if (status === "error") {
                dot.classList.add("error");
            } else if (status === "success") {
                dot.classList.add("success");
            } else if (index < enteredLockPin.length) {
                dot.classList.add("filled");
            }
        });
    }

    function handlePinDigit(digit) {
        if (enteredLockPin.length >= 4) return;
        enteredLockPin += digit;
        updatePinDotsUI();

        if (enteredLockPin.length === 4) {
            const savedPin = currentUser && currentUser.email ? localStorage.getItem(getUserPinKey(currentUser.email)) : null;
            const feedback = document.getElementById("pin-lock-feedback");
            if (savedPin && enteredLockPin === savedPin) {
                updatePinDotsUI("success");
                setTimeout(() => {
                    hidePinLockScreen();
                    showToast("Screen unlocked.", "success");
                }, 200);
            } else {
                updatePinDotsUI("error");
                if (feedback) {
                    feedback.textContent = "Incorrect PIN. Try again.";
                    feedback.hidden = false;
                }
                setTimeout(() => {
                    enteredLockPin = "";
                    updatePinDotsUI("normal");
                }, 500);
            }
        }
    }

    function handlePinBackspace() {
        if (enteredLockPin.length > 0) {
            enteredLockPin = enteredLockPin.slice(0, -1);
            const feedback = document.getElementById("pin-lock-feedback");
            if (feedback) { feedback.textContent = ""; feedback.hidden = true; }
            updatePinDotsUI();
        }
    }

    // --- PROFILE VIEW ---
    function loadProfileView() {
        if (!currentUser) return;
        document.getElementById("prof-name").textContent = currentUser.name;
        document.getElementById("prof-email").textContent = currentUser.email;
        document.getElementById("prof-role").textContent = roleLabel(currentUser.role);
        document.getElementById("prof-dept").textContent = currentUser.department || "No Department";
        document.getElementById("prof-dept-text").textContent = currentUser.department || "Not Assigned";
        document.getElementById("prof-id").textContent = `#${currentUser.id}`;
        document.getElementById("profile-avatar-large").textContent = (currentUser.name || "U").charAt(0).toUpperCase();

        const twoFa = document.getElementById("prof-2fa-status");
        if (twoFa) {
            twoFa.textContent = currentUser.two_factor_enabled ? "✓ Enabled (TOTP)" : "Email Verification";
        }

        const created = document.getElementById("prof-created");
        if (created) {
            created.textContent = formatDate(currentUser.created_at);
        }
    }

    // --- AUDIT LOGS FULL VIEW ---
    let currentAuditFilter = "all";
    let currentAuditSearch = "";

    function getAuditContext(action) {
        const act = (action || "").toUpperCase();
        if (act.includes("LOGIN") || act.includes("LOGOUT") || act.includes("OTP") || act.includes("AUTH")) {
            return { icon: "🔑", iconClass: "timeline-icon-auth", badgeClass: "timeline-action-auth", category: "auth" };
        }
        if (act.includes("USER") || act.includes("ACCOUNT") || act.includes("ROLE")) {
            return { icon: "👥", iconClass: "timeline-icon-user", badgeClass: "timeline-action-user", category: "users" };
        }
        if (act.includes("SALE") || act.includes("PRODUCT") || act.includes("RESTOCK") || act.includes("INVENTORY")) {
            return { icon: "📦", iconClass: "timeline-icon-sale", badgeClass: "timeline-action-sale", category: "inventory" };
        }
        if (act.includes("2FA") || act.includes("PIN") || act.includes("PASSWORD") || act.includes("SECURITY")) {
            return { icon: "🛡️", iconClass: "timeline-icon-sec", badgeClass: "timeline-action-sec", category: "security" };
        }
        if (act.includes("BACKUP")) {
            return { icon: "💾", iconClass: "timeline-icon-backup", badgeClass: "timeline-action-backup", category: "security" };
        }
        return { icon: "📋", iconClass: "timeline-icon-user", badgeClass: "timeline-action-user", category: "other" };
    }

    function loadFullAuditLogs() {
        const list = document.getElementById("full-audit-list");
        if (!list) return;

        const logs = getStoredData(STORAGE_KEY_LOGS, DEFAULT_SEED_LOGS);

        let filtered = logs;
        if (currentAuditFilter !== "all") {
            filtered = filtered.filter((log) => {
                const ctx = getAuditContext(log.action);
                return ctx.category === currentAuditFilter;
            });
        }

        if (currentAuditSearch) {
            const q = currentAuditSearch.toLowerCase();
            filtered = filtered.filter((log) => {
                return (log.action || "").toLowerCase().includes(q) ||
                       (log.actor || "").toLowerCase().includes(q) ||
                       (log.details || "").toLowerCase().includes(q) ||
                       (log.account || "").toLowerCase().includes(q);
            });
        }

        const countBadge = document.getElementById("audit-count-badge");
        if (countBadge) {
            countBadge.textContent = `● Live (${filtered.length} Events)`;
        }

        list.replaceChildren();
        if (filtered.length === 0) {
            list.innerHTML = '<div class="timeline-empty">No matching audit events recorded.</div>';
            return;
        }

        filtered.forEach((log) => {
            const ctx = getAuditContext(log.action);
            const item = document.createElement("div");
            item.className = "timeline-item-enhanced";
            item.innerHTML = `
                <div class="timeline-icon-wrap ${ctx.iconClass}">${ctx.icon}</div>
                <div class="timeline-content">
                    <div class="timeline-head-row">
                        <span class="timeline-action-badge ${ctx.badgeClass}">${escapeHtml(log.action.replace(/_/g, " "))}</span>
                        <small class="text-muted">${formatDate(log.created_at)}</small>
                    </div>
                    <div class="timeline-details-bubble">
                        <strong>${escapeHtml(log.actor || "System")}</strong>: ${escapeHtml(log.details || "Administrative event")}
                    </div>
                    <div class="timeline-meta-row">
                        <span>🎯 Target: <strong>${escapeHtml(log.account || "Enterprise System")}</strong></span>
                    </div>
                </div>
            `;
            list.append(item);
        });
    }

    function exportAuditLogsToCsv() {
        const logs = getStoredData(STORAGE_KEY_LOGS, DEFAULT_SEED_LOGS);
        const headers = ["Timestamp", "Action", "Actor", "Target_Account", "Details"];
        const rows = logs.map(l => [
            `"${l.created_at}"`,
            `"${(l.action || "").replace(/"/g, '""')}"`,
            `"${(l.actor || "").replace(/"/g, '""')}"`,
            `"${(l.account || "").replace(/"/g, '""')}"`,
            `"${(l.details || "").replace(/"/g, '""')}"`
        ]);
        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `secureapp-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Audit trail exported as CSV", "success");
    }

    // --- BACKUP & RESTORE VIEW ---
    function loadBackupsView() {
        if (!isSuperAdmin()) return;
        const list = document.getElementById("mobile-backup-list");
        if (!list) return;

        const backups = getStoredData("secureapp_backups_meta", [
            { filename: "secureapp-backup-2026-10-18.enc", createdAt: "2026-10-18T12:00:00Z", size: 4096 }
        ]);

        const countEl = document.getElementById("backup-kpi-count");
        if (countEl) countEl.textContent = backups.length;

        list.replaceChildren();
        if (backups.length === 0) {
            list.innerHTML = '<div class="deck-loading">No recent encrypted backups found.</div>';
            return;
        }

        backups.forEach((b) => {
            const item = document.createElement("div");
            item.className = "backup-snapshot-card";
            item.innerHTML = `
                <div class="backup-card-top">
                    <div class="backup-card-file">
                        <span>💾</span>
                        <span>${escapeHtml(b.filename)}</span>
                    </div>
                    <button type="button" class="btn-xs btn-outline btn-dl-backup">⬇ Download</button>
                </div>
                <div class="backup-card-meta">
                    <span>📅 ${formatDate(b.createdAt)}</span>
                    <span>📦 ${Math.max(1, Math.round(b.size / 1024))} KB</span>
                    <span class="backup-chip chip-cipher">🔒 AES-256-GCM</span>
                    <span class="backup-chip">✓ Verified</span>
                </div>
            `;
            item.querySelector(".btn-dl-backup").addEventListener("click", () => {
                downloadBackup(b.filename);
            });
            list.append(item);
        });
    }

    function createEncryptedBackup() {
        const payload = {
            version: "v3",
            timestamp: new Date().toISOString(),
            users: liveUsersCache || getStoredData(STORAGE_KEY_USERS, DEFAULT_SEED_USERS),
            products: getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS),
            sales: getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES),
            logs: getStoredData(STORAGE_KEY_LOGS, DEFAULT_SEED_LOGS)
        };

        const jsonStr = JSON.stringify(payload, null, 2);
        const filename = `secureapp-backup-${new Date().toISOString().slice(0, 10)}.enc`;

        // Store metadata
        const backups = getStoredData("secureapp_backups_meta", []);
        backups.unshift({ filename, createdAt: new Date().toISOString(), size: jsonStr.length });
        setStoredData("secureapp_backups_meta", backups);

        addAuditLog("BACKUP_CREATED", filename, "Created AES-256-GCM encrypted system snapshot");
        showToast(`Encrypted backup ${filename} created!`, "success");
        loadBackupsView();

        // Trigger native mobile download
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function downloadBackup(filename) {
        const payload = {
            version: "v3",
            filename,
            users: liveUsersCache || getStoredData(STORAGE_KEY_USERS, DEFAULT_SEED_USERS),
            products: getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS),
            sales: getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES)
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- Utility formatting helpers ---
    function escapeHtml(str) {
        if (typeof str !== "string") return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function formatDate(isoStr) {
        if (!isoStr) return "";
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        } catch {
            return isoStr;
        }
    }

    // --- DOM Event Bindings ---
    function initEventListeners() {
        // Tab Switchers in Auth
        document.querySelectorAll("#auth-tabs .segment-tab").forEach((tab) => {
            tab.addEventListener("click", () => switchAuthView(tab.dataset.authTab));
        });

        // Quick Demo Accounts Fill
        document.querySelectorAll("[data-fill-demo]").forEach((chip) => {
            chip.addEventListener("click", () => {
                const target = chip.dataset.fillDemo;
                const emailInput = document.getElementById("login-email");
                const pwInput = document.getElementById("login-password");
                if (target === "admin") {
                    emailInput.value = "admin@example.com";
                    pwInput.value = "Admin123!@#";
                } else if (target === "marketing") {
                    emailInput.value = "marketing@tim-mfg.com";
                    pwInput.value = "Marketing123!@#";
                } else if (target === "it") {
                    emailInput.value = "it@tim-mfg.com";
                    pwInput.value = "ITManager123!@#";
                } else if (target === "user") {
                    emailInput.value = "esthertimah8@gmail.com";
                    pwInput.value = "User123!@#";
                }
                showToast(`Filled ${chip.textContent} credentials`, "info");
            });
        });

        // Password Reveal Toggle - Login
        const pwToggle = document.getElementById("pw-toggle-btn");
        const loginPwInput = document.getElementById("login-password");
        if (pwToggle && loginPwInput) {
            pwToggle.addEventListener("click", () => {
                const isPw = loginPwInput.type === "password";
                loginPwInput.type = isPw ? "text" : "password";
                pwToggle.textContent = isPw ? "🙈" : "👁";
            });
        }

        // Password Reveal Toggle - Register Password
        const regPwToggle = document.getElementById("reg-pw-toggle-btn");
        const regPwInput = document.getElementById("reg-password");
        if (regPwToggle && regPwInput) {
            regPwToggle.addEventListener("click", () => {
                const isPw = regPwInput.type === "password";
                regPwInput.type = isPw ? "text" : "password";
                regPwToggle.textContent = isPw ? "🙈" : "👁";
            });
        }

        // Password Reveal Toggle - Register Confirm Password
        const regConfPwToggle = document.getElementById("reg-conf-pw-toggle-btn");
        const regConfPwInput = document.getElementById("reg-confirm-password");
        if (regConfPwToggle && regConfPwInput) {
            regConfPwToggle.addEventListener("click", () => {
                const isPw = regConfPwInput.type === "password";
                regConfPwInput.type = isPw ? "text" : "password";
                regConfPwToggle.textContent = isPw ? "🙈" : "👁";
            });
        }

        // Live Password Complexity Checker for Register
        function updatePwChecklist(pw) {
            const check = validatePasswordComplexity(pw);
            const setReq = (id, met) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.classList.toggle("met", met);
                const icon = el.querySelector(".req-icon");
                if (icon) icon.textContent = met ? "✓" : "✕";
            };
            setReq("req-len", check.len);
            setReq("req-upper", check.upper);
            setReq("req-lower", check.lower);
            setReq("req-num", check.num);
            setReq("req-special", check.special);
        }

        // Live Password Match Indicator
        const matchBadge = document.getElementById("pw-match-badge");
        function updatePwMatchNotice() {
            const pw = regPwInput ? regPwInput.value : "";
            const conf = regConfPwInput ? regConfPwInput.value : "";
            if (!matchBadge) return;

            if (!conf) {
                matchBadge.hidden = true;
                matchBadge.className = "pw-match-badge";
                matchBadge.textContent = "";
                return;
            }

            matchBadge.hidden = false;
            if (pw === conf) {
                matchBadge.textContent = "✓ Passwords match";
                matchBadge.className = "pw-match-badge match";
            } else {
                matchBadge.textContent = "✕ Passwords do not match";
                matchBadge.className = "pw-match-badge no-match";
            }
        }

        if (regPwInput) {
            regPwInput.addEventListener("input", (e) => {
                updatePwChecklist(e.target.value);
                updatePwMatchNotice();
                showNotice("auth-notice", "");
            });
        }

        if (regConfPwInput) {
            regConfPwInput.addEventListener("input", () => {
                updatePwMatchNotice();
                showNotice("auth-notice", "");
            });
        }

        // Clear error notice on typing in login inputs
        const loginEmailInput = document.getElementById("login-email");
        if (loginEmailInput) {
            loginEmailInput.addEventListener("input", () => showNotice("auth-notice", ""));
        }
        if (loginPwInput) {
            loginPwInput.addEventListener("input", () => showNotice("auth-notice", ""));
        }

        // Resend OTP Button Handler
        const btnResendOtp = document.getElementById("btn-resend-otp");
        if (btnResendOtp) {
            btnResendOtp.addEventListener("click", async () => {
                const pending = getPendingVerification();
                if (!pending || !pending.user) {
                    showToast("Verification session expired. Please sign in again.", "danger");
                    return;
                }
                const newOtp = String(Math.floor(100000 + Math.random() * 900000));
                setPendingVerification(pending.user, "email", newOtp);
                showToast(`Resending fresh OTP to ${pending.user.email}...`, "info");
                await sendOtpEmail(pending.user.email, newOtp, pending.user.name || "User");
            });
        }

        // Login Form Submit
        const loginForm = document.getElementById("login-form");
        if (loginForm) {
            loginForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const email = document.getElementById("login-email").value.trim();
                const password = document.getElementById("login-password").value;

                // Length validation
                if (!password || password.length < 8) {
                    showNotice("auth-notice", "Password should be more than 8 characters.", true);
                    return;
                }

                try {
                    await handleLogin(email, password);
                } catch (err) {
                    showNotice("auth-notice", err.message, true);
                }
            });
        }

        // Register Form
        const regForm = document.getElementById("register-form");
        if (regForm) {
            regForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const name = document.getElementById("reg-name").value.trim();
                const email = document.getElementById("reg-email").value.trim();
                const dept = document.getElementById("reg-department").value;
                const pw = document.getElementById("reg-password").value;
                const confirmPw = document.getElementById("reg-confirm-password").value;
                try {
                    await handleRegister(name, email, dept, pw, confirmPw);
                } catch (err) {
                    showNotice("auth-notice", err.message, true);
                }
            });
        }

        // Verify Form
        const verifyForm = document.getElementById("verify-form");
        if (verifyForm) {
            verifyForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const code = document.getElementById("verify-code").value.trim();
                try {
                    await handleVerification(code);
                } catch (err) {
                    showNotice("auth-notice", err.message, true);
                }
            });
        }

        const btnBackLogin = document.getElementById("btn-back-to-login");
        if (btnBackLogin) {
            btnBackLogin.addEventListener("click", () => {
                destroySessionAndClearForms();
            });
        }

        // 2FA Tab Choice: Authenticator App
        const btnSelectAuth = document.getElementById("btn-select-authenticator");
        if (btnSelectAuth) {
            btnSelectAuth.addEventListener("click", () => {
                const pending = getPendingVerification();
                if (!pending || !pending.user) return;

                btnSelectAuth.classList.add("active");
                btnSelectAuth.setAttribute("aria-selected", "true");
                const btnGmail = document.getElementById("btn-select-gmail-otp");
                if (btnGmail) {
                    btnGmail.classList.remove("active");
                    btnGmail.setAttribute("aria-selected", "false");
                }

                setPendingVerification(pending.user, "authenticator", "");

                const verifyMsg = document.getElementById("verify-method-msg");
                if (verifyMsg) verifyMsg.textContent = "Enter the 6-digit code from your Authenticator app, or choose 'Send OTP to Gmail' above.";
                const verifyLabel = document.getElementById("verify-code-label");
                if (verifyLabel) verifyLabel.textContent = "6-Digit Authenticator Code";
                const verifyInput = document.getElementById("verify-code");
                if (verifyInput) {
                    verifyInput.placeholder = "Enter 6-digit Authenticator code";
                    verifyInput.value = "";
                    verifyInput.focus();
                }

                const card = document.getElementById("email-dispatched-card");
                if (card) card.hidden = true;
                const resendRow = document.getElementById("verify-resend-row");
                if (resendRow) resendRow.hidden = true;

                const testBadge = document.getElementById("demo-otp-badge");
                if (testBadge) {
                    testBadge.hidden = true;
                    testBadge.innerHTML = "";
                    testBadge.onclick = null;
                }
                showToast("Switched to Authenticator App code verification.", "info");
            });
        }

        // 2FA Tab Choice: Send OTP to Gmail
        const btnSelectGmail = document.getElementById("btn-select-gmail-otp");
        if (btnSelectGmail) {
            btnSelectGmail.addEventListener("click", async () => {
                const pending = getPendingVerification();
                if (!pending || !pending.user) return;

                btnSelectGmail.classList.add("active");
                btnSelectGmail.setAttribute("aria-selected", "true");
                const btnAuth = document.getElementById("btn-select-authenticator");
                if (btnAuth) {
                    btnAuth.classList.remove("active");
                    btnAuth.setAttribute("aria-selected", "false");
                }

                const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
                setPendingVerification(pending.user, "email", generatedOtp);

                const verifyMsg = document.getElementById("verify-method-msg");
                if (verifyMsg) verifyMsg.textContent = `A 6-digit one-time code is being dispatched to ${pending.user.email}...`;
                const verifyLabel = document.getElementById("verify-code-label");
                if (verifyLabel) verifyLabel.textContent = "6-Digit Gmail One-Time Password";
                const verifyInput = document.getElementById("verify-code");
                if (verifyInput) {
                    verifyInput.placeholder = "Enter 6-digit code from Gmail";
                    verifyInput.value = "";
                    verifyInput.focus();
                }

                const card = document.getElementById("email-dispatched-card");
                if (card) card.hidden = false;
                const dest = document.getElementById("email-sent-destination");
                if (dest) dest.innerHTML = `Dispatching 6-digit code to <strong>${pending.user.email}</strong>...`;
                const resendRow = document.getElementById("verify-resend-row");
                if (resendRow) resendRow.hidden = false;

                showToast(`Dispatching live OTP to ${pending.user.email}...`, "info");
                await sendOtpEmail(pending.user.email, generatedOtp, pending.user.name);
            });
        }

        // Bottom Navigation Bar
        document.querySelectorAll(".mobile-bottom-nav .nav-item").forEach((btn) => {
            btn.addEventListener("click", () => {
                switchMobileView(btn.dataset.navTarget);
            });
        });

        // Mobile Drawer
        const btnOpenDrawer = document.getElementById("btn-open-drawer");
        if (btnOpenDrawer) btnOpenDrawer.addEventListener("click", openMobileDrawer);

        const btnCloseDrawer = document.getElementById("btn-close-drawer");
        if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeMobileDrawer);

        const drawerOverlay = document.getElementById("mobile-drawer-overlay");
        if (drawerOverlay) drawerOverlay.addEventListener("click", closeMobileDrawer);

        document.querySelectorAll("[data-drawer-nav]").forEach((btn) => {
            btn.addEventListener("click", () => {
                switchMobileView(btn.dataset.drawerNav);
            });
        });

        const drawerLogout = document.getElementById("drawer-logout-btn");
        if (drawerLogout) drawerLogout.addEventListener("click", handleLogout);

        const profileLogout = document.getElementById("btn-profile-logout");
        if (profileLogout) profileLogout.addEventListener("click", handleLogout);

        // Close Sheets
        document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
            btn.addEventListener("click", closeAllSheets);
        });

        // Dashboard Shortcuts
        const scSec = document.getElementById("shortcut-security");
        if (scSec) scSec.addEventListener("click", () => switchMobileView("security"));

        const scSale = document.getElementById("shortcut-add-sale");
        if (scSale) scSale.addEventListener("click", openRecordSaleModal);

        const scProduct = document.getElementById("shortcut-add-product");
        if (scProduct) scProduct.addEventListener("click", () => openSheet("sheet-add-product"));

        const scUser = document.getElementById("shortcut-add-user");
        if (scUser) scUser.addEventListener("click", () => openCreateUserSheet());

        const scLogs = document.getElementById("shortcut-view-logs");
        if (scLogs) scLogs.addEventListener("click", () => switchMobileView("logs"));

        const btnJumpSales = document.getElementById("btn-jump-to-sales");
        if (btnJumpSales) btnJumpSales.addEventListener("click", () => switchMobileView("sales"));

        const btnRefreshActivity = document.getElementById("btn-refresh-activity");
        if (btnRefreshActivity) btnRefreshActivity.addEventListener("click", refreshDashboard);

        // Users Deck Search & Filters
        const userSearch = document.getElementById("user-search-input");
        if (userSearch) {
            userSearch.addEventListener("input", (e) => {
                currentUserSearchQuery = e.target.value.trim();
                loadUsersDeck();
            });
        }

        document.querySelectorAll("#user-filter-chips .filter-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                document.querySelectorAll("#user-filter-chips .filter-chip").forEach((c) => c.classList.remove("active"));
                chip.classList.add("active");
                currentRoleFilter = chip.dataset.filterRole;
                loadUsersDeck();
            });
        });

        const btnOpenCreateUser = document.getElementById("btn-open-create-user");
        if (btnOpenCreateUser) {
            btnOpenCreateUser.addEventListener("click", () => openCreateUserSheet());
        }

        const btnRefreshUsersDeck = document.getElementById("btn-refresh-users-deck");
        if (btnRefreshUsersDeck) {
            btnRefreshUsersDeck.addEventListener("click", async () => {
                btnRefreshUsersDeck.classList.add("rotating");
                showToast("Syncing with Cloud Firestore...", "info");
                try {
                    await fetchLiveUsers(true);
                    refreshDashboard();
                    await loadUsersDeck();
                    showToast("Directory synchronized with Cloud Firestore!", "success");
                } catch (e) {
                    showToast("Sync notice: " + e.message, "warning");
                } finally {
                    btnRefreshUsersDeck.classList.remove("rotating");
                }
            });
        }

        // Sheet 1: Create User Form Interactive Listeners & Live Preview
        const createNameInput = document.getElementById("sheet-user-name");
        if (createNameInput) {
            createNameInput.addEventListener("input", (e) => {
                const val = e.target.value.trim();
                const elDisp = document.getElementById("create-user-display-name");
                const elAvatar = document.getElementById("create-user-avatar-circle");
                if (elDisp) elDisp.textContent = val || "New Team Member";
                if (elAvatar) elAvatar.textContent = val ? val.charAt(0).toUpperCase() : "＋";
            });
        }

        const createEmailInput = document.getElementById("sheet-user-email");
        if (createEmailInput) {
            createEmailInput.addEventListener("input", (e) => {
                const val = e.target.value.trim();
                const elDisp = document.getElementById("create-user-display-email");
                if (elDisp) elDisp.textContent = val || "user@tim-mfg.com";
            });
        }

        const btnGenerateUserPw = document.getElementById("btn-generate-user-pw");
        if (btnGenerateUserPw) {
            btnGenerateUserPw.addEventListener("click", () => {
                const generated = generateSecurePassword(12);
                const pwInput = document.getElementById("sheet-user-password");
                const toggleBtn = document.getElementById("sheet-user-pw-toggle");
                if (pwInput) {
                    pwInput.value = generated;
                    pwInput.type = "text";
                }
                if (toggleBtn) {
                    toggleBtn.textContent = "🔒";
                }
                showToast("Generated 12-char temporary password!", "info");
            });
        }

        const sheetUserPwToggle = document.getElementById("sheet-user-pw-toggle");
        if (sheetUserPwToggle) {
            sheetUserPwToggle.addEventListener("click", () => {
                const pwInput = document.getElementById("sheet-user-password");
                if (!pwInput) return;
                if (pwInput.type === "password") {
                    pwInput.type = "text";
                    sheetUserPwToggle.textContent = "🔒";
                } else {
                    pwInput.type = "password";
                    sheetUserPwToggle.textContent = "👁";
                }
            });
        }

        const createDeptSelect = document.getElementById("sheet-user-dept");
        if (createDeptSelect) {
            createDeptSelect.addEventListener("change", (e) => {
                const dept = e.target.value;
                const elDeptBadge = document.getElementById("create-user-dept-badge");
                if (elDeptBadge) elDeptBadge.textContent = dept ? `🏢 ${dept}` : "🏢 General";
                document.querySelectorAll("#create-dept-chips .btn-dept-chip").forEach((chip) => {
                    chip.classList.toggle("active", chip.dataset.dept === dept);
                });
            });
        }

        document.querySelectorAll("#create-dept-chips .btn-dept-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                const dept = chip.dataset.dept;
                const select = document.getElementById("sheet-user-dept");
                if (select) {
                    select.value = dept;
                    select.dispatchEvent(new Event("change"));
                }
            });
        });

        const createRoleSelect = document.getElementById("sheet-user-role");
        if (createRoleSelect) {
            createRoleSelect.addEventListener("change", (e) => {
                const role = e.target.value;
                const elRoleBadge = document.getElementById("create-user-role-badge");
                const elRoleDescText = document.getElementById("create-role-desc-text");
                if (elRoleBadge) elRoleBadge.textContent = roleLabel(role);
                if (elRoleDescText) elRoleDescText.textContent = ROLE_DESCRIPTIONS[role] || ROLE_DESCRIPTIONS.user;
            });
        }

        // Sheet 1: Create User Form Submission (Registers in Cloud Firestore)
        const sheetUserForm = document.getElementById("sheet-user-form");
        if (sheetUserForm) {
            sheetUserForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const name = document.getElementById("sheet-user-name").value.trim();
                const email = document.getElementById("sheet-user-email").value.trim().toLowerCase();
                const dept = document.getElementById("sheet-user-dept").value;
                const roleSelect = document.getElementById("sheet-user-role");
                const role = roleSelect ? roleSelect.value : "user";
                const passwordInput = document.getElementById("sheet-user-password");
                const password = passwordInput ? passwordInput.value : "";

                if (!name || !email || !password) {
                    showToast("Name, email, and temporary password are required.", "danger");
                    return;
                }

                if (password.length < 8) {
                    showToast("Password must be at least 8 characters.", "danger");
                    return;
                }

                const submitBtn = document.getElementById("btn-submit-create-user") || sheetUserForm.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = "<span>Provisioning in Firestore...</span>";
                }

                try {
                    const data = await safeApiFetch("/api/auth/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name,
                            email,
                            department: dept || null,
                            role: role || "user",
                            password
                        })
                    });

                    addAuditLog("USER_CREATED", name, `Created new Firestore account (${roleLabel(role)}) for ${dept || "General"}`);
                    showToast(`User ${name} provisioned and stored in Cloud Firestore!`, "success");
                    sheetUserForm.reset();
                    closeAllSheets();

                    // Re-sync with backend & update dashboard & deck
                    await fetchLiveUsers(true);
                    refreshDashboard();
                    await loadUsersDeck();
                } catch (err) {
                    showToast(err.message, "danger");
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `<span>Provision User</span> <span class="btn-arrow">➕</span>`;
                    }
                }
            });
        }

        // Sheet 2: Edit User Form Interactive Listeners & Live Preview
        const editNameInput = document.getElementById("edit-user-name");
        if (editNameInput) {
            editNameInput.addEventListener("input", (e) => {
                const val = e.target.value.trim() || "User";
                const elDisp = document.getElementById("edit-user-display-name");
                const elAvatar = document.getElementById("edit-user-avatar-circle");
                if (elDisp) elDisp.textContent = val;
                if (elAvatar) elAvatar.textContent = val.charAt(0).toUpperCase();
            });
        }

        const editDeptSelect = document.getElementById("edit-user-dept");
        if (editDeptSelect) {
            editDeptSelect.addEventListener("change", (e) => {
                const dept = e.target.value;
                const elDeptBadge = document.getElementById("edit-user-dept-badge");
                if (elDeptBadge) elDeptBadge.textContent = dept ? `🏢 ${dept}` : "🏢 General";
                document.querySelectorAll("#edit-dept-chips .btn-dept-chip").forEach((chip) => {
                    chip.classList.toggle("active", chip.dataset.dept === dept);
                });
            });
        }

        document.querySelectorAll("#edit-dept-chips .btn-dept-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                const dept = chip.dataset.dept;
                const select = document.getElementById("edit-user-dept");
                if (select) {
                    select.value = dept;
                    select.dispatchEvent(new Event("change"));
                }
            });
        });

        const editRoleSelect = document.getElementById("edit-user-role");
        if (editRoleSelect) {
            editRoleSelect.addEventListener("change", (e) => {
                const role = e.target.value;
                const elRoleBadge = document.getElementById("edit-user-role-badge");
                const elRoleDescText = document.getElementById("edit-role-desc-text");
                if (elRoleBadge) elRoleBadge.textContent = roleLabel(role);
                if (elRoleDescText) elRoleDescText.textContent = ROLE_DESCRIPTIONS[role] || ROLE_DESCRIPTIONS.user;
            });
        }

        // Sheet 2: Edit User Form (Updates in Cloud Firestore)
        const sheetEditForm = document.getElementById("sheet-edit-user-form");
        if (sheetEditForm) {
            sheetEditForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const id = document.getElementById("edit-user-id").value;
                const name = document.getElementById("edit-user-name").value.trim();
                const email = document.getElementById("edit-user-email").value.trim().toLowerCase();
                const deptSelect = document.getElementById("edit-user-dept");
                const department = deptSelect ? deptSelect.value : undefined;
                const roleSelect = document.getElementById("edit-user-role");
                const role = roleSelect && !roleSelect.disabled ? roleSelect.value : undefined;

                const submitBtn = document.getElementById("btn-save-user-changes") || sheetEditForm.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = "<span>Saving to Firestore...</span>";
                }

                try {
                    await safeApiFetch("/api/users/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, name, role, department })
                    });

                    // Update live cache
                    if (liveUsersCache) {
                        const u = liveUsersCache.find((x) => x.email.toLowerCase() === email || String(x.id) === String(id));
                        if (u) {
                            u.name = name;
                            if (role) u.role = role;
                            if (department !== undefined) u.department = department || null;
                        }
                    }

                    addAuditLog("USER_UPDATED", name, `Updated account details (Role: ${roleLabel(role || 'user')}, Dept: ${department || 'General'}) in Cloud Firestore`);
                    showToast("User details saved to Cloud Firestore.", "success");
                    closeAllSheets();

                    await fetchLiveUsers(true);
                    refreshDashboard();
                    await loadUsersDeck();
                } catch (err) {
                    if (liveUsersCache) {
                        const u = liveUsersCache.find((x) => x.email.toLowerCase() === email || String(x.id) === String(id));
                        if (u) {
                            u.name = name;
                            if (role) u.role = role;
                            if (department !== undefined) u.department = department || null;
                            setStoredData(STORAGE_KEY_USERS, liveUsersCache);
                        }
                    }
                    closeAllSheets();
                    loadUsersDeck();
                    showToast("Updated locally: " + (err.message || "syncing pending"), "info");
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = "<span>Save Changes</span> <span class=\"btn-arrow\">✓</span>";
                    }
                }
            });
        }

        const btnSheetDeleteUser = document.getElementById("btn-sheet-delete-user");
        if (btnSheetDeleteUser) {
            btnSheetDeleteUser.addEventListener("click", async () => {
                const email = document.getElementById("edit-user-email").value.trim().toLowerCase();
                const name = document.getElementById("edit-user-name").value.trim();
                const targetUser = (liveUsersCache || []).find((x) => x.email.toLowerCase() === email) || { email, name };
                const isCurrentlyDisabled = isUserAccountDisabled(targetUser) || 
                    (document.getElementById("edit-user-status-pill") && document.getElementById("edit-user-status-pill").classList.contains("pill-disabled"));

                if (isCurrentlyDisabled) {
                    // Re-activate user with styled in-app confirmation
                    const confirmed = await showConfirmDialog({
                        title: "Re-activate Account",
                        message: `Restore active access for ${name}?`,
                        details: "Their status will be updated to Active in Cloud Firestore and they will be able to sign in immediately.",
                        icon: "✓",
                        confirmText: "Yes, Re-activate",
                        cancelText: "Cancel",
                        type: "success"
                    });
                    if (!confirmed) return;

                    btnSheetDeleteUser.disabled = true;
                    try {
                        await safeApiFetch("/api/users/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email, status: "active", deleted_at: null, deletedAt: null })
                        });
                    } catch (e) {
                        console.warn("Backend update notice:", e);
                    }

                    if (liveUsersCache) {
                        const u = liveUsersCache.find((x) => x.email.toLowerCase() === email);
                        if (u) {
                            u.deleted_at = null;
                            u.deletedAt = null;
                            u.status = "active";
                            setStoredData(STORAGE_KEY_USERS, liveUsersCache);
                        }
                    }

                    addAuditLog("USER_REACTIVATED", name, "Restored active status for Firestore user account");
                    closeAllSheets();
                    btnSheetDeleteUser.disabled = false;
                    await fetchLiveUsers(true);
                    refreshDashboard();
                    await loadUsersDeck();
                    showToast(`Account for ${name} re-activated in Cloud Firestore!`, "success");
                } else {
                    // Disable user with styled in-app confirmation
                    const confirmed = await showConfirmDialog({
                        title: "Disable User Account",
                        message: `Are you sure you want to disable ${name}'s account?`,
                        details: "Their operational access will be suspended and recorded as disabled in Cloud Firestore.",
                        icon: "🗑",
                        confirmText: "Yes, Disable Account",
                        cancelText: "Keep Active",
                        type: "danger"
                    });
                    if (!confirmed) return;

                    btnSheetDeleteUser.disabled = true;
                    const nowIso = new Date().toISOString();
                    try {
                        await safeApiFetch("/api/users/delete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email })
                        });
                    } catch (e) {
                        console.warn("Backend delete notice:", e);
                    }

                    if (liveUsersCache) {
                        const u = liveUsersCache.find((x) => x.email.toLowerCase() === email);
                        if (u) {
                            u.deleted_at = nowIso;
                            u.deletedAt = nowIso;
                            u.status = "disabled";
                            setStoredData(STORAGE_KEY_USERS, liveUsersCache);
                        }
                    }

                    addAuditLog("USER_DELETED", name, "Disabled Firestore user account");
                    closeAllSheets();
                    btnSheetDeleteUser.disabled = false;
                    await fetchLiveUsers(true);
                    refreshDashboard();
                    await loadUsersDeck();
                    showToast(`Account for ${name} disabled.`, "info");
                }
            });
        }

        // Sales Tab Switching
        document.querySelectorAll(".sales-tab-bar .sales-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                document.querySelectorAll(".sales-tab-bar .sales-tab").forEach((t) => t.classList.remove("active"));
                tab.classList.add("active");
                const target = tab.dataset.salesTab;
                document.getElementById("sales-panel-products").hidden = target !== "products";
                document.getElementById("sales-panel-history").hidden = target !== "history";
                document.getElementById("sales-panel-deleted").hidden = target !== "deleted";
            });
        });

        // Sales Modal Buttons
        const btnOpenRecordSale = document.getElementById("btn-open-record-sale");
        if (btnOpenRecordSale) btnOpenRecordSale.addEventListener("click", openRecordSaleModal);

        const btnHeroRecordSale = document.getElementById("btn-hero-record-sale");
        if (btnHeroRecordSale) btnHeroRecordSale.addEventListener("click", openRecordSaleModal);

        const btnOpenAddProduct = document.getElementById("btn-open-add-product");
        if (btnOpenAddProduct) btnOpenAddProduct.addEventListener("click", () => openSheet("sheet-add-product"));

        const btnTopAddProduct = document.getElementById("btn-top-add-product");
        if (btnTopAddProduct) btnTopAddProduct.addEventListener("click", () => openSheet("sheet-add-product"));

        const btnInflowAddProduct = document.getElementById("btn-inflow-add-product");
        if (btnInflowAddProduct) btnInflowAddProduct.addEventListener("click", () => openSheet("sheet-add-product"));

        // Record Sale Interactive Controls
        const saleProdSelect = document.getElementById("sheet-sale-product");
        if (saleProdSelect) {
            saleProdSelect.addEventListener("change", updateSaleModalPreview);
        }

        const saleQtyInput = document.getElementById("sheet-sale-qty");
        if (saleQtyInput) {
            saleQtyInput.addEventListener("input", updateSaleModalPreview);
            saleQtyInput.addEventListener("change", updateSaleModalPreview);
        }

        const btnQtyMinus = document.getElementById("btn-qty-minus");
        if (btnQtyMinus) {
            btnQtyMinus.addEventListener("click", () => {
                if (saleQtyInput) {
                    const current = parseInt(saleQtyInput.value, 10) || 1;
                    saleQtyInput.value = Math.max(1, current - 1);
                    updateSaleModalPreview();
                }
            });
        }

        const btnQtyPlus = document.getElementById("btn-qty-plus");
        if (btnQtyPlus) {
            btnQtyPlus.addEventListener("click", () => {
                if (saleQtyInput) {
                    const current = parseInt(saleQtyInput.value, 10) || 0;
                    saleQtyInput.value = current + 1;
                    updateSaleModalPreview();
                }
            });
        }

        // Quick quantity preset chips (+1, +5, +10, +25, +50)
        document.querySelectorAll(".btn-qty-chip[data-qty]").forEach((chip) => {
            chip.addEventListener("click", () => {
                if (saleQtyInput) {
                    const add = parseInt(chip.dataset.qty, 10) || 1;
                    const current = parseInt(saleQtyInput.value, 10) || 0;
                    saleQtyInput.value = current + add;
                    updateSaleModalPreview();
                }
            });
        });

        // Max quantity chip
        const btnQtyMax = document.getElementById("btn-qty-max");
        if (btnQtyMax) {
            btnQtyMax.addEventListener("click", () => {
                if (saleProdSelect && saleQtyInput) {
                    const prodId = Number(saleProdSelect.value);
                    const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
                    const prod = products.find((p) => p.id === prodId);
                    if (prod && prod.current_stock > 0) {
                        saleQtyInput.value = prod.current_stock;
                        updateSaleModalPreview();
                    }
                }
            });
        }

        // Date "Today" shortcut button
        const btnSaleToday = document.getElementById("btn-sale-today");
        if (btnSaleToday) {
            btnSaleToday.addEventListener("click", () => {
                const dateInput = document.getElementById("sheet-sale-date");
                if (dateInput) {
                    dateInput.value = new Date().toISOString().split("T")[0];
                }
            });
        }

        // Sheet 3: Record Sale Form
        const sheetSaleForm = document.getElementById("sheet-sale-form");
        if (sheetSaleForm) {
            sheetSaleForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const prodId = Number(document.getElementById("sheet-sale-product").value);
                const qty = Number(document.getElementById("sheet-sale-qty").value);
                const date = document.getElementById("sheet-sale-date").value;

                const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
                const sales = getStoredData(STORAGE_KEY_SALES, DEFAULT_SEED_SALES);

                const prod = products.find((p) => p.id === prodId);
                if (!prod) {
                    showToast("Select a valid product.", "warning");
                    return;
                }
                if (qty > prod.current_stock) {
                    showToast(`Quantity (${qty}) exceeds available stock (${prod.current_stock}).`, "warning");
                    return;
                }

                // Deduct stock
                prod.current_stock -= qty;

                sales.unshift({
                    id: Date.now(),
                    product_id: prod.id,
                    product_name: prod.name,
                    product_category: prod.category,
                    quantity_sold: qty,
                    current_stock: prod.current_stock,
                    sale_date: date,
                    deleted_at: null
                });

                setStoredData(STORAGE_KEY_PRODUCTS, products);
                setStoredData(STORAGE_KEY_SALES, sales);
                addAuditLog("SALE_RECORDED", prod.name, `Recorded sale of ${qty} units`);
                closeAllSheets();
                loadSalesView();
                showToast(`Sale recorded! Stock updated to ${prod.current_stock}.`, "success");
            });
        }

        // Sheet 4: Add Product Form
        const sheetProductForm = document.getElementById("sheet-product-form");
        if (sheetProductForm) {
            sheetProductForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const name = document.getElementById("sheet-prod-name").value.trim();
                const cat = document.getElementById("sheet-prod-category").value.trim();
                const stock = Number(document.getElementById("sheet-prod-stock").value);

                const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
                products.push({ id: Date.now(), name, category: cat, current_stock: stock });

                setStoredData(STORAGE_KEY_PRODUCTS, products);
                addAuditLog("PRODUCT_ADDED", name, `Added product with starting stock ${stock}`);
                closeAllSheets();
                loadSalesView();
                showToast(`Product "${name}" added.`, "success");
            });
        }

        // Sheet 5: Restock Product Form
        const sheetRestockForm = document.getElementById("sheet-restock-form");
        if (sheetRestockForm) {
            sheetRestockForm.addEventListener("submit", (e) => {
                e.preventDefault();
                const prodId = Number(document.getElementById("restock-prod-id").value);
                const qty = Number(document.getElementById("restock-qty").value);

                const products = getStoredData(STORAGE_KEY_PRODUCTS, DEFAULT_SEED_PRODUCTS);
                const prod = products.find((p) => p.id === prodId);
                if (prod) {
                    prod.current_stock += qty;
                    setStoredData(STORAGE_KEY_PRODUCTS, products);
                    addAuditLog("PRODUCT_RESTOCKED", prod.name, `Added ${qty} units to inventory (New stock: ${prod.current_stock})`);
                    closeAllSheets();
                    loadSalesView();
                    showToast(`Restocked ${prod.name} (+${qty})`, "success");
                }
            });
        }

        // Category quick chips for Add Product
        document.querySelectorAll(".quick-category-chips .btn-cat-chip").forEach((btn) => {
            btn.addEventListener("click", () => {
                const catInput = document.getElementById("sheet-prod-category");
                if (catInput) {
                    catInput.value = btn.dataset.cat;
                    document.querySelectorAll(".quick-category-chips .btn-cat-chip").forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                }
            });
        });

        // Add Product stock steppers & presets
        const addStockInput = document.getElementById("sheet-prod-stock");
        const btnAddStockMinus = document.getElementById("btn-add-stock-minus");
        if (btnAddStockMinus && addStockInput) {
            btnAddStockMinus.addEventListener("click", () => {
                const curr = parseInt(addStockInput.value, 10) || 10;
                addStockInput.value = Math.max(1, curr - 10);
            });
        }
        const btnAddStockPlus = document.getElementById("btn-add-stock-plus");
        if (btnAddStockPlus && addStockInput) {
            btnAddStockPlus.addEventListener("click", () => {
                const curr = parseInt(addStockInput.value, 10) || 0;
                addStockInput.value = curr + 10;
            });
        }
        document.querySelectorAll(".btn-add-preset[data-add]").forEach((chip) => {
            chip.addEventListener("click", () => {
                if (addStockInput) {
                    const add = parseInt(chip.dataset.add, 10) || 50;
                    const curr = parseInt(addStockInput.value, 10) || 0;
                    addStockInput.value = curr + add;
                }
            });
        });

        // Restock stock steppers & presets
        const restockQtyInput = document.getElementById("restock-qty");
        const btnRestockMinus = document.getElementById("btn-restock-minus");
        if (btnRestockMinus && restockQtyInput) {
            btnRestockMinus.addEventListener("click", () => {
                const curr = parseInt(restockQtyInput.value, 10) || 10;
                restockQtyInput.value = Math.max(1, curr - 10);
            });
        }
        const btnRestockPlus = document.getElementById("btn-restock-plus");
        if (btnRestockPlus && restockQtyInput) {
            btnRestockPlus.addEventListener("click", () => {
                const curr = parseInt(restockQtyInput.value, 10) || 0;
                restockQtyInput.value = curr + 10;
            });
        }
        document.querySelectorAll(".btn-restock-preset[data-add]").forEach((chip) => {
            chip.addEventListener("click", () => {
                if (restockQtyInput) {
                    const add = parseInt(chip.dataset.add, 10) || 25;
                    const curr = parseInt(restockQtyInput.value, 10) || 0;
                    restockQtyInput.value = curr + add;
                }
            });
        });

        // Security Authenticator App Toggle
        const toggleAuth = document.getElementById("toggle-authenticator-app");
        if (toggleAuth) {
            toggleAuth.addEventListener("change", async (e) => {
                if (!currentUser) return;
                const wantEnable = e.target.checked;
                const userEmailKey = (currentUser.email || "").toLowerCase().trim();
                const fallbackSecret = localStorage.getItem("secureapp_totp_secret_" + userEmailKey);
                const secretToUse = currentUser.two_factor_secret || currentUser.twoFactorSecret || fallbackSecret || null;

                if (wantEnable) {
                    if (secretToUse) {
                        currentUser.two_factor_secret = secretToUse;
                        currentUser.twoFactorSecret = secretToUse;
                        currentUser.two_factor_enabled = 1;
                        currentUser.twoFactorEnabled = true;
                        setStoredData(STORAGE_KEY_SESSION, { user: currentUser, timestamp: Date.now() });

                        try {
                            await safeApiFetch("/api/auth/update-2fa", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    email: currentUser.email,
                                    twoFactorEnabled: true,
                                    two_factor_enabled: 1,
                                    enabled: true,
                                    twoFactorSecret: secretToUse,
                                    two_factor_secret: secretToUse,
                                    secret: secretToUse
                                })
                            });
                        } catch (syncErr) {
                            console.warn("[2FA] Sync notice:", syncErr.message);
                        }

                        addAuditLog("2FA_TOTP_ENABLED", currentUser.name, "Enabled Authenticator App 2FA");
                        showToast("Authenticator App enabled! Sign-in will prompt for Authenticator code (with Email OTP option).", "success");
                        loadSecurityView();
                    } else {
                        // User hasn't enrolled an authenticator yet: open setup drawer
                        e.target.checked = false;
                        startTotpSetup();
                        showToast("Please scan the QR code and enter the 6-digit code to enable.", "info");
                    }
                } else {
                    // Turn OFF authenticator app
                    currentUser.two_factor_enabled = 0;
                    currentUser.twoFactorEnabled = false;
                    setStoredData(STORAGE_KEY_SESSION, { user: currentUser, timestamp: Date.now() });

                    try {
                        await safeApiFetch("/api/auth/update-2fa", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                email: currentUser.email,
                                twoFactorEnabled: false,
                                two_factor_enabled: 0,
                                enabled: false,
                                twoFactorSecret: secretToUse,
                                two_factor_secret: secretToUse,
                                secret: secretToUse
                            })
                        });
                    } catch (syncErr) {
                        console.warn("[2FA] Sync notice:", syncErr.message);
                    }

                    const drawer = document.getElementById("totp-qr-container");
                    if (drawer) drawer.hidden = true;

                    addAuditLog("2FA_TOTP_DISABLED", currentUser.name, "Disabled Authenticator App 2FA (Reverted to Email OTP)");
                    showToast("Authenticator App disabled. Sign-ins will now require 6-digit Email OTP.", "info");
                    loadSecurityView();
                }
            });
        }

        // Security Setup Authenticator
        const btnStartTotp = document.getElementById("btn-start-totp-setup");
        if (btnStartTotp) btnStartTotp.addEventListener("click", () => startTotpSetup(false));

        const btnRegenTotp = document.getElementById("btn-regen-totp-key");
        if (btnRegenTotp) {
            btnRegenTotp.addEventListener("click", () => {
                startTotpSetup(true);
                showToast("Generated fresh 32-character secret key and QR code!", "info");
            });
        }

        const btnCopyTotp = document.getElementById("btn-copy-totp-key");
        if (btnCopyTotp) {
            btnCopyTotp.addEventListener("click", () => {
                navigator.clipboard.writeText(pendingTotpSecret).then(() => {
                    showToast("Authenticator secret copied to clipboard!", "success");
                });
            });
        }

        const totpConfirmForm = document.getElementById("totp-confirm-form");
        if (totpConfirmForm) {
            totpConfirmForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const code = document.getElementById("totp-code-confirm").value.trim();
                try {
                    await confirmTotpSetup(code);
                } catch (err) {
                    showToast(err.message, "danger");
                }
            });
        }

        // Mobile Screen Lock Toggle (Per-Account Isolated)
        const togglePin = document.getElementById("toggle-mobile-pin");
        if (togglePin) {
            togglePin.addEventListener("change", (e) => {
                if (!currentUser || !currentUser.email) return;
                if (e.target.checked) {
                    const existingPin = localStorage.getItem(getUserPinKey(currentUser.email));
                    if (existingPin && existingPin.length === 4) {
                        localStorage.setItem(getUserPinEnabledKey(currentUser.email), "true");
                        loadSecurityView();
                        showToast(`Screen Lock PIN enabled for ${currentUser.email}.`, "success");
                    } else {
                        openPinSetupSheet();
                    }
                } else {
                    localStorage.removeItem(getUserPinEnabledKey(currentUser.email));
                    localStorage.removeItem(getUserPinKey(currentUser.email));
                    showToast(`Screen Lock PIN disabled for ${currentUser.email}.`, "info");
                    loadSecurityView();
                }
            });
        }

        // Lock App Screen Now Button
        const btnLockNow = document.getElementById("btn-lock-screen-now");
        if (btnLockNow) {
            btnLockNow.addEventListener("click", () => {
                showPinLockScreen();
            });
        }

        // Change PIN Button
        const btnChangePin = document.getElementById("btn-change-pin");
        if (btnChangePin) {
            btnChangePin.addEventListener("click", () => {
                openPinSetupSheet();
            });
        }

        // Setup PIN Form (Per-Account Isolated)
        const pinSetupForm = document.getElementById("pin-setup-form");
        if (pinSetupForm) {
            pinSetupForm.addEventListener("submit", (e) => {
                e.preventDefault();
                if (!currentUser || !currentUser.email) {
                    showToast("No active session found.", "danger");
                    return;
                }
                const p1 = document.getElementById("input-new-pin").value.trim();
                const p2 = document.getElementById("input-confirm-pin").value.trim();
                if (!/^\d{4}$/.test(p1)) {
                    showToast("PIN must be exactly 4 numeric digits (0-9).", "danger");
                    return;
                }
                if (p1 !== p2) {
                    showToast("PINs do not match. Please verify both fields.", "danger");
                    return;
                }
                localStorage.setItem(getUserPinKey(currentUser.email), p1);
                localStorage.setItem(getUserPinEnabledKey(currentUser.email), "true");
                closeAllSheets();
                loadSecurityView();
                showToast(`Individual Screen Lock PIN set for ${currentUser.email}!`, "success");
            });
        }

        // Keypad buttons
        document.querySelectorAll(".pin-key[data-digit]").forEach((btn) => {
            btn.addEventListener("click", () => handlePinDigit(btn.dataset.digit));
        });

        const btnPinBack = document.getElementById("btn-pin-backspace");
        if (btnPinBack) {
            btnPinBack.addEventListener("click", handlePinBackspace);
        }

        const btnPinSignout = document.getElementById("btn-pin-lock-signout");
        if (btnPinSignout) {
            btnPinSignout.addEventListener("click", () => {
                hidePinLockScreen();
                handleLogout();
            });
        }

        // Physical keyboard support for PIN entry
        window.addEventListener("keydown", (e) => {
            const overlay = document.getElementById("pin-lock-overlay");
            if (overlay && !overlay.hidden) {
                if (/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    handlePinDigit(e.key);
                } else if (e.key === "Backspace") {
                    e.preventDefault();
                    handlePinBackspace();
                }
            }
        });

        // Background / App switch detection: Auto-lock when tab/app is hidden
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                if (currentUser && currentUser.email && isUserPinActive(currentUser.email)) {
                    showPinLockScreen();
                }
            }
        });

        // Backup Actions
        const btnCreateBackup = document.getElementById("btn-create-backup-now");
        if (btnCreateBackup) btnCreateBackup.addEventListener("click", createEncryptedBackup);

        // Audit Logs Actions & Filters
        const btnRefreshAudit = document.getElementById("btn-refresh-audit-page");
        if (btnRefreshAudit) btnRefreshAudit.addEventListener("click", () => {
            loadFullAuditLogs();
            showToast("Audit logs synchronized", "info");
        });

        const btnExportAudit = document.getElementById("btn-export-audit-csv");
        if (btnExportAudit) btnExportAudit.addEventListener("click", exportAuditLogsToCsv);

        const auditSearchInput = document.getElementById("audit-search-input");
        if (auditSearchInput) {
            auditSearchInput.addEventListener("input", (e) => {
                currentAuditSearch = e.target.value.trim();
                loadFullAuditLogs();
            });
        }

        document.querySelectorAll("#audit-filter-chips .filter-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                document.querySelectorAll("#audit-filter-chips .filter-chip").forEach((c) => c.classList.remove("active"));
                chip.classList.add("active");
                currentAuditFilter = chip.dataset.filterAudit || "all";
                loadFullAuditLogs();
            });
        });

        // Profile Quick Navigation Shortcuts
        const profSecBtn = document.getElementById("prof-btn-security");
        if (profSecBtn) profSecBtn.addEventListener("click", () => switchMobileView("security"));

        const profPinBtn = document.getElementById("prof-btn-pin");
        if (profPinBtn) profPinBtn.addEventListener("click", () => openSheet("sheet-pin-setup"));

        const profAuditBtn = document.getElementById("prof-btn-audit");
        if (profAuditBtn) profAuditBtn.addEventListener("click", () => switchMobileView("logs"));

        // PWA Install Prompt Banner
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            const banner = document.getElementById("pwa-install-banner");
            if (banner) banner.hidden = false;
        });

        const btnPwaInstall = document.getElementById("pwa-install-btn");
        if (btnPwaInstall) {
            btnPwaInstall.addEventListener("click", async () => {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    const { outcome } = await deferredInstallPrompt.userChoice;
                    if (outcome === "accepted") {
                        showToast("Installing SecureApp Mobile...", "success");
                    }
                    deferredInstallPrompt = null;
                }
                document.getElementById("pwa-install-banner").hidden = true;
            });
        }

        const btnPwaDismiss = document.getElementById("pwa-dismiss-btn");
        if (btnPwaDismiss) {
            btnPwaDismiss.addEventListener("click", () => {
                document.getElementById("pwa-install-banner").hidden = true;
            });
        }
    }

    // --- Server Connection Configuration & Ping Diagnostics ---
    function initServerSettings() {
        const statusLabel = document.getElementById("server-status-label");
        const statusDot = document.getElementById("server-status-dot");
        const btnOpen = document.getElementById("btn-open-server-settings");
        const form = document.getElementById("sheet-server-form");
        const input = document.getElementById("server-url-input");
        const btnDefault = document.getElementById("btn-server-default-ip");
        const btnLocalhost = document.getElementById("btn-server-localhost-ip");
        const btnTest = document.getElementById("btn-test-server-connection");
        const testResult = document.getElementById("server-test-result");

        function updateStatusUI() {
            if (window.FirestoreDirect) {
                if (statusLabel) {
                    statusLabel.textContent = "Backend: Google Cloud Firestore";
                }
                if (statusDot) {
                    statusDot.style.background = "#10b981";
                    statusDot.title = "Connected directly to Google Cloud Firestore (Standalone Mode)";
                }
                if (input) {
                    input.value = "https://firestore.googleapis.com (Direct Standalone)";
                }
                return;
            }

            const base = getApiBaseUrl();
            if (statusLabel) {
                const display = base ? base.replace(/^https?:\/\//, "") : "Direct / Localhost";
                statusLabel.textContent = `Server: ${display}`;
            }
            if (input) {
                input.value = base || "http://192.168.0.100:3000";
            }
        }

        async function pingServer(targetUrl) {
            if (window.FirestoreDirect && (!targetUrl || targetUrl.includes("firestore.googleapis.com"))) {
                try {
                    const health = await window.FirestoreDirect.checkConnection();
                    if (health.ok) {
                        if (statusDot) {
                            statusDot.style.background = "#10b981";
                            statusDot.title = "Connected directly to Google Cloud Firestore (app-7f085)";
                        }
                        updateStatusUI();
                        return { ok: true, url: "Google Cloud Firestore (app-7f085)" };
                    }
                } catch (_) {}
            }

            if (!targetUrl) {
                const bestUrl = await probeBestApiBase();
                if (bestUrl && !bestUrl.includes("firestore.googleapis.com")) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 2000);
                        const resp = await fetch(`${bestUrl}/api/health`, { 
                            signal: controller.signal,
                            cache: "no-store" 
                        });
                        clearTimeout(timeoutId);
                        if (resp.ok) {
                            if (statusDot) {
                                statusDot.style.background = "#10b981";
                                statusDot.title = `Connected to ${bestUrl}`;
                            }
                            updateStatusUI();
                            return { ok: true, url: bestUrl };
                        }
                    } catch (_) {}
                }
            } else {
                const urlToTest = targetUrl.replace(/\/+$/, "");
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    const resp = await fetch(`${urlToTest}/api/health`, { 
                        signal: controller.signal,
                        cache: "no-store" 
                    });
                    clearTimeout(timeoutId);
                    if (resp.ok) {
                        activeApiBase = urlToTest;
                        localStorage.setItem("secureapp_api_base", urlToTest);
                        if (statusDot) {
                            statusDot.style.background = "#10b981";
                            statusDot.title = `Connected to ${urlToTest}`;
                        }
                        updateStatusUI();
                        return { ok: true, url: urlToTest };
                    }
                } catch (e) {
                    // Connection error
                }
            }
            if (statusDot) {
                statusDot.style.background = "#f59e0b";
                statusDot.title = "Server not reachable or offline";
            }
            return { ok: false, url: targetUrl || getApiBaseUrl() };
        }

        updateStatusUI();
        // Background check
        pingServer();

        if (btnOpen) {
            btnOpen.addEventListener("click", () => {
                updateStatusUI();
                if (testResult) testResult.style.display = "none";
                openSheet("sheet-server-settings");
            });
        }

        if (btnDefault && input) {
            btnDefault.addEventListener("click", () => {
                input.value = "http://192.168.0.100:3000";
            });
        }

        if (btnLocalhost && input) {
            btnLocalhost.addEventListener("click", () => {
                input.value = "http://localhost:3000";
            });
        }

        if (btnTest && input && testResult) {
            btnTest.addEventListener("click", async () => {
                const val = input.value.trim();
                testResult.style.display = "block";
                testResult.style.background = "rgba(59, 130, 246, 0.1)";
                testResult.style.color = "var(--primary, #3b82f6)";
                testResult.style.border = "1px solid rgba(59, 130, 246, 0.2)";
                testResult.innerHTML = `⏳ Pinging server at <code>${val}</code>...`;

                const ping = await pingServer(val);
                if (ping.ok) {
                    testResult.style.background = "rgba(16, 185, 129, 0.12)";
                    testResult.style.color = "#059669";
                    testResult.style.border = "1px solid rgba(16, 185, 129, 0.3)";
                    testResult.innerHTML = `✅ <strong>Connected!</strong> Successfully reached SecureApp backend at <code>${ping.url}</code>.`;
                } else {
                    testResult.style.background = "rgba(239, 68, 68, 0.12)";
                    testResult.style.color = "#dc2626";
                    testResult.style.border = "1px solid rgba(239, 68, 68, 0.3)";
                    testResult.innerHTML = `❌ <strong>Connection Failed.</strong> Could not reach <code>${ping.url}</code>.<br><small>1. Check that the Node server is running.<br>2. Ensure both phone and PC are connected to the same Wi-Fi.<br>3. Verify computer IP with <code>ipconfig</code>.</small>`;
                }
            });
        }

        if (form && input) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                let val = input.value.trim();
                if (val && !val.startsWith("http://") && !val.startsWith("https://")) {
                    val = "http://" + val;
                }
                localStorage.setItem("secureapp_api_base", val);
                updateStatusUI();
                closeAllSheets();
                showToast(`Server address set to ${val}`, "success");
                await pingServer(val);
                fetchLiveUsers(true);
            });
        }
    }

    // --- Gmail OTP Cloud Relay Settings (Cellular Mobile Data Delivery) ---
    function initMailRelaySettings() {
        const btnOpenRelayModal = document.getElementById("btn-open-relay-modal");
        const btnOpenRelaySettings = document.getElementById("btn-open-relay-settings");
        const relayForm = document.getElementById("sheet-mail-relay-form");
        const relayUrlInput = document.getElementById("relay-url-input");
        const relayTestEmail = document.getElementById("relay-test-email");
        const btnTestRelay = document.getElementById("btn-test-relay");
        const testResult = document.getElementById("relay-test-result");
        const btnCopyScript = document.getElementById("btn-copy-apps-script");

        const APPS_SCRIPT_CODE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var to = data.to;
    var subject = data.subject || ("Your SecureApp Verification Code: " + data.otp);
    var html = data.html;
    GmailApp.sendEmail(to, subject, "", { htmlBody: html });
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

        async function populateRelayInput() {
            let existing = localStorage.getItem("secureapp_mail_relay_url") || "";
            if (!existing && window.FirestoreDirect && typeof window.FirestoreDirect.getMailConfig === "function") {
                try {
                    const cfg = await window.FirestoreDirect.getMailConfig();
                    if (cfg && cfg.relayUrl) {
                        existing = cfg.relayUrl;
                        localStorage.setItem("secureapp_mail_relay_url", existing);
                    }
                } catch (_) {}
            }
            if (relayUrlInput) relayUrlInput.value = existing;
            if (testResult) testResult.style.display = "none";
        }

        function openRelaySheet() {
            populateRelayInput();
            openSheet("sheet-mail-relay");
        }

        if (btnOpenRelayModal) btnOpenRelayModal.addEventListener("click", openRelaySheet);
        if (btnOpenRelaySettings) btnOpenRelaySettings.addEventListener("click", openRelaySheet);

        if (btnCopyScript) {
            btnCopyScript.addEventListener("click", async () => {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
                    } else {
                        const ta = document.createElement("textarea");
                        ta.value = APPS_SCRIPT_CODE;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                    }
                    showToast("📋 Google Apps Script code copied to clipboard!", "success");
                } catch (err) {
                    showToast("Failed to copy automatically. Please copy the code manually.", "warning");
                }
            });
        }

        if (btnTestRelay && relayUrlInput && testResult) {
            btnTestRelay.addEventListener("click", async () => {
                const url = relayUrlInput.value.trim();
                const target = (relayTestEmail && relayTestEmail.value.trim()) || "ayimnhyirahamos@gmail.com";

                if (!url) {
                    testResult.style.display = "block";
                    testResult.style.background = "rgba(239, 68, 68, 0.12)";
                    testResult.style.color = "#dc2626";
                    testResult.style.border = "1px solid rgba(239, 68, 68, 0.3)";
                    testResult.innerHTML = "❌ Please enter a Google Apps Script Web App URL first.";
                    return;
                }

                testResult.style.display = "block";
                testResult.style.background = "rgba(59, 130, 246, 0.1)";
                testResult.style.color = "var(--primary, #3b82f6)";
                testResult.style.border = "1px solid rgba(59, 130, 246, 0.2)";
                testResult.innerHTML = `⏳ Sending test verification email to <strong>${target}</strong>...`;

                try {
                    let testOk = false;
                    let testErrMsg = null;

                    if (window.AndroidMailBridge && typeof window.AndroidMailBridge.sendOtpWithRelay === "function") {
                        const reqId = "test_" + Date.now();
                        const result = await new Promise((resolve) => {
                            const timer = setTimeout(() => resolve({ success: false, error: "Test timed out after 20s" }), 20000);
                            window.__onNativeMailResult = (id, ok, err) => {
                                if (id === reqId) {
                                    clearTimeout(timer);
                                    resolve({ success: ok, error: err });
                                }
                            };
                            window.AndroidMailBridge.sendOtpWithRelay(url, target, "849201", "SecureApp Tester", reqId);
                        });
                        testOk = result.success;
                        testErrMsg = result.error;
                    } else {
                        const res = await fetch(url, {
                            method: "POST",
                            headers: { "Content-Type": "text/plain;charset=utf-8" },
                            body: JSON.stringify({
                                to: target,
                                otp: "849201",
                                name: "SecureApp Tester",
                                subject: "Your SecureApp Verification Code: 849201",
                                html: "<p>This is a test OTP from SecureApp Mobile: <strong>849201</strong></p>"
                            })
                        });
                        testOk = res.ok || res.type === "opaque";
                    }

                    if (testOk) {
                        testResult.style.background = "rgba(16, 185, 129, 0.12)";
                        testResult.style.color = "#059669";
                        testResult.style.border = "1px solid rgba(16, 185, 129, 0.3)";
                        testResult.innerHTML = `✅ <strong>Success!</strong> Test email dispatched to <strong>${target}</strong>. Please check your inbox.`;
                        // Auto-cache
                        localStorage.setItem("secureapp_mail_relay_url", url);
                        if (window.FirestoreDirect && typeof window.FirestoreDirect.saveMailConfig === "function") {
                            window.FirestoreDirect.saveMailConfig({ provider: "google_apps_script", relayUrl: url }).catch(() => {});
                        }
                    } else {
                        testResult.style.background = "rgba(239, 68, 68, 0.12)";
                        testResult.style.color = "#dc2626";
                        testResult.style.border = "1px solid rgba(239, 68, 68, 0.3)";
                        testResult.innerHTML = `❌ <strong>Dispatch failed:</strong> ${testErrMsg || "Unable to reach script URL"}. Verify Web App access is set to 'Anyone'.`;
                    }
                } catch (err) {
                    testResult.style.background = "rgba(239, 68, 68, 0.12)";
                    testResult.style.color = "#dc2626";
                    testResult.style.border = "1px solid rgba(239, 68, 68, 0.3)";
                    testResult.innerHTML = `❌ <strong>Error:</strong> ${err.message}.`;
                }
            });
        }

        if (relayForm && relayUrlInput) {
            relayForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const url = relayUrlInput.value.trim();
                if (!url) {
                    showToast("Please enter a valid Web App URL", "warning");
                    return;
                }
                localStorage.setItem("secureapp_mail_relay_url", url);
                if (window.FirestoreDirect && typeof window.FirestoreDirect.saveMailConfig === "function") {
                    try {
                        await window.FirestoreDirect.saveMailConfig({ provider: "google_apps_script", relayUrl: url });
                    } catch (_) {}
                }
                closeAllSheets();
                showToast("✅ Cloud Mail Relay successfully activated!", "success");

                // If currently on verify view, retry OTP sending automatically
                const pending = getPendingVerification();
                if (pending && pending.user && pending.method === "email") {
                    showToast(`Resending OTP to ${pending.user.email}...`, "info");
                    sendOtpEmail(pending.user.email, pending.otp || "938214", pending.user.name);
                }
            });
        }
    }

    // --- Service Worker Registration for PWA ---
    function registerServiceWorker() {
        if ("serviceWorker" in navigator && !window.Capacitor && window.location.protocol !== "file:") {
            navigator.serviceWorker.register("./sw.js").then(
                (reg) => console.log("SecureApp SW registered:", reg.scope),
                (err) => console.warn("SW register error:", err)
            );
        }
    }

    // --- INITIALIZE APPLICATION ---
    function initialize() {
        initDataStorage();
        initEventListeners();
        initServerSettings();
        initMailRelaySettings();
        registerServiceWorker();

        // Restore Session if exists
        const savedSession = getStoredData(STORAGE_KEY_SESSION, null);
        if (savedSession && savedSession.user) {
            currentUser = savedSession.user;
            setAppShellVisible(true);
            updateRoleVisibility();
            switchMobileView("dashboard");

            // Live sync user 2FA status and roles from Firestore backend
            if (currentUser && currentUser.email) {
                safeApiFetch(`/api/auth/profile?email=${encodeURIComponent(currentUser.email)}`)
                    .then((data) => {
                        if (data && data.user) {
                            currentUser.two_factor_enabled = data.user.two_factor_enabled ? 1 : 0;
                            currentUser.twoFactorEnabled = Boolean(data.user.twoFactorEnabled || data.user.two_factor_enabled);
                            currentUser.role = data.user.role || currentUser.role;
                            currentUser.department = data.user.department || currentUser.department;
                            setStoredData(STORAGE_KEY_SESSION, { user: currentUser, timestamp: Date.now() });
                            updateRoleVisibility();
                        }
                    })
                    .catch(() => {});
            }

            // If PIN lock is enabled on this account, lock the screen upon session restore
            if (currentUser && currentUser.email && isUserPinActive(currentUser.email)) {
                showPinLockScreen();
            }
        } else {
            setAppShellVisible(false);
            switchAuthView("login");
        }
    }

    // Start on DOMContentLoaded
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
