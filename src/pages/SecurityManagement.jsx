import React, { useEffect, useMemo, useState } from "react";
import "./SecurityManagement.css";

const API_BASE = "http://localhost:5004/api/admin";
const ADMIN_AUTH_API = "http://localhost:5000/admin";

function SecurityManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [sessionRevoking, setSessionRevoking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // DEVICE MANAGEMENT STATE
  const [expandedProfile, setExpandedProfile] = useState("");
  const [devicesByProfile, setDevicesByProfile] = useState({});
  const [deviceLoading, setDeviceLoading] = useState("");
  const [deviceActionLoading, setDeviceActionLoading] = useState("");

  // DEVICE BAN FORM STATE
  // { installationId, reason, permanent }
  const [banForm, setBanForm] = useState(null);

  const getToken = () => {
    return localStorage.getItem("adminToken");
  };

  const apiRequest = async (url, options = {}) => {
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
  };

  // =====================================================
  // REVOKE ALL ADMIN SESSIONS
  // =====================================================

  const revokeAllAdminSessions = async () => {
    const confirmed = window.confirm(
      "WARNING: This will revoke ALL admin login sessions.\n\n" +
      "Every admin will need to login again.\n\n" +
      "Are you sure you want to continue?"
    );

    if (!confirmed) return;

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

      setSuccess(
        data.message || "All admin sessions revoked successfully."
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
  // LOAD USERS
  // =====================================================

const loadUsers = React.useCallback(async () => {
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
}, []);
  // =====================================================
  // LOAD PLAYER DEVICES
  // =====================================================

  const loadPlayerDevices = async (profileId) => {
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
    setBanForm(null);

    if (expandedProfile === profileId) {
      setExpandedProfile("");
      return;
    }

    setExpandedProfile(profileId);

    // Load devices when opening the device section.
    await loadPlayerDevices(profileId);
  };

  // =====================================================
  // DEVICE BAN FORM
  // =====================================================

  const openBanForm = (device) => {
    setError("");
    setSuccess("");

    setBanForm({
      installationId: device.installation_id,
      reason: "",
      permanent: false,
    });
  };

  const closeBanForm = () => {
    setBanForm(null);
  };

  // =====================================================
  // BAN PLAYER DEVICE (raw installation_id)
  // =====================================================

  const submitDeviceBan = async (user, device) => {
    const profileId = user.profile_id;

    if (!banForm || banForm.installationId !== device.installation_id) {
      return;
    }

    if (!profileId || !device.installation_id) {
      setError("Player ID or installation ID is missing.");
      return;
    }

    const reason = banForm.reason.trim();

    if (!reason) {
      setError("Device ban reason is required.");
      return;
    }

    const permanent = banForm.permanent === true;
    const deviceName = device.device_name || "Unknown Device";

    const confirmed = window.confirm(
      permanent
        ? `Permanently ban this device?\n\n${deviceName}\n\nThis device will remain restricted until you unban it.`
        : `Ban this device for 30 days?\n\n${deviceName}`
    );

    if (!confirmed) return;

    setDeviceActionLoading(device.installation_id);
    setError("");
    setSuccess("");

    try {
      // Expiry server decide karta hai (permanent = never, warna 30 din)
      const data = await apiRequest("/devices/ban", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profileId,
          installation_id: device.installation_id,
          reason,
          is_permanent: permanent,
        }),
      });

      setSuccess(
        data.message ||
        (permanent
          ? "Device permanently banned successfully."
          : "Device banned for 30 days successfully.")
      );

      setBanForm(null);

      await loadPlayerDevices(profileId);
    } catch (err) {
      setError(err.message || "Unable to ban device.");
    } finally {
      setDeviceActionLoading("");
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

    const confirmed = window.confirm(
      `Unban this device?\n\n${device.device_name || "Unknown Device"}\n\nThis device will be allowed to register and login again.`
    );

    if (!confirmed) return;

    setDeviceActionLoading(device.installation_id);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest(
        `/devices/${encodeURIComponent(device.ban_id)}`,
        {
          method: "DELETE",
        }
      );

      setSuccess(data.message || "Device unbanned successfully.");

      await loadPlayerDevices(user.profile_id);
    } catch (err) {
      setError(err.message || "Unable to unban device.");
    } finally {
      setDeviceActionLoading("");
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
  // ACCOUNT SECURITY ACTIONS
  // =====================================================

  const performAction = async (user, action) => {
    const profileId = user.profile_id;

    if (!profileId) {
      setError("Player Profile ID is missing.");
      return;
    }

    let reason = "";

    if (action === "suspend") {
      reason = window.prompt(
        `Enter suspension reason for ${user.username || profileId}:`
      );

      if (reason === null) return;

      reason = reason.trim();

      if (!reason) {
        setError("Suspension reason is required.");
        return;
      }
    }

    if (action === "ban") {
      reason = window.prompt(
        `Enter permanent ban reason for ${user.username || profileId}:`
      );

      if (reason === null) return;

      reason = reason.trim();

      if (!reason) {
        setError("Permanent ban reason is required.");
        return;
      }

      const confirmed = window.confirm(
        `WARNING: Permanently ban ${user.username || profileId}?\n\nThis action cannot currently be reversed through this API.`
      );

      if (!confirmed) return;
    }

    if (action === "unsuspend") {
      const confirmed = window.confirm(
        `Reactivate player ${user.username || profileId}?`
      );

      if (!confirmed) return;

      reason = "Account reactivated by admin";
    }

    const endpoint =
      action === "suspend"
        ? `/users/${encodeURIComponent(profileId)}/suspend`
        : action === "unsuspend"
        ? `/users/${encodeURIComponent(profileId)}/unsuspend`
        : `/users/${encodeURIComponent(profileId)}/ban`;

    setActionLoading(`${profileId}-${action}`);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });

      setSuccess(
        data.message || `Player ${action} action completed successfully.`
      );

      await loadUsers();

      if (devicesByProfile[profileId]) {
        await loadPlayerDevices(profileId);
      }
    } catch (err) {
      setError(err.message || "Security action failed.");
    } finally {
      setActionLoading("");
    }
  };

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
    });
  };

  const getStatus = (user) => {
    return String(user.account_status || "active").toLowerCase();
  };

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

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="security-page">

      <div className="security-header">
        <div>
          <h1>Security Management</h1>
          <p>Manage player accounts and security actions.</p>
        </div>

        <button
          className="security-refresh-btn"
          onClick={loadUsers}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="security-alert security-error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      {success && (
        <div className="security-alert security-success">
          {success}
          <button onClick={() => setSuccess("")}>×</button>
        </div>
      )}

      {/* ADMIN SESSION SECURITY */}

      <div className="security-admin-session-card">
        <div className="security-admin-session-info">
          <h2>Admin Session Security</h2>
          <p>
            Revoke all existing admin login sessions if you
            suspect that an admin token has been compromised.
          </p>
          <span className="security-session-warning">
            All admins will need to login again.
          </span>
        </div>

        <button
          className="security-revoke-all-btn"
          onClick={revokeAllAdminSessions}
          disabled={sessionRevoking}
        >
          {sessionRevoking
            ? "Revoking Sessions..."
            : "Revoke All Admin Sessions"}
        </button>
      </div>

      {/* PLAYER STATISTICS */}

      <div className="security-stats">
        <div className="security-stat-card">
          <span>Total Players</span>
          <strong>{users.length}</strong>
        </div>

        <div className="security-stat-card active-card">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="security-stat-card suspended-card">
          <span>Suspended</span>
          <strong>{suspendedCount}</strong>
        </div>

        <div className="security-stat-card banned-card">
          <span>Permanently Banned</span>
          <strong>{bannedCount}</strong>
        </div>
      </div>

      {/* SEARCH AND FILTER */}

      <div className="security-controls">
        <input
          type="text"
          placeholder="Search username, Profile ID or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Players</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      {/* PLAYER SECURITY TABLE */}

      <div className="security-table-wrapper">
        <table className="security-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Profile ID</th>
              <th>Email</th>
              <th>Account Status</th>
              <th>Suspension Expiry</th>
              <th>Reason</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan="8" className="security-empty">
                  Loading players...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="8" className="security-empty">
                  No players found.
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
                    <tr>
                      <td>{index + 1}</td>

                      <td>
                        <strong>{user.username || "Unknown"}</strong>
                      </td>

                      <td>{profileId || "—"}</td>

                      <td>{user.email || "—"}</td>

                      <td>
                        <span className={`security-status ${status}`}>
                          {status.toUpperCase()}
                        </span>
                      </td>

                      <td>
                        {isSuspended
                          ? formatDate(user.suspended_until)
                          : "—"}
                      </td>

                      <td className="security-reason">
                        {user.suspension_reason || "—"}
                      </td>

                      <td>
                        <div className="security-action-buttons">
                          {status === "active" && (
                            <>
                              <button
                                className="action-btn suspend-btn"
                                disabled={!!actionLoading}
                                onClick={() => performAction(user, "suspend")}
                              >
                                {actionLoading === `${profileId}-suspend`
                                  ? "Please wait..."
                                  : "Suspend 30 Days"}
                              </button>

                              <button
                                className="action-btn ban-btn"
                                disabled={!!actionLoading}
                                onClick={() => performAction(user, "ban")}
                              >
                                Permanent Ban
                              </button>
                            </>
                          )}

                          {isSuspended && (
                            <>
                              <button
                                className="action-btn unsuspend-btn"
                                disabled={!!actionLoading}
                                onClick={() => performAction(user, "unsuspend")}
                              >
                                {actionLoading === `${profileId}-unsuspend`
                                  ? "Please wait..."
                                  : "Unsuspend"}
                              </button>

                              <button
                                className="action-btn ban-btn"
                                disabled={!!actionLoading}
                                onClick={() => performAction(user, "ban")}
                              >
                                Permanent Ban
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

                    {/* DEVICE MANAGEMENT ROW */}

                    <tr className="security-device-toggle-row">
                      <td colSpan="8">
                        <button
                          className="security-device-toggle"
                          onClick={() => toggleDevices(profileId)}
                          disabled={!profileId || deviceLoading === profileId}
                        >
                          {deviceLoading === profileId
                            ? "Loading devices..."
                            : isExpanded
                            ? "− Hide Registered Devices"
                            : "+ Manage Registered Devices"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan="8">
                          <div className="security-device-panel">
                            <h3>
                              Registered Devices — {user.username || profileId}
                            </h3>

                            {deviceLoading === profileId ? (
                              <p>Loading registered devices...</p>
                            ) : devices.length === 0 ? (
                              <p className="security-empty">
                                No registered devices found for this player.
                              </p>
                            ) : (
                              <div className="security-device-list">
                                {devices.map((device) => {
                                  const deviceStatus = getDeviceStatus(device);
                                  const isDeviceBanned =
                                    device.is_banned === true;
                                  const busy =
                                    deviceActionLoading ===
                                    device.installation_id;
                                  const formOpen =
                                    banForm &&
                                    banForm.installationId ===
                                      device.installation_id;

                                  return (
                                    <div
                                      className="security-device-card"
                                      key={device.id || device.installation_id}
                                    >
                                      <div className="security-device-details">
                                        <h4>
                                          {device.device_name || "Unknown Device"}
                                        </h4>

                                        <p>
                                          Browser: {device.browser_name || "Unknown"}
                                        </p>

                                        <p>
                                          OS: {device.operating_system || "Unknown"}
                                        </p>

                                        <p>
                                          Last IP: {device.last_ip || "—"}
                                        </p>

                                        <p>
                                          Last Seen: {formatDate(device.last_seen)}
                                        </p>

                                        <p>
                                          Installation ID:{" "}
                                          <code>
                                            {device.installation_id
                                              ? `${device.installation_id.slice(0, 16)}...`
                                              : "—"}
                                          </code>
                                        </p>

                                        <p>
                                          Ban Reason: {device.ban_reason || "—"}
                                        </p>

                                        <p>
                                          Ban Expiry:{" "}
                                          {isDeviceBanned
                                            ? device.is_permanent
                                              ? "Never"
                                              : formatDate(device.expires_at)
                                            : "—"}
                                        </p>

                                        <span
                                          className={`security-device-status ${
                                            isDeviceBanned ? "banned" : "active"
                                          }`}
                                        >
                                          {deviceStatus}
                                        </span>
                                      </div>

                                      <div className="security-device-actions">

                                        {/* DEVICE BAN BUTTON */}

                                        {!isDeviceBanned && !formOpen && (
                                          <button
                                            className="action-btn ban-btn"
                                            disabled={!!deviceActionLoading}
                                            onClick={() => openBanForm(device)}
                                          >
                                            Device Ban
                                          </button>
                                        )}

                                        {/* DEVICE BAN FORM (reason + duration) */}

                                        {!isDeviceBanned && formOpen && (
                                          <div
                                            style={{
                                              display: "flex",
                                              flexDirection: "column",
                                              gap: "8px",
                                              minWidth: "220px",
                                            }}
                                          >
                                            <input
                                              type="text"
                                              placeholder="Device ban reason"
                                              value={banForm.reason}
                                              onChange={(e) =>
                                                setBanForm({
                                                  ...banForm,
                                                  reason: e.target.value,
                                                })
                                              }
                                              style={{
                                                padding: "8px 10px",
                                                borderRadius: "6px",
                                                border: "1px solid #555",
                                                background: "transparent",
                                                color: "inherit",
                                              }}
                                            />

                                            <select
                                              value={
                                                banForm.permanent
                                                  ? "permanent"
                                                  : "30days"
                                              }
                                              onChange={(e) =>
                                                setBanForm({
                                                  ...banForm,
                                                  permanent:
                                                    e.target.value ===
                                                    "permanent",
                                                })
                                              }
                                              style={{
                                                padding: "8px 10px",
                                                borderRadius: "6px",
                                                border: "1px solid #555",
                                                background: "transparent",
                                                color: "inherit",
                                              }}
                                            >
                                              <option value="30days">
                                                Ban for 30 Days
                                              </option>
                                              <option value="permanent">
                                                Permanent Ban
                                              </option>
                                            </select>

                                            <div
                                              style={{
                                                display: "flex",
                                                gap: "8px",
                                              }}
                                            >
                                              <button
                                                className="action-btn ban-btn"
                                                disabled={!!deviceActionLoading}
                                                onClick={() =>
                                                  submitDeviceBan(user, device)
                                                }
                                              >
                                                {busy
                                                  ? "Please wait..."
                                                  : "Confirm Ban"}
                                              </button>

                                              <button
                                                className="action-btn suspend-btn"
                                                disabled={!!deviceActionLoading}
                                                onClick={closeBanForm}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* DEVICE UNBAN BUTTON */}

                                        {isDeviceBanned && (
                                          <button
                                            className="action-btn unsuspend-btn"
                                            disabled={!!deviceActionLoading}
                                            onClick={() =>
                                              unbanDevice(user, device)
                                            }
                                          >
                                            {busy
                                              ? "Please wait..."
                                              : "Device Unban"}
                                          </button>
                                        )}
                                      </div>
                                    </div>
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

      <div className="security-footer">
        Showing {filteredUsers.length} of {users.length} players
      </div>
    </div>
  );
}

export default SecurityManagement;