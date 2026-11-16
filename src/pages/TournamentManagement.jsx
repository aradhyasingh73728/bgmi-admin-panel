
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "./TournamentManagement.css";

// ==================================================
// API CONFIGURATION
// ==================================================

const API_BASE = (
  process.env.REACT_APP_TOURNAMENT_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5005"
    : "https://create-tournament-server-5005.onrender.com")
).replace(/\/+$/, "");

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
// INDIA DATE
// ==================================================

const getTodayDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

// ==================================================
// HELPERS
// ==================================================

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const makeId = () =>
  `BG${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const getTimeInput = (value) =>
  value ? String(value).slice(0, 5) : "";

const getVisibilityLabel = (tournament) => {
  if (tournament.is_hidden) return "Hidden";
  if (tournament.published) return "Published";
  return "Unpublished";
};

const getTdmSlots = (mode) =>
  TDM_MODES.find((item) => item.value === mode)?.slots || 2;

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

  // Three page sections
  const [activeSection, setActiveSection] = useState("today");

  // Update date automatically
  const [today, setToday] = useState(getTodayDate());

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    date: getTodayDate(),
  });

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
  // API REQUEST
  // ==================================================

  const apiRequest = useCallback(async (path, options = {}) => {
    if (!API_BASE) {
      throw new Error(
        "Tournament API URL missing. Set REACT_APP_TOURNAMENT_API_URL."
      );
    }

    const token = localStorage.getItem("adminToken");

    if (!token) {
      throw new Error(
        "Admin token nahi mila. Please login again."
      );
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
      throw new Error(`Invalid server response. HTTP ${response.status}`);
    }

    if (response.status === 401) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("bgmi_admin_logged_in");
      throw new Error("Admin session expired. Please login again.");
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ||
        result.message ||
        `Request failed: HTTP ${response.status}`
      );
    }

    return result;
  }, []);

  // ==================================================
  // LOAD DATA
  // ==================================================

  const loadTournaments = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);

    try {
      setError("");

      const [tournamentResult, dailyResult] = await Promise.all([
        apiRequest("/api/admin/tournaments"),
        apiRequest("/api/admin/daily-repeat"),
      ]);

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
      console.error("Tournament load error:", err);
      setError(err.message || "Tournament data load nahi hua.");
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    loadTournaments(true);
  }, [loadTournaments]);

  // ==================================================
  // AUTOMATIC SECTION CLASSIFICATION
  // ==================================================

  const classifiedTournaments = useMemo(() => {
    const todayList = [];
    const upcomingList = [];
    const historyList = [];

    tournaments.forEach((tournament) => {
      const date = String(tournament.date || "").slice(0, 10);
      const status = tournament.status || "Draft";

      // Completed and Cancelled always go to history.
      if (
        status === "Completed" ||
        status === "Cancelled" ||
        !date
      ) {
        historyList.push(tournament);
        return;
      }

      // Past dates go to history.
      if (date < today) {
        historyList.push(tournament);
        return;
      }

      // Future dates go to upcoming.
      if (date > today) {
        upcomingList.push(tournament);
        return;
      }

      // Only today's non-completed tournaments.
      todayList.push(tournament);
    });

    const sortByDateTime = (a, b) => {
      const dateA = `${a.date || ""} ${getTimeInput(a.time)}`;
      const dateB = `${b.date || ""} ${getTimeInput(b.time)}`;
      return dateA.localeCompare(dateB);
    };

    todayList.sort(sortByDateTime);
    upcomingList.sort(sortByDateTime);
    historyList.sort((a, b) => {
      const dateA = `${a.date || ""} ${getTimeInput(a.time)}`;
      const dateB = `${b.date || ""} ${getTimeInput(b.time)}`;
      return dateB.localeCompare(dateA);
    });

    return {
      today: todayList,
      upcoming: upcomingList,
      history: historyList,
    };
  }, [tournaments, today]);

  // ==================================================
  // ACTIVE SECTION + FILTERS
  // ==================================================

  const sectionTournaments =
    classifiedTournaments[activeSection] || [];

  const filteredTournaments = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return sectionTournaments.filter((tournament) => {
      const matchesSearch =
        !searchText ||
        String(tournament.name || "").toLowerCase().includes(searchText) ||
        String(tournament.id || "").toLowerCase().includes(searchText);

      const matchesStatus =
        filterStatus === "All" ||
        tournament.status === filterStatus;

      const matchesType =
        filterType === "All" ||
        (tournament.type || "Classic") === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [
    sectionTournaments,
    search,
    filterStatus,
    filterType,
  ]);

  // ==================================================
  // FORM HELPERS
  // ==================================================

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((previous) => {
      const updated = {
        ...previous,
        [name]: value,
      };

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

  const openCreateForm = () => {
    setEditingId("");
    setForm({
      ...EMPTY_FORM,
      date: getTodayDate(),
      time: "10:00",
    });
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
      date: tournament.date || getTodayDate(),
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

  const closeForm = () => {
    if (saving) return;

    setShowForm(false);
    setEditingId("");
    setForm({
      ...EMPTY_FORM,
      date: getTodayDate(),
    });
  };

  // ==================================================
  // COMMISSION
  // ==================================================

  const commissionPreview = useMemo(() => {
    const entry = Number(form.entryFee || 0);
    const prize = Number(form.prizePool || 0);
    const slots = Number(form.totalSlots || 0);

    const collection = entry * slots;
    const commission = collection - prize;

    return {
      collection,
      commission,
      valid: commission >= 0,
    };
  }, [form.entryFee, form.prizePool, form.totalSlots]);

  // ==================================================
  // VALIDATION
  // ==================================================

  const validateForm = (payload) => {
    if (!payload.name) {
      throw new Error("Tournament name required hai.");
    }

    if (!Number.isFinite(payload.entryFee) || payload.entryFee < 0) {
      throw new Error("Entry fee valid honi chahiye.");
    }

    if (!Number.isFinite(payload.prizePool) || payload.prizePool < 0) {
      throw new Error("Prize pool valid hona chahiye.");
    }

    if (!Number.isFinite(payload.perKill) || payload.perKill < 0) {
      throw new Error("Per kill amount valid hona chahiye.");
    }

    if (!Number.isInteger(payload.totalSlots) || payload.totalSlots < 1) {
      throw new Error("Total slots valid whole number hona chahiye.");
    }

    if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      throw new Error("Invalid tournament date.");
    }

    if (!payload.time || !/^\d{2}:\d{2}$/.test(payload.time)) {
      throw new Error("Valid tournament time required hai.");
    }

    if (payload.type === "TDM") {
      if (!TDM_MODES.some((item) => item.value === payload.mode)) {
        throw new Error("Invalid TDM mode.");
      }

      if (!TDM_MAPS.includes(payload.map)) {
        throw new Error("Invalid TDM map.");
      }

      if (payload.totalSlots !== getTdmSlots(payload.mode)) {
        throw new Error("TDM player slots aur mode match nahi kar rahe.");
      }

      if (payload.entryFee * payload.totalSlots < payload.prizePool) {
        throw new Error("Prize pool total entry collection se zyada nahi ho sakta.");
      }
    }
  };

  // ==================================================
  // CREATE / UPDATE
  // ==================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

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
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        setSuccess(result.message || "Tournament successfully updated.");
      } else {
        const id = makeId();

        await apiRequest("/api/admin/tournaments", {
          method: "POST",
          body: JSON.stringify({
            id,
            ...payload,
            published: false,
          }),
        });

        setSuccess(`Tournament created successfully. ID: ${id}`);
      }

      setShowForm(false);
      setEditingId("");
      setForm({
        ...EMPTY_FORM,
        date: getTodayDate(),
      });

      await loadTournaments();
    } catch (err) {
      console.error("Save tournament error:", err);
      setError(err.message || "Tournament save nahi hua.");
    } finally {
      setSaving(false);
    }
  };

  // ==================================================
  // PUBLISH / HIDE
  // ==================================================

  const changeVisibility = async (tournament) => {
    const isCurrentlyPublished =
      Boolean(tournament.published) &&
      !Boolean(tournament.is_hidden);

    const shouldPublish = !isCurrentlyPublished;

    const confirmed = window.confirm(
      shouldPublish
        ? `Kya "${tournament.name}" ko publish/unhide karna hai?`
        : `Kya "${tournament.name}" ko hide karna hai?`
    );

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
            shouldPublish
              ? { published: true }
              : { hidden: true }
          ),
        }
      );

      setSuccess(result.message || `${tournament.name} visibility updated.`);
      await loadTournaments();
    } catch (err) {
      console.error("Visibility update error:", err);
      setError(err.message || "Visibility update nahi hui.");
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // STATUS
  // ==================================================

  const changeStatus = async (tournament, status) => {
    if (status === "Completed") {
      setError("Completed status ke liye Complete Tournament action use karna hoga.");
      return;
    }

    if (
      tournament.status === "Cancelled" ||
      tournament.status === "Completed"
    ) {
      setError("Cancelled/Completed tournament ka status change nahi ho sakta.");
      return;
    }

    const confirmed = window.confirm(
      `Kya "${tournament.name}" ka status ${status} karna hai?`
    );

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      setSuccess(result.message || "Tournament status updated.");
      await loadTournaments();
    } catch (err) {
      console.error("Status update error:", err);
      setError(err.message || "Status update nahi hua.");
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
    const currentRule = dailyRules[tournamentId];
    const newStatus = !Boolean(currentRule?.active);

    const confirmed = window.confirm(
      newStatus
        ? `Kya "${tournament.name}" ke liye Daily Repeat ON karna hai?\n\nKal se har din naya tournament automatically create hoga.`
        : `Kya "${tournament.name}" ka Daily Repeat OFF karna hai?\n\nFuture tournaments generate hona band ho jayenge.`
    );

    if (!confirmed) return;

    setDailyActionId(tournamentId);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournamentId)}/repeat-daily`,
        {
          method: "POST",
          body: JSON.stringify({ enabled: newStatus }),
        }
      );

      setSuccess(
        result.message ||
        (newStatus ? "Daily repeat enabled." : "Daily repeat disabled.")
      );

      await loadTournaments();
    } catch (err) {
      console.error("Daily repeat error:", err);
      setError(err.message || "Daily repeat status update nahi hua.");
    } finally {
      setDailyActionId("");
    }
  };

  // ==================================================
  // DUPLICATE
  // ==================================================

  const duplicateTournament = async (tournament) => {
    const newId = makeId();

    const confirmed = window.confirm(
      `Kya "${tournament.name}" ki Draft copy create karni hai?\n\nNew ID: ${newId}`
    );

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({ newId }),
        }
      );

      setSuccess(result.message || `Tournament duplicated. New ID: ${newId}`);
      await loadTournaments();
    } catch (err) {
      console.error("Duplicate error:", err);
      setError(err.message || "Duplicate create nahi hua.");
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // DELETE
  // ==================================================

  const deleteTournament = async (tournament) => {
    const confirmed = window.confirm(
      `Kya tum "${tournament.name}" (${tournament.id}) delete karna chahte ho?\n\nServer RPC ke through player entry fees refund karke tournament delete karega.`
    );

    if (!confirmed) return;

    setActionId(tournament.id);
    setError("");
    setSuccess("");

    try {
      const result = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(tournament.id)}`,
        {
          method: "DELETE",
        }
      );

      const refundedPlayers = Number(result.result?.refunded_players || 0);
      const totalRefunded = Number(result.result?.total_refunded || 0);

      setSuccess(
        `Tournament deleted. ${refundedPlayers} players refunded. Total refund: ${money(totalRefunded)}`
      );

      await loadTournaments();
    } catch (err) {
      console.error("Delete error:", err);
      setError(err.message || "Tournament delete nahi hua.");
    } finally {
      setActionId("");
    }
  };

  // ==================================================
  // STATISTICS
  // ==================================================

  const stats = useMemo(() => {
    const totalPlayers = tournaments.reduce(
      (sum, item) => sum + Number(item.joinedPlayers || 0),
      0
    );

    return {
      total: tournaments.length,
      today: classifiedTournaments.today.length,
      upcoming: classifiedTournaments.upcoming.length,
      history: classifiedTournaments.history.length,
      published: tournaments.filter(
        (item) => item.published && !item.is_hidden
      ).length,
      live: tournaments.filter((item) => item.status === "Live").length,
      completed: tournaments.filter((item) => item.status === "Completed").length,
      players: totalPlayers,
    };
  }, [tournaments, classifiedTournaments]);

  // ==================================================
  // SECTION DETAILS
  // ==================================================

  const sectionInfo = {
    today: {
      title: "Today's Tournaments",
      description: `Showing tournaments scheduled for ${today} (India time).`,
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

  // ==================================================
  // UI
  // ==================================================

  return (
    <div className="tournament-management">

      {/* HEADER */}

      <div className="tm-header">
        <div>
          <div className="tm-eyebrow">ADMIN CONTROL CENTER</div>
          <h1>Tournament Management</h1>
          <p>Create, edit, publish and manage BGMI tournaments.</p>
        </div>

        <div className="tm-header-actions">
          <button
            type="button"
            className="tm-btn tm-btn-secondary"
            onClick={() => loadTournaments(true)}
            disabled={loading || Boolean(actionId) || Boolean(dailyActionId)}
          >
            ↻ Refresh
          </button>

          <button
            type="button"
            className="tm-btn tm-btn-primary"
            onClick={openCreateForm}
          >
            + Create Tournament
          </button>
        </div>
      </div>

      {/* ALERTS */}

      {error && (
        <div className="tm-alert tm-alert-error" role="alert">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="tm-alert tm-alert-success" role="status">
          ✓ {success}
        </div>
      )}

      {/* STATISTICS */}

      <div className="tm-stats-grid">
        <div className="tm-stat-card">
          <span>Total Tournaments</span>
          <strong>{stats.total}</strong>
        </div>

        <div className="tm-stat-card">
          <span>Today's Tournaments</span>
          <strong>{stats.today}</strong>
        </div>

        <div className="tm-stat-card">
          <span>Upcoming</span>
          <strong>{stats.upcoming}</strong>
        </div>

        <div className="tm-stat-card">
          <span>History</span>
          <strong>{stats.history}</strong>
        </div>

        <div className="tm-stat-card">
          <span>Published</span>
          <strong>{stats.published}</strong>
        </div>

        <div className="tm-stat-card">
          <span>Total Registrations</span>
          <strong>{stats.players}</strong>
        </div>
      </div>

      {/* CREATE / EDIT FORM */}

      {showForm && (
        <div className="tm-form-overlay">
          <div className="tm-form-card">

            <div className="tm-form-heading">
              <div>
                <h2>{editingId ? "Edit Tournament" : "Create Tournament"}</h2>
                <p>
                  {editingId
                    ? `Editing tournament ${editingId}`
                    : "New tournament database mein save hoga."}
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

            <form onSubmit={handleSubmit}>
              <div className="tm-form-grid">

                <label className="tm-field tm-field-full">
                  <span>Tournament Name *</span>
                  <input
                    name="name"
                    value={form.name}
                    onChange={updateField}
                    placeholder="Enter tournament name"
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
                    {(form.type === "TDM" ? TDM_MAPS : CLASSIC_MAPS).map((map) => (
                      <option key={map} value={map}>{map}</option>
                    ))}
                  </select>
                </label>

                <label className="tm-field">
                  <span>Tournament Date (Automatic)</span>
                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    readOnly
                    required
                  />
                  <small>Today's India date automatically selected.</small>
                </label>

                <label className="tm-field">
                  <span>Tournament Time</span>
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
                  <span>{form.type === "TDM" ? "Total Players (Automatic)" : "Total Slots"}</span>
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
                    <small>Players automatically selected according to TDM format.</small>
                  )}
                </label>

                <div className="tm-field tm-field-full">
                  <span>Collection & Admin Commission Preview</span>
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
                      <strong style={{
                        color: commissionPreview.valid ? "#22c55e" : "#ff304f",
                      }}>
                        {money(commissionPreview.commission)}
                      </strong>
                    </div>
                  </div>
                  <small>
                    Total players × Entry fee − Winner prize.
                    Actual collection depends on successful registrations.
                  </small>
                </div>

                <label className="tm-field">
                  <span>Tournament Status</span>
                  <select name="status" value={form.status} onChange={updateField}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
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

      {/* SECTION TABS */}

      <div className="tm-section-tabs">
        <button
          type="button"
          className={activeSection === "today" ? "active" : ""}
          onClick={() => setActiveSection("today")}
        >
          Today's Tournaments
          <span>{stats.today}</span>
        </button>

        <button
          type="button"
          className={activeSection === "upcoming" ? "active" : ""}
          onClick={() => setActiveSection("upcoming")}
        >
          Upcoming
          <span>{stats.upcoming}</span>
        </button>

        <button
          type="button"
          className={activeSection === "history" ? "active" : ""}
          onClick={() => setActiveSection("history")}
        >
          Tournament History
          <span>{stats.history}</span>
        </button>
      </div>

      {/* TOOLBAR */}

      <div className="tm-toolbar">
        <div>
          <h2>{sectionInfo[activeSection].title}</h2>
          <p>{sectionInfo[activeSection].description}</p>
        </div>

        <div className="tm-filters">
          <input
            type="search"
            placeholder="Search name or tournament ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
          >
            <option value="All">All Types</option>
            <option value="Classic">Classic</option>
            <option value="TDM">TDM</option>
            <option value="Custom Room">Custom Room</option>
          </select>

          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
          >
            <option value="All">All Statuses</option>
            {[...STATUSES, "Completed"].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TOURNAMENT TABLE */}

      <div className="tm-table-wrap">
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
                  Loading tournaments...
                </td>
              </tr>
            ) : filteredTournaments.length === 0 ? (
              <tr>
                <td colSpan="9" className="tm-empty">
                  {activeSection === "today"
                    ? "Aaj koi tournament nahi hai."
                    : activeSection === "upcoming"
                      ? "Koi upcoming tournament nahi hai."
                      : "Tournament history empty hai."}
                </td>
              </tr>
            ) : (
              filteredTournaments.map((tournament) => {
                const busy = actionId === tournament.id;
                const dailyBusy = dailyActionId === tournament.id;

                const dailyActive = Boolean(
                  dailyRules[tournament.id]?.active
                );

                const nextDailyDate =
                  dailyRules[tournament.id]?.next_run_date || "";

                const isLocked =
                  tournament.status === "Completed" ||
                  tournament.status === "Cancelled";

                const visibilityLabel =
                  getVisibilityLabel(tournament);

                return (
                  <tr key={tournament.id}>
                    <td>
                      <strong>{tournament.name}</strong>
                      <small>#{tournament.id}</small>
                      {tournament.date && (
                        <small>
                          {tournament.date}
                          {tournament.time
                            ? ` • ${getTimeInput(tournament.time)}`
                            : ""}
                        </small>
                      )}
                    </td>

                    <td>
                      <strong>{tournament.type || "Classic"}</strong>
                      <small>{tournament.mode || "—"}</small>
                      <small>{tournament.map || "—"}</small>
                    </td>

                    <td>{money(tournament.entryFee)}</td>
                    <td>{money(tournament.prizePool)}</td>

                    <td>
                      <strong>
                        {tournament.joinedPlayers || 0}
                        {" / "}
                        {tournament.totalSlots || 50}
                      </strong>
                    </td>

                    <td>
                      <select
                        className="tm-status-select"
                        value={tournament.status || "Draft"}
                        disabled={busy || isLocked}
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
                        {visibilityLabel}
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
                            dailyActive
                              ? "tm-daily-disable"
                              : "tm-daily-enable"
                          }`}
                          onClick={() => toggleDailyRepeat(tournament)}
                          disabled={
                            busy ||
                            dailyBusy ||
                            tournament.status === "Completed" ||
                            tournament.status === "Cancelled"
                          }
                        >
                          {dailyBusy
                            ? "Please wait..."
                            : dailyActive
                              ? "Disable Daily"
                              : "Enable Daily"}
                        </button>

                        {dailyActive && nextDailyDate && (
                          <small className="tm-daily-date">
                            Next: {nextDailyDate}
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
                          {busy
                            ? "..."
                            : tournament.published && !tournament.is_hidden
                              ? "Hide"
                              : "Publish"}
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

      {/* FOOTER */}

      <div className="tm-footer">
        <span>Database: <strong>Supabase</strong></span>
        <span>API: <strong>Port 5005</strong></span>
        <span>India Date: <strong>{today}</strong></span>
        <span>Total records: <strong>{tournaments.length}</strong></span>
        <span>Showing: <strong>{filteredTournaments.length}</strong></span>
      </div>

    </div>
  );
};

export default TournamentManagement;
