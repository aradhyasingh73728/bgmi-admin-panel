
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./AdminLogin.css";

/* =================================
   API BASE - LOCAL + LIVE
================================= */

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://admin-login-server-5000.onrender.com";

const AdminLogin = () => {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  /* =================================
     LOGIN HANDLER
  ================================= */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError("");

    if (!adminId.trim() || !password) {
      setError("Please enter your Admin ID and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(
        `${API_URL}/admin/login`,
        {
          id: adminId.trim(),
          password: password,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 20000,
        }
      );

      if (res.data?.success && res.data?.token) {
        const token = res.data.token;

        localStorage.setItem("adminToken", token);
        localStorage.setItem("bgmi_admin_logged_in", "true");

        const verify = await axios.get(
          `${API_URL}/admin/verify`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 20000,
          }
        );

        if (verify.data?.success) {
          navigate("/", { replace: true });
          return;
        }

        setError("Token verification failed. Please login again.");

        localStorage.removeItem("adminToken");
        localStorage.removeItem("bgmi_admin_logged_in");
      } else {
        setError(
          res.data?.message || "Invalid admin credentials."
        );
      }
    } catch (err) {
      console.error(
        "Admin login error:",
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.message ||
        (err.code === "ECONNABORTED"
          ? "Server response timed out. Please try again."
          : "Admin login failed. Please check your credentials.")
      );

      localStorage.removeItem("adminToken");
      localStorage.removeItem("bgmi_admin_logged_in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-auth-page">

      {/* BACKGROUND EFFECTS */}

      <div className="admin-bg-grid"></div>
      <div className="admin-bg-glow admin-glow-one"></div>
      <div className="admin-bg-glow admin-glow-two"></div>

      {/* MAIN LOGIN WRAPPER */}

      <div className="admin-auth-shell">

        <div className="admin-auth-card">

          {/* TOP DECORATION */}

          <div className="admin-card-top-line"></div>

          {/* BRANDING */}

          <div className="admin-auth-header">

            <div className="admin-logo">
              <span className="admin-logo-icon">⚔</span>
            </div>

            <span className="admin-access-badge">
              <span className="admin-live-dot"></span>
              SECURE ADMIN ACCESS
            </span>

            <h1 className="admin-login-title">
              BGMI <span>ESPORTS</span>
            </h1>

            <h2 className="admin-login-subtitle">
              CONTROL LOGIN
            </h2>

            <p className="admin-login-description">
              Authorized administrators only
            </p>

          </div>

          {/* ERROR MESSAGE */}

          {error && (
            <div className="admin-login-error" role="alert">
              <span className="admin-error-icon">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* LOGIN FORM */}

          <form
            className="admin-login-form"
            onSubmit={handleSubmit}
          >

            {/* ADMIN ID */}

            <div className="admin-input-group">

              <label htmlFor="adminId">
                ADMIN ID
              </label>

              <div className="admin-input-wrapper">
                <span className="admin-input-icon">◈</span>

                <input
                  id="adminId"
                  type="text"
                  placeholder="Enter your admin ID"
                  value={adminId}
                  onChange={(e) => {
                    setAdminId(e.target.value);
                    setError("");
                  }}
                  autoComplete="username"
                  required
                  disabled={loading}
                />
              </div>

            </div>

            {/* PASSWORD */}

            <div className="admin-input-group">

              <label htmlFor="adminPassword">
                PASSWORD
              </label>

              <div className="admin-input-wrapper">
                <span className="admin-input-icon">◆</span>

                <input
                  id="adminPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />

                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  disabled={loading}
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>

            </div>

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              className="admin-login-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="admin-button-spinner"></span>
                  VERIFYING ACCESS...
                </>
              ) : (
                <>
                  <span>ENTER CONTROL ROOM</span>
                  <span className="admin-button-arrow">➜</span>
                </>
              )}
            </button>

            {/* SECURITY MESSAGE */}

            <div className="admin-security-message">
              <span>🛡</span>
              <p>
                Protected admin authentication system.
                Unauthorized access is prohibited.
              </p>
            </div>

          </form>

          {/* FOOTER */}

          <div className="admin-login-footer">
            <span>BGMI ESPORTS</span>
            <span className="admin-footer-divider">|</span>
            <span>ADMIN PANEL</span>
          </div>

        </div>

        <p className="admin-bottom-text">
          POWERED BY ESPORTS MANAGEMENT SYSTEM
        </p>

      </div>
    </div>
  );
};

export default AdminLogin;
