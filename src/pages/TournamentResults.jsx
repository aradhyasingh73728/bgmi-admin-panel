
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "./TournamentResults.css";

// ============================================================
// API CONFIG
// ============================================================

const API_BASE = (
  import.meta.env.VITE_TOURNAMENT_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5005"
    : "https://create-tournament-server-5005.onrender.com")
).replace(/\/+$/, "");

// ============================================================
// HELPERS
// ============================================================

const getTournamentId = (t) =>
  t?.tournament_id || t?.id || "";

const getTournamentName = (t) =>
  t?.tournament_name || t?.name || "Unnamed Tournament";

const getTournamentStatus = (t) =>
  t?.tournament_status || t?.status || "Draft";

const normalizeStatus = (value) =>
  String(value || "").trim().toLowerCase();

const formatStatus = (value) => {
  if (!value) return "Not Started";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// ============================================================
// INDIA DATE
// ============================================================

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// ============================================================
// RESULTS PAGE FILTER
// ============================================================

const isEligibleForResults = (tournament) => {
  const today = getIndiaDate();

  const tournamentDate = String(
    tournament?.date || ""
  ).slice(0, 10);

  const status = normalizeStatus(
    getTournamentStatus(tournament)
  );

  return (
    tournamentDate === today &&
    (status === "live" || status === "completed")
  );
};

// ============================================================
// MATCH TYPE
// ============================================================

const getMatchType = (tournament) => {
  const value = String(
    tournament?.match_type ||
    tournament?.type ||
    "Classic"
  ).toLowerCase();

  return value.includes("tdm") ? "TDM" : "Classic";
};

// ============================================================
// PLAYER HELPERS
// ============================================================

const getBgmiName = (player) =>
  player?.bgmi_name ||
  player?.player_bgmi_name ||
  player?.bgmiName ||
  player?.player_name ||
  "Unknown Player";

const getBgmiId = (player) =>
  player?.bgmi_id ||
  player?.player_bgmi_id ||
  player?.bgmiId ||
  "N/A";

const getProfileId = (player) =>
  player?.profile_id ||
  player?.user_profile_id ||
  player?.profileId ||
  "N/A";

// ============================================================
// COMPONENT
// ============================================================

const TournamentResults = () => {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] =
    useState(null);

  const [players, setPlayers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // CUSTOM CONFIRMATION MODAL
  const [confirmModal, setConfirmModal] = useState(null);

  // ==========================================================
  // CUSTOM CONFIRMATION
  // ==========================================================

  const openConfirmModal = (type) => {
    if (actionLoading) return;

    if (type === "publish") {
      setConfirmModal({
        type: "publish",
        title: "Publish Tournament Results?",
        message:
          "Are you sure you want to publish these results? Winning amounts will be credited to player wallets. This action cannot be reversed.",
        confirmText: "Publish Results",
        variant: "publish",
        icon: "🚀",
      });
    }

    if (type === "complete") {
      setConfirmModal({
        type: "complete",
        title: "Complete Tournament?",
        message:
          "Please confirm that all player results and wallet payouts have been verified. Completing this tournament will lock it permanently.",
        confirmText: "Complete Tournament",
        variant: "complete",
        icon: "🏆",
      });
    }
  };

  const closeConfirmModal = () => {
    if (actionLoading) return;
    setConfirmModal(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmModal || actionLoading) return;

    const type = confirmModal.type;

    setConfirmModal(null);

    if (type === "publish") {
      await publishResults();
    }

    if (type === "complete") {
      await completeTournament();
    }
  };

  // ==========================================================
  // AUTHENTICATED API REQUEST
  // ==========================================================

  const apiRequest = useCallback(
    async (endpoint, options = {}) => {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        throw new Error(
          "Admin token missing. Please login again."
        );
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };

      if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(
        `${API_BASE}${endpoint}`,
        {
          ...options,
          headers,
        }
      );

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          throw new Error(
            "Admin session expired or unauthorized. Please login again."
          );
        }

        throw new Error(
          data.error ||
          data.message ||
          `Request failed with status ${response.status}`
        );
      }

      return data;
    },
    []
  );

  // ==========================================================
  // LOAD TOURNAMENTS
  // ==========================================================

  const fetchTournaments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await apiRequest(
        "/api/admin/tournaments"
      );

      const allTournaments = Array.isArray(data.tournaments)
        ? data.tournaments
        : [];

      const eligibleTournaments = allTournaments.filter(
        isEligibleForResults
      );

      setTournaments(eligibleTournaments);

      setSelectedTournament((previous) => {
        if (!eligibleTournaments.length) {
          return null;
        }

        if (!previous) {
          return eligibleTournaments[0];
        }

        const previousId = getTournamentId(previous);

        return (
          eligibleTournaments.find(
            (item) =>
              String(getTournamentId(item)) ===
              String(previousId)
          ) || eligibleTournaments[0]
        );
      });

      return eligibleTournaments;
    } catch (err) {
      console.error("Tournament loading error:", err);

      setError(
        err.message || "Failed to load tournaments."
      );

      setTournaments([]);
      setSelectedTournament(null);

      return [];
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  // ==========================================================
  // LOAD PLAYERS
  // ==========================================================

  const loadPlayersAgain = useCallback(
    async (id) => {
      if (!id) return null;

      return await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(id)}/players`
      );
    },
    [apiRequest]
  );

  const selectedTournamentId =
    getTournamentId(selectedTournament);

  useEffect(() => {
    const id = selectedTournamentId;

    if (!id) {
      setPlayers([]);
      setPlayersLoading(false);
      return;
    }

    let cancelled = false;

    const loadPlayers = async () => {
      try {
        setPlayersLoading(true);
        setError("");
        setPlayers([]);

        const data = await loadPlayersAgain(id);

        if (cancelled) return;

        setPlayers(
          Array.isArray(data.players)
            ? data.players
            : []
        );

        if (data.tournament) {
          setSelectedTournament((previous) => {
            if (
              String(getTournamentId(previous)) !==
              String(id)
            ) {
              return previous;
            }

            return {
              ...previous,
              ...data.tournament,
            };
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Player loading error:", err);
          setPlayers([]);

          setError(
            err.message || "Failed to load registered players."
          );
        }
      } finally {
        if (!cancelled) {
          setPlayersLoading(false);
        }
      }
    };

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [
    selectedTournamentId,
    loadPlayersAgain,
  ]);

  // ==========================================================
  // RELOAD CURRENT PLAYERS
  // ==========================================================

  const reloadCurrentPlayers = async () => {
    const id = getTournamentId(selectedTournament);

    if (!id) return;

    const data = await loadPlayersAgain(id);

    if (
      String(getTournamentId(selectedTournament)) !==
      String(id)
    ) {
      return;
    }

    setPlayers(
      Array.isArray(data.players)
        ? data.players
        : []
    );

    if (data.tournament) {
      setSelectedTournament((previous) => {
        if (
          String(getTournamentId(previous)) !==
          String(id)
        ) {
          return previous;
        }

        return {
          ...previous,
          ...data.tournament,
        };
      });
    }
  };

  // ==========================================================
  // UPDATE PLAYER
  // ==========================================================

  const updatePlayer = (joinId, field, value) => {
    setPlayers((previous) =>
      previous.map((player) => {
        if (
          String(player.join_id) !== String(joinId)
        ) {
          return player;
        }

        return {
          ...player,
          [field]: value,
        };
      })
    );
  };

  const toggleWinner = (joinId, checked) => {
    setPlayers((previous) =>
      previous.map((player) => {
        if (
          String(player.join_id) !== String(joinId)
        ) {
          return player;
        }

        return {
          ...player,
          is_winner: checked,
          winner_prize: checked
            ? player.winner_prize ?? 0
            : 0,
        };
      })
    );
  };

  // ==========================================================
  // SELECTED TOURNAMENT
  // ==========================================================

  const tournamentId =
    getTournamentId(selectedTournament);

  const tournamentName =
    getTournamentName(selectedTournament);

  const tournamentStatus =
    getTournamentStatus(selectedTournament);

  const normalizedTournamentStatus =
    normalizeStatus(tournamentStatus);

  const isCompleted =
    normalizedTournamentStatus === "completed";

  const isCancelled =
    normalizedTournamentStatus === "cancelled";

  const matchType = getMatchType(selectedTournament);

  const isTDM = matchType === "TDM";

  const perKill = isTDM
    ? 0
    : toNumber(
        selectedTournament?.per_kill ??
        selectedTournament?.perKill
      );

  // ==========================================================
  // CALCULATIONS
  // ==========================================================

  const totalPlayers = players.length;

  const savedPlayers = useMemo(
    () =>
      players.filter((player) => {
        const status = normalizeStatus(player.status);

        return (
          status !== "" &&
          status !== "not_saved"
        );
      }).length,
    [players]
  );

  const paidPlayers = useMemo(
    () =>
      players.filter(
        (player) =>
          normalizeStatus(player.status) === "paid"
      ).length,
    [players]
  );

  const creditedAmount = useMemo(
    () =>
      players.reduce((total, player) => {
        if (
          normalizeStatus(player.status) !== "paid"
        ) {
          return total;
        }

        return (
          total + toNumber(player.total_winning)
        );
      }, 0),
    [players]
  );

  const totalDraftWinning = useMemo(
    () =>
      players.reduce((total, player) => {
        const killAmount = isTDM
          ? 0
          : toNumber(player.kills) * perKill;

        const winnerPrize = player.is_winner
          ? toNumber(player.winner_prize)
          : 0;

        return total + killAmount + winnerPrize;
      }, 0),
    [players, perKill, isTDM]
  );

  const hasPaidResults = paidPlayers > 0;

  const editingLocked =
    isCompleted ||
    isCancelled ||
    hasPaidResults;

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validatePlayers = () => {
    if (!players.length) {
      throw new Error(
        "No registered players available."
      );
    }

    for (const player of players) {
      const playerName = getBgmiName(player);

      if (!isTDM) {
        const kills = Number(player.kills);

        const rank =
          player.rank_position === "" ||
          player.rank_position === null ||
          player.rank_position === undefined
            ? null
            : Number(player.rank_position);

        if (
          !Number.isFinite(kills) ||
          kills < 0 ||
          !Number.isInteger(kills)
        ) {
          throw new Error(
            `Invalid kills entered for ${playerName}.`
          );
        }

        if (
          rank !== null &&
          (
            !Number.isFinite(rank) ||
            rank < 1 ||
            !Number.isInteger(rank)
          )
        ) {
          throw new Error(
            `Invalid rank entered for ${playerName}.`
          );
        }
      }

      const winnerPrize = Number(
        player.winner_prize || 0
      );

      if (
        player.is_winner &&
        (
          !Number.isFinite(winnerPrize) ||
          winnerPrize < 0
        )
      ) {
        throw new Error(
          `Invalid winning amount for ${playerName}.`
        );
      }
    }

    if (isTDM) {
      const winners = players.filter(
        (player) => Boolean(player.is_winner)
      );

      if (!winners.length) {
        throw new Error(
          "Please select at least one TDM winner."
        );
      }

      const zeroPrizeWinner = winners.find(
        (player) =>
          toNumber(player.winner_prize) <= 0
      );

      if (zeroPrizeWinner) {
        throw new Error(
          `Enter winning amount for ${getBgmiName(zeroPrizeWinner)}.`
        );
      }
    }
  };

  // ==========================================================
  // SAVE RESULTS
  // ==========================================================

  const saveResults = async () => {
    try {
      if (!tournamentId) {
        throw new Error(
          "Please select a tournament first."
        );
      }

      if (editingLocked) {
        throw new Error(
          "Results cannot be edited after payout or tournament completion."
        );
      }

      validatePlayers();

      setActionLoading(true);
      setError("");
      setSuccess("");

      const payload = {
        players: players.map((player) => ({
          join_id: player.join_id,

          kills: isTDM
            ? 0
            : Number(player.kills || 0),

          points: toNumber(player.points),

          rank_position: isTDM
            ? null
            : (
                player.rank_position === "" ||
                player.rank_position === null ||
                player.rank_position === undefined
                  ? null
                  : Number(player.rank_position)
              ),

          is_winner: Boolean(player.is_winner),

          winner_prize: player.is_winner
            ? Number(player.winner_prize || 0)
            : 0,
        })),
      };

      const data = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(
          tournamentId
        )}/results`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        }
      );

      setSuccess(
        data.message || "Results saved successfully."
      );

      await reloadCurrentPlayers();
    } catch (err) {
      console.error("Save results error:", err);

      setError(
        err.message || "Unable to save results."
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================================
  // PUBLISH RESULTS
  // ==========================================================

  const publishResults = async () => {
    try {
      if (!tournamentId) {
        throw new Error(
          "Please select a tournament first."
        );
      }

      if (!players.length) {
        throw new Error(
          "No registered players found."
        );
      }

      if (editingLocked) {
        throw new Error(
          "Results have already been paid or tournament is locked."
        );
      }

      const notSaved = players.filter((player) => {
        const status = normalizeStatus(player.status);

        return (
          status === "" ||
          status === "not_saved"
        );
      });

      if (notSaved.length > 0) {
        throw new Error(
          "Save all player results before publishing."
        );
      }

      if (isTDM) {
        const winners = players.filter(
          (player) => Boolean(player.is_winner)
        );

        if (!winners.length) {
          throw new Error(
            "Please select the TDM winner before publishing."
          );
        }

        const invalidWinner = winners.find(
          (player) =>
            toNumber(player.winner_prize) <= 0
        );

        if (invalidWinner) {
          throw new Error(
            `Winning amount is missing for ${getBgmiName(invalidWinner)}.`
          );
        }
      }

      setActionLoading(true);
      setError("");
      setSuccess("");

      const data = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(
          tournamentId
        )}/publish-results`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      const paidCount =
        data.paidCount ??
        data.paid_count ??
        0;

      const totalAmount = toNumber(
        data.totalAmount ??
        data.total_amount
      );

      setSuccess(
        `${data.message || "Results published successfully."} Paid players: ${paidCount}, Total credited: ₹${totalAmount.toFixed(2)}`
      );

      await reloadCurrentPlayers();
    } catch (err) {
      console.error("Publish results error:", err);

      setError(
        err.message || "Unable to publish results."
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================================
  // COMPLETE TOURNAMENT
  // ==========================================================

  const completeTournament = async () => {
    try {
      if (!tournamentId) {
        throw new Error(
          "Please select a tournament first."
        );
      }

      if (!players.length) {
        throw new Error(
          "No registered players found."
        );
      }

      if (isCompleted) {
        throw new Error(
          "This tournament is already completed."
        );
      }

      if (isCancelled) {
        throw new Error(
          "Cancelled tournaments cannot be completed."
        );
      }

      const unpaidPlayers = players.filter(
        (player) =>
          normalizeStatus(player.status) !== "paid"
      );

      if (unpaidPlayers.length > 0) {
        throw new Error(
          "All player payouts must be completed before completing the tournament."
        );
      }

      setActionLoading(true);
      setError("");
      setSuccess("");

      const data = await apiRequest(
        `/api/admin/tournaments/${encodeURIComponent(
          tournamentId
        )}/complete`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (data.tournament) {
        setSelectedTournament((previous) => ({
          ...previous,
          ...data.tournament,
        }));
      }

      setSuccess(
        data.message ||
        "Tournament completed successfully."
      );

      await fetchTournaments();
    } catch (err) {
      console.error("Complete tournament error:", err);

      setError(
        err.message || "Unable to complete tournament."
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================================
  // REFRESH
  // ==========================================================

  const refreshPage = async () => {
    setError("");
    setSuccess("");

    const currentId = tournamentId;

    const list = await fetchTournaments();

    if (!currentId) return;

    const exists = list.some(
      (item) =>
        String(getTournamentId(item)) ===
        String(currentId)
    );

    if (exists) {
      try {
        const data = await loadPlayersAgain(currentId);

        setPlayers(
          Array.isArray(data.players)
            ? data.players
            : []
        );

        if (data.tournament) {
          setSelectedTournament((previous) => {
            if (
              String(getTournamentId(previous)) !==
              String(currentId)
            ) {
              return previous;
            }

            return {
              ...previous,
              ...data.tournament,
            };
          });
        }
      } catch (err) {
        setError(
          err.message || "Unable to refresh player results."
        );
      }
    }
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="tr-page">

      {/* HEADER */}

      <div className="tr-header">
        <div>
          <div className="tr-heading-label">
            E-SPORTS ADMIN PANEL
          </div>

          <h1>
            TOURNAMENT <span>RESULTS</span>
          </h1>

          <p>
            Manage match results, winners and wallet payouts.
          </p>
        </div>

        <button
          className="tr-refresh-btn"
          type="button"
          onClick={refreshPage}
          disabled={loading || actionLoading}
        >
          ↻ {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* CUSTOM ERROR NOTIFICATION */}

      {error && (
        <div className="tr-error" role="alert">
          <span className="tr-alert-icon">!</span>
          <span>{error}</span>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            ✕
          </button>
        </div>
      )}

      {/* CUSTOM SUCCESS NOTIFICATION */}

      {success && (
        <div className="tr-success" role="status">
          <span className="tr-alert-icon">✓</span>
          <span>{success}</span>

          <button
            type="button"
            aria-label="Dismiss success"
            onClick={() => setSuccess("")}
          >
            ✕
          </button>
        </div>
      )}

      {/* TOURNAMENT LIST */}

      <div className="tr-section">
        <div className="tr-section-heading">
          <div>
            <h2>Available Tournaments</h2>
            <p>
              Only today's Live and Completed matches are shown.
            </p>
          </div>

          <span className="tr-count">
            {tournaments.length} Tournaments
          </span>
        </div>

        {loading ? (
          <div className="tr-empty">
            Loading tournaments...
          </div>
        ) : tournaments.length === 0 ? (
          <div className="tr-empty">
            <div className="tr-empty-icon">🏆</div>
            <h3>No Live Matches Found</h3>
            <p>
              No Live or Completed tournaments are available for today.
              Set a tournament to Live from Tournament Management first.
            </p>
          </div>
        ) : (
          <div className="tr-tournament-grid">
            {tournaments.map((tournament) => {
              const id = getTournamentId(tournament);

              const selected =
                String(tournamentId) === String(id);

              const joinedCount =
                tournament.joinedPlayers ??
                tournament.registered ??
                0;

              const tdm =
                getMatchType(tournament) === "TDM";

              return (
                <div
                  key={id}
                  className={`tr-tournament-card ${
                    selected ? "selected" : ""
                  }`}
                  onClick={() => {
                    if (!actionLoading) {
                      setSelectedTournament(tournament);
                    }
                  }}
                >
                  <div className="tr-card-top">
                    <span className="tr-card-icon">🏆</span>

                    <span className="tr-status">
                      {formatStatus(
                        getTournamentStatus(tournament)
                      )}
                    </span>
                  </div>

                  <h3>{getTournamentName(tournament)}</h3>

                  <p className="tr-tournament-id">
                    ID: {id}
                  </p>

                  <div className="tr-card-details">
                    <span>
                      🎮 {tournament.game_mode || tournament.mode || "N/A"}
                    </span>

                    <span>
                      🗺️ {tournament.map || "N/A"}
                    </span>

                    <span>
                      👥 {joinedCount} Players
                    </span>

                    <span>
                      💰 ₹{toNumber(
                        tournament.prize_pool ??
                        tournament.prizePool
                      )}
                    </span>
                  </div>

                  <div className="tr-card-type">
                    {tdm ? "TDM MATCH" : "CLASSIC MATCH"}
                  </div>

                  <button
                    className="tr-manage-btn"
                    type="button"
                    disabled={actionLoading}
                  >
                    {selected
                      ? "SELECTED ✓"
                      : "MANAGE RESULTS →"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SELECTED TOURNAMENT */}

      {selectedTournament && (
        <>
          <div className="tr-section">
            <div className="tr-section-heading">
              <div>
                <h2>Selected Tournament</h2>
                <p>Complete tournament result management.</p>
              </div>

              <span className="tr-selected-tag">
                {isTDM ? "TDM RESULT MODE" : "CLASSIC RESULT MODE"}
              </span>
            </div>

            <div className="tr-overview">
              <div className="tr-overview-main">
                <span className="tr-overview-label">
                  TOURNAMENT NAME
                </span>

                <h2>{tournamentName}</h2>

                <span className="tr-overview-id">
                  Tournament ID: {tournamentId}
                </span>
              </div>

              <div className="tr-overview-grid">
                <div>
                  <span>GAME MODE</span>
                  <strong>
                    {selectedTournament.game_mode ||
                    selectedTournament.mode ||
                    "N/A"}
                  </strong>
                </div>

                <div>
                  <span>MATCH TYPE</span>
                  <strong>{matchType}</strong>
                </div>

                <div>
                  <span>MAP</span>
                  <strong>{selectedTournament.map || "N/A"}</strong>
                </div>

                <div>
                  <span>ENTRY FEE</span>
                  <strong>
                    ₹{toNumber(
                      selectedTournament.entry_fee ??
                      selectedTournament.entryFee
                    )}
                  </strong>
                </div>

                <div>
                  <span>PRIZE POOL</span>
                  <strong>
                    ₹{toNumber(
                      selectedTournament.prize_pool ??
                      selectedTournament.prizePool
                    )}
                  </strong>
                </div>

                <div>
                  <span>DATE & TIME</span>
                  <strong>
                    {selectedTournament.date || "N/A"}{" "}
                    {selectedTournament.time || ""}
                  </strong>
                </div>
              </div>
            </div>

            {/* SUMMARY */}

            <div className="tr-stats-grid">
              <div className="tr-stat-card">
                <span>REGISTERED PLAYERS</span>
                <strong>{totalPlayers}</strong>
              </div>

              <div className="tr-stat-card">
                <span>RESULTS SAVED</span>
                <strong>
                  {savedPlayers}/{totalPlayers}
                </strong>
              </div>

              <div className="tr-stat-card">
                <span>WINNING CREDITED</span>
                <strong>
                  ₹{creditedAmount.toFixed(2)}
                </strong>
              </div>

              <div className="tr-stat-card">
                <span>TOURNAMENT STATUS</span>
                <strong className="tr-stat-status">
                  {formatStatus(tournamentStatus)}
                </strong>
              </div>
            </div>
          </div>

          {/* PLAYER RESULTS */}

          <div className="tr-section">
            <div className="tr-section-heading">
              <div>
                <h2>Player Results</h2>

                <p>
                  {isTDM
                    ? "Select the winning player or winning team members and enter their winning amount."
                    : "Enter kills, rank and winner prize for each player."}
                </p>
              </div>

              <span className="tr-count">
                {totalPlayers} Players
              </span>
            </div>

            {playersLoading ? (
              <div className="tr-empty">
                Loading registered players...
              </div>
            ) : players.length === 0 ? (
              <div className="tr-empty">
                <div className="tr-empty-icon">👥</div>
                <h3>No Registered Players</h3>
                <p>
                  This tournament does not have any registered players yet.
                </p>
              </div>
            ) : (
              <>
                <div className="tr-table-wrapper">
                  <table className="tr-results-table">
                    <thead>
                      <tr>
                        <th>PLAYER / BGMI NAME</th>
                        <th>BGMI ID</th>
                        <th>PROFILE ID</th>

                        {!isTDM && (
                          <>
                            <th>KILLS</th>
                            <th>RANK</th>
                          </>
                        )}

                        <th>WINNER</th>
                        <th>WINNING AMOUNT</th>

                        {!isTDM && (
                          <>
                            <th>KILL AMOUNT</th>
                            <th>TOTAL WINNING</th>
                          </>
                        )}

                        {isTDM && (
                          <th>TOTAL WINNING</th>
                        )}

                        <th>PAYMENT</th>
                      </tr>
                    </thead>

                    <tbody>
                      {players.map((player) => {
                        const killAmount = isTDM
                          ? 0
                          : toNumber(player.kills) * perKill;

                        const winnerPrize =
                          player.is_winner
                            ? toNumber(player.winner_prize)
                            : 0;

                        const totalWinning =
                          killAmount + winnerPrize;

                        const isPaid =
                          normalizeStatus(player.status) === "paid";

                        const isLocked =
                          editingLocked || isPaid;

                        return (
                          <tr key={player.join_id}>
                            <td>
                              <strong className="tr-player-name">
                                {getBgmiName(player)}
                              </strong>

                              <small className="tr-player-real-name">
                                Registration: {player.player_name || "N/A"}
                              </small>
                            </td>

                            <td>
                              <span className="tr-id-value">
                                {getBgmiId(player)}
                              </span>
                            </td>

                            <td>
                              <span className="tr-id-value">
                                {getProfileId(player)}
                              </span>
                            </td>

                            {!isTDM && (
                              <>
                                <td>
                                  <input
                                    className="tr-result-input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={player.kills ?? 0}
                                    disabled={isLocked}
                                    onChange={(event) =>
                                      updatePlayer(
                                        player.join_id,
                                        "kills",
                                        event.target.value
                                      )
                                    }
                                  />
                                </td>

                                <td>
                                  <input
                                    className="tr-result-input"
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="-"
                                    value={
                                      player.rank_position ?? ""
                                    }
                                    disabled={isLocked}
                                    onChange={(event) =>
                                      updatePlayer(
                                        player.join_id,
                                        "rank_position",
                                        event.target.value
                                      )
                                    }
                                  />
                                </td>
                              </>
                            )}

                            <td>
                              <label className="tr-winner-check">
                                <input
                                  type="checkbox"
                                  checked={Boolean(player.is_winner)}
                                  disabled={isLocked}
                                  onChange={(event) =>
                                    toggleWinner(
                                      player.join_id,
                                      event.target.checked
                                    )
                                  }
                                />

                                <span>
                                  {player.is_winner
                                    ? "WINNER"
                                    : "SELECT"}
                                </span>
                              </label>
                            </td>

                            <td>
                              <input
                                className="tr-result-input tr-prize-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  player.is_winner
                                    ? player.winner_prize ?? 0
                                    : 0
                                }
                                disabled={
                                  isLocked ||
                                  !player.is_winner
                                }
                                onChange={(event) =>
                                  updatePlayer(
                                    player.join_id,
                                    "winner_prize",
                                    event.target.value
                                  )
                                }
                              />
                            </td>

                            {!isTDM && (
                              <>
                                <td>
                                  ₹{killAmount.toFixed(2)}
                                </td>

                                <td>
                                  <strong>
                                    ₹{totalWinning.toFixed(2)}
                                  </strong>
                                </td>
                              </>
                            )}

                            {isTDM && (
                              <td>
                                <strong>
                                  ₹{totalWinning.toFixed(2)}
                                </strong>
                              </td>
                            )}

                            <td>
                              <span
                                className={`tr-payment-status ${
                                  isPaid ? "paid" : "pending"
                                }`}
                              >
                                {isPaid ? "PAID" : "PENDING"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* WINNING SUMMARY */}

                <div className="tr-winning-placeholder">
                  <div className="tr-winning-icon">💰</div>

                  <div>
                    <h3>
                      {isTDM
                        ? "TDM Winner Calculation"
                        : "Classic Winning Calculation"}
                    </h3>

                    <p>
                      {isTDM ? (
                        <>
                          Selected winners:{" "}
                          {players.filter(
                            (player) => player.is_winner
                          ).length}
                          {" | "}
                          Total winning: ₹
                          {totalDraftWinning.toFixed(2)}
                          {" | "}
                          Already credited: ₹
                          {creditedAmount.toFixed(2)}
                        </>
                      ) : (
                        <>
                          Per kill: ₹{perKill.toFixed(2)}
                          {" | "}
                          Total estimated winning: ₹
                          {totalDraftWinning.toFixed(2)}
                          {" | "}
                          Already credited: ₹
                          {creditedAmount.toFixed(2)}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* FINAL ACTIONS */}

          <div className="tr-section">
            <div className="tr-section-heading">
              <div>
                <h2>Final Actions</h2>
                <p>Save, publish and complete this tournament.</p>
              </div>
            </div>

            <div className="tr-actions">
              <button
                className="tr-action-btn save"
                type="button"
                onClick={saveResults}
                disabled={
                  actionLoading ||
                  playersLoading ||
                  !players.length ||
                  editingLocked
                }
              >
                {actionLoading
                  ? "Please wait..."
                  : "💾 Save Results"}
              </button>

              <button
                className="tr-action-btn publish"
                type="button"
                onClick={() => openConfirmModal("publish")}
                disabled={
                  actionLoading ||
                  playersLoading ||
                  !players.length ||
                  editingLocked ||
                  savedPlayers !== totalPlayers
                }
              >
                🚀 Publish & Credit Winning
              </button>

              <button
                className="tr-action-btn complete"
                type="button"
                onClick={() => openConfirmModal("complete")}
                disabled={
                  actionLoading ||
                  playersLoading ||
                  !players.length ||
                  isCompleted ||
                  isCancelled ||
                  paidPlayers !== totalPlayers
                }
              >
                ✓ Complete Tournament
              </button>
            </div>

            <p className="tr-action-note">
              {isCompleted
                ? "This tournament has been completed."
                : isCancelled
                  ? "Cancelled tournaments cannot publish results."
                  : hasPaidResults
                    ? "Wallet payouts have started. Editing is locked."
                    : "Save all player results before publishing. Complete the tournament only after every payout is verified."}
            </p>
          </div>
        </>
      )}

      {/* =====================================================
          CUSTOM CONFIRMATION MODAL
      ===================================================== */}

      {confirmModal && (
        <div
          className="tr-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeConfirmModal();
            }
          }}
        >
          <div
            className="tr-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tr-modal-title"
            aria-describedby="tr-modal-message"
          >
            <button
              type="button"
              className="tr-modal-close"
              onClick={closeConfirmModal}
              disabled={actionLoading}
              aria-label="Close confirmation"
            >
              ✕
            </button>

            <div
              className={`tr-modal-icon ${confirmModal.variant}`}
            >
              {confirmModal.icon}
            </div>

            <h2 id="tr-modal-title">
              {confirmModal.title}
            </h2>

            <p id="tr-modal-message">
              {confirmModal.message}
            </p>

            <div className="tr-modal-details">
              <span>TOURNAMENT</span>
              <strong>{tournamentName}</strong>

              <span>REGISTERED PLAYERS</span>
              <strong>{totalPlayers}</strong>
            </div>

            <div className="tr-modal-actions">
              <button
                type="button"
                className="tr-modal-cancel"
                onClick={closeConfirmModal}
                disabled={actionLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`tr-modal-confirm ${confirmModal.variant}`}
                onClick={handleConfirmAction}
                disabled={actionLoading}
              >
                {actionLoading
                  ? "Please wait..."
                  : confirmModal.confirmText}
              </button>
            </div>

            <div className="tr-modal-security">
              <span>🔒</span>
              Please verify all details before proceeding.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentResults;
