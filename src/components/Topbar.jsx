
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Topbar.css";

const getIndianDateTime = () => {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const Topbar = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(getIndianDateTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getIndianDateTime());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("bgmi_admin_logged_in");
    navigate("/admin-login", { replace: true });
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-heading-icon">🎮</div>

        <div className="topbar-heading-content">
          <h1 className="topbar-title">
            BGMI Esports Control Panel
          </h1>
          <p className="topbar-subtitle">
            Tournament Administration Dashboard
          </p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-clock">
          <span className="topbar-clock-icon">◷</span>
          <div className="topbar-clock-content">
            <span className="topbar-time">{currentTime}</span>
            <span className="topbar-timezone">INDIAN STANDARD TIME</span>
          </div>
        </div>

        <div className="topbar-badge">
          <span className="topbar-status-dot"></span>
          ADMIN
        </div>

        <button
          type="button"
          className="logout-btn"
          onClick={handleLogout}
          aria-label="Logout from admin panel"
        >
          <span className="logout-icon">↪</span>
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
