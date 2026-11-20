
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./UserBankDetails.css";

const ADMIN_API =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5003"
    : "https://withdraw-server-3.onrender.com";

const getErrorMessage = (error) => {
  const status = error?.response?.status;

  if (status === 401 || status === 403) {
    return "You are not authorized to view bank details. Please check your admin session.";
  }

  if (status === 404) {
    return "The bank details endpoint was not found.";
  }

  if (status >= 500) {
    return "The server is temporarily unavailable. Please try again.";
  }

  if (!error?.response) {
    return "Unable to connect to the server. Please check your connection.";
  }

  return (
    error?.response?.data?.message ||
    "Unable to load bank details."
  );
};

const formatIndianDate = (dateValue) => {
  if (!dateValue) return "-";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const UserBankDetails = () => {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchAllBanks = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      setError("");

      // Cache-Control header removed to prevent CORS preflight error.
      const { data } = await axios.get(
        `${ADMIN_API}/api/admin/all-banks`,
        {
          timeout: 20000,
        }
      );

      const bankList = Array.isArray(data?.banks)
        ? data.banks
        : [];

      const enhancedBanks = bankList.map((bank) => ({
        ...bank,
        displayUserId: bank.user_id || "N/A",
        displayName:
          bank.profile_name ||
          bank.account_holder ||
          "Unknown",
        displayTime: formatIndianDate(
          bank.created_at_ist || bank.created_at
        ),
      }));

      setBanks(enhancedBanks);

      setLastUpdated(
        new Date().toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchAllBanks();
  }, [fetchAllBanks]);

  return (
    <div className="bank-admin-page">
      <div className="bank-page-header">
        <div>
          <span className="bank-eyebrow">
            ADMIN CONTROL PANEL
          </span>

          <h1>User Bank Details</h1>

          <p>
            View the bank account information submitted by users.
          </p>
        </div>

        <button
          type="button"
          className="bank-refresh-btn"
          onClick={() => fetchAllBanks()}
          disabled={loading}
        >
          <span
            className={
              loading
                ? "bank-refresh-icon is-spinning"
                : "bank-refresh-icon"
            }
          >
            ↻
          </span>

          Refresh
        </button>
      </div>

      <div className="bank-summary-grid">
        <div className="bank-summary-card">
          <span className="bank-summary-label">
            Total Bank Records
          </span>

          <strong>{banks.length}</strong>

          <span className="bank-summary-foot">
            Submitted account details
          </span>
        </div>

        <div className="bank-summary-card">
          <span className="bank-summary-label">
            Last Updated
          </span>

          <strong className="bank-updated-value">
            {lastUpdated || "--:--"}
          </strong>

          <span className="bank-summary-foot">
            Indian Standard Time
          </span>
        </div>
      </div>

      <section className="bank-panel">
        <div className="bank-panel-heading">
          <div>
            <h2>Saved Bank Accounts</h2>

            <p>
              Account details are displayed as received from the server.
            </p>
          </div>

          <span className="bank-record-count">
            {banks.length} Records
          </span>
        </div>

        {error && (
          <div className="bank-error" role="alert">
            <span>{error}</span>

            <button
              type="button"
              onClick={() => fetchAllBanks()}
            >
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="bank-loading">
            <span className="bank-spinner" />

            <p>Loading bank details...</p>
          </div>
        ) : banks.length === 0 && !error ? (
          <div className="bank-empty">
            <span className="bank-empty-icon">▤</span>

            <strong>No bank details found</strong>

            <small>
              Bank account records will appear here when users submit them.
            </small>
          </div>
        ) : (
          <div className="bank-table-wrap">
            <table className="bank-data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User ID</th>
                  <th>Profile</th>
                  <th>Account Holder</th>
                  <th>Bank</th>
                  <th>Account Number</th>
                  <th>IFSC</th>
                  <th>Time (IST)</th>
                </tr>
              </thead>

              <tbody>
                {banks.map((bank, index) => (
                  <tr
                    key={bank.id || bank.user_id || index}
                  >
                    <td data-label="ID">
                      {bank.id ?? "-"}
                    </td>

                    <td data-label="User ID">
                      <code className="bank-mono bank-user-id">
                        {bank.displayUserId}
                      </code>
                    </td>

                    <td data-label="Profile">
                      <strong className="bank-profile-name">
                        {bank.displayName}
                      </strong>
                    </td>

                    <td data-label="Account Holder">
                      {bank.account_holder || "-"}
                    </td>

                    <td data-label="Bank">
                      <span className="bank-name">
                        {bank.bank_name || "-"}
                      </span>
                    </td>

                    <td data-label="Account Number">
                      <code className="bank-mono bank-account-number">
                        {bank.account_number || "-"}
                      </code>
                    </td>

                    <td data-label="IFSC">
                      <code className="bank-mono">
                        {bank.ifsc_code || "-"}
                      </code>
                    </td>

                    <td data-label="Time (IST)">
                      <strong className="bank-time">
                        {bank.displayTime}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="bank-security-note">
        <span>ⓘ</span>
        Bank account information is sensitive. Only authorized
        administrators should access or share it.
      </p>
    </div>
  );
};

export default UserBankDetails;
