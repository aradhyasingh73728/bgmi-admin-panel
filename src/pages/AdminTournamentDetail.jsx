
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import "./AdminTournamentDetail.css";

// ============================================================
// API CONFIGURATION
// ============================================================

const ADMIN_API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5004"
    : "https://bgmi-admin-dashboard-server-5004.onrender.com";

const getAdminAuthConfig = () => {
  const token = localStorage.getItem("adminToken");

  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

// ============================================================
// HELPERS
// ============================================================

const currency = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getPerKill = (tournament) =>
  Math.max(
    0,
    safeNumber(tournament?.per_kill ?? tournament?.perKill ?? 0)
  );

const getWinnerPrize = (tournament) =>
  Math.max(
    0,
    safeNumber(
      tournament?.winner_prize ??
        tournament?.winnerPrize ??
        tournament?.prize_pool ??
        tournament?.prizePool ??
        0
    )
  );

const getMaxSlots = (tournament) => {
  const slots = safeNumber(
    tournament?.max_slots ??
      tournament?.maxSlots ??
      tournament?.slots ??
      50
  );

  return slots > 0 ? Math.floor(slots) : 50;
};

const normalizeResult = (result) => ({
  kills: Math.max(0, Math.floor(safeNumber(result?.kills, 0))),
  isWinner: Boolean(result?.is_winner),
  killAmount: safeNumber(result?.kill_amount, 0),
  winnerPrize: safeNumber(result?.winner_prize, 0),
  totalWinning: safeNumber(result?.total_winning, 0),
  status: result?.status || "",
});

const isSettledTournament = (tournament) => {
  const status = String(tournament?.status || "").toLowerCase();

  return (
    tournament?.settled === true ||
    tournament?.is_settled === true ||
    tournament?.results_settled === true ||
    tournament?.resultsSettled === true ||
    tournament?.settlement_completed === true ||
    status === "settled" ||
    status === "paid"
  );
};

const hasPaidResults = (results) =>
  results.some((result) => {
    const status = String(
      result?.status || result?.result_status || ""
    ).toLowerCase();

    return status === "paid" || status === "settled";
  });

// ============================================================
// COMPONENT
// ============================================================

const AdminTournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [users, setUsers] = useState([]);
  const [results, setResults] = useState({});

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [savingResults, setSavingResults] = useState(false);
  const [settling, setSettling] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [resultSystemAvailable, setResultSystemAvailable] =
    useState(false);

  const [serverResultsLocked, setServerResultsLocked] =
    useState(false);

  const [confirmAction, setConfirmAction] = useState(null);

  const saveResultsLock = useRef(false);
  const settlementLock = useRef(false);

  // ==========================================================
  // LOAD TOURNAMENT
  // ==========================================================

  const loadData = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      setErrorMsg("");

      const response = await axios.get(
        `${ADMIN_API_BASE}/admin/tournament-joins/${encodeURIComponent(id)}`,
        {
          ...getAdminAuthConfig(),
          timeout: 10000,
        }
      );

      const data = response.data || {};

      const incomingUsers = Array.isArray(data.users)
        ? data.users
        : [];

      const incomingResults = Array.isArray(data.results)
        ? data.results
        : [];

      setResultSystemAvailable(
        data.resultSystemAvailable !== false
      );

      const locked =
        hasPaidResults(incomingResults) ||
        isSettledTournament(data.tournament || {});

      setServerResultsLocked(locked);

      const resultMap = {};

      incomingResults.forEach((result) => {
        resultMap[String(result.join_id)] =
          normalizeResult(result);
      });

      const mergedUsers = incomingUsers.map((user) => {
        const saved = resultMap[String(user.id)];

        return {
          ...user,
          resultStatus: saved?.status || "",
          kills:
            saved?.kills ??
            Math.max(
              0,
              Math.floor(safeNumber(user.kills, 0))
            ),
          isWinner:
            saved?.isWinner ??
            (Boolean(user.is_winner) || user.status === "winner"),
          killAmount: saved?.killAmount ?? 0,
          winnerPrize: saved?.winnerPrize ?? 0,
          totalWinning: saved?.totalWinning ?? 0,
        };
      });

      setTournament(data.tournament || {});
      setUsers(mergedUsers);

      const nextDraft = {};

      mergedUsers.forEach((user) => {
        nextDraft[user.id] = {
          kills: Math.max(
            0,
            Math.floor(safeNumber(user.kills, 0))
          ),
          isWinner: Boolean(user.isWinner),
        };
      });

      setResults(nextDraft);
    } catch (error) {
      console.error("TOURNAMENT DETAIL LOAD ERROR:", error);

      setErrorMsg(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Tournament data load nahi ho paaya."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ==========================================================
  // TOURNAMENT CONFIG
  // ==========================================================

  const perKill = getPerKill(tournament);
  const winnerPrize = getWinnerPrize(tournament);
  const maxSlots = getMaxSlots(tournament);

  const entryFee = safeNumber(
    tournament?.entry_fee ?? tournament?.entryFee ?? 0
  );

  const prizePool = safeNumber(
    tournament?.prize_pool ?? tournament?.prizePool ?? 0
  );

  // ==========================================================
  // PLAYER FILTERS
  // ==========================================================

  const activeUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          String(user.status || "").toLowerCase() !== "rejected"
      ),
    [users]
  );

  const approvedUsers = useMemo(
    () =>
      activeUsers.filter((user) =>
        ["approved", "winner", "loser"].includes(
          String(user.status || "").toLowerCase()
        )
      ),
    [activeUsers]
  );

  // ==========================================================
  // WINNER
  // ==========================================================

  const winnerId = useMemo(() => {
    const winner = activeUsers.find(
      (user) => results[user.id]?.isWinner
    );

    return winner?.id || "";
  }, [activeUsers, results]);

  const winnerName = useMemo(() => {
    if (!winnerId) return "Not selected";

    return (
      activeUsers.find((user) => user.id === winnerId)
        ?.player_name || "Unknown"
    );
  }, [activeUsers, winnerId]);

  // ==========================================================
  // PAYOUT PREVIEW
  // ==========================================================

  const previewTotal = useMemo(
    () =>
      activeUsers.reduce((total, user) => {
        const draft = results[user.id] || {};
        const kills = Math.max(
          0,
          Math.floor(safeNumber(draft.kills, 0))
        );

        return (
          total +
          kills * perKill +
          (draft.isWinner ? winnerPrize : 0)
        );
      }, 0),
    [activeUsers, results, perKill, winnerPrize]
  );

  // ==========================================================
  // RESULT LOCK
  // ==========================================================

  const paidAlready = useMemo(
    () =>
      users.some((user) => {
        const status = String(
          user.resultStatus || ""
        ).toLowerCase();

        return status === "paid" || status === "settled";
      }),
    [users]
  );

  const resultsLocked = paidAlready || serverResultsLocked;

  // ==========================================================
  // DRAFT UPDATE
  // ==========================================================

  const updatePlayerDraft = (userId, patch) => {
    if (resultsLocked) return;

    setResults((prev) => ({
      ...prev,
      [userId]: {
        kills: Math.max(
          0,
          Math.floor(safeNumber(prev[userId]?.kills, 0))
        ),
        isWinner: Boolean(prev[userId]?.isWinner),
        ...patch,
      },
    }));
  };

  // ==========================================================
  // SELECT WINNER
  // ==========================================================

  const selectWinner = (userId) => {
    if (resultsLocked) return;

    setResults((prev) => {
      const next = { ...prev };

      Object.keys(next).forEach((key) => {
        next[key] = {
          ...next[key],
          isWinner: false,
        };
      });

      if (next[userId]) {
        next[userId] = {
          ...next[userId],
          isWinner: true,
        };
      }

      return next;
    });
  };

  // ==========================================================
  // APPROVE / REJECT
  // ==========================================================

  const updateJoinStatus = async (userId, status) => {
    const actionKey = `${status}:${userId}`;

    setActionId(actionKey);
    setMessage("");
    setErrorMsg("");

    try {
      const endpoint =
        status === "approved"
          ? "approve"
          : status === "rejected"
          ? "reject"
          : "";

      if (!endpoint) return;

      const response = await axios.put(
        `${ADMIN_API_BASE}/admin/tournament-joins/${encodeURIComponent(
          id
        )}/${endpoint}`,
        { userId },
        {
          ...getAdminAuthConfig(),
          timeout: 10000,
        }
      );

      const updatedJoin = response.data?.join;

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? {
                ...user,
                ...(updatedJoin || {}),
                status,
              }
            : user
        )
      );

      setMessage(
        status === "approved"
          ? "Player approved successfully."
          : "Player rejected successfully."
      );
    } catch (error) {
      console.error(`${status} failed:`, error);

      setErrorMsg(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          `Player ${status} failed.`
      );
    } finally {
      setActionId("");
    }
  };

  // ==========================================================
  // DELETE PLAYER
  // ==========================================================

  const handleDelete = async (userId) => {
    if (resultsLocked) {
      setErrorMsg(
        "Paid result wale player ko delete nahi kar sakte."
      );
      return;
    }

    setActionId(`delete:${userId}`);
    setMessage("");
    setErrorMsg("");

    try {
      await axios.delete(
        `${ADMIN_API_BASE}/admin/tournament-joins/${encodeURIComponent(
          id
        )}`,
        {
          ...getAdminAuthConfig(),
          data: { userId },
          timeout: 10000,
        }
      );

      setUsers((prev) =>
        prev.filter((user) => user.id !== userId)
      );

      setResults((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });

      setMessage("Player join record deleted.");
    } catch (error) {
      console.error("DELETE PLAYER ERROR:", error);

      setErrorMsg(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Player delete nahi ho paaya."
      );
    } finally {
      setActionId("");
    }
  };

  // ==========================================================
  // SAVE / CALCULATE RESULTS
  // ==========================================================

  const saveResults = async () => {
    if (saveResultsLock.current) return;

    if (!resultSystemAvailable) {
      setErrorMsg(
        "Result system database mein available nahi hai."
      );
      return;
    }

    if (!activeUsers.length) {
      setErrorMsg("Koi active player nahi mila.");
      return;
    }

    if (resultsLocked) {
      setMessage(
        "This tournament is already settled. Paid results cannot be edited."
      );
      setErrorMsg("");
      return;
    }

    saveResultsLock.current = true;
    setSavingResults(true);
    setMessage("");
    setErrorMsg("");

    try {
      // Fresh server-side state check before saving.
      const latestResponse = await axios.get(
        `${ADMIN_API_BASE}/admin/tournament-joins/${encodeURIComponent(
          id
        )}`,
        {
          ...getAdminAuthConfig(),
          timeout: 10000,
        }
      );

      const latestData = latestResponse.data || {};
      const latestResults = Array.isArray(latestData.results)
        ? latestData.results
        : [];

      const latestTournament = latestData.tournament || {};

      if (
        hasPaidResults(latestResults) ||
        isSettledTournament(latestTournament)
      ) {
        setServerResultsLocked(true);
        setMessage(
          "This tournament is already settled. Paid results cannot be edited."
        );
        setErrorMsg("");
        await loadData();
        return;
      }

      const selectedWinners = activeUsers.filter(
        (user) => results[user.id]?.isWinner
      );

      if (
        winnerPrize > 0 &&
        selectedWinners.length !== 1
      ) {
        setErrorMsg("Exactly 1 winner select karo.");
        return;
      }

      const payload = activeUsers.map((user) => ({
        joinId: user.id,
        kills: Math.max(
          0,
          Math.floor(
            safeNumber(results[user.id]?.kills, 0)
          )
        ),
        isWinner: Boolean(results[user.id]?.isWinner),
      }));

      const response = await axios.post(
        `${ADMIN_API_BASE}/admin/tournament-results/${encodeURIComponent(
          id
        )}/save`,
        { results: payload },
        {
          ...getAdminAuthConfig(),
          timeout: 15000,
        }
      );

      const savedResults = Array.isArray(response.data?.results)
        ? response.data.results
        : [];

      setUsers((prev) =>
        prev.map((user) => {
          const saved = savedResults.find(
            (item) =>
              String(item.join_id) === String(user.id)
          );

          if (!saved) return user;

          return {
            ...user,
            kills: safeNumber(saved.kills),
            isWinner: Boolean(saved.is_winner),
            killAmount: safeNumber(saved.kill_amount),
            winnerPrize: safeNumber(saved.winner_prize),
            totalWinning: safeNumber(saved.total_winning),
            resultStatus: saved.status || "pending",
          };
        })
      );

      setMessage(
        `Results saved successfully. Total winning: ${currency(
          response.data?.totalWinning || 0
        )}`
      );
    } catch (error) {
      const serverError =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "";

      if (
        error?.response?.status === 400 &&
        /already settled|paid results cannot be edited/i.test(
          serverError
        )
      ) {
        setServerResultsLocked(true);
        await loadData();
        setMessage(
          "This tournament is already settled. Paid results cannot be edited."
        );
        setErrorMsg("");
        return;
      }

      console.error("SAVE RESULTS ERROR:", error);

      setErrorMsg(
        serverError || "Results save nahi ho paaye."
      );
    } finally {
      saveResultsLock.current = false;
      setSavingResults(false);
    }
  };

  // ==========================================================
  // CREDIT WINNING
  // ==========================================================

  const settleWinning = async () => {
    if (settlementLock.current) return;

    if (!resultSystemAvailable) {
      setErrorMsg(
        "Result system database mein available nahi hai."
      );
      return;
    }

    if (resultsLocked) {
      setErrorMsg(
        "Is tournament ki winning already paid hai."
      );
      return;
    }

    const hasPendingResults = users.some(
      (user) =>
        String(user.resultStatus || "").toLowerCase() ===
        "pending"
    );

    if (!hasPendingResults) {
      setErrorMsg("Pehle Save / Calculate Results karo.");
      return;
    }

    setConfirmAction({
      type: "settle",
      title: "Credit Tournament Winning?",
      description:
        "Selected players ki winning unke wallet mein credit hogi. Is action ko sirf ek baar perform karein.",
    });
  };

  // ==========================================================
  // CONFIRM ACTION
  // ==========================================================

  const confirmPendingAction = async () => {
    if (!confirmAction) return;

    const action = confirmAction;
    setConfirmAction(null);

    if (action.type === "delete") {
      await handleDelete(action.userId);
      return;
    }

    if (action.type === "settle") {
      if (settlementLock.current) return;

      settlementLock.current = true;
      setSettling(true);
      setMessage("");
      setErrorMsg("");

      try {
        const response = await axios.post(
          `${ADMIN_API_BASE}/admin/tournament-results/${encodeURIComponent(
            id
          )}/settle`,
          {},
          {
            ...getAdminAuthConfig(),
            timeout: 20000,
          }
        );

        setMessage(
          `Winning settled successfully. ${
            response.data?.paidCount ?? 0
          } player(s) paid, total ${currency(
            response.data?.totalPaid || 0
          )}.`
        );

        await loadData();
      } catch (error) {
        console.error("SETTLEMENT ERROR:", error);

        setErrorMsg(
          error?.response?.data?.error ||
            error?.response?.data?.message ||
            "Winning credit nahi ho paayi."
        );
      } finally {
        settlementLock.current = false;
        setSettling(false);
      }
    }
  };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="admin-tournament-page loading-state">
        <div className="loading-card">
          <div className="loading-spinner" />
          <h2>Loading Tournament</h2>
          <p>Players aur tournament data load ho raha hai...</p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // NOT FOUND
  // ==========================================================

  if (!tournament) {
    return (
      <div className="admin-tournament-page">
        <div className="empty-card">
          <div className="empty-card-icon">!</div>
          <h2>Tournament Not Found</h2>
          <p>
            {errorMsg || "Tournament record available nahi hai."}
          </p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => navigate("/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="admin-tournament-page">

      {/* PAGE HEADER */}

      <header className="page-head">
        <div className="page-head-left">
          <button
            type="button"
            className="back-btn"
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <span className="eyebrow">
            <span className="eyebrow-dot" />
            TOURNAMENT CONTROL CENTER
          </span>

          <h1>{tournament.name || "BGMI Tournament"}</h1>

          <p>
            Tournament ID:{" "}
            <strong>{tournament.id || id}</strong>
          </p>
        </div>

        <button
          type="button"
          className="refresh-tournament-btn"
          onClick={loadData}
          disabled={loading || savingResults || settling}
        >
          ↻ Refresh Data
        </button>
      </header>

      {/* ALERTS */}

      {(message || errorMsg) && (
        <div
          className={`admin-alert ${
            errorMsg ? "error" : "success"
          }`}
          role="status"
        >
          <span className="alert-icon">
            {errorMsg ? "!" : "✓"}
          </span>
          <span>{errorMsg || message}</span>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setErrorMsg("");
            }}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* SETTLED NOTICE */}

      {resultsLocked && (
        <div className="locked-notice">
          <span>🔒</span>
          <div>
            <strong>Results Locked</strong>
            <p>
              This tournament is already settled. Paid results cannot
              be edited or credited again.
            </p>
          </div>
        </div>
      )}

      {/* TOURNAMENT OVERVIEW */}

      <section className="hero-grid">

        <div className="hero-card primary">
          <div className="hero-topline">
            <span className="tournament-status-label">
              {tournament.status || "Scheduled"}
            </span>
            <span className="visibility-label">
              {tournament.is_visible === false
                ? "Hidden"
                : "Visible"}
            </span>
          </div>

          <div className="hero-title-row">
            <div className="hero-tournament-info">
              <h2>{tournament.name || "Tournament"}</h2>
              <p>
                {tournament.mode || "Classic"}
                {" · "}
                {tournament.map || "Erangel"}
              </p>
              <small>
                {tournament.teamType ||
                  tournament.team_type ||
                  "BGMI"}
              </small>
            </div>

            <div className="big-prize">
              <span>PRIZE POOL</span>
              <strong>{currency(prizePool)}</strong>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <span className="stat-card-icon">₹</span>
          <span className="stat-card-label">ENTRY FEE</span>
          <strong>{currency(entryFee)}</strong>
          <small>Per player</small>
        </div>

        <div className="stat-card">
          <span className="stat-card-icon">⚔</span>
          <span className="stat-card-label">PER KILL</span>
          <strong>{currency(perKill)}</strong>
          <small>Kill earning</small>
        </div>

        <div className="stat-card">
          <span className="stat-card-icon">🏆</span>
          <span className="stat-card-label">WINNER PRIZE</span>
          <strong>{currency(winnerPrize)}</strong>
          <small>Winner bonus</small>
        </div>

        <div className="stat-card">
          <span className="stat-card-icon">▣</span>
          <span className="stat-card-label">SLOTS FILLED</span>
          <strong>
            {users.length}/{maxSlots}
          </strong>
          <small>
            {Math.min(
              100,
              Math.round((users.length / maxSlots) * 100)
            )}
            % filled
          </small>
        </div>

      </section>

      {/* RESULT TOOLBAR */}

      <section className="results-toolbar">
        <div className="results-toolbar-heading">
          <span className="section-kicker">MATCH MANAGEMENT</span>
          <h3>Match Results</h3>
          <p>
            Players ke kills enter karo aur winner select karo.
          </p>
        </div>

        <div className="toolbar-right">
          <div className="total-preview">
            <span>PREVIEW PAYOUT</span>
            <strong>{currency(previewTotal)}</strong>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={saveResults}
            disabled={
              savingResults ||
              settling ||
              resultsLocked ||
              !resultSystemAvailable
            }
          >
            {savingResults
              ? "Saving..."
              : resultsLocked
              ? "🔒 Results Locked"
              : "▣ Save / Calculate"}
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={settleWinning}
            disabled={
              settling ||
              savingResults ||
              resultsLocked ||
              !resultSystemAvailable
            }
          >
            {settling
              ? "Crediting..."
              : resultsLocked
              ? "✓ Winning Paid"
              : "₹ Credit Winning"}
          </button>
        </div>
      </section>

      {/* RESULT SYSTEM WARNING */}

      {!resultSystemAvailable && (
        <div className="admin-alert error">
          <span className="alert-icon">!</span>
          <span>
            Result system available nahi hai. Database result system
            setup check karo.
          </span>
        </div>
      )}

      {/* PLAYER TABLE */}

      <section className="players-card">
        <div className="table-headline">
          <div>
            <span className="section-kicker">PARTICIPANTS</span>
            <h3>Players</h3>
            <p>
              {activeUsers.length} active players
              {" · "}
              {approvedUsers.length} approved
            </p>
          </div>

          <div className="winner-note">
            <span>🏆 CURRENT WINNER</span>
            <strong>{winnerName}</strong>
          </div>
        </div>

        <div className="table-scroll">
          <table className="players-table">
            <thead>
              <tr>
                <th>#</th>
                <th>PLAYER</th>
                <th>BGMI ID</th>
                <th>PROFILE ID</th>
                <th>STATUS</th>
                <th>KILLS</th>
                <th>KILL ₹</th>
                <th>WINNER</th>
                <th>TOTAL WINNING</th>
                <th>ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user, index) => {
                const draft = results[user.id] || {
                  kills: 0,
                  isWinner: false,
                };

                const kills = Math.max(
                  0,
                  Math.floor(safeNumber(draft.kills, 0))
                );

                const killAmount = kills * perKill;
                const winnerAmount = draft.isWinner
                  ? winnerPrize
                  : 0;
                const totalWinning = killAmount + winnerAmount;

                const busy =
                  actionId === `approved:${user.id}` ||
                  actionId === `rejected:${user.id}` ||
                  actionId === `delete:${user.id}`;

                const status = String(
                  user.status || "registered"
                ).toLowerCase();

                const isRejected = status === "rejected";

                return (
                  <tr
                    key={user.id}
                    className={draft.isWinner ? "winner-row" : ""}
                  >
                    <td className="index-cell">
                      {String(index + 1).padStart(2, "0")}
                    </td>

                    <td>
                      <div className="player-main">
                        <div className="player-avatar">
                          {(user.player_name || "P")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div>
                          <strong>
                            {user.player_name || "Unknown"}
                          </strong>
                          <span>
                            {user.profile_name || "No profile name"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="mono">
                      {user.bgmi_id || "N/A"}
                    </td>

                    <td className="mono">
                      {user.profile_id || "N/A"}
                    </td>

                    <td>
                      <span
                        className={`status-pill status-${status.replace(
                          /\s+/g,
                          "-"
                        )}`}
                      >
                        <span className="status-pill-dot" />
                        {user.status || "Registered"}
                      </span>

                      {user.resultStatus === "paid" && (
                        <span className="paid-mini">PAID</span>
                      )}
                    </td>

                    <td>
                      <input
                        className="kills-input"
                        type="number"
                        min="0"
                        step="1"
                        value={draft.kills}
                        onChange={(event) =>
                          updatePlayerDraft(user.id, {
                            kills: Math.max(
                              0,
                              Math.floor(
                                safeNumber(event.target.value, 0)
                              )
                            ),
                          })
                        }
                        disabled={
                          resultsLocked ||
                          isRejected ||
                          savingResults ||
                          settling
                        }
                        aria-label={`Kills for ${user.player_name || "player"}`}
                      />
                    </td>

                    <td className="money-cell">
                      {currency(killAmount)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className={`winner-toggle ${
                          draft.isWinner ? "selected" : ""
                        }`}
                        onClick={() => selectWinner(user.id)}
                        disabled={
                          resultsLocked ||
                          isRejected ||
                          savingResults ||
                          settling
                        }
                      >
                        {draft.isWinner ? "🏆 Winner" : "Select"}
                      </button>
                    </td>

                    <td>
                      <strong className="winning-amount">
                        {currency(totalWinning)}
                      </strong>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="approve-small"
                          onClick={() =>
                            updateJoinStatus(user.id, "approved")
                          }
                          disabled={
                            busy ||
                            settling ||
                            resultsLocked ||
                            ["approved", "winner", "loser", "rejected"].includes(
                              status
                            )
                          }
                          title="Approve player"
                        >
                          ✓
                        </button>

                        <button
                          type="button"
                          className="reject-small"
                          onClick={() =>
                            updateJoinStatus(user.id, "rejected")
                          }
                          disabled={
                            busy ||
                            settling ||
                            resultsLocked ||
                            isRejected
                          }
                          title="Reject player"
                        >
                          ✕
                        </button>

                        <button
                          type="button"
                          className="delete-small"
                          onClick={() =>
                            setConfirmAction({
                              type: "delete",
                              userId: user.id,
                              title: "Delete Player Join?",
                              description:
                                `Remove ${user.player_name || "this player"} from this tournament? This action cannot be undone.`,
                            })
                          }
                          disabled={
                            busy ||
                            settling ||
                            resultsLocked
                          }
                          title="Delete player"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!users.length && (
                <tr>
                  <td colSpan="10" className="no-players">
                    <span>▣</span>
                    <strong>No Players Found</strong>
                    <small>
                      Abhi tak kisi player ne tournament join nahi kiya.
                    </small>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="players-table-footer">
          <span>
            Total records: <strong>{users.length}</strong>
          </span>
          <span>
            Active: <strong>{activeUsers.length}</strong>
          </span>
          <span>
            Approved: <strong>{approvedUsers.length}</strong>
          </span>
        </div>
      </section>

      {/* CALCULATION CARD */}

      <section className="settlement-info">
        <div className="settlement-info-main">
          <span className="info-icon">∑</span>
          <div>
            <span className="section-kicker">PAYOUT FORMULA</span>
            <h4>Winning Calculation</h4>
            <p>
              Total winning = (Kills × Per Kill) + Winner Prize
            </p>
          </div>
        </div>

        <div className="formula-box">
          <span>EXAMPLE PAYOUT</span>
          <strong>
            5 × {currency(perKill)} + {currency(winnerPrize)}
            {" = "}
            {currency(5 * perKill + winnerPrize)}
          </strong>
        </div>
      </section>

      {/* SETTLEMENT SECURITY CARD */}

      <section className="settlement-info security-settlement">
        <div className="settlement-info-main">
          <span className="info-icon">🔐</span>
          <div>
            <span className="section-kicker">PAYMENT PROTECTION</span>
            <h4>Safe Settlement</h4>
            <p>
              Results pehle save hote hain. Uske baad winning server-side
              wallet mein credit hoti hai. Paid results ko dobara credit
              karne se system block karta hai.
            </p>
          </div>
        </div>

        <div className="formula-box current-winner-box">
          <span>CURRENT WINNER</span>
          <strong>{winnerName}</strong>
        </div>
      </section>

      {/* CONFIRMATION MODAL */}

      {confirmAction && (
        <div
          className="tournament-modal-overlay"
          onClick={() => {
            if (!settling && !actionId) {
              setConfirmAction(null);
            }
          }}
        >
          <div
            className="tournament-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tournament-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-top-line" />

            <button
              type="button"
              className="confirm-modal-close"
              onClick={() => setConfirmAction(null)}
              disabled={settling || Boolean(actionId)}
              aria-label="Close confirmation"
            >
              ×
            </button>

            <div className="confirm-modal-icon">
              {confirmAction.type === "settle" ? "₹" : "!"}
            </div>

            <span className="section-kicker">
              CONFIRM ADMIN ACTION
            </span>

            <h3 id="tournament-confirm-title">
              {confirmAction.title}
            </h3>

            <p>{confirmAction.description}</p>

            {confirmAction.type === "settle" && (
              <div className="confirm-amount">
                <span>PREVIEW TOTAL PAYOUT</span>
                <strong>{currency(previewTotal)}</strong>
              </div>
            )}

            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-cancel-btn"
                onClick={() => setConfirmAction(null)}
                disabled={settling || Boolean(actionId)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="confirm-danger-btn"
                onClick={confirmPendingAction}
                disabled={settling || Boolean(actionId)}
              >
                {settling
                  ? "Processing..."
                  : confirmAction.type === "settle"
                  ? "Confirm Credit"
                  : "Yes, Delete Player"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTournamentDetail;
