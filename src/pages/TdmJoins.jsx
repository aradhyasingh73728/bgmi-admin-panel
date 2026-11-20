
import { useState, useEffect, useCallback, useMemo } from "react";
import "./TdmJoins.css";

const API_URL = (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5002"
    : "https://deposit-and-join-tournament-server-5002.onrender.com"
).replace(/\/+$/, "");

const TdmJoins = () => {
  const [joins, setJoins] = useState([]);
  const [rooms, setRooms] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingTournamentId, setSavingTournamentId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const groupedFirstRowMap = useMemo(() => {
    const firstMap = {};

    joins.forEach((join) => {
      const tournamentKey = String(join.tournament_id ?? "");

      if (!(tournamentKey in firstMap)) {
        firstMap[tournamentKey] = join.id;
      }
    });

    return firstMap;
  }, [joins]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
  };

  const requestJson = async (url, options = {}) => {
    let response;

    try {
      response = await fetch(url, options);
    } catch {
      throw new Error(
        "Unable to connect to the server. Check your internet connection and try again."
      );
    }

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        response.status >= 500
          ? `The server encountered an error (HTTP ${response.status}). Please try again.`
          : `The request could not be completed (HTTP ${response.status}). Please check the details and try again.`
      );
    }

    return data;
  };

  const fetchData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      const data = await requestJson(`${API_URL}/api/admin/joins`);

      const joinsData = Array.isArray(data.tournamentJoins)
        ? data.tournamentJoins
        : [];

      setJoins(joinsData);

      const roomMap = {};

      joinsData.forEach((join) => {
        const tournamentKey = String(join.tournament_id ?? "");

        if (!(tournamentKey in roomMap)) {
          roomMap[tournamentKey] = {
            roomId: join.room_id || "",
            roomPassword: join.room_password || "",
          };
        }
      });

      setRooms(roomMap);
    } catch (error) {
      console.error("Fetch admin joins error:", error);

      showMessage(
        "error",
        error.message || "Unable to load tournament joins."
      );

      setJoins([]);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  const updateRoomField = (tournamentId, field, value) => {
    const key = String(tournamentId);

    setRooms((previous) => ({
      ...previous,
      [key]: {
        roomId: previous[key]?.roomId || "",
        roomPassword: previous[key]?.roomPassword || "",
        [field]: value,
      },
    }));
  };

  const saveRoom = async (tournamentId) => {
    const key = String(tournamentId);

    const roomData = rooms[key] || {
      roomId: "",
      roomPassword: "",
    };

    if (!roomData.roomId.trim() && !roomData.roomPassword.trim()) {
      showMessage(
        "error",
        "Enter a Room ID or Room Password before saving."
      );
      return;
    }

    try {
      setSavingTournamentId(key);
      setMessage(null);

      const data = await requestJson(
        `${API_URL}/api/admin/set-room-by-tournament`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tournamentId,
            roomId: roomData.roomId.trim(),
            roomPassword: roomData.roomPassword.trim(),
          }),
        }
      );

      showMessage(
        "success",
        typeof data.message === "string" &&
          // eslint-disable-next-line no-control-regex
          /^[\x00-\x7F]*$/.test(data.message)
          ? data.message
          : "Room details saved successfully."
      );

      await fetchData(false);
    } catch (error) {
      console.error("Save room error:", error);

      showMessage(
        "error",
        error.message || "Unable to save room details."
      );
    } finally {
      setSavingTournamentId("");
    }
  };

  const clearRoom = async (tournamentId) => {
    const key = String(tournamentId);

    try {
      setSavingTournamentId(key);
      setMessage(null);

      await requestJson(`${API_URL}/api/admin/set-room-by-tournament`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId,
          roomId: "",
          roomPassword: "",
        }),
      });

      showMessage("success", "Room details cleared successfully.");

      await fetchData(false);
    } catch (error) {
      console.error("Clear room error:", error);

      showMessage(
        "error",
        error.message || "Unable to clear room details."
      );
    } finally {
      setSavingTournamentId("");
    }
  };

  const askDeleteUser = (join) => {
    setConfirmDelete({
      id: join.id,
      playerName:
        join.player_name || join.profile_name || "this player",
    });
  };

  const deleteUser = async () => {
    if (!confirmDelete?.id) return;

    const id = confirmDelete.id;

    try {
      setDeletingId(String(id));
      setMessage(null);
      setConfirmDelete(null);

      await requestJson(
        `${API_URL}/api/admin/tournament/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      showMessage(
        "success",
        "Tournament join record deleted successfully."
      );

      await fetchData(false);
    } catch (error) {
      console.error("Delete user error:", error);

      showMessage(
        "error",
        error.message || "Unable to delete this join record."
      );
    } finally {
      setDeletingId("");
    }
  };

  const totalPlayers = joins.length;
  const totalTournaments = Object.keys(groupedFirstRowMap).length;

  if (loading) {
    return (
      <main className="tdm-joins-page">
        <div className="tdm-joins-loading">
          <span className="tdm-joins-spinner" />
          <h2>Loading Tournament Joins</h2>
          <p>Please wait while the data is being loaded.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="tdm-joins-page">
      <div className="tdm-joins-container">
        <header className="tdm-joins-header">
          <div>
            <span className="tdm-joins-eyebrow">
              BGMI ESPORTS ADMIN PANEL
            </span>

            <h1>
              TOURNAMENT <span>JOINS</span>
            </h1>

            <p>
              Manage registered players and tournament room credentials.
            </p>
          </div>

          <button
            type="button"
            className="tdm-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={
              loading ||
              Boolean(savingTournamentId) ||
              Boolean(deletingId)
            }
          >
            ↻ Refresh Data
          </button>
        </header>

        <section className="tdm-joins-stats">
          <article className="tdm-stat-card">
            <span className="tdm-stat-label">
              Total Joined Players
            </span>
            <strong>{totalPlayers}</strong>
          </article>

          <article className="tdm-stat-card">
            <span className="tdm-stat-label">
              Total Tournaments
            </span>
            <strong>{totalTournaments}</strong>
          </article>
        </section>

        {message && (
          <div
            className={`tdm-admin-message ${message.type}`}
            role={message.type === "error" ? "alert" : "status"}
          >
            <span>{message.text}</span>

            <button
              type="button"
              onClick={() => setMessage(null)}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        <section className="tdm-table-card">
          <div className="tdm-table-heading">
            <div>
              <h2>Player Registrations</h2>
              <p>
                Room credentials are managed once per tournament.
              </p>
            </div>

            <span className="tdm-record-count">
              {joins.length} Records
            </span>
          </div>

          <div className="tdm-table-wrap">
            <table className="tdm-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Profile Name</th>
                  <th>Profile ID</th>
                  <th>Tournament ID</th>
                  <th>Tournament Name</th>
                  <th>Player Name</th>
                  <th>Player ID</th>
                  <th>Entry Fee</th>
                  <th>Prize Pool</th>
                  <th>Mode</th>
                  <th>Map</th>
                  <th>Team Type</th>
                  <th>Per Kill</th>
                  <th>Room ID</th>
                  <th>Room Password</th>
                  <th>Joined At</th>
                  <th>Save</th>
                  <th>Clear</th>
                  <th>Delete</th>
                </tr>
              </thead>

              <tbody>
                {joins.map((join, index) => {
                  const tournamentKey = String(
                    join.tournament_id ?? ""
                  );

                  const isPrimaryRow =
                    groupedFirstRowMap[tournamentKey] === join.id;

                  const isSaving =
                    savingTournamentId === tournamentKey;

                  const isDeleting =
                    deletingId === String(join.id);

                  return (
                    <tr key={join.id}>
                      <td>{index + 1}</td>

                      <td>{join.profile_name || "N/A"}</td>
                      <td>{join.profile_id || "N/A"}</td>
                      <td>{join.tournament_id || "N/A"}</td>

                      <td className="tdm-tournament-name">
                        {join.tournament_name || "N/A"}
                      </td>

                      <td>{join.player_name || "N/A"}</td>
                      <td>{join.bgmi_id || "N/A"}</td>

                      <td>
                        ₹
                        {Number(join.entry_fee || 0).toLocaleString(
                          "en-IN"
                        )}
                      </td>

                      <td>
                        ₹
                        {Number(join.prize_pool || 0).toLocaleString(
                          "en-IN"
                        )}
                      </td>

                      <td>{join.mode || "Battle Royal"}</td>
                      <td>{join.map || "N/A"}</td>

                      <td className="tdm-capitalize">
                        {join.team_type || "N/A"}
                      </td>

                      <td>
                        {join.per_kill !== null &&
                        join.per_kill !== undefined
                          ? `₹${join.per_kill}`
                          : "N/A"}
                      </td>

                      <td>
                        <input
                          className="tdm-room-input"
                          type="text"
                          value={
                            rooms[tournamentKey]?.roomId || ""
                          }
                          onChange={(event) =>
                            updateRoomField(
                              join.tournament_id,
                              "roomId",
                              event.target.value
                            )
                          }
                          placeholder="Room ID"
                          aria-label={`Room ID for tournament ${tournamentKey}`}
                          disabled={
                            !isPrimaryRow ||
                            Boolean(savingTournamentId)
                          }
                        />
                      </td>

                      <td>
                        <input
                          className="tdm-room-input"
                          type="text"
                          value={
                            rooms[tournamentKey]?.roomPassword || ""
                          }
                          onChange={(event) =>
                            updateRoomField(
                              join.tournament_id,
                              "roomPassword",
                              event.target.value
                            )
                          }
                          placeholder="Password"
                          aria-label={`Room password for tournament ${tournamentKey}`}
                          disabled={
                            !isPrimaryRow ||
                            Boolean(savingTournamentId)
                          }
                        />
                      </td>

                      <td>
                        {join.joined_at
                          ? new Date(
                              join.joined_at
                            ).toLocaleString("en-IN")
                          : "N/A"}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="tdm-action-btn save"
                          onClick={() =>
                            saveRoom(join.tournament_id)
                          }
                          disabled={
                            !isPrimaryRow ||
                            Boolean(savingTournamentId)
                          }
                          title={
                            isPrimaryRow
                              ? "Save room details"
                              : "Use the first row for this tournament"
                          }
                        >
                          {isSaving ? "..." : "Save"}
                        </button>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="tdm-action-btn clear"
                          onClick={() =>
                            clearRoom(join.tournament_id)
                          }
                          disabled={
                            !isPrimaryRow ||
                            Boolean(savingTournamentId)
                          }
                          title={
                            isPrimaryRow
                              ? "Clear room details"
                              : "Use the first row for this tournament"
                          }
                        >
                          {isSaving ? "..." : "Clear"}
                        </button>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="tdm-action-btn delete"
                          onClick={() => askDeleteUser(join)}
                          disabled={Boolean(deletingId)}
                          title="Delete join record"
                        >
                          {isDeleting ? "..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {joins.length === 0 && (
                  <tr>
                    <td className="tdm-no-data" colSpan={19}>
                      <span>📭</span>
                      <strong>No tournament joins found</strong>
                      <small>
                        Player registrations will appear here.
                      </small>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <details className="tdm-debug-panel">
          <summary>Debug Information</summary>

          <pre>
            {JSON.stringify(
              {
                totalJoins: joins.length,
                totalTournaments,
                roomsCount: Object.keys(rooms).length,
                sampleData: joins[0] || "No data",
              },
              null,
              2
            )}
          </pre>
        </details>
      </div>

      {confirmDelete && (
        <div
          className="tdm-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmDelete(null);
            }
          }}
        >
          <section
            className="tdm-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tdm-confirm-title"
          >
            <div className="tdm-confirm-icon">!</div>

            <h2 id="tdm-confirm-title">
              Delete Join Record?
            </h2>

            <p>
              Are you sure you want to delete the join record for{" "}
              <strong>{confirmDelete.playerName}</strong>? This action
              cannot be undone.
            </p>

            <div className="tdm-confirm-actions">
              <button
                type="button"
                className="tdm-cancel-btn"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="tdm-confirm-delete-btn"
                onClick={deleteUser}
                disabled={Boolean(deletingId)}
              >
                {deletingId ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default TdmJoins;
