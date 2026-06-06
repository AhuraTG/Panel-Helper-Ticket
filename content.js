let enabled = true, isMuted = false, lastTotalRows = null, refreshInterval = null;
let audioCtx = null, audioUnlocked = false;

function removeAudioUnlockListeners() {
  document.removeEventListener("pointerdown", unlockAudio, true);
  document.removeEventListener("keydown", unlockAudio, true);
}

function unlockAudio() {
  if (audioUnlocked) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "running") {
      audioUnlocked = true;
      removeAudioUnlockListeners();
      return;
    }

    audioCtx.resume()
      .then(() => {
        if (audioCtx && audioCtx.state === "running") {
          audioUnlocked = true;
          removeAudioUnlockListeners();
        }
      })
      .catch(() => {});
  } catch (err) {
    console.error("Audio unlock failed:", err);
  }
}
document.addEventListener("pointerdown", unlockAudio, true);
document.addEventListener("keydown", unlockAudio, true);

function playTicketSound() {
  if (isMuted || !audioUnlocked) return;
  const ctx = audioCtx;
  function beep(freq, start) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.8, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  }
  const t = ctx.currentTime;
  beep(1100, t);
  beep(1500, t + 0.16);
}

function playBeepOnce() {
  if (isMuted || !audioUnlocked) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = 1200;
  gain.gain.value = 0.6;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.9);
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\u0600-\u06FF\s-]/g, "").trim();
}

function getFullPageText() {
  let text = document.body.innerText || "";
  document.querySelectorAll("input, textarea").forEach(el => el.value && (text += " " + el.value));
  return text;
}

function getTotalRows() {
  const match = document.body.innerText.match(/Total rows:\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function isLoggedOut() {
  return location.href.includes("login");
}

let statusDiv = null;
function createStatusIndicator() {
  statusDiv = document.createElement("div");
  Object.assign(statusDiv.style, {
    position: "fixed",
    bottom: "15px",
    right: "15px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: "12px",
    color: "white",
    zIndex: "9999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });
  statusDiv.onclick = () => {
    unlockAudio();
    isMuted = !isMuted;
    updateStatus();
  };
  document.body.appendChild(statusDiv);
  updateStatus();
}

function updateStatus() {
  const isRefreshing = !!refreshInterval;
  statusDiv.style.background = isRefreshing ? "green" : "red";
  statusDiv.innerText = isMuted ? "🔇" : "🔊";
}

const STORAGE_KEY = "TEMP_TEMPLATES_DATA";
let data = loadData();
let currentSubject = null, editSubject = null, editTopic = null;

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let tempPanel, tempHeader, tempBody, isDragging = false, offsetX = 0, offsetY = 0;

function createTempPanel() {
  if (tempPanel) return;
  tempPanel = document.createElement("div");
  Object.assign(tempPanel.style, {
    position: "fixed",
    top: "120px",
    right: "20px",
    width: "280px",
    background: "#0b7d2b",
    color: "#fff",
    borderRadius: "8px",
    zIndex: "10000",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    direction: "rtl",
    userSelect: "none"
  });

  tempHeader = document.createElement("div");
  tempHeader.innerText = "TEMP";
  Object.assign(tempHeader.style, {
    padding: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    textAlign: "center",
    background: "#0fa34a",
    borderRadius: "8px"
  });

  tempBody = document.createElement("div");
  Object.assign(tempBody.style, {
    maxHeight: "0",
    overflowY: "auto",
    background: "#111",
    transition: "max-height 0.3s ease",
    padding: "0"
  });

  tempHeader.onclick = () => {
    const open = tempBody.style.maxHeight !== "0px";
    tempBody.style.maxHeight = open ? "0" : "340px";
    tempBody.style.padding = open ? "0" : "8px";
  };

  tempHeader.onmousedown = e => {
    isDragging = true;
    offsetX = e.clientX - tempPanel.offsetLeft;
    offsetY = e.clientY - tempPanel.offsetTop;
  };

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;
    tempPanel.style.left = e.clientX - offsetX + "px";
    tempPanel.style.top = e.clientY - offsetY + "px";
    tempPanel.style.right = "auto";
  });
  document.addEventListener("mouseup", () => isDragging = false);

  tempPanel.append(tempHeader, tempBody);
  document.body.appendChild(tempPanel);
  renderSubjects();
}

function monitorMessageTextarea() {
  const observer = new MutationObserver(() => {
    const messageEl = document.querySelector("#message");
    if (messageEl && !document.body.contains(tempPanel)) createTempPanel();
    else if (!messageEl && tempPanel && document.body.contains(tempPanel)) {
      tempPanel.remove();
      tempPanel = null;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (document.querySelector("#message") && !document.body.contains(tempPanel)) createTempPanel();
}

function renderSubjects() {
  const subjects = Object.keys(data);
  tempBody.innerHTML = `
    ${subjects.map((s, i) => `
      <div class="subject-item" style="padding:6px;cursor:pointer;text-align:right;border:1px solid #fff;margin-bottom:4px;border-radius:4px">
        ${i + 1}. ${s}
      </div>
    `).join("")}
    <div id="settingsBtn" style="margin-top:10px;color:#ff4d4d;cursor:pointer;font-weight:bold;text-align:center">
      تنظیمات
    </div>
  `;
  tempBody.querySelectorAll(".subject-item").forEach(el => {
    el.onclick = () => {
      currentSubject = el.innerText.replace(/^\d+\.\s*/, "");
      renderTopics();
    };
  });
  tempBody.querySelector("#settingsBtn").onclick = renderSettings;
}

function renderTopics() {
  const topics = data[currentSubject] || {};
  const keys = Object.keys(topics);
  tempBody.innerHTML = `
    <div style="color:#ff4d4d;font-weight:bold;margin-bottom:4px">${currentSubject}</div>
    <div style="border-bottom:2px solid #ff4d4d;margin-bottom:8px"></div>
    ${keys.map((t, i) => `
      <div class="topic-item" style="padding:6px;cursor:pointer;text-align:right;border:1px solid #fff;margin-bottom:4px;border-radius:4px">
        ${i + 1}. ${t}
      </div>
    `).join("")}
    <button id="backToSubjects" style="width:100%;margin-top:10px;background:#ff4d4d">
      بازگشت
    </button>
  `;
  tempBody.querySelectorAll(".topic-item").forEach(el => {
    el.onclick = () => {
      const key = el.innerText.replace(/^\d+\.\s*/, "");
      const ta = document.querySelector("#message");
      if (ta) ta.value = topics[key];
    };
  });
  tempBody.querySelector("#backToSubjects").onclick = renderSubjects;
}

function renderSettings() {
  tempBody.innerHTML = `
    <div class="title" id="guideBtn" style="background:#222;padding:6px;margin-top:6px;cursor:pointer;font-weight:bold;text-align:right">
      راهنما
    </div>
    ${section("اضافه کردن", addForm())}
    ${section("ذخیره‌ی تمپلیت‌ها", exportImportSection())}
    <div class="title" id="editDeleteBtn" style="background:#222;padding:6px;margin-top:6px;cursor:pointer;font-weight:bold;text-align:right">
      ویرایش و حذف
    </div>
    <button id="backSettings" style="width:100%;margin-top:10px;background:#ff4d4d">
      بازگشت
    </button>
  `;
  tempBody.querySelector("#guideBtn").onclick = renderGuide;
  tempBody.querySelector("#editDeleteBtn").onclick = renderEditSubjects;
  tempBody.querySelector("#backSettings").onclick = renderSubjects;
  tempBody.querySelectorAll(".title").forEach(t => {
    if (t.id === "guideBtn" || t.id === "editDeleteBtn") return;
    const body = t.nextElementSibling;
    body.style.display = "none";
    t.onclick = () => body.style.display = body.style.display === "none" ? "block" : "none";
  });
}

function renderGuide() {
  tempBody.innerHTML = `
    <div style="line-height:1.8;font-size:15px;text-align:right;max-height:280px;overflow-y:auto">
      <span style="color:#ff4d4d;font-weight:bold">اهورا</span> هستم سازنده ی این افزونه<br>
      امیدوارم به خوبی استفاده کنید ازش و بتونه بهتون تو سایت کمک کنه<br>
      .........................<br><br>
      <b>بخش های افزونه شامل :</b><br>
      رفرش خودکار بخش تیکت<br>
      نوتفیکیشن تیکت های جدید<br>
      آلارم تیکت های 3 اسپای<br>
      تمپلیت تیکت<br>
      قسمت ویدرا<br>
      بررسی مبلغ ارزی<br>
      گرفتن خودکار تیکت<br>
      .........................<br><br>
      <b>توضیحات کامل :</b><br>
      وقتی وارد بخش تیکت می شوید صفحه خودکار رفرش میکند و با تیکت جدید نوتفیکیشن میاد<br><br>
      پیشنهاد میشود اگر صفحه های دیگه ای هم باز میکنید از پایین سمت راست روی گزینه ی صدا یکبار کلیک کنید تا نوتفیکیشن و آلارم برای آن صفحه قطع شود<br><br>
      اگر کاربر 3 اسپای باشد و یا مورد مشکوکی در یوزر استوری کاربر نوشته شده باشد برنامه آلارم میزند<br>
      ( لطفا پروفایل کاربر را همیشه برای 3 اسپای بودن بررسی کنید )<br><br>
      موفق باشید ( <span style="color:#ff4d4d;font-weight:bold">اهورا</span> )
    </div>
    <button id="backFromGuide" style="width:100%;margin-top:10px;background:#ff4d4d;color:#fff;padding:6px;border:none;border-radius:4px;cursor:pointer">
      بازگشت
    </button>
  `;
  tempBody.querySelector("#backFromGuide").onclick = renderSettings;
}

function renderEditSubjects() {
  const subjects = Object.keys(data);
  tempBody.innerHTML = `
    ${subjects.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px">
        <span>${s}</span>
        <span>
          <span style="color:#4da6ff;cursor:pointer" data-edit="${s}">✏️</span>
          <span style="color:#ff4d4d;cursor:pointer;margin-right:6px" data-del="${s}">🗑️</span>
        </span>
      </div>
      <div style="border-bottom:1px solid #fff"></div>
    `).join("")}
    <button id="backEditSubjects" style="width:100%;margin-top:10px;background:#ff4d4d">
      بازگشت
    </button>
  `;
  tempBody.querySelectorAll("[data-del]").forEach(el => {
    el.onclick = () => {
      const subjectToDelete = el.dataset.del;
      if (confirm(`حذف "${subjectToDelete}"؟`)) {
        if (data.hasOwnProperty(subjectToDelete)) {
          delete data[subjectToDelete];
          saveData();
          renderEditSubjects();
        }
      }
    };
  });
  tempBody.querySelectorAll("[data-edit]").forEach(el => {
    el.onclick = () => { editSubject = el.dataset.edit; renderEditTopics(); };
  });
  tempBody.querySelector("#backEditSubjects").onclick = renderSettings;
}

function renderEditTopics() {
  const topics = data[editSubject];
  const topicKeys = Object.keys(topics || {});
  tempBody.innerHTML = `
    <div style="color:#ff4d4d;font-weight:bold;margin-bottom:6px">${editSubject}</div>
    <div style="border-bottom:2px solid #ff4d4d;margin-bottom:8px"></div>
    ${topicKeys.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px">
        <span>${t}</span>
        <span>
          <span style="color:#4da6ff;cursor:pointer" data-edit="${t}">✏️</span>
          <span style="color:#ff4d4d;cursor:pointer;margin-right:6px" data-del="${t}">🗑️</span>
        </span>
      </div>
      <div style="border-bottom:1px solid #fff"></div>
    `).join("")}
    <button id="backEditTopics" style="width:100%;margin-top:10px;background:#ff4d4d">
      بازگشت
    </button>
  `;
  tempBody.querySelectorAll("[data-del]").forEach(el => {
    el.onclick = () => {
      const topicToDelete = el.dataset.del;
      if (confirm(`حذف "${topicToDelete}"؟`)) {
        if (topics.hasOwnProperty(topicToDelete)) {
          delete data[editSubject][topicToDelete];
          saveData();
          renderEditTopics();
        }
      }
    };
  });
  tempBody.querySelectorAll("[data-edit]").forEach(el => {
    el.onclick = () => { editTopic = el.dataset.edit; renderEditTemplate(); };
  });
  tempBody.querySelector("#backEditTopics").onclick = renderEditSubjects;
}

function renderEditTemplate() {
  tempBody.innerHTML = `
    <input id="editTopicInput" value="${editTopic}" style="width:100%;margin-bottom:6px;padding:6px"/>
    <textarea id="editTemplateInput" style="width:100%;height:120px;padding:6px">${data[editSubject][editTopic]}</textarea>
    <button id="saveEditBtn" style="width:100%;margin-top:6px">ذخیره</button>
    <button id="backEditTemplate" style="width:100%;margin-top:6px;background:#ff4d4d">بازگشت</button>
  `;
  tempBody.querySelector("#saveEditBtn").onclick = () => {
    const newTopic = editTopicInput.value.trim();
    data[editSubject][newTopic] = editTemplateInput.value;
    delete data[editSubject][editTopic];
    saveData();
    renderEditTopics();
  };
  tempBody.querySelector("#backEditTemplate").onclick = renderEditTopics;
}

function addForm() {
  return `
    <input id="subInput" placeholder="سابجکت" style="width:100%;margin-bottom:4px;padding:6px"/>
    <select id="subSelect" style="width:100%;margin-bottom:6px">
      <option value="">انتخاب سابجکت موجود</option>
      ${Object.keys(data).map(s => `<option>${s}</option>`).join("")}
    </select>
    <input id="topicInput" placeholder="موضوع" style="width:100%;margin-bottom:6px;padding:6px"/>
    <textarea id="templateInput" placeholder="تمپلیت" style="width:100%;height:100px;padding:6px"></textarea>
    <button id="saveBtn" style="width:100%;margin-top:6px">ذخیره</button>
  `;
}

function exportImportSection() {
  return `
    <button id="exportBtn" style="width:100%">ذخیره فایل JSON</button>
    <input type="file" id="importFile" accept=".json" style="width:100%;margin-top:6px"/>
  `;
}

function section(title, body) {
  return `
    <div class="title" style="background:#222;padding:6px;margin-top:6px;cursor:pointer;font-weight:bold;text-align:right">
      ${title}
    </div>
    <div style="padding:6px;font-size:12px;color:#ccc">${body}</div>
  `;
}

const sensitiveKeywords = [
  "spy spy spy",
  "6 - spy spy spy",
  "Admin Login",
  "48 - spy spy spy",
  "3spy",
  "3 spy",
  "moshtarak",
  "be dalile hesabe moshtarak",
  "be dalil shekayat",
  "جواب تیکت",
  "قبادي نيا",
  "وصال اصیل",
  "سيمين سالاري"
];
let sensitiveAlertLocked = false;
let successModalHandled = false;

function checkSensitiveKeywords() {
  const text = normalizeText(getFullPageText());
  for (const keyword of sensitiveKeywords) {
    const pattern = new RegExp(normalizeText(keyword).replace(/\s+/g, "\\s+"), "i");
    if (pattern.test(text) && !sensitiveAlertLocked) {
      playBeepOnce();
      sensitiveAlertLocked = true;
      setTimeout(() => sensitiveAlertLocked = false, 5000);
      break;
    }
  }
}

function checkGroupInputAlert() {
  const groupInput = document.querySelector('#group');
  if (!groupInput) return;
  const value = normalizeText(groupInput.value || "");
  const triggerValues = ["6 - spy spy spy", "48 - spy spy spy"];
  if (triggerValues.some(v => normalizeText(v) === value) && !sensitiveAlertLocked) {
    playBeepOnce();
    sensitiveAlertLocked = true;
    setTimeout(() => sensitiveAlertLocked = false, 5000);
  }
}

function checkSuccessModalAndConfirm() {
  const modal = document.querySelector(".swal2-modal");
  if (!modal) {
    successModalHandled = false;
    return;
  }

  const content = modal.querySelector(".swal2-content");
  const okBtn = modal.querySelector("button.swal2-confirm.swal2-styled");
  const message = (content?.textContent || "").trim();

  if (message === "Updated Successfully!" && okBtn) {
    if (!successModalHandled) {
      successModalHandled = true;
      okBtn.click();
    }
  } else {
    successModalHandled = false;
  }
}

function shouldPauseTicketAutomation(totalRows) {
  return totalRows > 15;
}

function refreshIfTotalRowsExists() {
  const totalRowsExists = document.body.innerText.includes("Last Message");
  const totalRows = getTotalRows();
  const shouldRefresh = totalRowsExists && !shouldPauseTicketAutomation(totalRows);

  if (shouldRefresh && !refreshInterval) {
    refreshInterval = setInterval(() => {
      if (shouldPauseTicketAutomation(getTotalRows())) {
        stopAutoRefresh();
        updateStatus();
        return;
      }
      document.querySelector(".menu_icon.menu_refresh")?.click();
    }, 3000);
    updateStatus();
  } else if (!shouldRefresh && refreshInterval) {
    stopAutoRefresh();
    updateStatus();
  }
}

function stopAutoRefresh() {
  clearInterval(refreshInterval);
  refreshInterval = null;
}

function checkTickets() {
  if (!enabled || isLoggedOut()) return;
  const currentTotal = getTotalRows();
  if (!shouldPauseTicketAutomation(currentTotal) && lastTotalRows !== null && currentTotal > lastTotalRows) {
    playTicketSound();
  }
  lastTotalRows = currentTotal;
}

window.addEventListener("load", () => {
  createStatusIndicator();
  monitorMessageTextarea();
  refreshIfTotalRowsExists();

  new MutationObserver(checkTickets).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(checkSensitiveKeywords).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(refreshIfTotalRowsExists).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(checkGroupInputAlert).observe(document.body, { childList: true, subtree: true, attributes: true });
  new MutationObserver(checkSuccessModalAndConfirm).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", e => {
    if (e.target?.id === "saveBtn") {
      const sub = subSelect.value || subInput.value.trim();
      const topic = topicInput.value.trim();
      const template = templateInput.value.trim();
      if (!sub || !topic || !template) { alert("لطفا همه فیلدها را پر کنید"); return; }
      if (!data[sub]) data[sub] = {};
      data[sub][topic] = template;
      saveData();
      renderSubjects();
      topicInput.value = "";
      templateInput.value = "";
      subInput.value = "";
      subSelect.value = "";
    }

    if (e.target?.id === "exportBtn") {
      if (!confirm("ذخیره شود؟")) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = "templates.json";
      a.click();
    }
  });

  document.addEventListener("change", e => {
    if (e.target?.id === "importFile" && e.target.files.length) {
      const r = new FileReader();
      r.onload = ev => {
        data = JSON.parse(ev.target.result);
        saveData();
        renderSubjects();
      };
      r.readAsText(e.target.files[0]);
    }
  });
});