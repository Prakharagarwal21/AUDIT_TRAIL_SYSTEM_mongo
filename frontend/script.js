(() => {
  "use strict";

  const API_BASE = "";
  const TOKEN_KEY = "jwt";
  const REMEMBER_KEY = "remember_username";

  function $(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function fmtDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  function fmtMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function setMsg(el, type, text) {
    if (!el) return;
    if (!text) {
      el.style.display = "none";
      el.textContent = "";
      el.className = "msg";
      return;
    }
    el.style.display = "block";
    el.className = `msg ${type || ""}`.trim();
    el.textContent = text;
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const isForm = options.body instanceof FormData;
    if (!isForm && options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    // Auto-handle blocked/expired sessions
    if (res.status === 401 || res.status === 403) {
      let payload = null;
      try {
        payload = await res.clone().json();
      } catch {}
      if (payload?.error === "account_blocked" || payload?.error === "token_revoked" || payload?.error === "authentication_required") {
        setToken("");
        if (!location.pathname.startsWith("/login") && location.pathname !== "/") location.href = "/login";
      }
    }

    const contentType = String(res.headers.get("content-type") || "");
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    if (!res.ok) {
      const err = new Error("api_error");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function initNav() {
    const navName = $("navName");
    const navRole = $("navRole");
    const navAvatar = $("navAvatar");
    const logoutBtn = $("logoutBtn");

    const onLoginPage = location.pathname === "/" || location.pathname.startsWith("/login");
    const token = getToken();
    if (!token && !onLoginPage) {
      location.href = "/login";
      return null;
    }
    if (onLoginPage) return null;

    let session = null;
    try {
      session = await apiFetch("/api/me");
    } catch {
      setToken("");
      location.href = "/login";
      return null;
    }

    const user = session?.user || null;
    if (!user) {
      setToken("");
      location.href = "/login";
      return null;
    }

    if (navName) navName.textContent = user.username || "—";
    if (navRole) navRole.textContent = user.role || "—";
    if (navAvatar) {
      const letter = (user.username || "A").trim().slice(0, 1).toUpperCase() || "A";
      navAvatar.innerHTML = `<span style="font-weight:900;color:#1d4ed8;">${letter}</span>`;
    }

    // Hide admin-only tabs for non-admins
    const adminOnly = document.querySelectorAll('[data-admin-only="1"]');
    adminOnly.forEach((el) => {
      if (user.role !== "admin") el.style.display = "none";
    });

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await apiFetch("/api/logout", { method: "POST" });
        } catch {}
        setToken("");
        location.href = "/login";
      });
    }

    return user;
  }

  function ensureModal() {
    let modal = document.querySelector(".modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="Dialog">
        <div class="row" style="justify-content:space-between;">
          <div style="font-weight:900;" id="modalTitle">Dialog</div>
          <button class="btn tight" id="modalCloseBtn" type="button">✕</button>
        </div>
        <div id="modalBody" style="margin-top:12px;"></div>
        <div class="row" style="margin-top:14px;justify-content:flex-end;">
          <button class="btn" id="modalCancelBtn" type="button">Cancel</button>
          <button class="btn primary" id="modalOkBtn" type="button">Save</button>
        </div>
        <div id="modalMsg" class="msg" style="display:none;margin-top:12px;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.remove("open");
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    $("modalCloseBtn").addEventListener("click", close);
    $("modalCancelBtn").addEventListener("click", close);

    return modal;
  }

  function openModal({ title, bodyHtml, okText = "Save", onOk }) {
    const modal = ensureModal();
    $("modalTitle").textContent = title || "Dialog";
    $("modalBody").innerHTML = bodyHtml || "";
    $("modalOkBtn").textContent = okText;
    setMsg($("modalMsg"), "", "");

    const okBtn = $("modalOkBtn");
    const handler = async () => {
      okBtn.disabled = true;
      try {
        await onOk?.();
        modal.classList.remove("open");
      } catch (e) {
        const msg = e?.data?.message || e?.data?.error || "Request failed";
        setMsg($("modalMsg"), "error", String(msg));
      } finally {
        okBtn.disabled = false;
      }
    };

    // Replace previous click handler
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    newOkBtn.addEventListener("click", handler);

    modal.classList.add("open");
  }

  async function initLoginPage() {
    const form = $("loginForm");
    if (!form) return;

    const usernameEl = $("username");
    const passwordEl = $("password");
    const rememberMeEl = $("rememberMe");
    const msgEl = $("loginMsg");

    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (remembered && usernameEl) {
      usernameEl.value = remembered;
      if (rememberMeEl) rememberMeEl.checked = true;
    }
    const forgotBtn = $("forgotBtn");
    if (forgotBtn) {
      forgotBtn.addEventListener("click", () => {
        setMsg(msgEl, "info", "Ask an admin to reset your password from Staff Management.");
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMsg(msgEl, "", "");

      const username = String(usernameEl?.value || "").trim();
      const password = String(passwordEl?.value || "");
      if (!username || !password) {
        setMsg(msgEl, "error", "Enter username and password.");
        return;
      }

      try {
        const data = await apiFetch("/api/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        if (!data?.token) throw new Error("missing_token");
        setToken(data.token);

        if (rememberMeEl?.checked) localStorage.setItem(REMEMBER_KEY, username);
        else localStorage.removeItem(REMEMBER_KEY);

        location.href = "/dashboard";
      } catch (e2) {
        const err = e2?.data?.message || e2?.data?.error || "Login failed";
        setMsg(msgEl, "error", String(err));
      }
    });
  }

  async function initEmployeesPage(user) {
    const tbody = $("empTbody");
    if (!tbody) return;

    const searchEl = $("empSearch");
    const msgEl = $("empMsg");
    const newBtn = $("empNewBtn");

    let employeesCache = [];

    function renderRows(list) {
      tbody.innerHTML = "";
      for (const emp of list) {
        const tr = document.createElement("tr");
        const canEdit = user?.role === "admin" || user?.role === "staff";
        const canDelete = user?.role === "admin" || user?.role === "staff";
        const actionsHtml = [
          canEdit ? `<button class="btn tight" data-action="edit" data-id="${emp._id}">Edit</button>` : "",
          canDelete ? `<button class="btn tight danger" data-action="delete" data-id="${emp._id}">Delete</button>` : ""
        ]
          .filter(Boolean)
          .join(" ");

        tr.innerHTML = `
          <td>${escapeHtml(emp.name)}</td>
          <td>${escapeHtml(emp.email)}</td>
          <td>${escapeHtml(emp.position)}</td>
          <td>${escapeHtml(emp.department)}</td>
          <td>${fmtMoney(emp.salary)}</td>
          <td>${fmtMoney(emp.totalBonuses || 0)}</td>
          <td>${actionsHtml}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    async function loadEmployees() {
      setMsg(msgEl, "", "");
      const search = String(searchEl?.value || "").trim();
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      const data = await apiFetch(`/api/employees?${qs.toString()}`);
      employeesCache = data?.employees || [];
      renderRows(employeesCache);
    }

    if (searchEl) {
      let t = null;
      searchEl.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => loadEmployees().catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load employees")), 250);
      });
    }

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        openModal({
          title: "Add Employee",
          okText: "Create",
          bodyHtml: employeeFormHtml({}),
          onOk: async () => {
            const payload = readEmployeeForm();
            await apiFetch("/api/employees", { method: "POST", body: JSON.stringify(payload) });
            await loadEmployees();
          }
        });
      });
    }

    tbody.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      const emp = employeesCache.find((x) => String(x._id) === String(id));
      if (!emp) return;

      if (action === "edit") {
        openModal({
          title: "Edit Employee",
          okText: "Save",
          bodyHtml: employeeFormHtml(emp),
          onOk: async () => {
            const payload = readEmployeeForm();
            await apiFetch("/api/employees", { method: "PUT", body: JSON.stringify({ id, ...payload }) });
            await loadEmployees();
          }
        });
      } else if (action === "delete") {
        if (!confirm(`Delete employee "${emp.name}"?`)) return;
        try {
          const resp = await apiFetch(`/api/employees?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          await loadEmployees();
          if (resp?.blocked) {
            setMsg(msgEl, "error", resp?.message || "Your account has been locked. Contact admin to unblock.");
            setToken("");
            setTimeout(() => (location.href = "/login"), 800);
          }
        } catch (e2) {
          setMsg(msgEl, "error", e2?.data?.error || "Delete failed");
        }
      }
    });

    await loadEmployees().catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load employees"));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function employeeFormHtml(emp) {
    const e = emp || {};
    return `
      <div class="row">
        <div>
          <label>Name</label>
          <input id="m_name" value="${escapeHtml(e.name || "")}" placeholder="Alice Johnson" />
        </div>
        <div>
          <label>Email</label>
          <input id="m_email" value="${escapeHtml(e.email || "")}" placeholder="alice@company.com" />
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div>
          <label>Position</label>
          <input id="m_position" value="${escapeHtml(e.position || "")}" placeholder="Senior Developer" />
        </div>
        <div>
          <label>Department</label>
          <input id="m_department" value="${escapeHtml(e.department || "")}" placeholder="Engineering" />
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div>
          <label>Salary</label>
          <input id="m_salary" type="number" min="0" step="0.01" value="${escapeHtml(e.salary ?? "")}" placeholder="85000" />
        </div>
      </div>
    `;
  }

  function readEmployeeForm() {
    const name = String($("m_name")?.value || "").trim();
    const email = String($("m_email")?.value || "").trim();
    const position = String($("m_position")?.value || "").trim();
    const department = String($("m_department")?.value || "").trim();
    const salary = Number($("m_salary")?.value || 0);

    if (!name || !email || !position || !department || !(salary > 0)) {
      const err = new Error("invalid_input");
      err.data = { error: "invalid_input", message: "Fill all fields correctly (salary must be > 0)." };
      throw err;
    }
    return { name, email, position, department, salary };
  }

  async function initSecurityCard(user) {
    const card = $("securityCard");
    if (!card) return;

    if (user?.role !== "admin") {
      card.style.display = "none";
      return;
    }
    card.style.display = "block";

    const msgEl = $("secMsg");
    const alertsPane = $("secAlertsPane");
    const blockedPane = $("secBlockedPane");

    const tabAlerts = $("secTabAlerts");
    const tabBlocked = $("secTabBlocked");
    const refreshBtn = $("secRefreshBtn");

    function setTab(which) {
      if (which === "blocked") {
        tabAlerts.classList.remove("active");
        tabBlocked.classList.add("active");
        alertsPane.style.display = "none";
        blockedPane.style.display = "block";
      } else {
        tabBlocked.classList.remove("active");
        tabAlerts.classList.add("active");
        blockedPane.style.display = "none";
        alertsPane.style.display = "block";
      }
    }

    tabAlerts?.addEventListener("click", () => setTab("alerts"));
    tabBlocked?.addEventListener("click", () => setTab("blocked"));
    refreshBtn?.addEventListener("click", () => load());

    async function load() {
      setMsg(msgEl, "", "");
      const data = await apiFetch("/api/admin/security");
      const alerts = data?.alerts || [];
      const blocked = data?.blocked_users || [];

      const unread = alerts.filter((a) => !a.isRead).length;
      $("secBlockedCount").textContent = String(blocked.length);
      $("secUnreadCount").textContent = String(unread);
      $("secTotalCount").textContent = String(alerts.length);

      renderAlerts(alerts);
      renderBlocked(blocked);
    }

    const alertsList = $("alertsList");
    if (alertsList) {
      alertsList.addEventListener("click", async (e) => {
        const btn = e.target?.closest?.("button[data-alert-read]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        try {
          await apiFetch("/api/admin/security", { method: "POST", body: JSON.stringify({ action: "mark_read", alert_id: id }) });
          await load();
        } catch (e2) {
          setMsg(msgEl, "error", e2?.data?.error || "Failed to mark read");
        }
      });
    }

    const blockedTbody = $("blockedTbody");
    if (blockedTbody) {
      blockedTbody.addEventListener("click", async (e) => {
        const btn = e.target?.closest?.("button[data-unblock]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        try {
          await apiFetch("/api/admin/security", { method: "POST", body: JSON.stringify({ action: "unblock", user_id: id }) });
          await load();
        } catch (e2) {
          setMsg(msgEl, "error", e2?.data?.error || "Failed to unblock");
        }
      });
    }

    function renderAlerts(alerts) {
      const list = $("alertsList");
      if (!list) return;
      list.innerHTML = "";
      if (!alerts.length) {
        list.innerHTML = `<div class="pill">No alerts</div>`;
        return;
      }
      for (const a of alerts) {
        const div = document.createElement("div");
        div.className = "alert";
        const sev = String(a.severity || "LOW").toUpperCase();
        const pill = `<span class="pill ${sev === "CRITICAL" ? "danger" : sev === "HIGH" ? "warn" : "ok"}">${escapeHtml(sev)}</span>`;
        const readBtn = a.isRead
          ? `<span class="pill">Read</span>`
          : `<button class="btn tight" data-alert-read="1" data-id="${a._id}">Mark read</button>`;
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;">
            <div>
              <div style="font-weight:800;">${escapeHtml(a.alertType || "ALERT")} ${pill}</div>
              <div style="color:var(--muted);font-size:12px;margin-top:2px;">
                ${escapeHtml(a.username || "unknown")} • ${escapeHtml(a.ipAddress || "unknown")} • ${escapeHtml(fmtDateTime(a.createdAt))}
              </div>
              <div style="margin-top:6px;">${escapeHtml(a.message || "")}</div>
            </div>
            <div class="tight" style="min-width:auto;display:flex;align-items:flex-start;gap:8px;">
              ${readBtn}
            </div>
          </div>
        `;
        list.appendChild(div);
      }
    }

    function renderBlocked(blocked) {
      const tbody = $("blockedTbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!blocked.length) {
        tbody.innerHTML = `<tr><td colspan="5"><span class="pill">No blocked accounts</span></td></tr>`;
        return;
      }
      for (const u of blocked) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.role)}</td>
          <td>${escapeHtml(u.blockedReason || "")}</td>
          <td>${escapeHtml(fmtDateTime(u.blockedAt))}</td>
          <td><button class="btn tight" data-unblock="1" data-id="${u._id}">Unblock</button></td>
        `;
        tbody.appendChild(tr);
      }
    }

    setTab("alerts");
    await load().catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load security data"));
  }

  async function initProfilePage() {
    const profileName = $("profileName");
    if (!profileName) return;

    const msgPhoto = $("photoMsg");
    const msgPass = $("passMsg");

    async function load() {
      const data = await apiFetch("/api/profile");
      const p = data?.profile;
      if (!p) return;

      profileName.textContent = p.username || "—";
      $("profileRole").textContent = p.role || "—";
      $("profileId").textContent = p.id ? `ID: ${p.id}` : "—";
      $("profileLastLogin").textContent = p.lastLoginAt ? `Last login: ${fmtDateTime(p.lastLoginAt)}` : "Last login: —";

      const avatar = $("profileAvatar");
      if (avatar) {
        if (p.profilePhotoUrl) {
          avatar.innerHTML = `<img src="${escapeHtml(p.profilePhotoUrl)}" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:999px;" />`;
        } else {
          const letter = (p.username || "A").trim().slice(0, 1).toUpperCase() || "A";
          avatar.innerHTML = `<span style="font-weight:900;color:#1d4ed8;">${letter}</span>`;
        }
      }

    }

    $("uploadPhotoBtn")?.addEventListener("click", async () => {
      setMsg(msgPhoto, "", "");
      const file = $("photoFile")?.files?.[0];
      if (!file) return setMsg(msgPhoto, "error", "Choose a file first.");
      const fd = new FormData();
      fd.append("file", file);
      try {
        await apiFetch("/api/profile/photo", { method: "POST", body: fd });
        setMsg(msgPhoto, "ok", "Uploaded.");
        await load();
      } catch (e) {
        setMsg(msgPhoto, "error", e?.data?.error || "Upload failed");
      }
    });

    $("removePhotoBtn")?.addEventListener("click", async () => {
      setMsg(msgPhoto, "", "");
      if (!confirm("Remove profile picture?")) return;
      try {
        await apiFetch("/api/profile/photo", { method: "DELETE" });
        setMsg(msgPhoto, "ok", "Removed.");
        await load();
      } catch (e) {
        setMsg(msgPhoto, "error", e?.data?.error || "Remove failed");
      }
    });

    $("changePasswordBtn")?.addEventListener("click", async () => {
      setMsg(msgPass, "", "");
      const currentPassword = String($("currentPassword")?.value || "");
      const newPassword = String($("newPassword")?.value || "");
      if (!currentPassword || !newPassword || newPassword.length < 8) {
        setMsg(msgPass, "error", "Enter current password and a new password (min 8 chars).");
        return;
      }
      try {
        await apiFetch("/api/profile/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
        setMsg(msgPass, "ok", "Password updated. Please sign in again.");
        setToken("");
        setTimeout(() => (location.href = "/login"), 700);
      } catch (e) {
        setMsg(msgPass, "error", e?.data?.error || "Update failed");
      }
    });

    await load().catch(() => {});
  }

  async function initStaffManagementPage(user) {
    const tbody = $("usersTbody");
    if (!tbody) return;
    if (user?.role !== "admin") {
      location.href = "/dashboard";
      return;
    }

    const msgEl = $("staffMsg");

    async function loadUsers() {
      const data = await apiFetch("/api/admin/users");
      const users = data?.users || [];
      tbody.innerHTML = "";
      for (const u of users) {
        const status = u.isBlocked ? `<span class="pill warn">Blocked</span>` : `<span class="pill ok">Active</span>`;
        const actions =
          u.role === "admin"
            ? `<span class="pill">Admin</span>`
            : u.isBlocked
              ? `<button class="btn tight" data-unblock="1" data-id="${u._id}">Unblock</button>`
              : `<button class="btn tight danger" data-block="1" data-id="${u._id}">Block</button>`;
        const resetBtn = u.role === "admin" ? "" : `<button class="btn tight" data-reset="1" data-id="${u._id}">Reset Password</button>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.role)}</td>
          <td>${escapeHtml(fmtDateTime(u.lastLoginAt))}</td>
          <td>${status}</td>
          <td>${escapeHtml(u.blockedReason || "—")}</td>
          <td>${escapeHtml(fmtDateTime(u.blockedAt))}</td>
          <td style="display:flex;gap:8px;flex-wrap:wrap;">${actions}${resetBtn}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    $("refreshUsersBtn")?.addEventListener("click", () => loadUsers().catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load users")));

    $("createUserBtn")?.addEventListener("click", async () => {
      setMsg(msgEl, "", "");
      const username = String($("newUserUsername")?.value || "").trim();
      const password = String($("newUserPassword")?.value || "");
      const role = String($("newUserRole")?.value || "staff");
      if (!username || password.length < 8) return setMsg(msgEl, "error", "Username required and password must be at least 8 characters.");
      try {
        await apiFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ username, password, role }) });
        setMsg(msgEl, "ok", "User created.");
        $("newUserUsername").value = "";
        $("newUserPassword").value = "";
        await loadUsers();
      } catch (e) {
        setMsg(msgEl, "error", e?.data?.error || "Create failed");
      }
    });

    tbody.addEventListener("click", async (e) => {
      const blockBtn = e.target?.closest?.("button[data-block]");
      const unblockBtn = e.target?.closest?.("button[data-unblock]");
      const resetBtn = e.target?.closest?.("button[data-reset]");

      try {
        if (blockBtn) {
          const id = blockBtn.getAttribute("data-id");
          if (!confirm("Block this user?")) return;
          await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/block`, { method: "POST" });
          await loadUsers();
        } else if (unblockBtn) {
          const id = unblockBtn.getAttribute("data-id");
          await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/unblock`, { method: "POST" });
          await loadUsers();
        } else if (resetBtn) {
          const id = resetBtn.getAttribute("data-id");
          const newPassword = prompt("Enter new temporary password (min 8 chars):");
          if (!newPassword || newPassword.length < 8) return;
          await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
            method: "POST",
            body: JSON.stringify({ newPassword })
          });
          setMsg(msgEl, "ok", "Password reset.");
        }
      } catch (e2) {
        setMsg(msgEl, "error", e2?.data?.error || "Action failed");
      }
    });

    await loadUsers().catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load users"));
  }

  async function initBonusManagementPage(user) {
    const select = $("bonusEmployeeSelect");
    if (!select) return;
    if (user?.role !== "admin") {
      location.href = "/dashboard";
      return;
    }

    const tbody = $("bonusesTbody");
    const msgEl = $("bonusMsg");
    let employees = [];

    async function loadEmployees() {
      const data = await apiFetch("/api/employees");
      employees = data?.employees || [];
      select.innerHTML = employees
        .map((e) => `<option value="${escapeHtml(e._id)}">${escapeHtml(e.name)} — ${escapeHtml(e.department)}</option>`)
        .join("");
    }

    async function loadBonuses() {
      const employeeId = String(select.value || "");
      const qs = new URLSearchParams();
      if (employeeId) qs.set("employeeId", employeeId);
      const data = await apiFetch(`/api/bonuses?${qs.toString()}`);
      const bonuses = data?.bonuses || [];
      tbody.innerHTML = "";
      for (const b of bonuses) {
        const emp = employees.find((e) => String(e._id) === String(b.employeeId));
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(emp?.name || "(unknown)")}</td>
          <td>${fmtMoney(b.amount)}</td>
          <td>${escapeHtml(b.note || "")}</td>
          <td>${escapeHtml(b.createdByUsername || "")}</td>
          <td>${escapeHtml(fmtDateTime(b.createdAt))}</td>
          <td><button class="btn tight danger" data-del="1" data-id="${b._id}">Delete</button></td>
        `;
        tbody.appendChild(tr);
      }
    }

    $("refreshBonusesBtn")?.addEventListener("click", () => loadBonuses().catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load bonuses")));
    select.addEventListener("change", () => loadBonuses().catch(() => {}));

    $("addBonusBtn")?.addEventListener("click", async () => {
      setMsg(msgEl, "", "");
      const employeeId = String(select.value || "");
      const amount = Number($("bonusAmount")?.value || 0);
      const note = String($("bonusNote")?.value || "").trim();
      if (!employeeId || !(amount > 0)) return setMsg(msgEl, "error", "Select an employee and enter an amount > 0.");
      try {
        await apiFetch("/api/bonuses", { method: "POST", body: JSON.stringify({ employeeId, amount, note }) });
        $("bonusAmount").value = "";
        $("bonusNote").value = "";
        setMsg(msgEl, "ok", "Bonus added.");
        await loadBonuses();
      } catch (e) {
        setMsg(msgEl, "error", e?.data?.error || "Add failed");
      }
    });

    tbody.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.("button[data-del]");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (!confirm("Delete this bonus?")) return;
      try {
        await apiFetch(`/api/bonuses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadBonuses();
      } catch (e2) {
        setMsg(msgEl, "error", e2?.data?.error || "Delete failed");
      }
    });

    await loadEmployees();
    await loadBonuses();
  }

  async function initAuditLogsPage(user) {
    const tbody = $("logsTbody");
    if (!tbody) return;
    if (user?.role !== "admin") {
      location.href = "/dashboard";
      return;
    }

    const msgEl = $("logsMsg");
    const loadMoreBtn = $("loadMoreBtn");

    let mode = "list"; // list | filter | search
    let lastQuery = new URLSearchParams();
    let offset = 0;
    const limit = 200;

    function renderRows(logs, append) {
      if (!append) tbody.innerHTML = "";
      for (const l of logs) {
        const tr = document.createElement("tr");
        const sev = String(l.severity || "").toUpperCase();
        const sevPill = sev ? `<span class="pill ${sev === "CRITICAL" ? "danger" : sev === "HIGH" ? "warn" : "ok"}">${escapeHtml(sev)}</span>` : `<span class="pill">—</span>`;
        const statusPill = `<span class="pill ${String(l.status || "").toUpperCase() === "SUSPICIOUS" ? "warn" : "ok"}">${escapeHtml(l.status || "")}</span>`;
        tr.innerHTML = `
          <td>${escapeHtml(l.username || "")}</td>
          <td>${escapeHtml(l.action || "")}</td>
          <td>${escapeHtml(l.resource || "")}</td>
          <td>${sevPill}</td>
          <td>${escapeHtml(fmtDateTime(l.timestamp))}</td>
          <td>${escapeHtml(l.ipAddress || "")}</td>
          <td>${statusPill}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    async function load(append = false) {
      setMsg(msgEl, "", "");
      const qs = new URLSearchParams(lastQuery);
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));
      let url = "/api/logs";
      if (mode === "filter") url = "/api/logs/filter";
      if (mode === "search") url = "/api/logs/search";
      const data = await apiFetch(`${url}?${qs.toString()}`);
      const logs = data?.logs || [];
      renderRows(logs, append);
      if (logs.length < limit) loadMoreBtn.style.display = "none";
      else loadMoreBtn.style.display = "inline-flex";
    }

    $("applyFilterBtn")?.addEventListener("click", async () => {
      mode = "filter";
      offset = 0;
      lastQuery = new URLSearchParams();
      const userQ = String($("filterUser")?.value || "").trim();
      const action = String($("filterAction")?.value || "").trim();
      const start = String($("filterStart")?.value || "").trim();
      const end = String($("filterEnd")?.value || "").trim();
      if (userQ) lastQuery.set("user", userQ);
      if (action) lastQuery.set("action", action);
      if (start) lastQuery.set("start", start);
      if (end) lastQuery.set("end", end);
      await load(false).catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load logs"));
    });

    $("searchBtn")?.addEventListener("click", async () => {
      const q = String($("searchQ")?.value || "").trim();
      if (!q) return setMsg(msgEl, "error", "Enter a keyword to search.");
      mode = "search";
      offset = 0;
      lastQuery = new URLSearchParams();
      lastQuery.set("q", q);
      await load(false).catch((e) => setMsg(msgEl, "error", e?.data?.error || "Search failed"));
    });

    $("clearBtn")?.addEventListener("click", async () => {
      mode = "list";
      offset = 0;
      lastQuery = new URLSearchParams();
      $("filterUser").value = "";
      $("filterAction").value = "";
      $("filterStart").value = "";
      $("filterEnd").value = "";
      $("searchQ").value = "";
      await load(false).catch(() => {});
    });

    $("exportBtn")?.addEventListener("click", async () => {
      const token = getToken();
      const qs = new URLSearchParams(lastQuery);
      // Export uses same query keys as filter/search; backend combines.
      const url = `/api/logs/export.csv?${qs.toString()}`;

      // Trigger download with auth header by fetching blob
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("export_failed");
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "audit-logs.csv";
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
      } catch {
        setMsg(msgEl, "error", "Export failed.");
      }
    });

    loadMoreBtn?.addEventListener("click", async () => {
      offset += limit;
      await load(true).catch(() => {});
    });

    await load(false).catch((e) => setMsg(msgEl, "error", e?.data?.error || "Failed to load logs"));
  }

  async function main() {
    await initLoginPage();
    const user = await initNav();
    if (!user) return;

    // Page initializers (based on unique element presence)
    await initSecurityCard(user);
    await initEmployeesPage(user);
    await initProfilePage();
    await initStaffManagementPage(user);
    await initBonusManagementPage(user);
    await initAuditLogsPage(user);
  }

  window.addEventListener("DOMContentLoaded", () => {
    main().catch(() => {});
  });
})();
