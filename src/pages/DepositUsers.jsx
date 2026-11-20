import { useCallback, useEffect, useMemo, useState } from "react";
import "./DepositUsers.css";

const API =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5002"
    : "https://deposit-and-join-tournament-server-5002.onrender.com";

/* ============================= ADMIN TOKEN ============================= */
const getAdminHeaders = (withJson = false) => {
  const token = String(localStorage.getItem("adminToken") || "").trim();

  if (!token) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
};

const getErrorMessage = (status, fallback) => {
  if (status === 401 || status === 403) {
    return "Your admin session has expired. Please log in again.";
  }
  if (status === 404) return "The requested deposit was not found.";
  if (status === 409) return "This deposit has already been processed. The list has been refreshed.";
  if (status >= 500) return "The server is temporarily unavailable. Please try again.";
  return fallback;
};

const DepositUsers = () => {
  const [deposits, setDeposits] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [modal, setModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

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

  const fetchDeposits = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError("");

      const headers = getAdminHeaders();
      if (!headers) {
        setDeposits([]);
        setError("Admin token missing. Please log in again.");
        return;
      }

      const response = await fetch(`${API}/api/admin/deposits`, { headers });

      if (response.status === 401 || response.status === 403) {
        setDeposits([]);
        setError("Your admin session has expired. Please log in again.");
        return;
      }

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, "Unable to load deposits."));
      }

      const data = await response.json();
      setDeposits(Array.isArray(data?.deposits) ? data.deposits : []);
    } catch (err) {
      setError(
        err.message && err.message !== "Failed to fetch"
          ? err.message
          : "Unable to connect to the server. Please check your connection."
      );
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  const openStatusModal = (deposit, status) => {
    setRejectReason("");
    setModal({ type: "status", deposit, status });
  };

  const openDeleteModal = (deposit) => {
    setModal({ type: "delete", deposit });
  };

  const closeModal = () => {
    if (processingId !== null) return;
    setModal(null);
    setRejectReason("");
  };

  const updateStatus = async () => {
    if (!modal || modal.type !== "status" || processingId !== null) return;

    const { deposit, status } = modal;
    const headers = getAdminHeaders(true);

    if (!headers) {
      setModal(null);
      setNotice({
        type: "error",
        message: "Admin token missing. Please log in again.",
      });
      return;
    }

    try {
      setProcessingId(deposit.id);
      setNotice(null);

      const response = await fetch(
        `${API}/api/admin/deposit-status/${deposit.id}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            status,
            reason: status === "rejected" ? rejectReason.trim() : "",
          }),
        }
      );

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok && data?.success) {
        setModal(null);
        setRejectReason("");
        setNotice({
          type: "success",
          message:
            status === "approved"
              ? "Deposit approved successfully."
              : "Deposit rejected successfully.",
        });
        await fetchDeposits(false);
      } else {
        if (response.status === 409) await fetchDeposits(false);
        setNotice({
          type: "error",
          message: getErrorMessage(
            response.status,
            "Unable to update this deposit. Please try again."
          ),
        });
      }
    } catch {
      setNotice({
        type: "error",
        message: "Network error. Unable to update the deposit.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const deleteDeposit = async () => {
    if (!modal || modal.type !== "delete" || processingId !== null) return;

    const { deposit } = modal;
    const headers = getAdminHeaders();

    if (!headers) {
      setModal(null);
      setNotice({
        type: "error",
        message: "Admin token missing. Please log in again.",
      });
      return;
    }

    try {
      setProcessingId(deposit.id);
      setNotice(null);

      const response = await fetch(`${API}/api/admin/deposit/${deposit.id}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        setModal(null);
        setNotice({ type: "success", message: "Deposit deleted successfully." });
        await fetchDeposits(false);
      } else {
        if (response.status === 409) await fetchDeposits(false);
        setNotice({
          type: "error",
          message: getErrorMessage(
            response.status,
            "Unable to delete this deposit. Please try again."
          ),
        });
      }
    } catch {
      setNotice({
        type: "error",
        message: "Network error. Unable to delete the deposit.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const filteredDeposits = useMemo(
    () => deposits.filter((deposit) => deposit.status === filter),
    [deposits, filter]
  );

  const getCount = (status) =>
    deposits.filter((deposit) => deposit.status === status).length;

  const formatAmount = (amount) => {
    const number = Number(amount);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : amount ?? "-";
  };

  return (
    <div className="deposit-admin">
      <div className="deposit-page-header">
        <div>
          <span className="deposit-eyebrow">ADMIN CONTROL PANEL</span>
          <h1>Deposit Requests</h1>
          <p>Review, approve, reject, and manage user deposits.</p>
        </div>
        <button
          type="button"
          className="deposit-refresh-btn"
          onClick={() => fetchDeposits()}
          disabled={loading || processingId !== null}
        >
          <span className={loading ? "deposit-refresh-icon is-spinning" : "deposit-refresh-icon"}>
            ↻
          </span>
          Refresh
        </button>
      </div>

      <div className="deposit-summary-grid">
        <div className="deposit-summary-card">
          <span className="summary-label">Total Requests</span>
          <strong>{deposits.length}</strong>
          <span className="summary-foot">All deposit records</span>
        </div>
        <div className="deposit-summary-card pending-card">
          <span className="summary-label">Pending</span>
          <strong>{getCount("pending")}</strong>
          <span className="summary-foot">Awaiting review</span>
        </div>
        <div className="deposit-summary-card approved-card">
          <span className="summary-label">Approved</span>
          <strong>{getCount("approved")}</strong>
          <span className="summary-foot">Successfully credited</span>
        </div>
        <div className="deposit-summary-card rejected-card">
          <span className="summary-label">Rejected</span>
          <strong>{getCount("rejected")}</strong>
          <span className="summary-foot">Not approved</span>
        </div>
      </div>

      <section className="deposit-panel">
        <div className="deposit-panel-heading">
          <div>
            <h2>Deposit Management</h2>
            <p>Check the payment details before changing a request status.</p>
          </div>
          <div className="deposit-filter" role="tablist" aria-label="Deposit status filter">
            {["pending", "approved", "rejected"].map((status) => (
              <button
                type="button"
                key={status}
                role="tab"
                aria-selected={filter === status}
                className={`deposit-filter-btn ${filter === status ? "active" : ""} ${status}`}
                onClick={() => setFilter(status)}
              >
                {status}
                <span>{getCount(status)}</span>
              </button>
            ))}
          </div>
        </div>

        {notice && (
          <div className={`deposit-notice ${notice.type}`} role="status">
            <span>{notice.type === "success" ? "✓" : "!"}</span>
            <p>{notice.message}</p>
            <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="deposit-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => fetchDeposits()}>
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="deposit-loading">
            <span className="deposit-spinner" />
            <p>Loading deposit requests...</p>
          </div>
        ) : (
          <div className="deposit-table-wrap">
            <table className="deposit-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Profile ID</th>
                  <th>Email</th>
                  <th>Amount</th>
                  <th>UTR</th>
                  <th>Date / Time (IST)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeposits.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="deposit-empty">
                      <span className="deposit-empty-icon">▤</span>
                      <strong>No {filter} deposits</strong>
                      <small>There are no records in this category.</small>
                    </td>
                  </tr>
                ) : (
                  filteredDeposits.map((deposit) => (
                    <tr key={deposit.id}>
                      <td data-label="User">
                        <strong className="deposit-user-name">{deposit.name || "Unknown"}</strong>
                      </td>
                      <td data-label="Profile ID">
                        <span className="deposit-mono">{deposit.profile_id || "-"}</span>
                      </td>
                      <td data-label="Email" className="deposit-email">
                        {deposit.email || "-"}
                      </td>
                      <td data-label="Amount">
                        <strong className="deposit-amount">₹{formatAmount(deposit.amount)}</strong>
                      </td>
                      <td data-label="UTR">
                        <span className="deposit-mono">{deposit.utr || "-"}</span>
                      </td>
                      <td data-label="Date / Time">
                        {deposit.date_ist || formatIndianDate(deposit.date)}
                      </td>
                      <td data-label="Status">
                        <span className={`deposit-status ${deposit.status || "unknown"}`}>
                          {deposit.status || "unknown"}
                        </span>
                      </td>
                      <td data-label="Action">
                        <div className="deposit-actions">
                          {deposit.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                className="deposit-action-btn approve"
                                disabled={processingId !== null}
                                onClick={() => openStatusModal(deposit, "approved")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="deposit-action-btn reject"
                                disabled={processingId !== null}
                                onClick={() => openStatusModal(deposit, "rejected")}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="deposit-action-btn delete"
                              disabled={processingId !== null}
                              onClick={() => openDeleteModal(deposit)}
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
          className="deposit-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="deposit-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deposit-modal-title"
          >
            <div className={`deposit-modal-icon ${modal.type === "delete" || modal.status === "rejected" ? "danger" : "success"}`}>
              {modal.type === "delete" ? "⌫" : modal.status === "approved" ? "✓" : "!"}
            </div>
            <h2 id="deposit-modal-title">
              {modal.type === "delete"
                ? "Delete Deposit?"
                : modal.status === "approved"
                  ? "Approve Deposit?"
                  : "Reject Deposit?"}
            </h2>
            <p className="deposit-modal-description">
              {modal.type === "delete"
                ? "This deposit record will be permanently deleted. This action cannot be undone."
                : modal.status === "approved"
                  ? "Confirm that you have verified this payment in your bank statement before approving it."
                  : "Confirm that you want to reject this deposit request."}
            </p>

            <div className="deposit-modal-details">
              <div><span>Profile ID</span><strong>{modal.deposit.profile_id || "-"}</strong></div>
              <div><span>Amount</span><strong>₹{formatAmount(modal.deposit.amount)}</strong></div>
              <div><span>UTR</span><strong>{modal.deposit.utr || "-"}</strong></div>
            </div>

            {modal.type === "status" && modal.status === "rejected" && (
              <label className="deposit-reason-label">
                Rejection reason <span>(optional)</span>
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Enter a reason for rejecting this deposit..."
                  rows={3}
                  maxLength={500}
                />
              </label>
            )}

            <div className="deposit-modal-actions">
              <button
                type="button"
                className="deposit-modal-cancel"
                onClick={closeModal}
                disabled={processingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`deposit-modal-confirm ${modal.type === "delete" || modal.status === "rejected" ? "danger" : "success"}`}
                onClick={modal.type === "delete" ? deleteDeposit : updateStatus}
                disabled={processingId !== null}
              >
                {processingId !== null
                  ? "Please wait..."
                  : modal.type === "delete"
                    ? "Delete Deposit"
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

export default DepositUsers;
