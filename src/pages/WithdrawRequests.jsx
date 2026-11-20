import { useCallback, useEffect, useMemo, useState } from "react";
import "./WithdrawRequests.css";

const PRIMARY_API =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5003"
    : "https://withdraw-server-3.onrender.com";

const BACKUP_API =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5002"
    : "https://deposit-and-join-tournament-server-5002.onrender.com";

const getFriendlyError = (status, fallback) => {
  if (status === 401 || status === 403) {
    return "You are not authorized to perform this action. Please check your admin session.";
  }
  if (status === 404) return "The requested withdrawal was not found.";
  if (status === 409) return "This withdrawal has already been processed. The list has been refreshed.";
  if (status >= 500) return "The server is temporarily unavailable. Please try again.";
  return fallback;
};

const WithdrawRequests = () => {
  const [withdraws, setWithdraws] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [modal, setModal] = useState(null);

  const formatIndianDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return String(dateString);

    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const requestWithFallback = useCallback(
    async (path, options = {}) => {
      let primaryResponse;

      try {
        primaryResponse = await fetch(`${PRIMARY_API}${path}`, {
          cache: "no-store",
          ...options,
        });
      } catch {
        primaryResponse = null;
      }

      if (primaryResponse?.ok) return primaryResponse;

      // Try the backup API if the primary API is unavailable or returns an error.
      try {
        const backupResponse = await fetch(`${BACKUP_API}${path}`, {
          cache: "no-store",
          ...options,
        });
        return backupResponse;
      } catch {
        if (primaryResponse) return primaryResponse;
        throw new Error("Unable to connect to the withdrawal servers.");
      }
    },
    []
  );

  const fetchWithdraws = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) setLoading(true);
        setError("");

        const response = await requestWithFallback("/api/admin/withdraw-requests", {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error(
            getFriendlyError(response.status, "Unable to load withdrawal requests.")
          );
        }

        const data = await response.json();
        setWithdraws(Array.isArray(data?.withdraws) ? data.withdraws : []);
      } catch (err) {
        setError(
          err.message && err.message !== "Failed to fetch"
            ? err.message
            : "Unable to connect to the server. Please check your connection."
        );
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [requestWithFallback]
  );

  useEffect(() => {
    fetchWithdraws();
  }, [fetchWithdraws]);

  const openStatusModal = (withdraw, status) => {
    setModal({ type: "status", withdraw, status });
  };

  const openDeleteModal = (withdraw) => {
    setModal({ type: "delete", withdraw });
  };

  const closeModal = () => {
    if (processingId !== null) return;
    setModal(null);
  };

  const updateStatus = async () => {
    if (!modal || modal.type !== "status" || processingId !== null) return;

    const { withdraw, status } = modal;
    const withdrawId = withdraw.withdraw_id;

    try {
      setProcessingId(withdrawId);
      setNotice(null);

      const response = await requestWithFallback(
        `/api/admin/withdraw-status/${encodeURIComponent(withdrawId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok && data?.success !== false) {
        setModal(null);
        setNotice({
          type: "success",
          message:
            status === "approved"
              ? "Withdrawal approved successfully."
              : "Withdrawal rejected successfully.",
        });
        await fetchWithdraws(false);
      } else {
        if (response.status === 409) await fetchWithdraws(false);
        setNotice({
          type: "error",
          message: getFriendlyError(
            response.status,
            "Unable to update this withdrawal. Please try again."
          ),
        });
      }
    } catch {
      setNotice({
        type: "error",
        message: "Network error. Unable to update the withdrawal.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const deleteWithdraw = async () => {
    if (!modal || modal.type !== "delete" || processingId !== null) return;

    const withdrawId = modal.withdraw.withdraw_id;

    try {
      setProcessingId(withdrawId);
      setNotice(null);

      const response = await requestWithFallback(
        `/api/admin/withdraw/${encodeURIComponent(withdrawId)}`,
        { method: "DELETE" }
      );

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok && data?.success !== false) {
        setModal(null);
        setNotice({
          type: "success",
          message: "Withdrawal request deleted successfully.",
        });
        await fetchWithdraws(false);
      } else {
        if (response.status === 409) await fetchWithdraws(false);
        setNotice({
          type: "error",
          message: getFriendlyError(
            response.status,
            "Unable to delete this withdrawal. Please try again."
          ),
        });
      }
    } catch {
      setNotice({
        type: "error",
        message: "Network error. Unable to delete the withdrawal.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = useMemo(
    () => withdraws.filter((withdraw) => withdraw.status === filter),
    [withdraws, filter]
  );

  const getCount = (status) =>
    withdraws.filter((withdraw) => withdraw.status === status).length;

  const formatAmount = (amount) => {
    const number = Number(amount);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : amount ?? "-";
  };

  return (
    <div className="withdraw-admin">
      <div className="withdraw-page-header">
        <div>
          <span className="withdraw-eyebrow">ADMIN CONTROL PANEL</span>
          <h1>Withdrawal Requests</h1>
          <p>Review and manage user withdrawal requests.</p>
        </div>
        <button
          type="button"
          className="withdraw-refresh-btn"
          onClick={() => fetchWithdraws()}
          disabled={loading || processingId !== null}
        >
          <span className={loading ? "withdraw-refresh-icon is-spinning" : "withdraw-refresh-icon"}>
            ↻
          </span>
          Refresh
        </button>
      </div>

      <div className="withdraw-summary-grid">
        <div className="withdraw-summary-card">
          <span className="summary-label">Total Requests</span>
          <strong>{withdraws.length}</strong>
          <span className="summary-foot">All withdrawal records</span>
        </div>
        <div className="withdraw-summary-card pending-card">
          <span className="summary-label">Pending</span>
          <strong>{getCount("pending")}</strong>
          <span className="summary-foot">Awaiting review</span>
        </div>
        <div className="withdraw-summary-card approved-card">
          <span className="summary-label">Approved</span>
          <strong>{getCount("approved")}</strong>
          <span className="summary-foot">Successfully processed</span>
        </div>
        <div className="withdraw-summary-card rejected-card">
          <span className="summary-label">Rejected</span>
          <strong>{getCount("rejected")}</strong>
          <span className="summary-foot">Not approved</span>
        </div>
      </div>

      <section className="withdraw-panel">
        <div className="withdraw-panel-heading">
          <div>
            <h2>Withdrawal Management</h2>
            <p>Verify each request before approving or rejecting it.</p>
          </div>

          <div className="withdraw-filter" role="tablist" aria-label="Withdrawal status filter">
            {["pending", "approved", "rejected"].map((status) => (
              <button
                type="button"
                key={status}
                role="tab"
                aria-selected={filter === status}
                className={`withdraw-filter-btn ${filter === status ? "active" : ""} ${status}`}
                onClick={() => setFilter(status)}
              >
                {status}
                <span>{getCount(status)}</span>
              </button>
            ))}
          </div>
        </div>

        {notice && (
          <div className={`withdraw-notice ${notice.type}`} role="status">
            <span>{notice.type === "success" ? "✓" : "!"}</span>
            <p>{notice.message}</p>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="withdraw-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => fetchWithdraws()}>
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="withdraw-loading">
            <span className="withdraw-spinner" />
            <p>Loading withdrawal requests...</p>
          </div>
        ) : (
          <div className="withdraw-table-wrap">
            <table className="withdraw-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Profile ID</th>
                  <th>Email</th>
                  <th>Withdraw ID</th>
                  <th>Amount</th>
                  <th>Date / Time (IST)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="withdraw-empty">
                      <span className="withdraw-empty-icon">▤</span>
                      <strong>No {filter} withdrawal requests</strong>
                      <small>There are no records in this category.</small>
                    </td>
                  </tr>
                ) : (
                  filtered.map((withdraw) => (
                    <tr key={withdraw.withdraw_id}>
                      <td data-label="Name">
                        <strong className="withdraw-user-name">
                          {withdraw.profile_name || "Unknown"}
                        </strong>
                      </td>
                      <td data-label="Profile ID">
                        <span className="withdraw-mono">{withdraw.profile_id || "-"}</span>
                      </td>
                      <td data-label="Email" className="withdraw-email">
                        {withdraw.user_email || "-"}
                      </td>
                      <td data-label="Withdraw ID">
                        <span className="withdraw-mono">{withdraw.withdraw_id || "-"}</span>
                      </td>
                      <td data-label="Amount">
                        <strong className="withdraw-amount">
                          ₹{formatAmount(withdraw.withdraw_amount)}
                        </strong>
                      </td>
                      <td data-label="Date / Time">
                        {formatIndianDate(withdraw.created_at)}
                      </td>
                      <td data-label="Status">
                        <span className={`withdraw-status ${withdraw.status || "unknown"}`}>
                          {withdraw.status || "unknown"}
                        </span>
                      </td>
                      <td data-label="Action">
                        <div className="withdraw-actions">
                          {withdraw.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                className="withdraw-action-btn approve"
                                disabled={processingId !== null}
                                onClick={() => openStatusModal(withdraw, "approved")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="withdraw-action-btn reject"
                                disabled={processingId !== null}
                                onClick={() => openStatusModal(withdraw, "rejected")}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="withdraw-action-btn delete"
                              disabled={processingId !== null}
                              onClick={() => openDeleteModal(withdraw)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <div
          className="withdraw-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="withdraw-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdraw-modal-title"
          >
            <div
              className={`withdraw-modal-icon ${
                modal.type === "delete" || modal.status === "rejected"
                  ? "danger"
                  : "success"
              }`}
            >
              {modal.type === "delete"
                ? "⌫"
                : modal.status === "approved"
                  ? "✓"
                  : "!"}
            </div>

            <h2 id="withdraw-modal-title">
              {modal.type === "delete"
                ? "Delete Withdrawal?"
                : modal.status === "approved"
                  ? "Approve Withdrawal?"
                  : "Reject Withdrawal?"}
            </h2>

            <p className="withdraw-modal-description">
              {modal.type === "delete"
                ? "This withdrawal record will be permanently deleted. This action cannot be undone."
                : modal.status === "approved"
                  ? "Confirm that you have verified the withdrawal details and are ready to approve this request."
                  : "Confirm that you want to reject this withdrawal request."}
            </p>

            <div className="withdraw-modal-details">
              <div>
                <span>Name</span>
                <strong>{modal.withdraw.profile_name || "Unknown"}</strong>
              </div>
              <div>
                <span>Profile ID</span>
                <strong>{modal.withdraw.profile_id || "-"}</strong>
              </div>
              <div>
                <span>Withdraw ID</span>
                <strong>{modal.withdraw.withdraw_id || "-"}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>₹{formatAmount(modal.withdraw.withdraw_amount)}</strong>
              </div>
            </div>

            <div className="withdraw-modal-actions">
              <button
                type="button"
                className="withdraw-modal-cancel"
                onClick={closeModal}
                disabled={processingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`withdraw-modal-confirm ${
                  modal.type === "delete" || modal.status === "rejected"
                    ? "danger"
                    : "success"
                }`}
                onClick={modal.type === "delete" ? deleteWithdraw : updateStatus}
                disabled={processingId !== null}
              >
                {processingId !== null
                  ? "Please wait..."
                  : modal.type === "delete"
                    ? "Delete Withdrawal"
                    : modal.status === "approved"
                      ? "Confirm Approval"
                      : "Confirm Rejection"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default WithdrawRequests;
