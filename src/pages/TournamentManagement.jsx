import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./TournamentManagement.css";

// ==================================================
// API CONFIGURATION (Vite)
// ==================================================

const API_BASE = (
  import.meta.env.VITE_TOURNAMENT_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:5005"
    : "https://create-tournament-server-5005.onrender.com")
).replace(/\/+$/, "");

const LOGIN_PATH = "/admin-login";

const STATUSES = ["Draft", "Upcoming", "Live", "Cancelled"];

const TDM_MODES = [
  { value: "1v1", slots: 2 },
  { value: "2v2", slots: 4 },
  { value: "3v3", slots: 6 },
  { value: "4v4", slots: 8 },
  { value: "5v5", slots: 10 },
];

const TDM_MAPS = [
  "Warehouse", "Hangar", "Ruins",
  "Library", "Santorini", "Town",
];

const CLASSIC_MAPS = [
  "Erangel", "Livik", "Miramar", "Sanhok", "Vikendi",
];

// ==================================================
// HELPERS
// ==================================================

const getTodayDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

// Crypto based random ID (fewer collisions than Math.random)
const makeId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  window.crypto.getRandomValues(bytes);
  return `BG${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
};

const getTimeInput = (value) =>
  value ? String(value).slice(0, 5) : "";

const getVisibilityLabel = (tournament) => {
  if (tournament.is_hidden) return "Hidden";
  if (tournament.published) return "Published";
  return "Unpublished";
};

const getTdmSlots = (mode) =>
  TDM_MODES.find((item) => item.value === mode)?.slots || 2;

const isLockedStatus = (status) =>
  status === "Completed" || status === "Cancelled";

const dateTimeKey = (t) =>
  `${String(t.date || "").slice(0, 10)} ${getTimeInput(t.time)}`;

const EMPTY_FORM = {
  name: "",
  mode: "Solo",
  type: "Classic",
  map: "Erangel",
  date: "",
  time: "10:00",
  entryFee: "0",
  prizePool: "0",
  perKill: "0",
  totalSlots: "50",
  image: "",
  description: "",
  status: "Draft",
};

// ==================================================
// MAIN COMPONENT
// ==================================================

const TournamentManagement = () => {
  const [tournaments, setTournaments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");

  const [dailyRules, setDailyRules] = useState({});
  const [dailyActionId, setDailyActionId] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");

  const [activeSection, setActiveSection] = useState("today");
  const [today, setToday] = useState(getTodayDate());

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    date: getTodayDate(),
  });

  // Custom confirm dialog (replaces the browser's native confirm)
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolver = useRef(null);

  const askConfirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        confirmResolver.current = resolve;
        setConfirmState(options);
      }),
    []
  );

  const closeConfirm = useCallback((result) => {
    if (confirmResolver.current) confirmResolver.current(result);
    confirmResolver.current = null;
    setConfirmState(null);
  }, []);

  useEffect(() => {
    if (!confirmState) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeConfirm(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmState, closeConfirm]);

  // Latest-request guard (prevents stale responses from overwriting new data)
  const loadRequestRef = useRef(0);

  // ==================================================
  // AUTO DATE REFRESH
  // ==================================================

  useEffect(() => {
    const interval = setInterval(() => {
      const latestDate = getTodayDate();
      setToday((previous) =>
        previous !== latestDate ? latestDate : previous
      );
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // ==================================================
  // AUTO DISMISS ALERTS
  // ==================================================

  useEffect(() => {
    if (!success && !error) return;

    const timer = setTimeout(() => {
      setSuccess("");
      setError("");
    }, 7000);

    return () => clearTimeout(timer);
  }, [success, error]);

  // ==================================================
  // API REQUEST
  // ==================================================

  const apiRequest = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      window.location.href = LOGIN_PATH;
      throw new Error("Admin token not found. Please log in again.");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
      cache: "no-store",
    });

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(`Invalid server response (HTTP ${response.status}).`);
    }

    if (response.status === 401) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("bgmi_admin_logged_in");
      window.location.href = LOGIN_PATH;
      throw new Error("Admin session expired. Please log in again.");
    }

    if (response.status === 403) {
      throw new Error("You do not have permission to perform this action.");
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ||
          result.message ||
          `Request failed (HTTP ${response.status}).`
      );
    }

    return result;
  }, []);

  // ==================================================
  // LOAD DATA
  // ==================================================

  const loadTournaments = useCallback(
    async (showLoader = false) => {
      const requestId = ++loadRequestRef.current;

      if (showLoader) setLoading(true);

      try {
        const [tournamentResult, dailyResult] = await Promise.all([
          apiRequest("/api/admin/tournaments"),
          apiRequest("/api/admin/daily-repeat"),
        ]);

        // Ignore the response if a newer request has started
        if (requestId !== loadRequestRef.current) return;

        setTournaments(
          Array.isArray(tournamentResult.tournaments)
            ? tournamentResult.tournaments
            : []
        );

        const rulesMap = {};

        (dailyResult.rules || []).forEach((rule) => {
          rulesMap[rule.source_tournament_id] = {
            active: Boolean(rule.active),
            next_run_date: rule.next_run_date || "",
          };
        });

        setDailyRules(rulesMap);
      } catch (err) {
        if (requestId !== loadRequestRef.current) return;
        console.error("Tournament load error:", err);
        setError(err.message || "Unable to load tournament data.");
      } finally {
        if (requestId === loadRequestRef.current) setLoading(false);
      }
    },
    [apiRequest]
  );

  useEffect(() => {
    loadTournaments(true);
  }, [loadTournaments]);

  // ==================================================
  // SECTION CLASSIFICATION
  // ==================================================

  const classifiedTournaments = useMemo(() => {
    const todayList = [];
    const upcomingList = [];
    const historyList = [];

    tournaments.forEach((tournament) => {
      const date = String(tournament.date || "").slice(0, 10);
      const status = tournament.status || "Draft";

      if (isLockedStatus(status) || !date) {
        historyList.push(tournament);
        return;
      }

      // A Live tournament always stays in "Today", whatever its date
      // (it may have started late at night and run past midnight).
      if (status === "Live") {
        todayList.push(tournament);
        return;
      }

      if (date < today) {
        historyList.push(tournament);
      } else if (date > today) {
        upcomingList.push(tournament);
      } else {
        todayList.push(tournament);
      }
    });

    const ascending = (a, b) => dateTimeKey(a).localeCompare(dateTimeKey(b));
    const descending = (a, b) => dateTimeKey(b).localeCompare(dateTimeKey(a));

    todayList.sort(ascending);
    upcomingList.sort(ascending);
    historyList.sort(descending);

    return {
      today: todayList,
      upcoming: upcomingList,
      history: historyList,
    };
  }, [tournaments, today]);

  const sectionTournaments = useMemo(
    () => classifiedTournaments[activeSection] || [],
    [classifiedTournaments, activeSection]
  );

  const filteredTournaments = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return sectionTournaments.filter((tournament) => {
      const matchesSearch =
        !searchText ||
        String(tournament.name || "").toLowerCase().includes(searchText) ||
        String(tournament.id || "").toLowerCase().includes(searchText);

      const matchesStatus =
        filterStatus === "All" || tournament.status === filterStatus;

      const matchesType =
        filterType === "All" ||
        (tournament.type || "Classic") === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [sectionTournaments, search, filterStatus, filterType]);

  // ==================================================
  // FORM HELPERS
  // ==================================================

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((previous) => {
      const updated = { ...previous, [name]: value };

      if (name === "type") {
        if (value === "TDM") {
          updated.mode = "1v1";
          updated.map = "Warehouse";
          updated.entryFee = "100";
          updated.prizePool = "180";
          updated.perKill = "0";
          updated.totalSlots = "2";
        } else if (value === "Classic") {
          updated.mode = "Solo";
          updated.map = "Erangel";
          updated.perKill = "0";
          updated.totalSlots = "50";
        } else {
          updated.mode = "Solo";
          updated.map = "Erangel";
          updated.totalSlots = "50";
        }
      }

      if (name === "mode" && previous.type === "TDM") {
        updated.totalSlots = String(getTdmSlots(value));
      }

      return updated;
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId("");
    setForm({ ...EMPTY_FORM, date: getTodayDate() });
  };

  const openCreateForm = () => {
    setEditingId("");
    setForm({ ...EMPTY_FORM, date: getTodayDate(), time: "10:00" });
    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const openEditForm = (tournament) => {
    setEditingId(tournament.id);

    setForm({
      name: tournament.name || "",
      mode: tournament.mode || "Solo",
      type: tournament.type || "Classic",
      map: tournament.map || "Erangel",
      date: String(tournament.date || getTodayDate()).slice(0, 10),
      time: getTimeInput(tournament.time) || "10:00",
      entryFee: String(tournament.entryFee ?? 0),
      prizePool: String(tournament.prizePool ?? 0),
      perKill: String(tournament.perKill ?? 0),
      totalSlots: String(tournament.totalSlots ?? 50),
      image: tournament.image || "",
      description: tournament.description || "",
      status: tournament.status || "Draft",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  };

  const closeForm = useCallback(() => {
    if (saving) return;
    resetForm();
  }, [saving]);

  // Close the form with the Escape key
  useEffect(() => {
    if (!showForm) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !confirmState) closeForm();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showForm, confirmState, closeForm]);

  // Lock page scroll while the form is open
  useEffect(() => {
    if (!showForm) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showForm]);

  // ==================================================
  // COMMISSION
  // ==================================================

  const commissionPreview = useMemo(() => {
    const entry = Number(form.entryFee || 0);
    const prize = Number(form.prizePool || 0);
    const slots = Number(form.totalSlots || 0);

    const collection = entry * slots;
    const commission = collection - prize;

    return { collection, commission, valid: commission >= 0 };
  }, [form.entryFee, form.prizePool, form.totalSlots]);

  // ==================================================
  // VALIDATION
  // ==================================================

  const validateForm = (payload) => {
    if (!payload.name) {
      throw new Error("Tournament name is required.");
    }

    if (!Number.isFinite(payload.entryFee) || payload.entryFee < 0) {
      throw new Error("Entry fee must be a valid amount.");
    }

    if (!Number.isFinite(payload.prizePool) || payload.prizePool < 0) {
      throw new Error("Prize pool must be a valid amount.");
    }

    if (!Number.isFinite(payload.perKill) || payload.perKill < 0) {
      throw new Error("Per-kill amount must be a valid amount.");
    }

    if (!Number.isInteger(payload.totalSlots) || payload.totalSlots < 1) {
      throw new Error("Total slots must be a whole number of at least 1.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date || "")) {
      throw new Error("Please select a valid tournament date.");
    }

    if (!editingId && payload.date < getTodayDate()) {
      throw new Error("A new tournament cannot be scheduled in the past.");
    }

    if (!/^\d{2}:\d{2}$/.test(payload.time || "")) {
      throw new Error("Please select a valid tournament time.");
    }

    if (payload.entryFee * payload.totalSlots < payload.prizePool) {
      throw new Error(
        "The prize pool cannot exceed the total entry collection."
      );
    }

    if (editingId) {
      const existing = tournaments.find((item) => item.id === editingId);
      const joined = Number(existing?.joinedPlayers || 0);

      if (payload.totalSlots < joined) {
        throw new Error(
          `Total slots cannot be lower than ${joined}, because that many players have already joined.`
        );
      }
    }

    if (payload.type === "TDM") {
      if (!TDM_MODES.some((item) => item.value === payload.mode)) {
        throw new Error("Invalid TDM format selected.");
      }

      if (!TDM_MAPS.includes(payload.map)) {
        throw new Error("Invalid TDM map selected.");
      }

      if (payload.totalSlots !== getTdmSlots(payload.mode)) {
        throw new Error("TDM player slots do not match the selected format.");
      }
    }
  };

  // ==================================================
  // CREATE / UPDATE
  // ==================================================

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name: form.name.trim(),
        mode: form.mode,
        type: form.type,
        map: form.map,
        date: form.date,
        time: form.time,
        entryFee: Number(form.entryFee),
        prizePool: Number(form.prizePool),
        perKill: Number(form.perKill),
        totalSlots: Number(form.totalSlots),
        image: form.image.trim(),
        description: form.description.trim(),
        status: form.status,
      };

      validateForm(payload);

      if (editingId) {
        const result = await apiRequest(
          `/api/admin/tournaments/${encodeURIComponent(editingId)}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );

        setSuccess(result.message || "Tournament updated successfully.");
      } else {
        const id = makeId();

        await apiRequest("/api/admin/tournaments", {
          method: "POST",
          body: JSON.stringify({ id, ...payload, published: false }),
        });

        setSuccess(`Tournament created successfully. ID: ${id}`);
      }

      resetForm();
      await loadTournaments();
    } catch (err) {
      console.error("Save tournament error:", err);
      setError(err.message || "Unable to save the tournament.");
    } finally {
      setSaving(false);
    }
  };

  // ==================================================
  // PUBLISH / HIDE
  // ==================================================

  const changeVisibility = async (tournament) => {
    const isCurrentlyPublished =
      Boolean(tournament.published) && !tournament.is_hidden;

    const shouldPublish = !isCurrentlyPublished;

    const confirmed = await askConfirm({
      title: shouldPublish ? "Publish this tournament?" : "Hide this tournament?",
      message: shouldPublish
        ? `"${tournament.name}" will become visible to players.`
        : `"${tournament.name}" will no longer be visible to players.`,
      confirmText: shouldPublish ? "Publish" : "Hide",
      danger: !shouldPublish,
    });

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}/visibility`,
        {
          method: "PATCH",
          body: JSON.stringify(
            shouldPublish ? { published: true } : { hidden: true }
          ),
        }
      );

      setSuccess(
        result.message || `Visibility updated for "${tournament.name}".`
      );
      await loadTournaments();
    } catch (err) {
      console.error("Visibility update error:", err);
      setError(err.message || "Unable to update visibility.");
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // STATUS
  // ==================================================

  const changeStatus = async (tournament, status) => {
    if (status === tournament.status) return;

    if (status === "Completed") {
      setError("Use the Complete Tournament action to mark a tournament as Completed.");
      return;
    }

    if (isLockedStatus(tournament.status)) {
      setError("The status of a Cancelled or Completed tournament cannot be changed.");
      return;
    }

    const extraWarning =
      status === "Cancelled"
        ? "\n\nA cancelled tournament cannot be changed again."
        : "";

    const confirmed = await askConfirm({
      title: "Change tournament status?",
      message: `"${tournament.name}" will be set to ${status}.${extraWarning}`,
      confirmText: `Set ${status}`,
      danger: status === "Cancelled",
    });

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) }
      );

      setSuccess(result.message || "Tournament status updated.");
      await loadTournaments();
    } catch (err) {
      console.error("Status update error:", err);
      setError(err.message || "Unable to update the status.");
      await loadTournaments();
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // DAILY REPEAT
  // ==================================================

  const toggleDailyRepeat = async (tournament) => {
    const tournamentId = tournament.id;
    const newStatus = !dailyRules[tournamentId]?.active;

    const confirmed = await askConfirm({
      title: newStatus ? "Enable Daily Repeat?" : "Disable Daily Repeat?",
      message: newStatus
        ? `A new copy of "${tournament.name}" will be created automatically every day, starting tomorrow.`
        : `"${tournament.name}" will stop generating new tournaments automatically.`,
      confirmText: newStatus ? "Enable Daily" : "Disable Daily",
      danger: !newStatus,
    });

    if (!confirmed) return;

    setDailyActionId(tournamentId);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/repeat-daily`,
        { method: "POST", body: JSON.stringify({ enabled: newStatus }) }
      );

      setSuccess(
        result.message ||
          (newStatus ? "Daily repeat enabled." : "Daily repeat disabled.")
      );

      await loadTournaments();
    } catch (err) {
      console.error("Daily repeat error:", err);
      setError(err.message || "Unable to update daily repeat.");
    } finally {
      setDailyActionId("");
    }
  };

  // ==================================================
  // DUPLICATE
  // ==================================================

  const duplicateTournament = async (tournament) => {
    const newId = makeId();

    const confirmed = await askConfirm({
      title: "Duplicate this tournament?",
      message: `A draft copy of "${tournament.name}" will be created.\n\nNew ID: ${newId}`,
      confirmText: "Create Copy",
    });

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}/duplicate`,
        { method: "POST", body: JSON.stringify({ newId }) }
      );

      setSuccess(result.message || `Tournament duplicated. New ID: ${newId}`);
      await loadTournaments();
    } catch (err) {
      console.error("Duplicate error:", err);
      setError(err.message || "Unable to duplicate the tournament.");
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // DELETE
  // ==================================================

  const deleteTournament = async (tournament) => {
    const joined = Number(tournament.joinedPlayers || 0);

    const confirmed = await askConfirm({
      title: "Delete this tournament?",
      message:
        `"${tournament.name}" (${tournament.id}) will be permanently deleted.\n\n` +
        (joined > 0
          ? `${joined} joined player${joined === 1 ? "" : "s"} will be refunded their entry fee.\n\n`
          : "") +
        "This action cannot be undone.",
      confirmText: "Delete",
      danger: true,
    });

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}`,
        { method: "DELETE" }
      );

      const refundedPlayers = Number(result.result?.refunded_players || 0);
      const totalRefunded = Number(result.result?.total_refunded || 0);

      setSuccess(
        `Tournament deleted. ${refundedPlayers} player${refundedPlayers === 1 ? "" : "s"} refunded, total ${money(totalRefunded)}.`
      );

      await loadTournaments();
    } catch (err) {
      console.error("Delete error:", err);
      setError(err.message || "Unable to delete the tournament.");
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // STATISTICS
  // ==================================================

  const stats = useMemo(
    () => ({
      total: tournaments.length,
      today: classifiedTournaments.today.length,
      upcoming: classifiedTournaments.upcoming.length,
      history: classifiedTournaments.history.length,
      published: tournaments.filter(
        (item) => item.published && !item.is_hidden
      ).length,
      players: tournaments.reduce(
        (sum, item) => sum + Number(item.joinedPlayers || 0),
        0
      ),
    }),
    [tournaments, classifiedTournaments]
  );

  const statCards = [
    { key: "total", label: "TOTAL TOURNAMENTS", value: stats.total, icon: "▦", note: "All records" },
    { key: "today", label: "TODAY", value: stats.today, icon: "◉", note: "Scheduled & live" },
    { key: "upcoming", label: "UPCOMING", value: stats.upcoming, icon: "➜", note: "Future dates" },
    { key: "history", label: "HISTORY", value: stats.history, icon: "↺", note: "Past & closed" },
    { key: "published", label: "PUBLISHED", value: stats.published, icon: "✓", note: "Visible to players" },
    { key: "players", label: "REGISTRATIONS", value: stats.players, icon: "♟", note: "Total joined" },
  ];

  const sectionInfo = {
    today: {
      title: "Today's Tournaments",
      description: `Tournaments scheduled for ${today} (India time) and all Live tournaments.`,
    },
    upcoming: {
      title: "Upcoming Tournaments",
      description: "Tournaments scheduled for future dates.",
    },
    history: {
      title: "Tournament History",
      description: "Past-date, completed and cancelled tournaments.",
    },
  };

  const anyActionRunning =
    loading || Boolean(actionId) || Boolean(dailyActionId);

  // ==================================================
  // UI
  // ==================================================

  return (
    <div className="tournament-management">
      {/* HEADER */}
      <header className="tm-header">
        <div className="tm-heading">
          <div className="tm-eyebrow">
            <span />
            ADMIN CONTROL CENTER
          </div>
          <h1>
            Tournament <em>Management</em>
          </h1>
          <p>Create, schedule, publish and manage BGMI tournaments.</p>
        </div>

        <div className="tm-header-actions">
          <button
            type="button"
            className="tm-btn tm-btn-secondary"
            onClick={() => loadTournaments(true)}
            disabled={anyActionRunning}
          >
            <span className={loading ? "tm-spin" : ""}>↻</span>
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            className="tm-btn tm-btn-primary"
            onClick={openCreateForm}
          >
            + Create Tournament
          </button>
        </div>
      </header>

      {/* ALERTS */}
      {error && !showForm && (
        <div className="tm-alert tm-alert-error" role="alert">
          <span className="tm-alert-icon">!</span>
          <span className="tm-alert-text">{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="tm-alert tm-alert-success" role="status">
          <span className="tm-alert-icon">✓</span>
          <span className="tm-alert-text">{success}</span>
          <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* STATISTICS */}
      <section className="tm-stats-grid">
        {statCards.map((card) => (
          <div key={card.key} className={`tm-stat-card ${card.key}`}>
            <div className="tm-stat-top">
              <span>{card.label}</span>
              <i>{card.icon}</i>
            </div>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </div>
        ))}
      </section>

      {/* CREATE / EDIT FORM */}
      {showForm && (
        <div className="tm-form-overlay">
          <div
            className="tm-form-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tm-form-title"
          >
            <div className="tm-form-heading">
              <div>
                <div className="tm-kicker">
                  {editingId ? "EDIT MODE" : "NEW TOURNAMENT"}
                </div>
                <h2 id="tm-form-title">
                  {editingId ? "Edit Tournament" : "Create Tournament"}
                </h2>
                <p>
                  {editingId
                    ? `Editing tournament #${editingId}`
                    : "The new tournament will be saved as a draft."}
                </p>
              </div>

              <button
                type="button"
                className="tm-close-btn"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="tm-alert tm-alert-error" role="alert">
                <span className="tm-alert-icon">!</span>
                <span className="tm-alert-text">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="tm-form-grid">
                <label className="tm-field tm-field-full">
                  <span>Tournament Name *</span>
                  <input
                    name="name"
                    value={form.name}
                    onChange={updateField}
                    placeholder="Enter tournament name"
                    maxLength={80}
                    required
                  />
                </label>

                <label className="tm-field">
                  <span>Tournament Type *</span>
                  <select name="type" value={form.type} onChange={updateField}>
                    <option value="Classic">Classic</option>
                    <option value="TDM">TDM</option>
                    <option value="Custom Room">Custom Room</option>
                  </select>
                </label>

                <label className="tm-field">
                  <span>{form.type === "TDM" ? "TDM Format" : "Game Mode"}</span>
                  <select name="mode" value={form.mode} onChange={updateField}>
                    {form.type === "TDM" ? (
                      TDM_MODES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.value}
                        </option>
                      ))
                    ) : (
                      <>
                        <option>Solo</option>
                        <option>Duo</option>
                        <option>Squad</option>
                      </>
                    )}
                  </select>
                </label>

                <label className="tm-field">
                  <span>Map</span>
                  <select name="map" value={form.map} onChange={updateField}>
                    {(form.type === "TDM" ? TDM_MAPS : CLASSIC_MAPS).map(
                      (map) => (
                        <option key={map} value={map}>
                          {map}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="tm-field">
                  <span>Tournament Date *</span>
                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    min={editingId ? undefined : today}
                    onChange={updateField}
                    required
                  />
                  <small>Defaults to today's India date. You can pick a future date.</small>
                </label>

                <label className="tm-field">
                  <span>Tournament Time *</span>
                  <input
                    type="time"
                    name="time"
                    value={form.time}
                    onChange={updateField}
                    required
                  />
                </label>

                <label className="tm-field">
                  <span>Entry Fee Per Player (₹)</span>
                  <input
                    type="number"
                    name="entryFee"
                    min="0"
                    step="0.01"
                    value={form.entryFee}
                    onChange={updateField}
                    required
                  />
                </label>

                <label className="tm-field">
                  <span>Winner Prize (₹)</span>
                  <input
                    type="number"
                    name="prizePool"
                    min="0"
                    step="0.01"
                    value={form.prizePool}
                    onChange={updateField}
                    required
                  />
                </label>

                {form.type !== "TDM" && (
                  <label className="tm-field">
                    <span>Per Kill (₹)</span>
                    <input
                      type="number"
                      name="perKill"
                      min="0"
                      step="0.01"
                      value={form.perKill}
                      onChange={updateField}
                      required
                    />
                  </label>
                )}

                <label className="tm-field">
                  <span>
                    {form.type === "TDM"
                      ? "Total Players (Automatic)"
                      : "Total Slots"}
                  </span>
                  <input
                    type="number"
                    name="totalSlots"
                    min="1"
                    step="1"
                    value={form.totalSlots}
                    onChange={updateField}
                    readOnly={form.type === "TDM"}
                    required
                  />
                  {form.type === "TDM" && (
                    <small>
                      Set automatically from the selected TDM format.
                    </small>
                  )}
                </label>

                <div className="tm-field tm-field-full">
                  <span>Collection &amp; Admin Commission Preview</span>
                  <div className="tm-commission-preview">
                    <div>
                      <small>Total Collection</small>
                      <strong>{money(commissionPreview.collection)}</strong>
                    </div>
                    <div>
                      <small>Winner Prize</small>
                      <strong>{money(form.prizePool)}</strong>
                    </div>
                    <div>
                      <small>Admin Commission</small>
                      <strong
                        className={
                          commissionPreview.valid
                            ? "tm-commission-ok"
                            : "tm-commission-bad"
                        }
                      >
                        {money(commissionPreview.commission)}
                      </strong>
                    </div>
                  </div>
                  <small>
                    Total players × entry fee − winner prize. Actual collection
                    depends on successful registrations.
                  </small>
                  {!commissionPreview.valid && (
                    <small className="tm-commission-bad">
                      The prize pool exceeds the total collection, so this
                      tournament cannot be saved.
                    </small>
                  )}
                </div>

                <label className="tm-field">
                  <span>Tournament Status</span>
                  <select
                    name="status"
                    value={form.status}
                    onChange={updateField}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="tm-field tm-field-full">
                  <span>Image URL</span>
                  <input
                    type="url"
                    name="image"
                    value={form.image}
                    onChange={updateField}
                    placeholder="https://example.com/tournament.webp"
                  />
                </label>

                <label className="tm-field tm-field-full">
                  <span>Description / Rules</span>
                  <textarea
                    name="description"
                    rows="4"
                    value={form.description}
                    onChange={updateField}
                    placeholder="Tournament rules and details..."
                  />
                </label>
              </div>

              <div className="tm-form-actions">
                <button
                  type="button"
                  className="tm-btn tm-btn-secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="tm-btn tm-btn-primary"
                  disabled={saving || !commissionPreview.valid}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save Changes"
                      : "Create Tournament"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM DIALOG */}
      {confirmState && (
        <div
          className="tm-confirm-backdrop"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="tm-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tm-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`tm-confirm-icon ${
                confirmState.danger ? "danger" : ""
              }`}
            >
              {confirmState.danger ? "!" : "?"}
            </div>

            <div className="tm-kicker">ADMIN CONFIRMATION</div>

            <h3 id="tm-confirm-title">
              {confirmState.title || "Please confirm"}
            </h3>

            <p>{confirmState.message}</p>

            <div className="tm-confirm-actions">
              <button
                type="button"
                className="tm-btn tm-btn-secondary"
                onClick={() => closeConfirm(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                autoFocus
                className={`tm-btn ${
                  confirmState.danger ? "tm-btn-danger" : "tm-btn-primary"
                }`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION TABS */}
      <div className="tm-section-tabs" role="tablist">
        {[
          ["today", "Today", stats.today],
          ["upcoming", "Upcoming", stats.upcoming],
          ["history", "History", stats.history],
        ].map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeSection === key}
            className={activeSection === key ? "active" : ""}
            onClick={() => setActiveSection(key)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      {/* TOOLBAR */}
      <div className="tm-toolbar">
        <div>
          <div className="tm-kicker">TOURNAMENT DATABASE</div>
          <h2>{sectionInfo[activeSection].title}</h2>
          <p>{sectionInfo[activeSection].description}</p>
        </div>

        <div className="tm-filters">
          <div className="tm-search">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search name or tournament ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search tournaments"
            />
          </div>

          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
            aria-label="Filter by type"
          >
            <option value="All">All Types</option>
            <option value="Classic">Classic</option>
            <option value="TDM">TDM</option>
            <option value="Custom Room">Custom Room</option>
          </select>

          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">All Statuses</option>
            {[...STATUSES, "Completed"].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TOURNAMENT TABLE */}
      <div className="tm-table-wrap">
        <div className="tm-table-scroll">
        <table className="tm-table">
          <thead>
            <tr>
              <th>Tournament</th>
              <th>Type / Mode / Map</th>
              <th>Entry</th>
              <th>Prize</th>
              <th>Players</th>
              <th>Status</th>
              <th>Visibility</th>
              <th>Daily Repeat</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" className="tm-empty">
                  <span className="tm-loader" />
                  Loading tournaments...
                </td>
              </tr>
            ) : filteredTournaments.length === 0 ? (
              <tr>
                <td colSpan="9" className="tm-empty">
                  {search || filterType !== "All" || filterStatus !== "All"
                    ? "No tournaments match your search or filters."
                    : activeSection === "today"
                      ? "There are no tournaments today."
                      : activeSection === "upcoming"
                        ? "There are no upcoming tournaments."
                        : "Tournament history is empty."}
                </td>
              </tr>
            ) : (
              filteredTournaments.map((tournament) => {
                const busy = actionId === tournament.id;
                const dailyBusy = dailyActionId === tournament.id;

                const dailyActive = Boolean(dailyRules[tournament.id]?.active);
                const nextDailyDate =
                  dailyRules[tournament.id]?.next_run_date || "";

                const isLocked = isLockedStatus(tournament.status);
                const isVisible =
                  Boolean(tournament.published) && !tournament.is_hidden;

                return (
                  <tr key={tournament.id}>
                    <td>
                      <strong>{tournament.name}</strong>
                      <code className="tm-id">#{tournament.id}</code>
                      {tournament.date && (
                        <small>
                          {String(tournament.date).slice(0, 10)}
                          {tournament.time
                            ? ` • ${getTimeInput(tournament.time)}`
                            : ""}
                        </small>
                      )}
                    </td>

                    <td>
                      <span className="tm-type-chip">
                        {tournament.type || "Classic"}
                      </span>
                      <small>
                        {tournament.mode || "—"} · {tournament.map || "—"}
                      </small>
                    </td>

                    <td className="tm-money">{money(tournament.entryFee)}</td>
                    <td className="tm-money">{money(tournament.prizePool)}</td>

                    <td>
                      <strong>
                        {tournament.joinedPlayers || 0}
                        <span className="tm-slots">
                          {" / "}
                          {tournament.totalSlots || 50}
                        </span>
                      </strong>
                    </td>

                    <td>
                      <select
                        className="tm-status-select"
                        data-status={tournament.status || "Draft"}
                        value={tournament.status || "Draft"}
                        disabled={busy || isLocked}
                        aria-label={`Status of ${tournament.name}`}
                        onChange={(event) =>
                          changeStatus(tournament, event.target.value)
                        }
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                        <option value="Completed" disabled>
                          Completed (Locked)
                        </option>
                      </select>
                    </td>

                    <td>
                      <span
                        className={`tm-visibility ${
                          tournament.is_hidden
                            ? "is-hidden"
                            : tournament.published
                              ? "is-visible"
                              : "is-unpublished"
                        }`}
                      >
                        <i />
                        {getVisibilityLabel(tournament)}
                      </span>
                    </td>

                    <td>
                      <div className="tm-daily-repeat">
                        <span
                          className={`tm-daily-status ${
                            dailyActive ? "is-active" : "is-inactive"
                          }`}
                        >
                          {dailyActive ? "DAILY ON" : "DAILY OFF"}
                        </span>

                        <button
                          type="button"
                          className={`tm-action-btn ${
                            dailyActive ? "tm-daily-disable" : "tm-daily-enable"
                          }`}
                          onClick={() => toggleDailyRepeat(tournament)}
                          disabled={busy || dailyBusy || isLocked}
                        >
                          {dailyBusy
                            ? "Please wait..."
                            : dailyActive
                              ? "Disable Daily"
                              : "Enable Daily"}
                        </button>

                        {dailyActive && nextDailyDate && (
                          <small className="tm-daily-date">
                            Next run: {nextDailyDate}
                          </small>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="tm-row-actions">
                        <button
                          type="button"
                          className="tm-action-btn"
                          onClick={() => openEditForm(tournament)}
                          disabled={busy || isLocked}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="tm-action-btn"
                          onClick={() => changeVisibility(tournament)}
                          disabled={busy || isLocked}
                        >
                          {busy ? "..." : isVisible ? "Hide" : "Publish"}
                        </button>

                        <button
                          type="button"
                          className="tm-action-btn"
                          onClick={() => duplicateTournament(tournament)}
                          disabled={busy}
                        >
                          Duplicate
                        </button>

                        <button
                          type="button"
                          className="tm-action-btn tm-action-danger"
                          onClick={() => deleteTournament(tournament)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        <div className="tm-table-footer">
          <span>
            Showing <strong>{filteredTournaments.length}</strong> of{" "}
            <strong>{tournaments.length}</strong> tournaments
          </span>
          <span>
            India date: <strong>{today}</strong>
          </span>
          <span className="tm-db-status">
            <i /> SUPABASE
          </span>
        </div>
      </div>
    </div>
  );
};

export default TournamentManagement;