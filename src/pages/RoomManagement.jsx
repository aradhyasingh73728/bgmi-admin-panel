import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./RoomManagement.css";

// ============================================================
// API CONFIG
// ============================================================

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const ADMIN_API_BASE = (
  isLocalhost
    ? "http://localhost:5004"
    : "https://bgmi-admin-dashboard-server-5004.onrender.com"
).replace(/\/+$/, "");

const TOURNAMENT_API_BASE = (
  isLocalhost
    ? "http://localhost:5005"
    : "https://create-tournament-server-5005.onrender.com"
).replace(/\/+$/, "");

const LOGIN_PATH = "/admin-login";
const TOAST_MS = 6000;
const MAX_FIELD_LENGTH = 64;

// ============================================================
// HELPERS
// ============================================================

const getJsonResponse = async (response) => {
  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The server returned an invalid response.");
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

  if (!response.ok || data.success === false) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Request failed with status ${response.status}.`
    );
  }

  return data;
};

const getAdminToken = () => {
  const token = localStorage.getItem("adminToken");

  if (!token) {
    throw new Error("Admin token not found. Please log in again.");
  }

  return token;
};

const getTournamentId = (tournament) =>
  String(tournament?.id || tournament?.tournament_id || "");

const getTournamentName = (tournament) =>
  tournament?.name || tournament?.tournament_name || "Tournament";

const pickNumber = (data, keys) => {
  for (const key of keys) {
    const value = data?.[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return 0;
};

const getPlayerCount = (data) =>
  pickNumber(data, [
    "playersUpdated",
    "updatedPlayers",
    "players_updated",
    "updated_players",
    "participantCount",
    "joinedPlayers",
    "joinedCount",
    "totalPlayers",
    "count",
  ]);

const getNotificationCount = (data) =>
  pickNumber(data, [
    "notificationsSent",
    "notificationsCreated",
    "notificationCount",
    "notifications_created",
  ]);

const normalizeRoomData = (data) => ({
  roomId: data?.roomId || data?.room_id || "",
  roomPassword:
    data?.roomPassword || data?.password || data?.room_password || "",
  participantCount: getPlayerCount(data),
});

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// ============================================================
// COMPONENT
// ============================================================

const RoomManagement = () => {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [searchId, setSearchId] = useState("");

  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [participantCount, setParticipantCount] = useState(0);
  const [roomPublished, setRoomPublished] = useState(false);

  const [loading, setLoading] = useState(true);
  const [roomLoading, setRoomLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [roomMap, setRoomMap] = useState({});

  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const confirmResolver = useRef(null);
  const selectedIdRef = useRef("");
  const roomRequestRef = useRef(0);
  const panelRef = useRef(null);

  selectedIdRef.current = selectedTournament?.id || "";

  const busy = saving || clearing;

  // ----------------------------------------------------------
  // IN-APP NOTIFICATIONS (replace browser alerts)
  // ----------------------------------------------------------

  const notify = useCallback((type, text) => {
    setToast({ type, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // ----------------------------------------------------------
  // IN-APP CONFIRM DIALOG (replaces window.confirm)
  // ----------------------------------------------------------

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
    if (!confirmState) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeConfirm(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmState, closeConfirm]);

  // ----------------------------------------------------------
  // LOAD ROOM DETAILS FROM PORT 5004
  // ----------------------------------------------------------

  const fetchRoomDetails = useCallback(async (tournamentId) => {
    const response = await fetch(
      `${ADMIN_API_BASE}/admin/rooms/${encodeURIComponent(tournamentId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      }
    );

    return normalizeRoomData(await getJsonResponse(response));
  }, []);

  // ----------------------------------------------------------
  // RESET THE ROOM FORM
  // ----------------------------------------------------------

  const resetRoomForm = () => {
    setRoomId("");
    setPassword("");
    setParticipantCount(0);
    setRoomPublished(false);
  };

  // ----------------------------------------------------------
  // LOAD CURRENT HOME PAGE TOURNAMENTS FROM PORT 5005
  // (does not depend on the selected tournament, so selecting
  //  a row no longer triggers a full reload)
  // ----------------------------------------------------------

  const fetchTournaments = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) setLoading(true);

        const response = await fetch(`${TOURNAMENT_API_BASE}/api/tournaments`);
        const data = await getJsonResponse(response);

        const list = Array.isArray(data.tournaments) ? data.tournaments : [];

        const currentList = list
          .map((tournament) => ({
            ...tournament,
            id: getTournamentId(tournament),
          }))
          .filter((tournament) => tournament.id);

        setTournaments(currentList);

        // Drop the selection if the tournament is no longer listed
        if (
          selectedIdRef.current &&
          !currentList.some((item) => item.id === selectedIdRef.current)
        ) {
          setSelectedTournament(null);
          resetRoomForm();
        }

        // Load room details for every listed tournament
        const roomEntries = await Promise.all(
          currentList.map(async (tournament) => {
            try {
              return [tournament.id, await fetchRoomDetails(tournament.id)];
            } catch (error) {
              console.error(`Room load error (${tournament.id}):`, error);
              return [tournament.id, null];
            }
          })
        );

        setRoomMap(Object.fromEntries(roomEntries));
      } catch (error) {
        console.error("Load tournaments error:", error);
        notify("error", error.message || "Unable to load tournaments.");
      } finally {
        setLoading(false);
      }
    },
    [fetchRoomDetails, notify]
  );

  useEffect(() => {
    fetchTournaments(true);
  }, [fetchTournaments]);

  // ----------------------------------------------------------
  // SEARCH BY TOURNAMENT ID OR NAME
  // ----------------------------------------------------------

  const filteredTournaments = useMemo(() => {
    const search = searchId.trim().toLowerCase();

    if (!search) return tournaments;

    return tournaments.filter(
      (tournament) =>
        String(tournament.id || "").toLowerCase().includes(search) ||
        getTournamentName(tournament).toLowerCase().includes(search)
    );
  }, [tournaments, searchId]);

  const publishedCount = useMemo(
    () =>
      tournaments.filter(
        (tournament) =>
          roomMap[tournament.id]?.roomId &&
          roomMap[tournament.id]?.roomPassword
      ).length,
    [tournaments, roomMap]
  );

  // ----------------------------------------------------------
  // SELECT TOURNAMENT AND LOAD ITS ROOM
  // ----------------------------------------------------------

  const loadRoomDetails = async (tournament) => {
    const tournamentId = getTournamentId(tournament);

    if (!tournamentId) return;

    const requestId = ++roomRequestRef.current;

    setSelectedTournament({ ...tournament, id: tournamentId });
    resetRoomForm();

    setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    try {
      setRoomLoading(true);

      const data = await fetchRoomDetails(tournamentId);

      // Ignore the response if another tournament was selected meanwhile
      if (requestId !== roomRequestRef.current) return;

      setRoomId(data.roomId);
      setPassword(data.roomPassword);
      setParticipantCount(data.participantCount);
      setRoomPublished(Boolean(data.roomId && data.roomPassword));

      setRoomMap((previous) => ({ ...previous, [tournamentId]: data }));
    } catch (error) {
      if (requestId !== roomRequestRef.current) return;

      console.error("Load room error:", error);
      notify("error", error.message || "Unable to load room details.");
    } finally {
      if (requestId === roomRequestRef.current) setRoomLoading(false);
    }
  };

  const closePanel = () => {
    if (busy) return;

    roomRequestRef.current += 1;
    setSelectedTournament(null);
    resetRoomForm();
  };

  // ----------------------------------------------------------
  // COPY TO CLIPBOARD
  // ----------------------------------------------------------

  const copyValue = async (label, value) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      notify("success", `${label} copied to clipboard.`);
    } catch {
      notify("error", `Unable to copy the ${label.toLowerCase()}.`);
    }
  };

  // ----------------------------------------------------------
  // PUBLISH / UPDATE ROOM AND SHARE WITH JOINED PLAYERS
  // ----------------------------------------------------------

  const handleSaveRoom = async (event) => {
    event.preventDefault();

    if (busy) return;

    if (!selectedTournament) {
      notify("error", "Please select a tournament first.");
      return;
    }

    const selectedId = selectedTournament.id;
    const cleanRoomId = roomId.trim();
    const cleanPassword = password.trim();

    if (!cleanRoomId) {
      notify("error", "Please enter the BGMI Room ID.");
      return;
    }

    if (!cleanPassword) {
      notify("error", "Please enter the BGMI Room Password.");
      return;
    }

    // Re-sharing notifies players again, so ask first
    if (roomPublished) {
      const confirmed = await askConfirm({
        title: "Update and re-share room?",
        message: `The new Room ID and Password will be sent to ${plural(
          participantCount,
          "joined player"
        )} of "${getTournamentName(selectedTournament)}".`,
        confirmText: "Update & Share",
      });

      if (!confirmed) return;
    }

    let roomSaved = false;

    try {
      setSaving(true);

      const adminToken = getAdminToken();

      // STEP 1: save room details
      const saveResponse = await fetch(
        `${ADMIN_API_BASE}/admin/rooms/${encodeURIComponent(selectedId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            roomId: cleanRoomId,
            password: cleanPassword,
          }),
        }
      );

      await getJsonResponse(saveResponse);
      roomSaved = true;

      // STEP 2: share the room with joined players
      const shareResponse = await fetch(
        `${TOURNAMENT_API_BASE}/api/admin/tournaments/${encodeURIComponent(
          selectedId
        )}/share-room`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            room_id: cleanRoomId,
            room_password: cleanPassword,
          }),
        }
      );

      const shareData = await getJsonResponse(shareResponse);

      // STEP 3: read back the latest details
      let freshRoomData = null;

      try {
        freshRoomData = await fetchRoomDetails(selectedId);
      } catch (refreshError) {
        console.error("Room refresh error:", refreshError);
      }

      const finalRoomData = {
        roomId: freshRoomData?.roomId || cleanRoomId,
        roomPassword: freshRoomData?.roomPassword || cleanPassword,
        participantCount: freshRoomData
          ? freshRoomData.participantCount
          : getPlayerCount(shareData),
      };

      if (selectedIdRef.current === selectedId) {
        setRoomId(finalRoomData.roomId);
        setPassword(finalRoomData.roomPassword);
        setParticipantCount(finalRoomData.participantCount);
        setRoomPublished(true);
      }

      setRoomMap((previous) => ({ ...previous, [selectedId]: finalRoomData }));

      const updatedPlayers = getPlayerCount(shareData);
      const notificationsCreated = getNotificationCount(shareData);

      notify(
        "success",
        `Room saved and shared. ${plural(
          updatedPlayers,
          "player"
        )} updated, ${plural(notificationsCreated, "notification")} created.`
      );

      if (shareData.notificationError) {
        console.error("Notification error:", shareData.notificationError);
      }
    } catch (error) {
      console.error("Publish room error:", error);

      if (roomSaved) {
        notify(
          "error",
          `The room details were saved, but sharing with players failed: ${error.message}`
        );

        setRoomPublished(true);

        setRoomMap((previous) => ({
          ...previous,
          [selectedId]: {
            roomId: cleanRoomId,
            roomPassword: cleanPassword,
            participantCount,
          },
        }));
      } else {
        notify("error", error.message || "Unable to save the room details.");
      }
    } finally {
      setSaving(false);
    }
  };

  // ----------------------------------------------------------
  // CLEAR ROOM DETAILS
  // ----------------------------------------------------------

  const handleClearRoom = async () => {
    if (busy) return;

    if (!selectedTournament) {
      notify("error", "Please select a tournament first.");
      return;
    }

    const selectedId = selectedTournament.id;

    const confirmed = await askConfirm({
      title: "Clear room details?",
      message: `The Room ID and Password will be removed for all ${plural(
        participantCount,
        "joined player"
      )} of "${getTournamentName(selectedTournament)}".`,
      confirmText: "Clear Room",
      danger: true,
    });

    if (!confirmed) return;

    try {
      setClearing(true);

      const response = await fetch(
        `${ADMIN_API_BASE}/admin/rooms/${encodeURIComponent(selectedId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getAdminToken()}` },
        }
      );

      const data = await getJsonResponse(response);
      const clearedCount = getPlayerCount(data);

      let finalCount = 0;

      try {
        finalCount = (await fetchRoomDetails(selectedId)).participantCount;
      } catch (refreshError) {
        console.error("Room clear refresh error:", refreshError);
      }

      if (selectedIdRef.current === selectedId) {
        setRoomId("");
        setPassword("");
        setRoomPublished(false);
        setParticipantCount(finalCount);
      }

      setRoomMap((previous) => ({
        ...previous,
        [selectedId]: {
          roomId: "",
          roomPassword: "",
          participantCount: finalCount,
        },
      }));

      notify(
        "success",
        `Room details cleared. ${plural(clearedCount, "player")} updated.`
      );
    } catch (error) {
      console.error("Clear room error:", error);
      notify("error", error.message || "Unable to clear the room details.");
    } finally {
      setClearing(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="room-management">
      {/* TOAST */}
      {toast && (
        <div
          className={`rm-toast ${toast.type}`}
          key={toast.id}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <span className="rm-toast-icon">
            {toast.type === "error" ? "!" : "✓"}
          </span>

          <span className="rm-toast-text">{toast.text}</span>

          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      {confirmState && (
        <div
          className="rm-confirm-backdrop"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="rm-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rm-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`rm-confirm-icon ${
                confirmState.danger ? "danger" : ""
              }`}
            >
              {confirmState.danger ? "!" : "?"}
            </div>

            <div className="rm-kicker">ADMIN CONFIRMATION</div>

            <h3 id="rm-confirm-title">{confirmState.title}</h3>

            <p>{confirmState.message}</p>

            <div className="rm-confirm-actions">
              <button
                type="button"
                className="rm-btn rm-btn-secondary"
                onClick={() => closeConfirm(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                autoFocus
                className={`rm-btn ${
                  confirmState.danger ? "rm-btn-danger" : "rm-btn-primary"
                }`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="rm-header">
        <div>
          <div className="rm-eyebrow">
            <span />
            ADMIN CONTROL CENTER
          </div>

          <h1>
            Room <em>Management</em>
          </h1>

          <p>
            Select a current Home Page tournament and share its Room ID and
            Password with joined players.
          </p>
        </div>

        <button
          type="button"
          className="rm-btn rm-btn-primary"
          onClick={() => fetchTournaments(true)}
          disabled={loading || busy}
        >
          <b className={loading ? "rm-spin" : ""}>↻</b>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {/* STATS */}
      <section className="rm-stats">
        <div className="rm-stat blue">
          <span>CURRENT TOURNAMENTS</span>
          <strong>{tournaments.length}</strong>
          <small>Listed on the Home Page</small>
        </div>

        <div className="rm-stat green">
          <span>ROOMS PUBLISHED</span>
          <strong>{publishedCount}</strong>
          <small>Shared with players</small>
        </div>

        <div className="rm-stat orange">
          <span>WAITING FOR ROOM</span>
          <strong>{Math.max(tournaments.length - publishedCount, 0)}</strong>
          <small>Not published yet</small>
        </div>
      </section>

      {/* TOOLBAR */}
      <section className="rm-toolbar">
        <div>
          <div className="rm-kicker">TOURNAMENT LIST</div>
          <h2>Current Tournaments</h2>
        </div>

        <div className="rm-search">
          <span>⌕</span>

          <input
            type="text"
            placeholder="Search tournament ID or name..."
            value={searchId}
            onChange={(event) => setSearchId(event.target.value)}
            aria-label="Search tournaments"
          />

          {searchId && (
            <button
              type="button"
              onClick={() => setSearchId("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </section>

      {/* TABLE */}
      <section className="rm-table-wrap">
        <div className="rm-table-scroll">
          <table className="rm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tournament</th>
                <th>Tournament ID</th>
                <th>Mode</th>
                <th>Map</th>
                <th>Joined</th>
                <th>Room Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="rm-empty">
                    <span className="rm-loader" />
                    Loading current tournaments...
                  </td>
                </tr>
              ) : filteredTournaments.length === 0 ? (
                <tr>
                  <td colSpan="8" className="rm-empty">
                    {searchId.trim()
                      ? "No tournaments match your search."
                      : "There are no current Home Page tournaments."}
                  </td>
                </tr>
              ) : (
                filteredTournaments.map((tournament, index) => {
                  const room = roomMap[tournament.id];
                  const hasRoom = Boolean(room?.roomId && room?.roomPassword);
                  const isSelected = selectedTournament?.id === tournament.id;

                  return (
                    <tr
                      key={tournament.id}
                      className={isSelected ? "selected" : ""}
                    >
                      <td className="rm-index">{index + 1}</td>

                      <td>
                        <strong>{getTournamentName(tournament)}</strong>
                      </td>

                      <td>
                        <code className="rm-id">#{tournament.id}</code>
                      </td>

                      <td>{tournament.mode || tournament.game_mode || "—"}</td>

                      <td>{tournament.map || "—"}</td>

                      <td>
                        <strong>{Number(room?.participantCount ?? 0)}</strong>
                      </td>

                      <td>
                        <span
                          className={`rm-status ${
                            hasRoom ? "published" : "pending"
                          }`}
                        >
                          <i />
                          {hasRoom ? "Published" : "Not Published"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`rm-btn rm-btn-small ${
                            isSelected ? "rm-btn-primary" : "rm-btn-secondary"
                          }`}
                          disabled={roomLoading || busy}
                          onClick={() => loadRoomDetails(tournament)}
                        >
                          {isSelected ? "Selected" : "Manage Room"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="rm-table-footer">
          <span>
            Showing <strong>{filteredTournaments.length}</strong> of{" "}
            <strong>{tournaments.length}</strong> tournaments
          </span>

          <span className="rm-db-status">
            <i /> LIVE DATA
          </span>
        </div>
      </section>

      {/* ROOM FORM */}
      {selectedTournament && (
        <section className="rm-panel" ref={panelRef}>
          <div className="rm-panel-heading">
            <div>
              <div className="rm-kicker">ROOM DETAILS</div>
              <h2>Manage Tournament Room</h2>
            </div>

            <button
              type="button"
              className="rm-close"
              onClick={closePanel}
              disabled={busy}
              aria-label="Close room panel"
            >
              ×
            </button>
          </div>

          <div className="rm-summary">
            <div>
              <span>TOURNAMENT</span>
              <strong>{getTournamentName(selectedTournament)}</strong>
            </div>

            <div>
              <span>TOURNAMENT ID</span>
              <strong>#{selectedTournament.id}</strong>
            </div>

            <div>
              <span>JOINED PLAYERS</span>
              <strong>{participantCount}</strong>
            </div>

            <div>
              <span>ROOM STATUS</span>
              <strong className={roomPublished ? "ok" : "warn"}>
                {roomPublished ? "Published" : "Not Published"}
              </strong>
            </div>
          </div>

          {roomLoading ? (
            <div className="rm-panel-loading">
              <span className="rm-loader" />
              Loading room details...
            </div>
          ) : (
            <form className="rm-form" onSubmit={handleSaveRoom}>
              <div className="rm-form-grid">
                <label className="rm-field">
                  <span>BGMI Room ID *</span>

                  <div className="rm-input-row">
                    <input
                      type="text"
                      name="roomId"
                      placeholder="Enter BGMI Room ID"
                      value={roomId}
                      maxLength={MAX_FIELD_LENGTH}
                      autoComplete="off"
                      onChange={(event) => setRoomId(event.target.value)}
                      disabled={busy}
                    />

                    <button
                      type="button"
                      className="rm-copy"
                      onClick={() => copyValue("Room ID", roomId.trim())}
                      disabled={!roomId.trim()}
                    >
                      Copy
                    </button>
                  </div>
                </label>

                <label className="rm-field">
                  <span>BGMI Room Password *</span>

                  <div className="rm-input-row">
                    <input
                      type="text"
                      name="password"
                      placeholder="Enter BGMI Room Password"
                      value={password}
                      maxLength={MAX_FIELD_LENGTH}
                      autoComplete="off"
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy}
                    />

                    <button
                      type="button"
                      className="rm-copy"
                      onClick={() => copyValue("Password", password.trim())}
                      disabled={!password.trim()}
                    >
                      Copy
                    </button>
                  </div>
                </label>
              </div>

              <div className="rm-form-actions">
                <button
                  type="button"
                  className="rm-btn rm-btn-danger-outline"
                  onClick={handleClearRoom}
                  disabled={busy || !roomPublished}
                >
                  {clearing ? "Clearing..." : "Clear Room"}
                </button>

                <button
                  type="submit"
                  className="rm-btn rm-btn-primary"
                  disabled={busy || !roomId.trim() || !password.trim()}
                >
                  {saving
                    ? "Saving and Sharing..."
                    : roomPublished
                      ? "Update & Share Room"
                      : "Publish & Share Room"}
                </button>
              </div>

              {roomPublished && (
                <p className="rm-note ok">
                  Room details are saved. Use “Update &amp; Share Room” to send
                  updated details to players again.
                </p>
              )}

              {participantCount === 0 && (
                <p className="rm-note warn">
                  No players have joined this tournament yet, so there is
                  nobody to notify.
                </p>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
};

export default RoomManagement;