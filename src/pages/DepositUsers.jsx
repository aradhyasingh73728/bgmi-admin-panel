import { useEffect, useState, useCallback } from "react";
import "./DepositUsers.css";

const API =
  window.location.hostname === "localhost"
    ? "http://localhost:5002"
    : "https://deposit-and-join-tournament-server-5002.onrender.com";

/* ============================= ADMIN TOKEN ============================= */
// ✅ CHANGED: AdminLogin token ko "adminToken" naam se save karta hai
const getAdminHeaders = (withJson = false) => {
  const token = String(localStorage.getItem("adminToken") || "").trim();

  if (!token) return null;

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (withJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
};

const DepositUsers = () => {
  const [deposits, setDeposits] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);

  /* ============================= DATE FORMAT (INDIA) ============================= */
  const formatIndianDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const d = new Date(dateString);
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (err) {
      return dateString;
    }
  };

  /* ============================= FETCH DEPOSITS ============================= */
  const fetchDeposits = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const headers = getAdminHeaders();

      if (!headers) {
        setDeposits([]);
        setError("Admin token missing. Please login again.");
        return;
      }

      const res = await fetch(`${API}/api/admin/deposits`, { headers });

      if (res.status === 401 || res.status === 403) {
        setDeposits([]);
        setError("Admin session expired. Please login again.");
        return;
      }

      if (!res.ok) throw new Error("Fetch failed");

      const data = await res.json();
      setDeposits(data.deposits || []);
    } catch (err) {
      setError("Server down");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  /* ============================= UPDATE STATUS (API CALL) ============================= */
  const updateStatus = async (deposit, status) => {
    if (processingId) return;

    const headers = getAdminHeaders(true);

    if (!headers) {
      alert("Admin token missing. Please login again.");
      return;
    }

    let reason = "";

    if (status === "approved") {
      const ok = window.confirm(
        `Approve ₹${deposit.amount} for ${deposit.profile_id}?\n` +
          `UTR: ${deposit.utr}\n\n` +
          `Pehle bank statement me ye payment check kar lo.`
      );

      if (!ok) return;
    } else {
      const input = window.prompt(
        `Reject ₹${deposit.amount} (UTR: ${deposit.utr})?\n\nReason (optional):`,
        ""
      );

      // Cancel dabaya to kuch mat karo
      if (input === null) return;

      reason = input.trim();
    }

    try {
      setProcessingId(deposit.id);

      const res = await fetch(`${API}/api/admin/deposit-status/${deposit.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ status, reason }),
      });

      let data = null;

      try {
        data = await res.json();
      } catch (jsonError) {
        data = null;
      }

      if (res.ok && data?.success) {
        await fetchDeposits(); // Refresh data from Supabase
      } else {
        alert(data?.message || "Update failed");

        // Already processed ho chuka hai to list refresh kar do
        if (res.status === 409) {
          fetchDeposits();
        }
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessingId(null);
    }
  };

  /* ============================= DELETE DEPOSIT (API CALL) ============================= */
  const deleteDeposit = async (id) => {
    if (processingId) return;

    if (!window.confirm("Are you sure you want to delete this deposit?")) return;

    const headers = getAdminHeaders();

    if (!headers) {
      alert("Admin token missing. Please login again.");
      return;
    }

    try {
      setProcessingId(id);

      const res = await fetch(`${API}/api/admin/deposit/${id}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        await fetchDeposits(); // Refresh data from Supabase
      } else {
        let data = null;

        try {
          data = await res.json();
        } catch (jsonError) {
          data = null;
        }

        alert(data?.message || "Delete failed");
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessingId(null);
    }
  };

  /* ============================= FILTER ============================= */
  const filteredDeposits = deposits.filter(
    (d) => d.status === filter
  );

  const getCount = (s) =>
    deposits.filter((d) => d.status === s).length;

  if (loading) return <div style={{ padding: 50 }}>🔄 Loading deposits...</div>;

  /* ============================= RENDER ============================= */
  return (
    <div className="deposit-admin">
      <h2>💰 Deposit Requests (Admin)</h2>

      {/* FILTER */}
      <div className="deposit-filter">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            className={filter === s ? "active" : ""}
            onClick={() => setFilter(s)}
          >
            {s.toUpperCase()} ({getCount(s)})
          </button>
        ))}
      </div>

      {error && <div style={{ color: "red" }}>{error}</div>}

      {/* TABLE */}
      <table className="deposit-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Profile ID</th>
            <th>Email</th>
            <th>Amount</th>
            <th>UTR</th>
            <th>Date/Time (IST)</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {filteredDeposits.length === 0 ? (
            <tr>
              <td colSpan="8" style={{ textAlign: "center" }}>
                No {filter} deposits
              </td>
            </tr>
          ) : (
            filteredDeposits.map((d) => (
              <tr key={d.id}>
                <td>{d.name || "Unknown"}</td>
                <td>{d.profile_id}</td>
                <td>{d.email}</td>
                <td>₹{d.amount}</td>
                <td>{d.utr}</td>
                <td>{d.date_ist || formatIndianDate(d.date)}</td>
                <td>{d.status}</td>
                <td>
                  {d.status === "pending" ? (
                    <>
                      <button
                        disabled={processingId !== null}
                        onClick={() => updateStatus(d, "approved")}
                        style={{
                          marginRight: 5,
                          background: "#4CAF50",
                          opacity: processingId !== null ? 0.6 : 1,
                        }}
                      >
                        ✅ Approve
                      </button>
                      <button
                        disabled={processingId !== null}
                        onClick={() => updateStatus(d, "rejected")}
                        style={{
                          marginRight: 5,
                          background: "#f44336",
                          opacity: processingId !== null ? 0.6 : 1,
                        }}
                      >
                        ❌ Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={processingId !== null}
                        onClick={() => deleteDeposit(d.id)}
                        style={{
                          color: "red",
                          background: "none",
                          border: "1px solid red",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          opacity: processingId !== null ? 0.6 : 1,
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DepositUsers;