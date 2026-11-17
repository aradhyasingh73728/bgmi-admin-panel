
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import { useEffect } from "react";
import axios from "axios";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

import Dashboard from "./pages/Dashboard";
import RegisterUsers from "./pages/RegisterUsers";
import RoomManagement from "./pages/RoomManagement";
import TdmJoins from "./pages/TdmJoins";
import Settings from "./pages/Settings";
import AdminLogin from "./pages/AdminLogin";

import DepositUsers from "./pages/DepositUsers";
import WithdrawRequests from "./pages/WithdrawRequests";
import UserBankDetails from "./pages/UserBankDetails";

import AdminTournamentDetail from "./pages/AdminTournamentDetail";
import TournamentManagement from "./pages/TournamentManagement";
import TournamentResults from "./pages/TournamentResults";
import AdminSupport from "./pages/AdminSupport";
import SecurityManagement from "./pages/SecurityManagement";
import AdminSessionManagement from "./pages/AdminSessionManagement";

import "./styles/theme.css";

// ==========================================
// ADMIN AUTH API
// ==========================================

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://admin-login-server-5000.onrender.com";

// ==========================================
// ADMIN LOGIN CHECK
// ==========================================

const isAdminLoggedIn = () =>
  localStorage.getItem("bgmi_admin_logged_in") === "true" &&
  Boolean(localStorage.getItem("adminToken"));

// ==========================================
// AUTOMATIC SESSION VERIFICATION
// ==========================================

const ProtectedApp = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("bgmi_admin_logged_in");
      navigate("/admin-login", { replace: true });
      return;
    }

    let isChecking = false;
    let isMounted = true;

    const verifySession = async () => {
      if (isChecking || !isMounted) {
        return;
      }

      isChecking = true;

      try {
        await axios.get(`${API_URL}/admin/verify`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        // Revoked or invalid session
        if (
          error.response?.status === 401 ||
          error.response?.status === 403
        ) {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("bgmi_admin_logged_in");

          navigate("/admin-login", { replace: true });
        } else {
          console.error(
            "Admin session verification unavailable:",
            error.message
          );
        }
      } finally {
        isChecking = false;
      }
    };

    // Verify immediately
    verifySession();

    // Verify every 3 seconds
    const interval = setInterval(() => {
      verifySession();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [navigate]);

  if (!isAdminLoggedIn()) {
    return <Navigate to="/admin-login" replace />;
  }

  return <AdminLayout />;
};

// ==========================================
// LAYOUT FOR ALL ADMIN PAGES
// ==========================================

const AdminLayout = () => (
  <div className="app-root">
    <Sidebar />

    <div className="app-main">
      <Topbar />

      <div className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/register-users" element={<RegisterUsers />} />
          <Route path="/security-management" element={<SecurityManagement />} />
          <Route path="/admin-sessions" element={<AdminSessionManagement />} />
          <Route path="/tournament-management" element={<TournamentManagement />} />
          <Route path="/tournament-results" element={<TournamentResults />} />
          <Route path="/support" element={<AdminSupport />} />
          <Route path="/rooms" element={<RoomManagement />} />
          <Route path="/tdm-joins" element={<TdmJoins />} />
          <Route path="/deposit-users" element={<DepositUsers />} />
          <Route path="/withdraw-requests" element={<WithdrawRequests />} />
          <Route path="/user-bank-details/:userId" element={<UserBankDetails />} />
          <Route path="/tournament/:id" element={<AdminTournamentDetail />} />
          <Route path="/settings" element={<Settings />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  </div>
);

// ==========================================
// MAIN APP
// ==========================================

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin-login" element={<AdminLogin />} />

        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </Router>
  );
}

export default App;
