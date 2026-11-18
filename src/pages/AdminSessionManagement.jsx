import React, { useCallback, useEffect, useState } from "react";
import "./AdminSessionManagement.css";

// ==================================================
// API CONFIGURATION
// ==================================================


const API_BASE = process.env.NODE_ENV === "development"
  ? "http://localhost:5004/api/admin"
  : "https://bgmi-admin-dashboard-server-5004.onrender.com/api/admin";


// ==================================================
// ADMIN SESSION MANAGEMENT
// ==================================================

function AdminSessionManagement() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedSession, setSelectedSession] = useState(null);

  // ==================================================
  // GET ADMIN TOKEN
  // ==================================================

  const getAdminToken = () => {
    return localStorage.getItem("adminToken");
  };

  // ==================================================
  // FETCH SESSIONS
  // ==================================================

  const fetchSessions = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const token = getAdminToken();

      if (!token) {
        throw new Error(
          "Admin authentication token not found. Please login again."
        );
      }

      const response = await fetch(`${API_BASE}/sessions`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to fetch admin sessions.");
      }

      if (data.success !== true) {
        throw new Error(data.message || "Invalid sessions response.");
      }

      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setCurrentSessionId(data.currentSessionId || null);
    } catch (err) {
      console.error("FETCH SESSIONS ERROR:", err);
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ==================================================
  // INITIAL LOAD
  // ==================================================

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ==================================================
  // INDIVIDUAL SESSION REVOKE
  // ==================================================

  const revokeSession = async () => {
    if (!selectedSession) {
      return;
    }

    const sessionId = selectedSession.id;

    setRevokingId(sessionId);
    setError("");
    setSuccess("");

    try {
      const token = getAdminToken();

      if (!token) {
        throw new Error("Admin token not found. Please login again.");
      }

      const response = await fetch(
        `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/revoke`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || data.success !== true) {
        throw new Error(data.message || "Failed to revoke this session.");
      }

      setSuccess("Selected device session has been revoked successfully.");
      setSelectedSession(null);

      await fetchSessions(true);
    } catch (err) {
      console.error("REVOKE SESSION ERROR:", err);
      setError(err.message || "Unable to revoke session.");
    } finally {
      setRevokingId(null);
    }
  };

  // ==================================================
  // DATE FORMAT
  // ==================================================

  const formatDate = (date) => {
    if (!date) {
      return "Not available";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Not available";
    }

    return parsedDate.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  // ==================================================
  // DEVICE INFORMATION
  // ==================================================

  const getDeviceName = (session) => {
    return session.device_name || "Unknown Device";
  };

  const getBrowserInfo = (session) => {
    return session.user_agent || "Unknown Browser";
  };

  const isCurrentSession = (session) => {
    return (
      currentSessionId &&
      String(session.id) === String(currentSessionId)
    );
  };

  // ==================================================
  // STATISTICS
  // ==================================================

  const activeSessions = sessions.filter(
    (session) => session.is_revoked !== true
  );

  const revokedSessions = sessions.filter(
    (session) => session.is_revoked === true
  );

  // ==================================================
  // LOADING SCREEN
  // ==================================================

  if (loading) {
    return (
      <div className="admin-sessions-page">
        <div className="sessions-loading">
          <div className="sessions-spinner"></div>
          <p>Loading Admin Sessions...</p>
        </div>
      </div>
    );
  }

  // ==================================================
  // MAIN PAGE
  // ==================================================

  return (
    <div className="admin-sessions-page">
      {/* PAGE HEADER */}

      <div className="sessions-header">
        <div>
          <h1>Admin Sessions</h1>

          <p>
            Manage logged-in devices and protect your admin account.
          </p>
        </div>

        <button
          className="sessions-refresh-btn"
          onClick={() => fetchSessions(true)}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "↻ Refresh Sessions"}
        </button>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div className="sessions-alert sessions-error">
          ⚠️ {error}
        </div>
      )}

      {/* SUCCESS MESSAGE */}

      {success && (
        <div className="sessions-alert sessions-success">
          ✓ {success}
        </div>
      )}

      {/* STATISTICS */}

      <div className="sessions-stats">
        <div className="session-stat-card">
          <div className="stat-icon blue">💻</div>

          <div>
            <h3>{sessions.length}</h3>
            <p>Total Sessions</p>
          </div>
        </div>

        <div className="session-stat-card">
          <div className="stat-icon green">✓</div>

          <div>
            <h3>{activeSessions.length}</h3>
            <p>Active Sessions</p>
          </div>
        </div>

        <div className="session-stat-card">
          <div className="stat-icon red">⊗</div>

          <div>
            <h3>{revokedSessions.length}</h3>
            <p>Revoked Sessions</p>
          </div>
        </div>
      </div>

      {/* SESSION TABLE */}

      <div className="sessions-table-card">
        <div className="sessions-table-header">
          <div>
            <h2>Logged-in Devices</h2>
            <p>View and manage all devices using your admin account.</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="sessions-empty">
            <div>💻</div>
            <h3>No Sessions Found</h3>
            <p>There are currently no admin sessions to display.</p>
          </div>
        ) : (
          <div className="sessions-table-wrapper">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>DEVICE</th>
                  <th>IP ADDRESS</th>
                  <th>LOGIN TIME</th>
                  <th>LAST ACTIVITY</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {sessions.map((session) => {
                  const current = isCurrentSession(session);
                  const revoked = session.is_revoked === true;

                  return (
                    <tr key={session.id}>
                      {/* DEVICE */}

                      <td>
                        <div className="session-device">
                          <div className="device-icon">💻</div>

                          <div className="device-info">
                            <strong>{getDeviceName(session)}</strong>

                            <span>
                              {current && (
                                <span className="current-device-badge">
                                  Current Device
                                </span>
                              )}
                            </span>

                            <small>{getBrowserInfo(session)}</small>
                          </div>
                        </div>
                      </td>

                      {/* IP */}

                      <td>
                        <span className="session-ip">
                          {session.ip_address || "Not available"}
                        </span>
                      </td>

                      {/* LOGIN TIME */}

                      <td>{formatDate(session.created_at)}</td>

                      {/* LAST ACTIVITY */}

                      <td>{formatDate(session.last_activity_at)}</td>

                      {/* STATUS */}

                      <td>
                        <span
                          className={`session-status ${
                            revoked ? "status-revoked" : "status-active"
                          }`}
                        >
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </td>

                      {/* ACTION */}

                      <td>
                        {current ? (
                          <span className="current-session-text">
                            Current Session
                          </span>
                        ) : revoked ? (
                          <span className="revoked-session-text">
                            Revoked
                          </span>
                        ) : (
                          <button
                            className="session-revoke-btn"
                            onClick={() => setSelectedSession(session)}
                            disabled={revokingId !== null}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECURITY INFORMATION */}

      <div className="sessions-security-note">
        <div className="security-note-icon">🛡️</div>

        <div>
          <h3>Session Security</h3>

          <p>
            Revoking a device immediately prevents that session from
            accessing protected admin APIs. Other active sessions
            remain logged in.
          </p>
        </div>
      </div>

      {/* REVOKE CONFIRMATION MODAL */}

      {selectedSession && (
        <div
          className="session-modal-overlay"
          onClick={() => {
            if (revokingId === null) {
              setSelectedSession(null);
            }
          }}
        >
          <div
            className="session-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-warning-icon">⚠️</div>

            <h2>Revoke Device Session?</h2>

            <p>Are you sure you want to logout this device?</p>

            <div className="modal-device-info">
              <strong>{getDeviceName(selectedSession)}</strong>

              <span>
                {selectedSession.ip_address || "IP not available"}
              </span>
            </div>

            <p className="modal-warning-text">
              This device will no longer be able to access protected
              admin APIs using its current session. It will need
              to login again.
            </p>

            <div className="modal-actions">
              <button
                className="modal-cancel-btn"
                onClick={() => setSelectedSession(null)}
                disabled={revokingId !== null}
              >
                Cancel
              </button>

              <button
                className="modal-confirm-btn"
                onClick={revokeSession}
                disabled={revokingId !== null}
              >
                {revokingId !== null
                  ? "Revoking..."
                  : "Yes, Revoke Session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSessionManagement;