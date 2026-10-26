/**
 * SecureApp Mobile - Direct Cloud Firestore Client & Cryptographic Engine
 * Enables 100% Standalone Mobile Operation without requiring a local PC or server.
 * Connects directly to Google Cloud Firestore (Project: app-mobile-50ac5) over HTTPS.
 */
(function (window) {
    "use strict";

    const FIRESTORE_PROJECT_ID = "app-7f085";
    const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;
    const PEPPER = "SecuReApp_P3pp3r_K3y_2026_@EnterpriseSecret!";

    // --- Firestore REST Document Serialization Helpers ---
    function firestoreDocToObj(doc) {
        if (!doc) return null;
        const obj = {};
        if (doc.name) {
            const parts = doc.name.split("/");
            obj._id = parts[parts.length - 1];
        }
        const fields = doc.fields || {};
        for (const [key, val] of Object.entries(fields)) {
            if ("stringValue" in val) obj[key] = val.stringValue;
            else if ("integerValue" in val) obj[key] = parseInt(val.integerValue, 10);
            else if ("doubleValue" in val) obj[key] = parseFloat(val.doubleValue);
            else if ("booleanValue" in val) obj[key] = val.booleanValue;
            else if ("nullValue" in val) obj[key] = null;
            else if ("timestampValue" in val) obj[key] = val.timestampValue;
            else if ("arrayValue" in val) {
                obj[key] = (val.arrayValue.values || []).map((item) => {
                    if ("stringValue" in item) return item.stringValue;
                    if ("integerValue" in item) return parseInt(item.integerValue, 10);
                    if ("booleanValue" in item) return item.booleanValue;
                    return item;
                });
            } else if ("mapValue" in val) {
                obj[key] = firestoreDocToObj({ fields: val.mapValue.fields });
            }
        }
        return obj;
    }

    function objToFirestoreFields(obj) {
        const fields = {};
        for (const [key, val] of Object.entries(obj)) {
            if (key.startsWith("_")) continue;
            if (val === null || val === undefined) fields[key] = { nullValue: null };
            else if (typeof val === "string") fields[key] = { stringValue: val };
            else if (typeof val === "number") {
                if (Number.isInteger(val)) fields[key] = { integerValue: String(val) };
                else fields[key] = { doubleValue: val };
            } else if (typeof val === "boolean") fields[key] = { booleanValue: val };
            else if (Array.isArray(val)) {
                fields[key] = {
                    arrayValue: {
                        values: val.map((item) => {
                            if (typeof item === "string") return { stringValue: item };
                            if (typeof item === "number") return { integerValue: String(item) };
                            if (typeof item === "boolean") return { booleanValue: item };
                            return { stringValue: String(item) };
                        })
                    }
                };
            } else if (typeof val === "object") {
                fields[key] = { mapValue: { fields: objToFirestoreFields(val) } };
            }
        }
        return fields;
    }

    async function fsFetch(path, options = {}) {
        const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
            const resp = await fetch(url, {
                method: options.method || "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },
                body: options.body ? (typeof options.body === "string" ? options.body : JSON.stringify(options.body)) : undefined,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const rawText = await resp.text();
            let data = {};
            try {
                data = rawText ? JSON.parse(rawText) : {};
            } catch (_) {
                throw new Error(`Failed to parse Firestore response (${resp.status})`);
            }

            if (!resp.ok) {
                const message = (data && data.error && data.error.message) ? data.error.message : `Firestore request failed (${resp.status})`;
                const err = new Error(message);
                err.status = resp.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            throw fetchErr;
        }
    }

    // --- WebCrypto Hardware-Accelerated PBKDF2 + HMAC Pepper Engine ---
    async function computePepperedPbkdf2(password, salt) {
        const enc = new TextEncoder();
        const subtle = window.crypto && window.crypto.subtle;
        if (!subtle) {
            throw new Error("Web Cryptography API is not available on this device.");
        }

        // 1. HMAC-SHA256 with Pepper
        const hmacKey = await subtle.importKey(
            "raw",
            enc.encode(PEPPER),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const hmacSig = await subtle.sign("HMAC", hmacKey, enc.encode(password));
        const pepperedHex = Array.from(new Uint8Array(hmacSig))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        // 2. PBKDF2-HMAC-SHA256 with 100,000 iterations
        const pbkdfKey = await subtle.importKey(
            "raw",
            enc.encode(pepperedHex),
            { name: "PBKDF2" },
            false,
            ["deriveBits"]
        );
        const derivedBits = await subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: enc.encode(salt),
                iterations: 100000,
                hash: "SHA-256"
            },
            pbkdfKey,
            256
        );
        const derivedHex = Array.from(new Uint8Array(derivedBits))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        return `v2$12$${salt}$${derivedHex}`;
    }

    function generateRandomSaltHex(bytes = 16) {
        const array = new Uint8Array(bytes);
        window.crypto.getRandomValues(array);
        return Array.from(array)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    function normalizeCode(code) {
        return String(code || "").trim().replace(/\s|-/g, "").toUpperCase();
    }

    // --- Direct Cloud Firestore Client Public Interface ---
    const FirestoreDirect = {
        projectId: FIRESTORE_PROJECT_ID,

        // Test Cloud Firestore Connectivity
        async checkConnection() {
            try {
                const res = await fsFetch(`/users/admin%40example.com`);
                return {
                    ok: true,
                    backend: "Google Cloud Firestore (REST API)",
                    project: FIRESTORE_PROJECT_ID,
                    userSample: res.name ? "admin@example.com" : null
                };
            } catch (err) {
                return {
                    ok: false,
                    backend: "Google Cloud Firestore",
                    project: FIRESTORE_PROJECT_ID,
                    error: err.message
                };
            }
        },

        // Fetch single user by email (with automatic offline fallback & caching)
        async getUser(email) {
            const clean = (email || "").toLowerCase().trim();
            if (!clean) return null;
            try {
                const doc = await fsFetch(`/users/${encodeURIComponent(clean)}`);
                const user = firestoreDocToObj(doc);
                if (user) {
                    user.email = user.email || clean;
                    const is2faActive = Boolean(
                        user.two_factor_enabled === 1 ||
                        user.two_factor_enabled === "1" ||
                        user.two_factor_enabled === true ||
                        user.twoFactorEnabled === true ||
                        user.twoFactorEnabled === "true" ||
                        user.twoFactorEnabled === 1
                    );
                    user.two_factor_enabled = is2faActive ? 1 : 0;
                    user.twoFactorEnabled = is2faActive;
                    user.two_factor_secret = user.two_factor_secret || user.twoFactorSecret;
                    user.twoFactorSecret = user.two_factor_secret;
                    user.recovery_codes = user.recovery_codes || user.recoveryCodes || [];
                    user.recoveryCodes = user.recovery_codes;
                    try { localStorage.setItem("cached_fs_user_" + clean, JSON.stringify(user)); } catch (_) {}
                }
                return user;
            } catch (err) {
                if (err.status === 404) return null;
                // Offline fallback: check local storage cache or bundled seed data
                try {
                    const cached = localStorage.getItem("cached_fs_user_" + clean);
                    if (cached) return JSON.parse(cached);
                } catch (_) {}
                const seeds = window.DEFAULT_SEED_USERS || [];
                const found = seeds.find((u) => (u.email || "").toLowerCase() === clean);
                if (found) return JSON.parse(JSON.stringify(found));
                throw err;
            }
        },

        // Fetch all users (with automatic offline fallback & caching)
        async getAllUsers() {
            try {
                const res = await fsFetch("/users");
                const docs = res.documents || [];
                const list = docs.map((d) => {
                    const u = firestoreDocToObj(d);
                    const is2faActive = Boolean(
                        u.two_factor_enabled === 1 ||
                        u.two_factor_enabled === "1" ||
                        u.two_factor_enabled === true ||
                        u.twoFactorEnabled === true ||
                        u.twoFactorEnabled === "true" ||
                        u.twoFactorEnabled === 1
                    );
                    u.two_factor_enabled = is2faActive ? 1 : 0;
                    u.twoFactorEnabled = is2faActive;
                    u.two_factor_secret = u.two_factor_secret || u.twoFactorSecret;
                    u.twoFactorSecret = u.two_factor_secret;
                    u.recovery_codes = u.recovery_codes || u.recoveryCodes || [];
                    u.recoveryCodes = u.recovery_codes;
                    return u;
                });
                if (list.length > 0) {
                    try { localStorage.setItem("cached_fs_all_users", JSON.stringify(list)); } catch (_) {}
                }
                return list;
            } catch (err) {
                console.warn("[FirestoreDirect] getAllUsers offline fallback:", err.message);
                try {
                    const cached = localStorage.getItem("cached_fs_all_users");
                    if (cached) return JSON.parse(cached);
                } catch (_) {}
                return (window.DEFAULT_SEED_USERS || []).map((u) => JSON.parse(JSON.stringify(u)));
            }
        },

        // Authenticate user with PBKDF2 Salt & Pepper
        async login(email, password) {
            const clean = (email || "").toLowerCase().trim();
            if (!clean) throw new Error("Please enter your email address.");
            if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

            const user = await this.getUser(clean);
            if (!user) {
                throw new Error("Invalid email address or password.");
            }

            if (user.status === "disabled") {
                throw new Error("This account is currently disabled. Contact your administrator.");
            }

            if (!user.salt || !user.passwordHash) {
                throw new Error("User credentials record is corrupted in Cloud Firestore.");
            }

            // Verify password using hardware WebCrypto PBKDF2
            const computedStorageString = await computePepperedPbkdf2(password, user.salt);
            if (computedStorageString !== user.passwordHash) {
                // Log failed attempt to Firestore
                await this.addAuditLog("LOGIN_FAILED", clean, `Failed login attempt (incorrect password)`).catch(() => {});
                throw new Error("Invalid email address or password.");
            }

            // Success: log successful credential validation
            await this.addAuditLog("LOGIN_CREDENTIALS_ACCEPTED", user.name || clean, `User password accepted. Proceeding to 2FA verification.`).catch(() => {});

            return user;
        },

        // Consume emergency single-use recovery code
        async consumeRecoveryCode(email, rawCode) {
            const cleanEmail = (email || "").toLowerCase().trim();
            const target = normalizeCode(rawCode);

            const user = await this.getUser(cleanEmail);
            if (!user) throw new Error("User account not found.");

            const codes = (user.recovery_codes || user.recoveryCodes || []).map(String);
            const matchIndex = codes.findIndex((c) => normalizeCode(c) === target);

            if (matchIndex === -1) {
                throw new Error("This emergency recovery code is invalid or has already been used. Each recovery key is single-use and destroyed after authentication.");
            }

            // Remove matched code
            codes.splice(matchIndex, 1);
            user.recovery_codes = codes;
            user.recoveryCodes = codes;
            try { localStorage.setItem("cached_fs_user_" + cleanEmail, JSON.stringify(user)); } catch (_) {}

            // Update in Cloud Firestore (with graceful offline fallback)
            try {
                await fsFetch(`/users/${encodeURIComponent(cleanEmail)}?updateMask.fieldPaths=recovery_codes&updateMask.fieldPaths=recoveryCodes&updateMask.fieldPaths=updatedAt`, {
                    method: "PATCH",
                    body: {
                        fields: {
                            recovery_codes: {
                                arrayValue: {
                                    values: codes.map((c) => ({ stringValue: c }))
                                }
                            },
                            recoveryCodes: {
                                arrayValue: {
                                    values: codes.map((c) => ({ stringValue: c }))
                                }
                            },
                            updatedAt: { stringValue: new Date().toISOString() }
                        }
                    }
                });
            } catch (patchErr) {
                console.warn("[FirestoreDirect] Recovery code consumed in offline mode:", patchErr.message);
            }

            // Log consumption
            await this.addAuditLog(
                "RECOVERY_CODE_CONSUMED",
                user.name || cleanEmail,
                `Consumed emergency recovery key on device. ${codes.length} remaining.`
            ).catch(() => {});

            return {
                success: true,
                remainingCount: codes.length,
                remainingCodes: codes
            };
        },

        // Save generated recovery codes
        async saveRecoveryCodes(email, codesList) {
            const cleanEmail = (email || "").toLowerCase().trim();
            const formatted = (codesList || []).map(String);
            try {
                const u = await this.getUser(cleanEmail);
                if (u) {
                    u.recovery_codes = formatted;
                    u.recoveryCodes = formatted;
                    localStorage.setItem("cached_fs_user_" + cleanEmail, JSON.stringify(u));
                }
            } catch (_) {}

            try {
                await fsFetch(`/users/${encodeURIComponent(cleanEmail)}?updateMask.fieldPaths=recovery_codes&updateMask.fieldPaths=recoveryCodes&updateMask.fieldPaths=updatedAt`, {
                    method: "PATCH",
                    body: {
                        fields: {
                            recovery_codes: {
                                arrayValue: {
                                    values: formatted.map((c) => ({ stringValue: c }))
                                }
                            },
                            recoveryCodes: {
                                arrayValue: {
                                    values: formatted.map((c) => ({ stringValue: c }))
                                }
                            },
                            updatedAt: { stringValue: new Date().toISOString() }
                        }
                    }
                });
            } catch (saveErr) {
                console.warn("[FirestoreDirect] Saved recovery codes locally (offline mode):", saveErr.message);
            }

            await this.addAuditLog("RECOVERY_CODES_GENERATED", cleanEmail, `Generated ${formatted.length} new emergency recovery codes.`).catch(() => {});
            return true;
        },

        // Update 2FA status and secret
        async update2fa(email, enabled, secret = null) {
            const cleanEmail = (email || "").toLowerCase().trim();
            const boolEnabled = Boolean(
                enabled === true || enabled === 1 || enabled === "1" || enabled === "true"
            );
            const numEnabled = boolEnabled ? 1 : 0;

            const patchFields = {
                two_factor_enabled: { integerValue: String(numEnabled) },
                twoFactorEnabled: { booleanValue: boolEnabled },
                updatedAt: { stringValue: new Date().toISOString() }
            };

            let mask = "updateMask.fieldPaths=two_factor_enabled&updateMask.fieldPaths=twoFactorEnabled&updateMask.fieldPaths=updatedAt";
            if (secret) {
                patchFields.two_factor_secret = { stringValue: secret };
                patchFields.twoFactorSecret = { stringValue: secret };
                mask += "&updateMask.fieldPaths=two_factor_secret&updateMask.fieldPaths=twoFactorSecret";
            }

            // Sync all local caches immediately so changes are reflected across the device
            try {
                const cachedRaw = localStorage.getItem("cached_fs_user_" + cleanEmail);
                if (cachedRaw) {
                    const u = JSON.parse(cachedRaw);
                    u.two_factor_enabled = numEnabled;
                    u.twoFactorEnabled = boolEnabled;
                    if (secret) {
                        u.two_factor_secret = secret;
                        u.twoFactorSecret = secret;
                    }
                    localStorage.setItem("cached_fs_user_" + cleanEmail, JSON.stringify(u));
                }
            } catch (_) {}

            try {
                const cachedAll = localStorage.getItem("cached_fs_all_users");
                if (cachedAll) {
                    const all = JSON.parse(cachedAll);
                    const idx = all.findIndex((u) => (u.email || "").toLowerCase() === cleanEmail);
                    if (idx !== -1) {
                        all[idx].two_factor_enabled = numEnabled;
                        all[idx].twoFactorEnabled = boolEnabled;
                        if (secret) {
                            all[idx].two_factor_secret = secret;
                            all[idx].twoFactorSecret = secret;
                        }
                        localStorage.setItem("cached_fs_all_users", JSON.stringify(all));
                    }
                }
            } catch (_) {}

            try {
                const mobileUsersRaw = localStorage.getItem("secureapp_mobile_users");
                if (mobileUsersRaw) {
                    const mUsers = JSON.parse(mobileUsersRaw);
                    const idx = mUsers.findIndex((u) => (u.email || "").toLowerCase() === cleanEmail);
                    if (idx !== -1) {
                        mUsers[idx].two_factor_enabled = numEnabled;
                        mUsers[idx].twoFactorEnabled = boolEnabled;
                        if (secret) {
                            mUsers[idx].two_factor_secret = secret;
                            mUsers[idx].twoFactorSecret = secret;
                        }
                        localStorage.setItem("secureapp_mobile_users", JSON.stringify(mUsers));
                    }
                }
            } catch (_) {}

            await fsFetch(`/users/${encodeURIComponent(cleanEmail)}?${mask}`, {
                method: "PATCH",
                body: { fields: patchFields }
            });

            await this.addAuditLog("TWO_FACTOR_UPDATED", cleanEmail, `Two-Factor Authentication set to ${boolEnabled ? "ENABLED" : "DISABLED"}`).catch(() => {});
            return true;
        },

        // Update arbitrary user fields
        async updateUser(email, updates = {}) {
            const cleanEmail = (email || "").toLowerCase().trim();
            const fields = {};
            const masks = [];

            for (const [key, val] of Object.entries(updates)) {
                masks.push(`updateMask.fieldPaths=${key}`);
                if (typeof val === "string") fields[key] = { stringValue: val };
                else if (typeof val === "number") fields[key] = { integerValue: String(val) };
                else if (typeof val === "boolean") fields[key] = { booleanValue: val };
                else if (val === null) fields[key] = { nullValue: null };
            }

            fields.updatedAt = { stringValue: new Date().toISOString() };
            masks.push("updateMask.fieldPaths=updatedAt");

            await fsFetch(`/users/${encodeURIComponent(cleanEmail)}?${masks.join("&")}`, {
                method: "PATCH",
                body: { fields }
            });

            await this.addAuditLog("USER_UPDATED", cleanEmail, `Updated fields: ${Object.keys(updates).join(", ")}`).catch(() => {});
            return true;
        },

        // Register new user with PBKDF2 hash & salt
        async registerUser(userData) {
            const cleanEmail = (userData.email || "").toLowerCase().trim();
            const existing = await this.getUser(cleanEmail);
            if (existing) {
                throw new Error("A user account with this email address already exists.");
            }

            const salt = generateRandomSaltHex(16);
            const passwordHash = await computePepperedPbkdf2(userData.password, salt);

            const newUserDoc = {
                id: `usr_${Date.now()}`,
                name: userData.name || "User",
                email: cleanEmail,
                role: userData.role || "user",
                department: userData.department || null,
                status: "active",
                salt: salt,
                passwordHash: passwordHash,
                two_factor_enabled: userData.twoFactorEnabled ? 1 : 0,
                twoFactorEnabled: Boolean(userData.twoFactorEnabled),
                two_factor_secret: userData.twoFactorSecret || null,
                twoFactorSecret: userData.twoFactorSecret || null,
                recovery_codes: [],
                recoveryCodes: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await fsFetch(`/users/${encodeURIComponent(cleanEmail)}`, {
                method: "PATCH",
                body: { fields: objToFirestoreFields(newUserDoc) }
            });

            await this.addAuditLog("USER_REGISTERED", cleanEmail, `New user registered with role: ${newUserDoc.role}`).catch(() => {});
            return newUserDoc;
        },

        // Delete user
        async deleteUser(email) {
            const cleanEmail = (email || "").toLowerCase().trim();
            await fsFetch(`/users/${encodeURIComponent(cleanEmail)}`, {
                method: "DELETE"
            });
            await this.addAuditLog("USER_DELETED", cleanEmail, `User account deleted from Cloud Firestore`).catch(() => {});
            return true;
        },

        // Products
        async getProducts() {
            try {
                const res = await fsFetch("/products");
                return (res.documents || []).map(firestoreDocToObj);
            } catch (err) {
                console.warn("[FirestoreDirect] getProducts:", err);
                return [];
            }
        },

        async saveProduct(product) {
            const id = product.id ? String(product.id) : `prod_${Date.now()}`;
            product.id = id;
            await fsFetch(`/products/${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: { fields: objToFirestoreFields(product) }
            });
            return product;
        },

        // Sales
        async getSales() {
            try {
                const res = await fsFetch("/sales");
                return (res.documents || []).map(firestoreDocToObj);
            } catch (err) {
                console.warn("[FirestoreDirect] getSales:", err);
                return [];
            }
        },

        async recordSale(sale) {
            const id = sale.id ? String(sale.id) : `sale_${Date.now()}`;
            sale.id = id;
            await fsFetch(`/sales/${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: { fields: objToFirestoreFields(sale) }
            });
            return sale;
        },

        // Audit Logs (with automatic offline fallback & caching)
        async getAuditLogs() {
            try {
                const res = await fsFetch("/audit_logs");
                const logs = (res.documents || []).map(firestoreDocToObj);
                if (logs.length > 0) {
                    try { localStorage.setItem("cached_fs_logs", JSON.stringify(logs)); } catch (_) {}
                }
                return logs;
            } catch (err) {
                console.warn("[FirestoreDirect] getAuditLogs offline fallback:", err.message);
                try {
                    const cached = localStorage.getItem("cached_fs_logs");
                    if (cached) return JSON.parse(cached);
                } catch (_) {}
                return (window.DEFAULT_SEED_LOGS || []).map((l) => JSON.parse(JSON.stringify(l)));
            }
        },

        async addAuditLog(action, actor, details) {
            try {
                const logObj = {
                    action: action || "ACTION",
                    actor: actor || "System",
                    details: details || "",
                    account: actor || "System",
                    created_at: new Date().toISOString(),
                    timestamp: new Date().toISOString()
                };
                await fsFetch("/audit_logs", {
                    method: "POST",
                    body: { fields: objToFirestoreFields(logObj) }
                });
            } catch (e) {
                console.warn("[FirestoreDirect] addAuditLog warning:", e.message);
            }
        },

        // Mail Cloud Relay Configuration (Enables cellular mobile data email delivery)
        async getMailConfig() {
            try {
                const res = await fsFetch("/config/mail");
                return firestoreDocToObj(res);
            } catch (err) {
                console.warn("[FirestoreDirect] getMailConfig:", err.message);
                return null;
            }
        },

        async saveMailConfig(config) {
            try {
                const clean = {
                    provider: config.provider || "google_apps_script",
                    relayUrl: config.relayUrl ? config.relayUrl.trim() : "",
                    updatedAt: new Date().toISOString()
                };
                await fsFetch("/config/mail", {
                    method: "PATCH",
                    body: { fields: objToFirestoreFields(clean) }
                });
                return clean;
            } catch (err) {
                console.warn("[FirestoreDirect] saveMailConfig error:", err.message);
                throw err;
            }
        }
    };

    window.FirestoreDirect = FirestoreDirect;
    console.log("[FirestoreDirect] Initialized direct Google Cloud Firestore client for project:", FIRESTORE_PROJECT_ID);
})(window);
