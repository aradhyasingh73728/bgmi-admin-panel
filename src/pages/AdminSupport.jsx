import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./AdminSupport.css";

// ======================================================
// API CONFIGURATION
// ======================================================

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "[::1]";

const API_BASE = (
  isLocalhost
    ? "http://localhost:5006"
    : import.meta.env.VITE_SUPPORT_API_URL ||
      "https://c-support-server-5006.onrender.com"
).replace(/\/$/, "");

// Player frontend URL (used for relative avatar paths)
const USER_APP_URL = (
  import.meta.env.VITE_USER_APP_URL ||
  (isLocalhost ? "http://localhost:3001" : "")
).replace(/\/$/, "");

const LOGIN_PATH = "/admin-login";

const CHAT_POLL_MS = 10000;
const MESSAGE_POLL_MS = 5000;
const TOAST_MS = 5000;
const MAX_MESSAGE_LENGTH = 1000;

// ======================================================
// HELPERS
// ======================================================

const getInitial = (name) =>
  String(name || "U").trim().charAt(0).toUpperCase() || "U";

const getUserAvatar = (chat) => {
  const avatar =
    chat?.profile?.avatar ||
    chat?.user?.avatar ||
    chat?.avatar ||
    chat?.player_avatar ||
    "";

  if (!avatar || typeof avatar !== "string") return "";

  // Storage URL, HTTP URL, data URL or blob URL
  if (/^(https?:\/\/|data:|blob:)/i.test(avatar)) return avatar;

  // Relative path served by the player frontend
  if (avatar.startsWith("/")) {
    return USER_APP_URL ? `${USER_APP_URL}${avatar}` : "";
  }

  return avatar;
};

const getUserName = (chat) =>
  chat?.profile?.username ||
  chat?.user?.username ||
  chat?.username ||
  chat?.player_name ||
  "Player";

const getUserEmail = (chat) =>
  chat?.profile?.email ||
  chat?.user?.email ||
  chat?.email ||
  "";

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Time for message bubbles
const formatTime = (value) => {
  const date = parseDate(value);
  if (!date) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Time (today) or short date (older) for the conversation list
const formatListTime = (value) => {
  const date = parseDate(value);
  if (!date) return "";

  if (isSameDay(date, new Date())) return formatTime(value);

  return date.toLocaleDateString([], { day: "numeric", month: "short" });
};

// Day separator label inside the conversation
const formatDay = (value) => {
  const date = parseDate(value);
  if (!date) return "";

  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

// ======================================================
// USER AVATAR COMPONENT
// ======================================================

const UserAvatar = ({ chat, name }) => {
  const avatarUrl = getUserAvatar(chat);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div className="admin-user-avatar">
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt={`${name || "Player"} profile`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        getInitial(name)
      )}
    </div>
  );
};

// ======================================================
// ADMIN SUPPORT COMPONENT
// ======================================================

const AdminSupport = () => {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);

  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [connected, setConnected] = useState(true);
  const [toast, setToast] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const connectedRef = useRef(true);
  const activeIdRef = useRef("");
  const scrollStateRef = useRef({ chatId: "", count: 0 });

  const hasToken = Boolean(localStorage.getItem("adminToken"));

  // Always know which chat is currently open (prevents stale responses)
  activeIdRef.current = activeChat?.id ? String(activeChat.id) : "";

  // ======================================================
  // IN-APP NOTIFICATIONS (replaces browser alerts)
  // ======================================================

  const notify = useCallback((type, text) => {
    setToast({ type, text, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // ======================================================
  // AUTHENTICATED API REQUEST
  // ======================================================

  const apiRequest = useCallback(async (endpoint, options = {}) => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      throw new Error("Admin token missing. Please log in again.");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
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

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          `Request failed with status ${response.status}.`
      );
    }

    return data;
  }, []);

  // ======================================================
  // LOAD ALL CHATS
  // mode: "initial" | "manual" | "poll"
  // ======================================================

  const loadChats = useCallback(
    async (mode = "poll") => {
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "manual") setRefreshing(true);

        const data = await apiRequest("/api/admin/support/chats");

        const chatList = Array.isArray(data.chats)
          ? data.chats
          : Array.isArray(data.data)
            ? data.data
            : [];

        setChats(chatList);

        // Keep the selected chat's information up to date
        setActiveChat((previous) => {
          if (!previous) return previous;

          const updatedChat = chatList.find(
            (chat) => String(chat.id) === String(previous.id)
          );

          return updatedChat || previous;
        });

        connectedRef.current = true;
        setConnected(true);
      } catch (err) {
        console.error("Admin support chats error:", err);

        const wasConnected = connectedRef.current;
        connectedRef.current = false;
        setConnected(false);

        // Avoid spamming the same error on every polling cycle
        if (mode !== "poll" || wasConnected) {
          notify("error", err.message || "Unable to load support chats.");
        }
      } finally {
        if (mode === "initial") setLoading(false);
        if (mode === "manual") setRefreshing(false);
      }
    },
    [apiRequest, notify]
  );

  // ======================================================
  // INITIAL LOAD + CHAT LIST POLLING
  // ======================================================

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return undefined;
    }

    loadChats("initial");

    const interval = setInterval(() => {
      if (!document.hidden) loadChats("poll");
    }, CHAT_POLL_MS);

    return () => clearInterval(interval);
  }, [hasToken, loadChats]);

  // ======================================================
  // LOAD SELECTED CHAT MESSAGES
  // ======================================================

  const loadMessages = useCallback(
    async (chatId, showLoading = false) => {
      if (!chatId) return;

      try {
        if (showLoading) setMessagesLoading(true);

        const data = await apiRequest(
          `/api/admin/support/chats/${encodeURIComponent(chatId)}/messages`
        );

        // Ignore the response if the admin already opened another chat
        if (activeIdRef.current !== String(chatId)) return;

        const messageList = Array.isArray(data.messages)
          ? data.messages
          : Array.isArray(data.data)
            ? data.data
            : [];

        setMessages(messageList);
      } catch (err) {
        console.error("Support messages error:", err);

        if (showLoading) {
          notify("error", err.message || "Unable to load messages.");
        }
      } finally {
        if (showLoading) setMessagesLoading(false);
      }
    },
    [apiRequest, notify]
  );

  // ======================================================
  // SELECTED CHAT MESSAGE POLLING
  // ======================================================

  useEffect(() => {
    if (!activeChat?.id) {
      setMessages([]);
      return undefined;
    }

    const chatId = activeChat.id;

    loadMessages(chatId, true);

    const interval = setInterval(() => {
      if (!document.hidden) loadMessages(chatId, false);
    }, MESSAGE_POLL_MS);

    return () => clearInterval(interval);
  }, [activeChat?.id, loadMessages]);

  // ======================================================
  // MARK PLAYER MESSAGES AS READ
  // (also runs when new messages arrive in the open chat)
  // ======================================================

  const markMessagesRead = useCallback(
    async (chatId) => {
      if (!chatId) return;

      try {
        await apiRequest(
          `/api/admin/support/chats/${encodeURIComponent(chatId)}/read`,
          { method: "PUT", body: JSON.stringify({}) }
        );

        setChats((previous) =>
          previous.map((chat) =>
            String(chat.id) === String(chatId)
              ? { ...chat, admin_unread_count: 0 }
              : chat
          )
        );

        setActiveChat((previous) =>
          previous && String(previous.id) === String(chatId)
            ? { ...previous, admin_unread_count: 0 }
            : previous
        );
      } catch (err) {
        console.error("Mark messages read error:", err);
      }
    },
    [apiRequest]
  );

  const activeUnread = Number(activeChat?.admin_unread_count || 0);

  useEffect(() => {
    if (activeChat?.id && activeUnread > 0) {
      markMessagesRead(activeChat.id);
    }
  }, [activeChat?.id, activeUnread, markMessagesRead]);

  // ======================================================
  // AUTO SCROLL
  // Only when the chat changes or new messages arrive, so
  // polling never pulls the admin away from older messages.
  // ======================================================

  useEffect(() => {
    const chatId = activeChat?.id ? String(activeChat.id) : "";
    const previous = scrollStateRef.current;

    const chatChanged = previous.chatId !== chatId;
    const hasNewMessages = messages.length > previous.count;

    if (chatChanged || hasNewMessages) {
      messagesEndRef.current?.scrollIntoView({
        behavior: chatChanged ? "auto" : "smooth",
        block: "end",
      });
    }

    scrollStateRef.current = { chatId, count: messages.length };
  }, [messages, activeChat?.id]);

  // ======================================================
  // SELECT / CLOSE CHAT
  // ======================================================

  const selectChat = (chat) => {
    if (String(activeChat?.id) === String(chat.id)) return;

    setActiveChat(chat);
    setMessages([]);
    setMessage("");
  };

  const closeChat = () => {
    setActiveChat(null);
    setMessages([]);
    setMessage("");
  };

  // ======================================================
  // SEND ADMIN MESSAGE
  // ======================================================

  const sendMessage = async (event) => {
    event.preventDefault();

    const text = message.trim();

    if (!text || sending || !activeChat?.id) return;

    const chatId = activeChat.id;

    try {
      setSending(true);

      const data = await apiRequest(
        `/api/admin/support/chats/${encodeURIComponent(chatId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message: text }),
        }
      );

      const newMessage = data.message_data || data.message_record;

      if (activeIdRef.current === String(chatId)) {
        if (newMessage && typeof newMessage === "object") {
          setMessages((previous) => {
            const exists = previous.some(
              (item) => String(item.id) === String(newMessage.id)
            );

            return exists ? previous : [...previous, newMessage];
          });
        } else {
          await loadMessages(chatId, false);
        }

        setMessage("");
      }

      await loadChats("poll");

      inputRef.current?.focus();
    } catch (err) {
      console.error("Send support message error:", err);
      notify("error", err.message || "Unable to send the message.");
    } finally {
      setSending(false);
    }
  };

  // ======================================================
  // DERIVED DATA
  // ======================================================

  const sortedChats = useMemo(
    () =>
      [...chats].sort((a, b) => {
        const timeA = parseDate(a.last_message_at)?.getTime() || 0;
        const timeB = parseDate(b.last_message_at)?.getTime() || 0;
        return timeB - timeA;
      }),
    [chats]
  );

  const filteredChats = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) return sortedChats;

    return sortedChats.filter(
      (chat) =>
        getUserName(chat).toLowerCase().includes(searchText) ||
        getUserEmail(chat).toLowerCase().includes(searchText) ||
        String(chat.last_message || "").toLowerCase().includes(searchText)
    );
  }, [sortedChats, search]);

  const totalUnread = useMemo(
    () =>
      chats.reduce(
        (sum, chat) => sum + Number(chat.admin_unread_count || 0),
        0
      ),
    [chats]
  );

  // ======================================================
  // LOGIN CHECK
  // ======================================================

  if (!hasToken) {
    return (
      <main className="admin-support-page">
        <div className="admin-support-login-error">
          <div className="admin-support-error-icon">🔒</div>
          <h2>Admin Login Required</h2>
          <p>Please log in to your admin panel to view support chats.</p>
          <button
            type="button"
            className="admin-support-refresh"
            onClick={() => {
              window.location.href = LOGIN_PATH;
            }}
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  // ======================================================
  // LOADING SCREEN
  // ======================================================

  if (loading) {
    return (
      <main className="admin-support-page">
        <div className="admin-support-loading">
          <div className="admin-support-spinner"></div>
          <p>Loading support chats...</p>
        </div>
      </main>
    );
  }

  // ======================================================
  // MAIN UI
  // ======================================================

  return (
    <main className="admin-support-page">
      {/* IN-APP TOAST */}
      {toast && (
        <div
          className={`admin-support-toast ${toast.type}`}
          key={toast.id}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <span className="admin-support-toast-icon">
            {toast.type === "error" ? "!" : "✓"}
          </span>

          <span className="admin-support-toast-text">{toast.text}</span>

          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      <div className="admin-support-container">
        {/* PAGE HEADER */}

        <div className="admin-support-header">
          <div>
            <span className="admin-support-label">
              <i />
              BGMI ESPORTS ADMIN PANEL
            </span>

            <h1>
              LIVE CHAT <span>SUPPORT</span>
            </h1>

            <p>Manage player conversations and respond to support requests.</p>
          </div>

          <div className="admin-support-header-actions">
            <div
              className={`admin-support-connection ${
                connected ? "online" : "offline"
              }`}
            >
              <span />
              {connected ? "Connected" : "Reconnecting..."}
            </div>

            {totalUnread > 0 && (
              <div className="admin-support-unread-chip">
                {totalUnread} unread
              </div>
            )}

            <button
              type="button"
              className="admin-support-refresh"
              onClick={() => loadChats("manual")}
              disabled={refreshing}
            >
              <b className={refreshing ? "admin-support-spin" : ""}>↻</b>
              {refreshing ? "Refreshing..." : "Refresh Chats"}
            </button>
          </div>
        </div>

        {/* CHAT LAYOUT */}

        <div
          className={`admin-support-layout ${activeChat ? "has-active" : ""}`}
        >
          {/* LEFT: USER LIST */}

          <aside className="admin-chat-list">
            <div className="admin-chat-list-header">
              <div>
                <h2>All Conversations</h2>
                <p>Player support inbox</p>
              </div>

              <span className="admin-chat-total">{chats.length}</span>
            </div>

            <div className="admin-chat-search">
              <span>⌕</span>

              <input
                type="text"
                placeholder="Search player, email or message..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="admin-chat-users">
              {filteredChats.length === 0 ? (
                <div className="admin-chat-list-empty">
                  <span>💬</span>
                  <p>
                    {search
                      ? "No matching conversations found."
                      : "No support conversations yet."}
                  </p>
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const userName = getUserName(chat);
                  const unread = Number(chat.admin_unread_count) || 0;

                  return (
                    <button
                      type="button"
                      key={chat.id}
                      className={`admin-chat-user ${
                        String(activeChat?.id) === String(chat.id)
                          ? "active"
                          : ""
                      } ${unread > 0 ? "unread" : ""}`}
                      onClick={() => selectChat(chat)}
                    >
                      <UserAvatar chat={chat} name={userName} />

                      <div className="admin-user-info">
                        <p className="admin-user-name">{userName}</p>

                        <p className="admin-user-last-message">
                          {chat.last_message || "No messages yet"}
                        </p>
                      </div>

                      <div className="admin-chat-meta">
                        <span className="admin-chat-time">
                          {formatListTime(chat.last_message_at)}
                        </span>

                        {unread > 0 && (
                          <span className="admin-unread-badge">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT: CHAT WINDOW */}

          <section className="admin-chat-window">
            {!activeChat ? (
              <div className="admin-chat-empty">
                <div className="admin-chat-empty-icon">💬</div>
                <h2>Select a Conversation</h2>
                <p>
                  Select a player from the list to view messages and reply to
                  their support request.
                </p>
              </div>
            ) : (
              <>
                {/* CHAT HEADER */}

                <div className="admin-chat-header">
                  <div className="admin-chat-user-info">
                    <button
                      type="button"
                      className="admin-chat-back"
                      onClick={closeChat}
                      aria-label="Back to conversations"
                    >
                      ←
                    </button>

                    <UserAvatar
                      chat={activeChat}
                      name={getUserName(activeChat)}
                    />

                    <div>
                      <h3>{getUserName(activeChat)}</h3>
                      <p>
                        {getUserEmail(activeChat) || "Player Support Chat"}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`admin-support-live-status ${
                      connected ? "" : "offline"
                    }`}
                  >
                    <span></span>
                    {connected ? "Live" : "Offline"}
                  </div>
                </div>

                {/* MESSAGE BODY */}

                <div className="admin-chat-body">
                  {messagesLoading ? (
                    <div className="admin-chat-message-loading">
                      <span className="admin-support-spinner small" />
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="admin-chat-no-messages">
                      <span>👋</span>
                      <h3>Start the conversation</h3>
                      <p>There are no messages in this conversation yet.</p>
                    </div>
                  ) : (
                    messages.map((item, index) => {
                      const isAdmin = item.sender_type === "admin";

                      const currentDate = parseDate(item.created_at);
                      const previousDate = parseDate(
                        messages[index - 1]?.created_at
                      );

                      const showDay =
                        currentDate &&
                        (!previousDate || !isSameDay(currentDate, previousDate));

                      return (
                        <div key={item.id}>
                          {showDay && (
                            <div className="admin-day-divider">
                              <span>{formatDay(item.created_at)}</span>
                            </div>
                          )}

                          <div
                            className={`admin-message-row ${
                              isAdmin
                                ? "admin-message-right"
                                : "admin-message-left"
                            }`}
                          >
                            <div className="admin-message-content">
                              <div className="admin-message-name">
                                {isAdmin ? "You" : getUserName(activeChat)}
                              </div>

                              <div className="admin-message-bubble">
                                {item.image_url && (
                                  <a
                                    href={item.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <img
                                      src={item.image_url}
                                      alt="Player attachment"
                                      className="admin-message-image"
                                    />
                                  </a>
                                )}

                                {item.message && <p>{item.message}</p>}
                              </div>

                              <div className="admin-message-time">
                                {formatTime(item.created_at)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* MESSAGE INPUT */}

                <form
                  className="admin-chat-input-area"
                  onSubmit={sendMessage}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Type your reply to the player..."
                    maxLength={MAX_MESSAGE_LENGTH}
                    disabled={sending}
                    aria-label="Reply message"
                  />

                  <button type="submit" disabled={!message.trim() || sending}>
                    {sending ? "SENDING..." : "SEND ➤"}
                  </button>
                </form>

                <div className="admin-chat-footer">
                  <span>Press Enter or click Send to reply</span>

                  {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
                    <span className="admin-chat-counter">
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default AdminSupport;