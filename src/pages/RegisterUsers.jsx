import { useEffect, useState } from "react";
import axios from "axios";
import "./RegisterUsers.css";

// USER SERVER (5001)
const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5001"
    : "https://user-register-server-5001.onrender.com";

// DEPOSIT SERVER (5002)
const DEPOSIT_API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5002"
    : "https://deposit-and-join-tournament-server-5002.onrender.com";

// ADMIN JWT AUTH
const getAdminAuthConfig = () => {
  const token = localStorage.getItem("adminToken");

  if (!token) {
    throw new Error("Admin token missing. Please login again.");
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const formatDate = (dateValue) => {
  if (!dateValue) return "—";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

const RegisterUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({
      message,
      type,
      id: Date.now(),
    });
  };

  // LOAD USERS FROM SERVER 5001
  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      console.log(
        "🔍 Loading BGMI users from 5001:",
        `${API_BASE}/api/admin/users`
      );

      const res = await axios.get(
        `${API_BASE}/api/admin/users`,
        getAdminAuthConfig()
      );

      console.log("🔍 API Response:", res.data);

      if (!res.data?.users?.length) {
        setUsers([]);
        console.log("✅ ADMIN USERS LOADED: 0 users");
        return;
      }

      const list = res.data.users.map((u, idx) => ({
        id: u.id,
        index: idx + 1,
        profileId: u.profile_id,
        name: u.username,
        email: u.email,
        userPassword: u["User Password"] || "******",
        balance: Number(u.balance) || 0,
        register_time_ist: u.register_time_ist,
        createdAt: u.register_time_ist || u.createdAt,
      }));

      setUsers(list);

      console.log("✅ ADMIN USERS LOADED:", list.length, "users");
    } catch (err) {
      console.error(
        "❌ Load users error:",
        err.response?.data || err.message
      );

      setError(
        `Failed to load users: ${
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.response?.statusText ||
          err.message ||
          "Server not reachable"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // CLEAR APPROVED DEPOSITS - SERVER 5002
  const clearApprovedHistory = async (profileId) => {
    try {
      console.log("🧹 Clearing approved history for:", profileId);

      const res = await axios.delete(
        `${DEPOSIT_API_BASE}/api/admin/clear-approved/${profileId}`,
        getAdminAuthConfig()
      );

      console.log("✅ DEPOSIT SERVER RESPONSE:", res.data);

      if (res.data?.success) {
        showToast(
          `${res.data.cleared || 0} approved deposits cleared. Wallet balance was not changed by this request.`,
          "success"
        );

        await loadUsers();
      } else {
        showToast(
          res.data?.message || "Server returned an unsuccessful response.",
          "error"
        );
      }
    } catch (err) {
      console.error(
        "❌ Clear history error:",
        err.response?.status,
        err.response?.data || err.message
      );

      showToast(
        `Clear failed: ${
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Please try again"
        }`,
        "error"
      );
    }
  };

  // DELETE USER - SERVER 5001
  const handleDelete = async (id) => {
    try {
      await axios.delete(
        `${API_BASE}/api/admin/users/${id}`,
        getAdminAuthConfig()
      );

      console.log("🗑️ User deleted:", id);

      showToast("Player deleted successfully.", "success");

      await loadUsers();
    } catch (err) {
      console.error(
        "Delete error:",
        err.response?.data || err.message
      );

      showToast(
        `Delete failed: ${
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Please try again"
        }`,
        "error"
      );
    }
  };

  // OPEN CUSTOM CONFIRMATION
  const requestAction = (type, user) => {
    setPendingAction({ type, user });
  };

  // CONFIRM ACTION
  const executePendingAction = async () => {
    if (!pendingAction || actionLoading) return;

    const action = pendingAction;

    setPendingAction(null);
    setActionLoading(true);

    try {
      if (action.type === "clear") {
        await clearApprovedHistory(action.user.profileId);
      }

      if (action.type === "delete") {
        await handleDelete(action.user.id);
      }
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // AUTO-HIDE TOAST
  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast]);

  const isClearAction = pendingAction?.type === "clear";

  return (
    <div className="register-page">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`register-toast ${toast.type}`}
          role="status"
          key={toast.id}
        >
          <span className="register-toast-icon">
            {toast.type === "success" ? "✓" : "!"}
          </span>

          <span className="register-toast-message">
            {toast.message}
          </span>

          <button
            type="button"
            className="register-toast-close"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* PAGE HEADER */}
      <header className="register-header">
        <div className="register-heading">
          <div className="register-eyebrow">
            <span className="register-eyebrow-line" />
            ESPORTS CONTROL CENTER
          </div>

          <h1>
            Registered <span>Players</span>
          </h1>

          <p>
            Manage BGMI player accounts, wallet information and registration
            records.
          </p>
        </div>

        <div className="register-header-actions">
          <div className="register-player-count">
            <span className="register-count-icon">♟</span>
            <div>
              <strong>{users.length}</strong>
              <small>TOTAL PLAYERS</small>
            </div>
          </div>

          <button
            type="button"
            className="register-refresh-btn"
            onClick={loadUsers}
            disabled={loading}
          >
            <span className={loading ? "refresh-spinning" : ""}>↻</span>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="register-error">
          <span className="register-error-icon">!</span>

          <div className="register-error-content">
            <strong>Unable to load players</strong>
            <p>{error}</p>
            <small>Check your backend connection and admin login.</small>
          </div>

          <button
            type="button"
            onClick={loadUsers}
            className="register-error-retry"
          >
            Retry
          </button>
        </div>
      )}

      {/* TABLE PANEL */}
      <section className="register-panel">
        <div className="register-panel-header">
          <div>
            <div className="register-panel-kicker">
              <span className="register-live-dot" />
              PLAYER DATABASE
            </div>

            <h2>All Registered Accounts</h2>

            <p>Player details fetched from the registration server.</p>
          </div>

          <div className="register-table-count">
            {users.length} RECORDS
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="register-loading">
            <div className="register-loader" />
            <strong>Loading BGMI players...</strong>
            <span>Connecting to player database</span>
          </div>
        ) : (
          <div className="register-table-scroll">
            <table className="register-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>PROFILE ID</th>
                  <th>PLAYER</th>
                  <th>EMAIL ADDRESS</th>
                  <th className="center-cell">PASSWORD</th>
                  <th className="center-cell">BALANCE</th>
                  <th>REGISTER TIME</th>
                  <th className="center-cell">ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="register-index">{user.index}</td>

                    <td>
                      <span className="register-profile-id">
                        {user.profileId || "—"}
                      </span>
                    </td>

                    <td>
                      <div className="register-player">
                        <span className="register-player-avatar">
                          {(user.name || "P").charAt(0).toUpperCase()}
                        </span>

                        <strong>{user.name || "Unknown Player"}</strong>
                      </div>
                    </td>

                    <td className="register-email">
                      {user.email || "—"}
                    </td>

                    <td className="center-cell">
                      <span className="register-password">
                        {user.userPassword}
                      </span>
                    </td>

                    <td className="center-cell">
                      <span
                        className={`register-balance ${
                          user.balance > 0 ? "has-balance" : ""
                        }`}
                      >
                        ₹{user.balance.toLocaleString("en-IN")}
                      </span>
                    </td>

                    <td className="register-date">
                      {formatDate(user.createdAt)}
                    </td>

                    <td>
                      <div className="register-actions">
                        <button
                          type="button"
                          className="register-action-btn clear-btn"
                          onClick={() => requestAction("clear", user)}
                          disabled={actionLoading}
                          title="Clear approved deposit history"
                        >
                          <span>⌫</span>
                          Clear
                        </button>

                        <button
                          type="button"
                          className="register-action-btn edit-btn"
                          disabled
                          title="Coming soon"
                        >
                          <span>✎</span>
                          Edit
                        </button>

                        <button
                          type="button"
                          className="register-action-btn delete-btn"
                          onClick={() => requestAction("delete", user)}
                          disabled={actionLoading}
                          title="Delete player permanently"
                        >
                          <span>×</span>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan="8">
                      <div className="register-empty">
                        <div className="register-empty-icon">♟</div>
                        <strong>No players found</strong>
                        <p>
                          Registered BGMI players will appear here.
                        </p>

                        <button
                          type="button"
                          onClick={loadUsers}
                          className="register-empty-refresh"
                        >
                          Refresh list
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="register-panel-footer">
          <span>
            <i className="register-footer-dot" />
            DATABASE CONNECTION
          </span>

          <span>
            SOURCE: <strong>USER SERVER · PORT 5001</strong>
          </span>
        </div>
      </section>

      {/* CUSTOM CONFIRMATION MODAL */}
      {pendingAction && (
        <div
          className="register-modal-backdrop"
          onClick={() => !actionLoading && setPendingAction(null)}
        >
          <div
            className="register-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`register-confirm-icon ${
                isClearAction ? "confirm-clear" : "confirm-delete"
              }`}
            >
              {isClearAction ? "⌫" : "!"}
            </div>

            <div className="register-confirm-kicker">
              ADMIN CONFIRMATION
            </div>

            <h2 id="register-confirm-title">
              {isClearAction ? "Clear approved history?" : "Delete player?"}
            </h2>

            <p>
              {isClearAction
                ? `You are about to clear approved deposit history for ${pendingAction.user.profileId}. This request targets deposit history on server 5002.`
                : `You are about to permanently delete ${pendingAction.user.name || "this player"} from the registration server.`}
            </p>

            {isClearAction && (
              <div className="register-wallet-note">
                <span>i</span>
                This action is intended to clear approved deposit history only.
                Verify your backend endpoint behavior before confirming.
              </div>
            )}

            <div className="register-confirm-actions">
              <button
                type="button"
                className="register-cancel-btn"
                onClick={() => setPendingAction(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`register-confirm-btn ${
                  isClearAction ? "confirm-clear-btn" : "confirm-delete-btn"
                }`}
                onClick={executePendingAction}
                disabled={actionLoading}
              >
                {actionLoading
                  ? "Please wait..."
                  : isClearAction
                  ? "Yes, clear history"
                  : "Yes, delete player"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterUsers;