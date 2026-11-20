
import React, { useCallback, useEffect, useState } from "react";
import "./AdminSessionManagement.css";

// ==================================================
// API CONFIGURATION
// ==================================================

const API_BASE = import.meta.env.DEV
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
    if (!selectedSession || revokingId !== null) {
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
          <h3>Loading Admin Sessions</h3>
          <p>Checking your admin devices and security status...</p>
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
        <div className="sessions-heading">
          <div className="sessions-eyebrow">
            <span className="sessions-live-dot"></span>
            SECURITY CONTROL CENTER
          </div>

          <h1>
            Admin <span>Sessions</span>
          </h1>

          <p>
            Manage logged-in devices and protect your admin account.
          </p>
        </div>

        <button
          className="sessions-refresh-btn"
          onClick={() => fetchSessions(true)}
          disabled={refreshing}
        >
          <span className={refreshing ? "refresh-spinning" : ""}>↻</span>
          {refreshing ? "Refreshing..." : "Refresh Sessions"}
        </button>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <div className="sessions-alert sessions-error">
          <span className="alert-symbol">!</span>
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* SUCCESS MESSAGE */}

      {success && (
        <div className="sessions-alert sessions-success">
          <span className="alert-symbol">✓</span>
          <span>{success}</span>

          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss success"
          >
            ×
          </button>
        </div>
      )}

      {/* STATISTICS */}

      <div className="sessions-stats">

        <div className="session-stat-card total-stat">
          <div className="stat-icon blue">▣</div>

          <div className="stat-content">
            <span className="stat-label">TOTAL SESSIONS</span>
            <h3>{sessions.length}</h3>
            <p>All registered devices</p>
          </div>

          <div className="stat-card-decoration">01</div>
        </div>

        <div className="session-stat-card active-stat">
          <div className="stat-icon green">✓</div>

          <div className="stat-content">
            <span className="stat-label">ACTIVE SESSIONS</span>
            <h3>{activeSessions.length}</h3>
            <p>Currently authorized</p>
          </div>

          <div className="stat-card-decoration">02</div>
        </div>

        <div className="session-stat-card revoked-stat">
          <div className="stat-icon red">⊗</div>

          <div className="stat-content">
            <span className="stat-label">REVOKED SESSIONS</span>
            <h3>{revokedSessions.length}</h3>
            <p>Access has been blocked</p>
          </div>

          <div className="stat-card-decoration">03</div>
        </div>

      </div>

      {/* SESSION TABLE */}

      <div className="sessions-table-card">

        <div className="sessions-table-header">
          <div className="table-heading-icon">⌘</div>

          <div className="table-heading-content">
            <h2>Logged-in Devices</h2>
            <p>
              View and manage all devices using your admin account.
            </p>
          </div>

          <div className="sessions-count">
            {sessions.length} {sessions.length === 1 ? "DEVICE" : "DEVICES"}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="sessions-empty">
            <div className="empty-device-icon">▣</div>
            <h3>No Sessions Found</h3>
            <p>
              There are currently no admin sessions to display.
            </p>

            <button
              className="sessions-empty-refresh"
              onClick={() => fetchSessions(true)}
              disabled={refreshing}
            >
              ↻ Check Again
            </button>
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
                          <div className="device-icon">▣</div>

                          <div className="device-info">
                            <strong>{getDeviceName(session)}</strong>

                            {current && (
                              <span className="current-device-badge">
                                <span></span>
                                Current Device
                              </span>
                            )}

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

                      <td>
                        <span className="session-date">
                          {formatDate(session.created_at)}
                        </span>
                      </td>

                      {/* LAST ACTIVITY */}

                      <td>
                        <span className="session-date">
                          {formatDate(session.last_activity_at)}
                        </span>
                      </td>

                      {/* STATUS */}

                      <td>
                        <span
                          className={`session-status ${
                            revoked ? "status-revoked" : "status-active"
                          }`}
                        >
                          <span className="status-dot"></span>
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </td>

                      {/* ACTION */}

                      <td>
                        {current ? (
                          <span className="current-session-text">
                            <span>✓</span> Current Session
                          </span>
                        ) : revoked ? (
                          <span className="revoked-session-text">
                            Already Revoked
                          </span>
                        ) : (
                          <button
                            className="session-revoke-btn"
                            onClick={() => {
                              setError("");
                              setSuccess("");
                              setSelectedSession(session);
                            }}
                            disabled={revokingId !== null}
                          >
                            <span>⊗</span> Revoke
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

        <div className="sessions-table-footer">
          <span>
            Showing <strong>{sessions.length}</strong> registered sessions
          </span>

          <span className="footer-security-label">
            <span></span> SESSION MONITORING ACTIVE
          </span>
        </div>

      </div>

      {/* SECURITY INFORMATION */}

      <div className="sessions-security-note">

        <div className="security-note-icon">♢</div>

        <div className="security-note-content">
          <span className="security-note-label">SECURITY INFORMATION</span>

          <h3>Session Security</h3>

          <p>
            Revoking a device immediately prevents that session from
            accessing protected admin APIs. Other active sessions
            remain logged in.
          </p>
        </div>

        <div className="security-note-badge">
          <span>✓</span> Protected
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-modal-title"
            onClick={(event) => event.stopPropagation()}
          >

            <div className="modal-top-line"></div>

            <button
              className="modal-close-btn"
              onClick={() => setSelectedSession(null)}
              disabled={revokingId !== null}
              aria-label="Close dialog"
            >
              ×
            </button>

            <div className="modal-warning-icon">!</div>

            <span className="modal-eyebrow">SECURITY ACTION</span>

            <h2 id="revoke-modal-title">
              Revoke Device <span>Session?</span>
            </h2>

            <p className="modal-description">
              Are you sure you want to log out this device?
            </p>

            <div className="modal-device-info">
              <div className="modal-device-icon">▣</div>

              <div>
                <strong>{getDeviceName(selectedSession)}</strong>

                <span>
                  {selectedSession.ip_address || "IP not available"}
                </span>
              </div>
            </div>

            <div className="modal-warning-text">
              <span>!</span>

              <p>
                This device will no longer be able to access protected
                admin APIs using its current session. It will need
                to login again.
              </p>
            </div>

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
                {revokingId !== null ? (
                  <>
                    <span className="button-spinner"></span>
                    Revoking...
                  </>
                ) : (
                  <>
                    ⊗ Yes, Revoke Session
                  </>
                )}
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default AdminSessionManagement;
