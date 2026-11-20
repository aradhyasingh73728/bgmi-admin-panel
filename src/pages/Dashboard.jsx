
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "./Dashboard.css";

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5004"
    : "https://bgmi-admin-dashboard-server-5004.onrender.com";

// ============================================================
// HELPERS
// ============================================================

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const timeAgo = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const diff = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
};

const activityIcon = {
  deposit: "💰",
  withdraw: "💸",
};

const activityTitle = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
};

// ============================================================
// DASHBOARD
// ============================================================

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [toast, setToast] = useState(null);

  // ==========================================================
  // CUSTOM UI NOTIFICATION
  // ==========================================================

  const showToast = useCallback((message, type = "success") => {
    setToast({
      id: Date.now(),
      message,
      type,
    });
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => clearTimeout(timer);
  }, [toast]);

  // ==========================================================
  // LOAD DASHBOARD
  // ==========================================================

  const loadDashboard = useCallback(
    async (silent = false, notify = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const token = localStorage.getItem("adminToken");

        if (!token) {
          throw new Error(
            "Admin session missing. Please login again."
          );
        }

        const res = await fetch(
          `${API_BASE}/api/admin/dashboard-overview`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = await res.json();

        if (!res.ok || !result.success) {
          throw new Error(
            result.error || `HTTP ${res.status}`
          );
        }

        setData(result);

        setLastUpdated(
          new Date(result.generatedAt || Date.now())
        );

        if (notify) {
          showToast("Dashboard updated successfully.", "success");
        }
      } catch (err) {
        console.error("Dashboard load error:", err);

        const message =
          err.message || "Dashboard data load failed.";

        setError(message);

        if (notify) {
          showToast(message, "error");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast]
  );

  // ==========================================================
  // INITIAL LOAD + AUTO REFRESH
  // ==========================================================

  useEffect(() => {
    loadDashboard(false);

    const timer = setInterval(() => {
      loadDashboard(true);
    }, 10000);

    return () => clearInterval(timer);
  }, [loadDashboard]);

  // ==========================================================
  // SUMMARY CARDS
  // ==========================================================

  const summary = useMemo(() => {
    const stats = data?.stats || {};

    return [
      {
        icon: "👥",
        label: "Registered Users",
        value: stats.users?.total || 0,
        meta: `${stats.users?.verified || 0} verified`,
        tone: "blue",
      },
      {
        icon: "💳",
        label: "Wallet Balance",
        value: money(stats.users?.walletBalance),
        meta: "Total user wallet funds",
        tone: "green",
      },
      {
        icon: "⏳",
        label: "Pending Deposits",
        value: stats.deposits?.pending || 0,
        meta: money(stats.deposits?.pendingAmount),
        tone: "yellow",
      },
      {
        icon: "💸",
        label: "Pending Withdrawals",
        value: stats.withdrawals?.pending || 0,
        meta: money(stats.withdrawals?.pendingAmount),
        tone: "red",
      },
    ];
  }, [data]);

  const recentActivity = useMemo(() => {
    return (data?.recentActivity || []).filter((item) =>
      ["deposit", "withdraw"].includes(
        String(item.type).toLowerCase()
      )
    );
  }, [data]);

  // ==========================================================
  // INITIAL LOADING
  // ==========================================================

  if (loading && !data) {
    return (
      <div className="admin-dashboard loading-state">
        <div className="loading-content">
          <div className="gaming-loader" />
          <h2>BGMI ADMIN</h2>
          <p>Loading control center...</p>
          <span className="loading-line" />
        </div>
      </div>
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="admin-dashboard">
      {/* CUSTOM NOTIFICATION */}

      {toast && (
        <div
          key={toast.id}
          className={`dashboard-toast ${toast.type}`}
          role="status"
          aria-live="polite"
        >
          <span className="toast-icon">
            {toast.type === "success" ? "✓" : "!"}
          </span>

          <span className="toast-message">
            {toast.message}
          </span>

          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* TOP BAR */}

      <header className="dashboard-topbar">
        <div className="dashboard-heading">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            ADMIN CONTROL CENTER
          </div>

          <h1>
            BGMI <span>ADMIN</span>
          </h1>

          <p>
            Manage your gaming platform from one powerful
            control center.
          </p>
        </div>

        <div className="dashboard-top-actions">
          <div className="live-status">
            <span className="live-dot" />
            LIVE SYSTEM
          </div>

          <div className="updated-text">
            <span className="updated-label">
              LAST SYNC
            </span>

            <strong>
              {lastUpdated
                ? lastUpdated.toLocaleTimeString("en-IN")
                : "Updating..."}
            </strong>
          </div>

          <button
            type="button"
            className="refresh-dashboard"
            onClick={() => loadDashboard(true, true)}
            disabled={refreshing}
          >
            <span className={refreshing ? "refresh-icon spinning" : "refresh-icon"}>
              ↻
            </span>

            {refreshing ? "Updating..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* ERROR PANEL */}

      {error && (
        <div className="dashboard-alert" role="alert">
          <div className="alert-symbol">!</div>

          <div className="alert-content">
            <strong>Connection issue</strong>
            <span>{error}</span>
          </div>

          <button
            type="button"
            className="alert-retry"
            onClick={() => loadDashboard(true, true)}
            disabled={refreshing}
          >
            Retry
          </button>
        </div>
      )}

      {/* SECTION LABEL */}

      <div className="section-label">
        <span className="section-indicator" />
        PLATFORM OVERVIEW
      </div>

      {/* SUMMARY CARDS */}

      <div className="stat-grid">
        {summary.map((item) => (
          <article
            className={`stat-card ${item.tone}`}
            key={item.label}
          >
            <div className="stat-card-top">
              <div className="stat-icon">
                {item.icon}
              </div>

              <span className="stat-card-mark">
                ●
              </span>
            </div>

            <div className="stat-content">
              <div className="stat-label">
                {item.label}
              </div>

              <div className="stat-value">
                {item.value}
              </div>

              <div className="stat-meta">
                {item.meta}
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* ANALYTICS */}

      <div className="section-label">
        <span className="section-indicator" />
        SYSTEM ANALYTICS
      </div>

      <div className="analytics-grid">
        {/* FINANCIAL OVERVIEW */}

        <section className="panel financial-panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">
                WALLET & TRANSACTIONS
              </span>

              <h2>Financial Overview</h2>

              <p>
                Approved wallet activity and bank account
                statistics.
              </p>
            </div>

            <div className="panel-head-icon">
              ₹
            </div>
          </div>

          <div className="finance-grid">
            <div className="finance-item">
              <span>Approved Deposits</span>
              <strong>
                {money(
                  data?.stats?.deposits?.approvedAmount
                )}
              </strong>
            </div>

            <div className="finance-item">
              <span>Approved Withdrawals</span>
              <strong>
                {money(
                  data?.stats?.withdrawals?.approvedAmount
                )}
              </strong>
            </div>

            <div className="finance-item">
              <span>Verified Bank Accounts</span>
              <strong>
                {data?.stats?.banks?.verified || 0}
              </strong>
            </div>

            <div className="finance-item">
              <span>Total Bank Accounts</span>
              <strong>
                {data?.stats?.banks?.total || 0}
              </strong>
            </div>
          </div>
        </section>

        {/* SYSTEM MODULES */}

        <section className="panel modules-panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">
                SERVER HEALTH
              </span>

              <h2>System Modules</h2>

              <p>
                Live connectivity status of each module.
              </p>
            </div>

            <div className="panel-head-icon">
              ⚙
            </div>
          </div>

          <div className="module-list">
            {Object.entries(data?.modules || {}).map(
              ([name, ok]) => (
                <div className="module-row" key={name}>
                  <span className="module-name">
                    <span className="module-mini-dot" />
                    {name.replace(
                      /^./,
                      (c) => c.toUpperCase()
                    )}
                  </span>

                  <span
                    className={`module-badge ${
                      ok ? "ok" : "down"
                    }`}
                  >
                    <span className="module-status-dot" />
                    {ok ? "ONLINE" : "ERROR"}
                  </span>
                </div>
              )
            )}

            {Object.keys(data?.modules || {}).length === 0 && (
              <div className="empty-row">
                Module information is not available.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* LIVE ACTIVITY */}

      <div className="section-label">
        <span className="section-indicator" />
        RECENT TRANSACTIONS
      </div>

      <section className="panel activity-panel">
        <div className="panel-head">
          <div>
            <span className="panel-kicker">
              REAL-TIME FEED
            </span>

            <h2>Live Activity</h2>

            <p>
              Latest deposit and withdrawal events.
            </p>
          </div>

          <div className="activity-live-tag">
            <span className="live-dot" />
            LIVE FEED
          </div>
        </div>

        <div className="activity-list">
          {recentActivity.map((item) => {
            const type = String(item.type).toLowerCase();

            return (
              <div
                className="activity-item"
                key={item.id}
              >
                <div className={`activity-icon ${type}`}>
                  {activityIcon[type] || "•"}
                </div>

                <div className="activity-main">
                  <strong>
                    {item.title || activityTitle[type]}
                  </strong>

                  <span>{item.subtitle || "—"}</span>

                  <small>
                    {activityTitle[type] || type}
                    {" · "}
                    {timeAgo(item.timestamp)}
                  </small>
                </div>

                <div className="activity-right">
                  {Number(item.amount || 0) > 0 && (
                    <strong>
                      {money(item.amount)}
                    </strong>
                  )}

                  <span
                    className={`activity-status ${String(
                      item.status || ""
                    )
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {item.status || "—"}
                  </span>
                </div>
              </div>
            );
          })}

          {recentActivity.length === 0 && (
            <div className="empty-row">
              <span className="empty-icon">⌁</span>
              <strong>No recent activity</strong>
              <span>
                Deposit and withdrawal updates will appear here.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}

      <footer className="footer-strip">
        <div className="footer-status">
          <span className="footer-dot" />
          <span>DATABASE</span>

          <b
            className={
              data?.modules?.database
                ? "online-text"
                : "error-text"
            }
          >
            {data?.modules?.database
              ? "CONNECTED"
              : "ISSUE DETECTED"}
          </b>
        </div>

        <div className="footer-info">
          AUTO REFRESH: <b>10 SECONDS</b>
        </div>

        <div className="footer-info footer-scope">
          SCOPE:{" "}
          <b>
            USERS · WALLET · DEPOSITS · WITHDRAWALS · BANKS
          </b>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
