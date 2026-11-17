
import { useCallback, useEffect, useMemo, useState } from "react";
import "./RoomManagement.css";

// ============================================================
// API CONFIG
// ============================================================

const ADMIN_API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5004"
    : "https://bgmi-admin-dashboard-server-5004.onrender.com";

const TOURNAMENT_API_BASE = (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5005"
    : "https://create-tournament-server-5005.onrender.com"
).replace(/\/+$/, "");


// ============================================================
// HELPERS
// ============================================================

const getJsonResponse = async (response) => {
  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Server returned an invalid response.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status}`
    );
  }

  return data;
};


const getTournamentId = (tournament) => {
  return String(
    tournament?.id ||
    tournament?.tournament_id ||
    ""
  );
};


const getPlayerCount = (data) => {
  const possibleCounts = [
    data?.playersUpdated,
    data?.updatedPlayers,
    data?.players_updated,
    data?.updated_players,
    data?.participantCount,
    data?.joinedPlayers,
    data?.joinedCount,
    data?.totalPlayers,
    data?.count,
  ];

  for (const value of possibleCounts) {
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


const getNotificationCount = (data) => {
  const possibleCounts = [
    data?.notificationsSent,
    data?.notificationsCreated,
    data?.notificationCount,
    data?.notifications_created,
  ];

  for (const value of possibleCounts) {
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


const normalizeRoomData = (data) => {
  return {
    roomId:
      data?.roomId ||
      data?.room_id ||
      "",

    roomPassword:
      data?.roomPassword ||
      data?.password ||
      data?.room_password ||
      "",

    participantCount: getPlayerCount(data),
  };
};


// ============================================================
// COMPONENT
// ============================================================

const RoomManagement = () => {

  // ----------------------------------------------------------
  // STATES
  // ----------------------------------------------------------

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

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");


  // ----------------------------------------------------------
  // LOAD ROOM DETAILS FROM PORT 5004
  // ----------------------------------------------------------

  const fetchRoomDetails = useCallback(async (tournamentId) => {
    const adminToken = localStorage.getItem("adminToken");

    if (!adminToken) {
      throw new Error("Admin token nahi mila. Please login again.");
    }

    const response = await fetch(
      `${ADMIN_API_BASE}/admin/rooms/${encodeURIComponent(
        tournamentId
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }
    );

    const data = await getJsonResponse(response);

    return normalizeRoomData(data);
  }, []);


  // ----------------------------------------------------------
  // LOAD CURRENT HOME PAGE TOURNAMENTS FROM PORT 5005
  // ----------------------------------------------------------

  const fetchTournaments = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      const response = await fetch(
        `${TOURNAMENT_API_BASE}/api/tournaments`
      );

      const data = await getJsonResponse(response);

      const list = Array.isArray(data.tournaments)
        ? data.tournaments
        : [];

      const currentList = list
        .map((tournament) => ({
          ...tournament,
          id: getTournamentId(tournament),
        }))
        .filter((tournament) => tournament.id);

      setTournaments(currentList);

      // Keep selected tournament only if it is still in public list.
      const selectedStillVisible = currentList.find(
        (tournament) =>
          tournament.id === selectedTournament?.id
      );

      if (selectedTournament && !selectedStillVisible) {
        setSelectedTournament(null);
        setRoomId("");
        setPassword("");
        setParticipantCount(0);
        setRoomPublished(false);
      }

      // Load room details for current tournaments.
      const roomEntries = await Promise.all(
        currentList.map(async (tournament) => {
          try {
            const roomData = await fetchRoomDetails(
              tournament.id
            );

            return [tournament.id, roomData];

          } catch (error) {
            console.error(
              `ROOM LOAD ERROR - ${tournament.id}:`,
              error
            );

            return [tournament.id, null];
          }
        })
      );

      setRoomMap(
        Object.fromEntries(roomEntries)
      );

    } catch (error) {
      console.error("LOAD TOURNAMENTS ERROR:", error);

      setErrorMsg(
        error.message || "Failed to load current tournaments."
      );

    } finally {
      setLoading(false);
    }
  }, [fetchRoomDetails, selectedTournament]);


  // ----------------------------------------------------------
  // INITIAL LOAD
  // ----------------------------------------------------------

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);


  // ----------------------------------------------------------
  // SEARCH BY TOURNAMENT ID OR NAME
  // ----------------------------------------------------------

  const filteredTournaments = useMemo(() => {
    const search = searchId.trim().toLowerCase();

    if (!search) {
      return tournaments;
    }

    return tournaments.filter((tournament) => {
      const id = String(tournament.id || "").toLowerCase();

      const name = String(
        tournament.name ||
        tournament.tournament_name ||
        ""
      ).toLowerCase();

      return (
        id.includes(search) ||
        name.includes(search)
      );
    });
  }, [tournaments, searchId]);


  // ----------------------------------------------------------
  // SELECT TOURNAMENT AND LOAD ITS ROOM
  // ----------------------------------------------------------

  const loadRoomDetails = async (tournament) => {
    const tournamentId = getTournamentId(tournament);

    if (!tournamentId) return;

    setSelectedTournament({
      ...tournament,
      id: tournamentId,
    });

    setMessage("");
    setErrorMsg("");

    setRoomId("");
    setPassword("");
    setParticipantCount(0);
    setRoomPublished(false);

    try {
      setRoomLoading(true);

      const data = await fetchRoomDetails(tournamentId);

      setRoomId(data.roomId);
      setPassword(data.roomPassword);
      setParticipantCount(data.participantCount);

      setRoomPublished(
        Boolean(data.roomId && data.roomPassword)
      );

      setRoomMap((previous) => ({
        ...previous,
        [tournamentId]: data,
      }));

    } catch (error) {
      console.error("LOAD ROOM ERROR:", error);

      setErrorMsg(
        error.message || "Failed to load room details."
      );

    } finally {
      setRoomLoading(false);
    }
  };


  // ----------------------------------------------------------
  // PUBLISH / UPDATE ROOM AND SHARE WITH JOINED PLAYERS
  // ----------------------------------------------------------

  const handleSaveRoom = async (event) => {
    event.preventDefault();

    setMessage("");
    setErrorMsg("");

    if (!selectedTournament) {
      setErrorMsg("Please select a tournament first.");
      return;
    }

    const selectedId = selectedTournament.id;

    const cleanRoomId = roomId.trim();
    const cleanPassword = password.trim();

    if (!cleanRoomId) {
      setErrorMsg("Please enter BGMI Room ID.");
      return;
    }

    if (!cleanPassword) {
      setErrorMsg("Please enter BGMI Room Password.");
      return;
    }

    const adminToken = localStorage.getItem("adminToken");

    if (!adminToken) {
      setErrorMsg(
        "Admin token nahi mila. Please logout karke login karo."
      );
      return;
    }

    let roomSavedOn5004 = false;

    try {
      setSaving(true);

      // ======================================================
      // STEP 1: SAVE ROOM DETAILS ON PORT 5004
      // ======================================================

      const saveResponse = await fetch(
        `${ADMIN_API_BASE}/admin/rooms/${encodeURIComponent(
          selectedId
        )}`,
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

      const saveData = await getJsonResponse(saveResponse);

      roomSavedOn5004 = true;

      console.log(
        "ROOM SAVE RESPONSE:",
        saveData
      );


      // ======================================================
      // STEP 2: SHARE ROOM WITH JOINED PLAYERS ON PORT 5005
      // ======================================================

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

      console.log(
        "ROOM SHARE RESPONSE:",
        shareData
      );


      // ======================================================
      // STEP 3: GET LATEST ROOM DETAILS
      // ======================================================

      let freshRoomData = null;

      try {
        freshRoomData = await fetchRoomDetails(selectedId);

      } catch (refreshError) {
        console.error(
          "ROOM REFRESH ERROR:",
          refreshError
        );
      }

      const finalCount = freshRoomData
        ? freshRoomData.participantCount
        : getPlayerCount(shareData);

      const finalRoomData = {
        roomId:
          freshRoomData?.roomId || cleanRoomId,

        roomPassword:
          freshRoomData?.roomPassword || cleanPassword,

        participantCount: finalCount,
      };

      setRoomId(finalRoomData.roomId);
      setPassword(finalRoomData.roomPassword);
      setParticipantCount(finalCount);
      setRoomPublished(true);

      setRoomMap((previous) => ({
        ...previous,
        [selectedId]: finalRoomData,
      }));


      // ======================================================
      // STEP 4: SHOW SHARE RESULT
      // ======================================================

      const updatedPlayers = getPlayerCount(shareData);
      const notificationsCreated = getNotificationCount(shareData);

      setMessage(
        `Room saved and shared successfully. ${updatedPlayers} player(s) updated. ${notificationsCreated} notification(s) created.`
      );

      console.log(
        "PLAYERS UPDATED:",
        updatedPlayers
      );

      console.log(
        "NOTIFICATIONS CREATED:",
        notificationsCreated
      );

      if (shareData.notificationError) {
        console.error(
          "NOTIFICATION ERROR:",
          shareData.notificationError
        );
      }

    } catch (error) {
      console.error("PUBLISH ROOM ERROR:", error);

      if (roomSavedOn5004) {
        setErrorMsg(
          `Room details Port 5004 par save ho gaye, lekin players ko share karne mein error aaya: ${error.message}`
        );

        // Keep the saved room visible in the form.
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
        setErrorMsg(
          error.message || "Failed to save room."
        );
      }

    } finally {
      setSaving(false);
    }
  };


  // ----------------------------------------------------------
  // CLEAR ROOM DETAILS
  // ----------------------------------------------------------

  const handleClearRoom = async () => {
    if (!selectedTournament) {
      setErrorMsg("Please select a tournament first.");
      return;
    }

    const selectedId = selectedTournament.id;

    const confirmed = window.confirm(
      "Are you sure you want to remove room details from all joined players?"
    );

    if (!confirmed) return;

    const adminToken = localStorage.getItem("adminToken");

    if (!adminToken) {
      setErrorMsg("Admin token nahi mila. Please login again.");
      return;
    }

    try {
      setClearing(true);
      setMessage("");
      setErrorMsg("");

      const response = await fetch(
        `${ADMIN_API_BASE}/admin/rooms/${encodeURIComponent(
          selectedId
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      );

      const data = await getJsonResponse(response);

      const clearedCount = getPlayerCount(data);

      setRoomId("");
      setPassword("");
      setRoomPublished(false);

      let finalCount = 0;

      try {
        const freshRoomData = await fetchRoomDetails(selectedId);

        finalCount = freshRoomData.participantCount;

      } catch (refreshError) {
        console.error(
          "ROOM CLEAR REFRESH ERROR:",
          refreshError
        );
      }

      setParticipantCount(finalCount);

      setRoomMap((previous) => ({
        ...previous,
        [selectedId]: {
          roomId: "",
          roomPassword: "",
          participantCount: finalCount,
        },
      }));

      setMessage(
        `Room details cleared. ${clearedCount} player(s) updated.`
      );

    } catch (error) {
      console.error("CLEAR ROOM ERROR:", error);

      setErrorMsg(
        error.message || "Failed to clear room."
      );

    } finally {
      setClearing(false);
    }
  };


  // ----------------------------------------------------------
  // SELECTED TOURNAMENT
  // ----------------------------------------------------------

  const selectedRoom = selectedTournament
    ? roomMap[selectedTournament.id]
    : null;


  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="page">

      <h2 className="page-title">
        Room Management
      </h2>

      <p className="page-subtitle">
        Select a current Home Page tournament and share its Room ID and Password with joined players.
      </p>


      {/* SEARCH AND REFRESH */}

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "20px",
          marginBottom: "16px",
        }}
      >

        <input
          type="text"
          placeholder="Search Tournament ID or Name..."
          value={searchId}
          onChange={(event) => setSearchId(event.target.value)}
          style={{
            flex: 1,
            minWidth: "220px",
          }}
        />

        <button
          type="button"
          className="btn-secondary"
          onClick={fetchTournaments}
          disabled={loading || saving || clearing}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>

      </div>


      {/* TOURNAMENT COUNT */}

      <p style={{ marginBottom: "12px" }}>
        <strong>Current Home Page Tournaments:</strong>{" "}
        {filteredTournaments.length}
      </p>


      {/* TOURNAMENT LIST */}

      <div style={{ overflowX: "auto" }}>

        <table className="data-table">

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
                <td colSpan="8" className="empty-row">
                  Loading current tournaments...
                </td>
              </tr>
            ) : filteredTournaments.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-row">
                  {searchId.trim()
                    ? "No tournament found."
                    : "No current Home Page tournaments found."}
                </td>
              </tr>
            ) : (
              filteredTournaments.map((tournament, index) => {
                const room = roomMap[tournament.id];

                const hasRoom = Boolean(
                  room?.roomId && room?.roomPassword
                );

                const isSelected =
                  selectedTournament?.id === tournament.id;

                return (
                  <tr
                    key={tournament.id}
                    style={
                      isSelected
                        ? {
                            background: "rgba(34,197,94,0.08)",
                          }
                        : {}
                    }
                  >

                    <td>{index + 1}</td>

                    <td>
                      <strong>
                        {tournament.name ||
                          tournament.tournament_name ||
                          "Tournament"}
                      </strong>
                    </td>

                    <td>
                      <strong>{tournament.id}</strong>
                    </td>

                    <td>
                      {tournament.mode ||
                        tournament.game_mode ||
                        "-"}
                    </td>

                    <td>
                      {tournament.map || "-"}
                    </td>

                    <td>
                      {Number(room?.participantCount ?? 0)}
                    </td>

                    <td>
                      {hasRoom ? (
                        <span className="status approved">
                          Published
                        </span>
                      ) : (
                        <span className="status pending">
                          Not Published
                        </span>
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          roomLoading ||
                          saving ||
                          clearing
                        }
                        onClick={() => loadRoomDetails(tournament)}
                      >
                        {isSelected
                          ? "Selected"
                          : "Manage Room"}
                      </button>
                    </td>

                  </tr>
                );
              })
            )}

          </tbody>

        </table>

      </div>


      {/* ROOM MANAGEMENT FORM */}

      {selectedTournament && (
        <div
          style={{
            marginTop: "24px",
            padding: "18px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >

          <h3 style={{ marginTop: 0 }}>
            Manage Tournament Room
          </h3>

          <div style={{ marginBottom: "16px" }}>

            <p>
              <strong>Tournament:</strong>{" "}
              {selectedTournament.name ||
                selectedTournament.tournament_name ||
                "Tournament"}
            </p>

            <p>
              <strong>Tournament ID:</strong>{" "}
              {selectedTournament.id}
            </p>

            <p>
              <strong>Joined Players:</strong>{" "}
              {participantCount}
            </p>

          </div>


          {roomLoading ? (
            <p>Loading room details...</p>
          ) : (
            <form
              className="form-grid"
              onSubmit={handleSaveRoom}
            >

              {/* ROOM ID */}

              <input
                type="text"
                name="roomId"
                placeholder="Enter BGMI Room ID"
                value={roomId}
                onChange={(event) =>
                  setRoomId(event.target.value)
                }
                disabled={saving || clearing}
              />


              {/* ROOM PASSWORD */}

              <input
                type="text"
                name="password"
                placeholder="Enter BGMI Room Password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                disabled={saving || clearing}
              />


              {/* PUBLISH / UPDATE */}

              <button
                type="submit"
                className="btn-primary"
                disabled={saving || clearing}
              >
                {saving
                  ? "Saving and Sharing..."
                  : roomPublished
                  ? "Update & Share Room"
                  : "Publish & Share Room"}
              </button>


              {/* CLEAR */}

              <button
                type="button"
                className="btn-danger"
                onClick={handleClearRoom}
                disabled={
                  saving ||
                  clearing ||
                  !roomPublished
                }
              >
                {clearing
                  ? "Clearing..."
                  : "Clear Room"}
              </button>

            </form>
          )}

          {roomPublished && (
            <p
              style={{
                marginTop: "14px",
                color: "#16a34a",
                fontWeight: 600,
              }}
            >
              Room details are saved. Use Update & Share Room to send updated details to players again.
            </p>
          )}

        </div>
      )}


      {/* SUCCESS MESSAGE */}

      {message && (
        <p
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            color: "#16a34a",
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      )}


      {/* ERROR MESSAGE */}

      {errorMsg && (
        <p
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            color: "#ef4444",
            fontWeight: 700,
          }}
        >
          Error: {errorMsg}
        </p>
      )}

    </div>
  );
};

export default RoomManagement;
