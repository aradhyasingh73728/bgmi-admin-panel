
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./SecurityManagement.css";

const API_BASE = import.meta.env.DEV
  ? "http://localhost:5004/api/admin"
  : "https://bgmi-admin-dashboard-server-5004.onrender.com/api/admin";

const ADMIN_AUTH_API = import.meta.env.DEV
  ? "http://localhost:5000/admin"
  : "https://admin-login-server-5000.onrender.com/admin";

function SecurityManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [sessionRevoking, setSessionRevoking] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [toast, setToast] = useState(null);

  // DEVICE MANAGEMENT
  const [expandedProfile, setExpandedProfile] = useState("");
  const [devicesByProfile, setDevicesByProfile] = useState({});
  const [deviceLoading, setDeviceLoading] = useState("");
  const [deviceActionLoading, setDeviceActionLoading] = useState("");

  // CUSTOM DIALOG
  const [dialog, setDialog] = useState(null);
  const [dialogReason, setDialogReason] = useState("");
  const [dialogPermanent, setDialogPermanent] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);

  // =====================================================
  // NOTIFICATIONS
  // =====================================================

  const showToast = (message, type = "success") => {
    setToast({ message, type, id: Date.now() });
  };

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!success && !error) return;

    const timer = setTimeout(() => {
      setSuccess("");
      setError("");
    }, 6000);

    return () => clearTimeout(timer);
  }, [success, error]);

  // =====================================================
  // AUTH HELPERS
  // =====================================================

  const getToken = () => localStorage.getItem("adminToken");

  const apiRequest = useCallback(async (url, options = {}) => {
    const token = getToken();

    if (!token) {
      throw new Error("Admin token not found. Please login again.");
    }

    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      throw new Error("Admin authentication failed. Please login again.");
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.error || "Request failed.");
    }

    return data;
  }, []);

  // =====================================================
  // LOAD USERS
  // =====================================================

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/users");

      if (!Array.isArray(data.users)) {
        throw new Error("Invalid users response from server.");
      }

      setUsers(data.users);
    } catch (err) {
      setError(err.message || "Unable to load players.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // =====================================================
  // LOAD PLAYER DEVICES
  // =====================================================

  const loadPlayerDevices = async (profileId) => {
    if (!profileId) return;

    setDeviceLoading(profileId);
    setError("");

    try {
      const data = await apiRequest(
        `/users/${encodeURIComponent(profileId)}/devices`
      );

      if (!Array.isArray(data.devices)) {
        throw new Error("Invalid devices response from server.");
      }

      setDevicesByProfile((previous) => ({
        ...previous,
        [profileId]: data.devices,
      }));
    } catch (err) {
      setError(err.message || "Unable to load player devices.");
    } finally {
      setDeviceLoading("");
    }
  };

  const toggleDevices = async (profileId) => {
    if (!profileId) return;

    if (expandedProfile === profileId) {
      setExpandedProfile("");
      return;
    }

    setExpandedProfile(profileId);
    setDialog(null);

    await loadPlayerDevices(profileId);
  };

  // =====================================================
  // CUSTOM DIALOG HELPERS
  // =====================================================

  const closeDialog = () => {
    if (dialogLoading) return;

    setDialog(null);
    setDialogReason("");
    setDialogPermanent(false);
  };

  const openDialog = (type, payload = {}) => {
    setError("");
    setSuccess("");
    setDialogReason("");
    setDialogPermanent(false);
    setDialog({ type, ...payload });
  };

  // =====================================================
  // REVOKE ALL ADMIN SESSIONS
  // =====================================================

  const revokeAllAdminSessions = async () => {
    const token = getToken();

    if (!token) {
      setError("Admin token not found. Please login again.");
      return;
    }

    setSessionRevoking(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${ADMIN_AUTH_API}/logout-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || "Unable to revoke admin sessions."
        );
      }

      showToast(
        data.message || "All admin sessions revoked successfully.",
        "success"
      );

      localStorage.removeItem("adminToken");
      localStorage.removeItem("bgmi_admin_logged_in");

      window.location.href = "/admin-login";
    } catch (err) {
      setError(err.message || "Session revocation failed.");
    } finally {
      setSessionRevoking(false);
    }
  };

  // =====================================================
  // DEVICE BAN
  // =====================================================

  const submitDeviceBan = async (user, device) => {
    const profileId = user.profile_id;

    if (!profileId || !device.installation_id) {
      setError("Player ID or installation ID is missing.");
      return;
    }

    const reason = dialogReason.trim();

    if (!reason) {
      setError("Device ban reason is required.");
      return;
    }

    const permanent = dialogPermanent === true;

    setDeviceActionLoading(device.installation_id);
    setDialogLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest("/devices/ban", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profileId,
          installation_id: device.installation_id,
          reason,
          is_permanent: permanent,
        }),
      });

      showToast(
        data.message ||
          (permanent
            ? "Device permanently banned successfully."
            : "Device banned for 30 days successfully."),
        "success"
      );

      setDialog(null);
      setDialogReason("");
      setDialogPermanent(false);

      await loadPlayerDevices(profileId);
    } catch (err) {
      setError(err.message || "Unable to ban device.");
    } finally {
      setDeviceActionLoading("");
      setDialogLoading(false);
    }
  };

  // =====================================================
  // DEVICE UNBAN
  // =====================================================

  const unbanDevice = async (user, device) => {
    if (!device.ban_id) {
      setError("Device ban ID is missing.");
      return;
    }

    setDeviceActionLoading(device.installation_id);
    setDialogLoading(true);
    setError("");

    try {
      const data = await apiRequest(
        `/devices/${encodeURIComponent(device.ban_id)}`,
        { method: "DELETE" }
      );

      showToast(data.message || "Device unbanned successfully.", "success");

      setDialog(null);
      await loadPlayerDevices(user.profile_id);
    } catch (err) {
      setError(err.message || "Unable to unban device.");
    } finally {
      setDeviceActionLoading("");
      setDialogLoading(false);
    }
  };

  // =====================================================
  // ACCOUNT SECURITY ACTIONS
  // =====================================================

  const performAction = async (user, action) => {
    const profileId = user.profile_id;

    if (!profileId) {
      setError("Player Profile ID is missing.");
      return;
    }

    const reason = dialogReason.trim();

    if (action === "suspend" || action === "ban") {
      if (!reason) {
        setError(
          action === "suspend"
            ? "Suspension reason is required."
            : "Permanent ban reason is required."
        );
        return;
      }
    }

    const endpoint =
      action === "suspend"
        ? `/users/${encodeURIComponent(profileId)}/suspend`
        : action === "unsuspend"
        ? `/users/${encodeURIComponent(profileId)}/unsuspend`
        : `/users/${encodeURIComponent(profileId)}/ban`;

    setActionLoading(`${profileId}-${action}`);
    setDialogLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          reason:
            action === "unsuspend"
              ? "Account reactivated by admin"
              : reason,
        }),
      });

      showToast(
        data.message || `Player ${action} action completed successfully.`,
        "success"
      );

      setDialog(null);
      setDialogReason("");

      await loadUsers();

      if (devicesByProfile[profileId]) {
        await loadPlayerDevices(profileId);
      }
    } catch (err) {
      setError(err.message || "Security action failed.");
    } finally {
      setActionLoading("");
      setDialogLoading(false);
    }
  };

  // =====================================================
  // EXECUTE CUSTOM DIALOG ACTION
  // =====================================================

  const executeDialog = async () => {
    if (!dialog || dialogLoading) return;

    if (dialog.type === "revoke") {
      setDialog(null);
      await revokeAllAdminSessions();
      return;
    }

    if (dialog.type === "suspend" || dialog.type === "ban" ||
        dialog.type === "unsuspend") {
      await performAction(dialog.user, dialog.type);
      return;
    }

    if (dialog.type === "device-ban") {
      await submitDeviceBan(dialog.user, dialog.device);
      return;
    }

    if (dialog.type === "device-unban") {
      await unbanDevice(dialog.user, dialog.device);
    }
  };

  // =====================================================
  // SEARCH AND FILTER
  // =====================================================

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        String(user.username || "").toLowerCase().includes(query) ||
        String(user.profile_id || "").toLowerCase().includes(query) ||
        String(user.email || "").toLowerCase().includes(query);

      const status = String(user.account_status || "active").toLowerCase();

      const matchesStatus =
        statusFilter === "all" || status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [users, search, statusFilter]);

  const activeCount = users.filter(
    (u) => String(u.account_status || "active").toLowerCase() === "active"
  ).length;

  const suspendedCount = users.filter(
    (u) => String(u.account_status || "").toLowerCase() === "suspended"
  ).length;

  const bannedCount = users.filter(
    (u) => String(u.account_status || "").toLowerCase() === "banned"
  ).length;

  // =====================================================
  // HELPERS
  // =====================================================

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
  };

  const getStatus = (user) =>
    String(user.account_status || "active").toLowerCase();

  const getDeviceStatus = (device) => {
    if (!device.is_banned) return "ACTIVE";
    if (device.is_permanent) return "PERMANENTLY BANNED";

    if (
      device.expires_at &&
      new Date(device.expires_at).getTime() <= Date.now()
    ) {
      return "EXPIRED";
    }

    return "SUSPENDED";
  };

  const dialogTitle = {
    revoke: "Revoke all admin sessions?",
    suspend: "Suspend this player?",
    ban: "Permanently ban this player?",
    unsuspend: "Reactivate this player?",
    "device-ban": "Ban this device?",
    "device-unban": "Unban this device?",
  };

  const dialogDescription = {
    revoke:
      "Every admin login session will be revoked. All admins will need to login again.",
    suspend:
      "The selected player will be suspended for 30 days. Enter a reason to continue.",
    ban:
      "This is a permanent account ban. The current API does not provide an unban action for permanently banned accounts.",
    unsuspend:
      "This player account will be reactivated.",
    "device-ban":
      "Choose a 30-day or permanent device ban and enter a reason.",
    "device-unban":
      "This device will be allowed to register and login again.",
  };

  const dialogNeedsReason =
    dialog?.type === "suspend" ||
    dialog?.type === "ban" ||
    dialog?.type === "device-ban";

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="security-page">
      {/* TOAST */}
      {toast && (
        <div className={`security-toast ${toast.type}`} key={toast.id}>
          <span className="security-toast-icon">
            {toast.type === "success" ? "✓" : "!"}
          </span>
          <span className="security-toast-message">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* HEADER */}
      <header className="security-header">
        <div className="security-heading">
          <div className="security-eyebrow">
            <span />
            ESPORTS CONTROL CENTER
          </div>
          <h1>
            Security <span>Management</span>
          </h1>
          <p>
            Monitor player accounts, registered devices and admin access.
          </p>
        </div>

        <button
          type="button"
          className="security-refresh-btn"
          onClick={loadUsers}
          disabled={loading}
        >
          <span className={loading ? "security-spin" : ""}>↻</span>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {/* ALERTS */}
      {error && (
        <div className="security-alert security-error">
          <span className="security-alert-symbol">!</span>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      )}

      {success && (
        <div className="security-alert security-success">
          <span className="security-alert-symbol">✓</span>
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess("")}>×</button>
        </div>
      )}

      {/* ADMIN SESSION SECURITY */}
      <section className="security-admin-session-card">
        <div className="security-session-icon">⌑</div>
        <div className="security-admin-session-info">
          <div className="security-card-kicker">ADMIN ACCESS CONTROL</div>
          <h2>Admin Session Security</h2>
          <p>
            Revoke all existing admin login sessions if you suspect an admin
            token has been compromised.
          </p>
          <span className="security-session-warning">
            <i /> All admins will need to login again.
          </span>
        </div>
        <button
          type="button"
          className="security-revoke-all-btn"
          onClick={() => openDialog("revoke")}
          disabled={sessionRevoking}
        >
          {sessionRevoking ? "Revoking..." : "Revoke All Sessions"}
        </button>
      </section>

      {/* STATISTICS */}
      <section className="security-stats">
        <div className="security-stat-card total">
          <div className="security-stat-top">
            <span>TOTAL PLAYERS</span>
            <i>♟</i>
          </div>
          <strong>{users.length}</strong>
          <small>Registered accounts</small>
        </div>

        <div className="security-stat-card active-card">
          <div className="security-stat-top">
            <span>ACTIVE</span>
            <i>✓</i>
          </div>
          <strong>{activeCount}</strong>
          <small>Accounts in good standing</small>
        </div>

        <div className="security-stat-card suspended-card">
          <div className="security-stat-top">
            <span>SUSPENDED</span>
            <i>Ⅱ</i>
          </div>
          <strong>{suspendedCount}</strong>
          <small>Temporarily restricted</small>
        </div>

        <div className="security-stat-card banned-card">
          <div className="security-stat-top">
            <span>PERMANENTLY BANNED</span>
            <i>!</i>
          </div>
          <strong>{bannedCount}</strong>
          <small>Restricted accounts</small>
        </div>
      </section>

      {/* SEARCH AND FILTER */}
      <section className="security-toolbar">
        <div className="security-toolbar-title">
          <div className="security-card-kicker">PLAYER DATABASE</div>
          <h2>Account Directory</h2>
        </div>

        <div className="security-controls">
          <div className="security-search">
            <span>⌕</span>
            <input
              type="text"
              placeholder="Search username, Profile ID or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter players by status"
          >
            <option value="all">All Players</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </div>
      </section>

      {/* PLAYER TABLE */}
      <section className="security-table-wrapper">
        <div className="security-table-scroll">
          <table className="security-table">
            <thead>
              <tr>
                <th>#</th>
                <th>PLAYER</th>
                <th>PROFILE ID</th>
                <th>EMAIL</th>
                <th>ACCOUNT STATUS</th>
                <th>SUSPENSION EXPIRY</th>
                <th>REASON</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="security-table-empty">
                      <span className="security-loader" />
                      <strong>Loading player records...</strong>
                      <small>Connecting to security database</small>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="security-table-empty">
                      <span className="security-empty-icon">♟</span>
                      <strong>No players found</strong>
                      <small>Try changing your search or status filter.</small>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => {
                  const status = getStatus(user);
                  const isSuspended = status === "suspended";
                  const isBanned = status === "banned";
                  const profileId = user.profile_id;
                  const isExpanded = expandedProfile === profileId;
                  const devices = devicesByProfile[profileId] || [];

                  return (
                    <React.Fragment key={profileId || user.id}>
                      <tr className="security-player-row">
                        <td className="security-index">{index + 1}</td>

                        <td>
                          <div className="security-player-name">
                            <span>
                              {(user.username || "P").charAt(0).toUpperCase()}
                            </span>
                            <strong>{user.username || "Unknown"}</strong>
                          </div>
                        </td>

                        <td>
                          <code className="security-profile-id">
                            {profileId || "—"}
                          </code>
                        </td>

                        <td className="security-email">
                          {user.email || "—"}
                        </td>

                        <td>
                          <span className={`security-status ${status}`}>
                            <i />
                            {status.toUpperCase()}
                          </span>
                        </td>

                        <td className="security-date">
                          {isSuspended ? formatDate(user.suspended_until) : "—"}
                        </td>

                        <td className="security-reason">
                          {user.suspension_reason || "—"}
                        </td>

                        <td>
                          <div className="security-action-buttons">
                            {status === "active" && (
                              <>
                                <button
                                  type="button"
                                  className="action-btn suspend-btn"
                                  disabled={!!actionLoading}
                                  onClick={() => openDialog("suspend", { user })}
                                >
                                  Suspend
                                </button>
                                <button
                                  type="button"
                                  className="action-btn ban-btn"
                                  disabled={!!actionLoading}
                                  onClick={() => openDialog("ban", { user })}
                                >
                                  Ban
                                </button>
                              </>
                            )}

                            {isSuspended && (
                              <>
                                <button
                                  type="button"
                                  className="action-btn unsuspend-btn"
                                  disabled={!!actionLoading}
                                  onClick={() => openDialog("unsuspend", { user })}
                                >
                                  Unsuspend
                                </button>
                                <button
                                  type="button"
                                  className="action-btn ban-btn"
                                  disabled={!!actionLoading}
                                  onClick={() => openDialog("ban", { user })}
                                >
                                  Ban
                                </button>
                              </>
                            )}

                            {isBanned && (
                              <span className="security-locked">
                                Permanently Banned
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* DEVICE TOGGLE */}
                      <tr className="security-device-toggle-row">
                        <td colSpan="8">
                          <button
                            type="button"
                            className={`security-device-toggle ${
                              isExpanded ? "expanded" : ""
                            }`}
                            onClick={() => toggleDevices(profileId)}
                            disabled={
                              !profileId || deviceLoading === profileId
                            }
                          >
                            <span>{isExpanded ? "−" : "+"}</span>
                            {deviceLoading === profileId
                              ? "Loading devices..."
                              : isExpanded
                              ? "Hide Registered Devices"
                              : "Manage Registered Devices"}
                            <small>
                              {devices.length} {devices.length === 1 ? "DEVICE" : "DEVICES"}
                            </small>
                          </button>
                        </td>
                      </tr>

                      {/* DEVICE PANEL */}
                      {isExpanded && (
                        <tr className="security-device-expanded-row">
                          <td colSpan="8">
                            <div className="security-device-panel">
                              <div className="security-device-heading">
                                <div>
                                  <div className="security-card-kicker">
                                    DEVICE SECURITY
                                  </div>
                                  <h3>
                                    Registered Devices — {user.username || profileId}
                                  </h3>
                                </div>
                                <span>{devices.length} RECORDS</span>
                              </div>

                              {deviceLoading === profileId ? (
                                <div className="security-device-empty">
                                  <span className="security-loader" />
                                  Loading registered devices...
                                </div>
                              ) : devices.length === 0 ? (
                                <div className="security-device-empty">
                                  No registered devices found for this player.
                                </div>
                              ) : (
                                <div className="security-device-list">
                                  {devices.map((device) => {
                                    const deviceStatus = getDeviceStatus(device);
                                    const isDeviceBanned = device.is_banned === true;
                                    const busy =
                                      deviceActionLoading === device.installation_id;

                                    return (
                                      <article
                                        className="security-device-card"
                                        key={device.id || device.installation_id}
                                      >
                                        <div className="security-device-card-top">
                                          <div className="security-device-avatar">
                                            ▣
                                          </div>
                                          <div className="security-device-title">
                                            <h4>
                                              {device.device_name || "Unknown Device"}
                                            </h4>
                                            <span
                                              className={`security-device-status ${
                                                isDeviceBanned ? "banned" : "active"
                                              }`}
                                            >
                                              <i />
                                              {deviceStatus}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="security-device-details">
                                          <div>
                                            <span>BROWSER</span>
                                            <strong>{device.browser_name || "Unknown"}</strong>
                                          </div>
                                          <div>
                                            <span>OPERATING SYSTEM</span>
                                            <strong>{device.operating_system || "Unknown"}</strong>
                                          </div>
                                          <div>
                                            <span>LAST IP</span>
                                            <strong>{device.last_ip || "—"}</strong>
                                          </div>
                                          <div>
                                            <span>LAST SEEN</span>
                                            <strong>{formatDate(device.last_seen)}</strong>
                                          </div>
                                          <div>
                                            <span>BAN EXPIRY</span>
                                            <strong>
                                              {isDeviceBanned
                                                ? device.is_permanent
                                                  ? "Never"
                                                  : formatDate(device.expires_at)
                                                : "—"}
                                            </strong>
                                          </div>
                                          <div>
                                            <span>BAN REASON</span>
                                            <strong>{device.ban_reason || "—"}</strong>
                                          </div>
                                        </div>

                                        <div className="security-installation">
                                          <span>INSTALLATION ID</span>
                                          <code>
                                            {device.installation_id || "—"}
                                          </code>
                                        </div>

                                        <div className="security-device-actions">
                                          {!isDeviceBanned ? (
                                            <button
                                              type="button"
                                              className="action-btn ban-btn"
                                              disabled={!!deviceActionLoading}
                                              onClick={() =>
                                                openDialog("device-ban", { user, device })
                                              }
                                            >
                                              Device Ban
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              className="action-btn unsuspend-btn"
                                              disabled={!!deviceActionLoading}
                                              onClick={() =>
                                                openDialog("device-unban", { user, device })
                                              }
                                            >
                                              {busy ? "Please wait..." : "Device Unban"}
                                            </button>
                                          )}
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="security-table-footer">
          <span>
            Showing <strong>{filteredUsers.length}</strong> of{" "}
            <strong>{users.length}</strong> players
          </span>
          <span className="security-database-status">
            <i /> SECURITY DATABASE
          </span>
        </div>
      </section>

      {/* CUSTOM CONFIRMATION / REASON MODAL */}
      {dialog && (
        <div className="security-modal-backdrop" onClick={closeDialog}>
          <div
            className="security-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`security-modal-icon ${dialog.type}`}>
              {dialog.type === "unsuspend" || dialog.type === "device-unban"
                ? "✓"
                : dialog.type === "revoke"
                ? "⌑"
                : "!"}
            </div>

            <div className="security-card-kicker">ADMIN CONFIRMATION</div>

            <h2 id="security-modal-title">
              {dialogTitle[dialog.type]}
            </h2>

            <p>{dialogDescription[dialog.type]}</p>

            {dialog.user && (
              <div className="security-modal-target">
                <span>SELECTED PLAYER</span>
                <strong>
                  {dialog.user.username || dialog.user.profile_id}
                </strong>
                <small>{dialog.user.profile_id}</small>
              </div>
            )}

            {dialog.device && (
              <div className="security-modal-target">
                <span>SELECTED DEVICE</span>
                <strong>
                  {dialog.device.device_name || "Unknown Device"}
                </strong>
                <small>
                  {dialog.device.installation_id || "No installation ID"}
                </small>
              </div>
            )}

            {dialogNeedsReason && (
              <div className="security-modal-field">
                <label htmlFor="security-action-reason">
                  REASON <span>*</span>
                </label>
                <textarea
                  id="security-action-reason"
                  rows="3"
                  value={dialogReason}
                  onChange={(event) => setDialogReason(event.target.value)}
                  placeholder="Enter a clear reason for this security action..."
                />
              </div>
            )}

            {dialog.type === "device-ban" && (
              <div className="security-modal-field">
                <label htmlFor="security-device-duration">
                  BAN DURATION
                </label>
                <select
                  id="security-device-duration"
                  value={dialogPermanent ? "permanent" : "30days"}
                  onChange={(event) =>
                    setDialogPermanent(event.target.value === "permanent")
                  }
                >
                  <option value="30days">Ban for 30 Days</option>
                  <option value="permanent">Permanent Ban</option>
                </select>
              </div>
            )}

            {dialog.type === "ban" && (
              <div className="security-modal-warning">
                Permanent account bans cannot currently be reversed through
                this API.
              </div>
            )}

            {dialog.type === "revoke" && (
              <div className="security-modal-warning">
                You may be logged out immediately after this operation.
              </div>
            )}

            <div className="security-modal-actions">
              <button
                type="button"
                className="security-modal-cancel"
                onClick={closeDialog}
                disabled={dialogLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`security-modal-confirm ${
                  dialog.type === "unsuspend" || dialog.type === "device-unban"
                    ? "positive"
                    : ""
                }`}
                onClick={executeDialog}
                disabled={
                  dialogLoading ||
                  (dialogNeedsReason && !dialogReason.trim())
                }
              >
                {dialogLoading
                  ? "Please wait..."
                  : dialog.type === "revoke"
                  ? "Revoke All Sessions"
                  : dialog.type === "suspend"
                  ? "Confirm Suspension"
                  : dialog.type === "ban"
                  ? "Confirm Permanent Ban"
                  : dialog.type === "unsuspend"
                  ? "Reactivate Account"
                  : dialog.type === "device-ban"
                  ? "Confirm Device Ban"
                  : "Confirm Device Unban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SecurityManagement;
