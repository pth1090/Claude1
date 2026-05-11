"use strict";

const socket = io();
let config = { buttons: [], opcua: {}, modbus: {} };
let selectedIndex = null;
let liveValues = {};
let buttonColors = {};

// --- Socket.IO ---
socket.on("connect", () => fetchConfig());

socket.on("status_update", (status) => {
  setDot("dot-opcua", status.opcua);
  setDot("dot-modbus", status.modbus);
  setDot("dot-deck", status.streamdeck);
});

socket.on("live_values", (values) => {
  values.forEach(({ index, value, color }) => {
    liveValues[index] = value;
    if (color) buttonColors[index] = color;
    updateButtonDisplay(index);
  });
});

socket.on("config_updated", () => fetchConfig());

function setDot(id, state) {
  const el = document.getElementById(id);
  el.className = "dot " + (state || "disconnected");
}

// --- Config loading ---
async function fetchConfig() {
  const res = await fetch("/api/config");
  config = await res.json();
  renderGrid();
  loadConnectionFields();
}

// --- Grid rendering ---
function renderGrid() {
  const grid = document.getElementById("deck-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const btn = config.buttons[i] || { index: i, enabled: false, label: `Taste ${i+1}`, color: "#1a3a5c" };
    const el = document.createElement("div");
    el.className = "deck-btn" + (!btn.enabled ? " disabled" : "") + (selectedIndex === i ? " selected" : "");
    el.id = `deck-btn-${i}`;
    el.style.background = buttonColors[i] || btn.color || "#1a3a5c";
    el.innerHTML = `
      <span class="btn-index">${i}</span>
      <span class="btn-label">${esc(btn.label || "")}</span>
      <span class="btn-value" id="bv-${i}">${formatValue(i, btn)}</span>
      <span class="btn-unit" id="bu-${i}">${(btn.display && btn.display.unit) || ""}</span>
    `;
    el.addEventListener("click", () => openEditor(i));
    grid.appendChild(el);
  }
}

function updateButtonDisplay(index) {
  const btn = config.buttons[index];
  if (!btn) return;
  const el = document.getElementById(`deck-btn-${index}`);
  if (!el) return;
  el.style.background = buttonColors[index] || btn.color || "#1a3a5c";
  const vEl = document.getElementById(`bv-${index}`);
  if (vEl) vEl.textContent = formatValue(index, btn);
}

function formatValue(index, btn) {
  const val = liveValues[index];
  if (val === undefined || val === null) {
    return btn.display ? "--" : "";
  }
  if (typeof val === "boolean") return val ? "EIN" : "AUS";
  if (typeof val === "number") {
    const dec = (btn.display && btn.display.decimals != null) ? btn.display.decimals : 1;
    return val.toFixed(dec);
  }
  return String(val).slice(0, 8);
}

// --- Connection settings ---
function loadConnectionFields() {
  if (!config.opcua) return;
  document.getElementById("opcua-endpoint").value = config.opcua.endpoint || "";
  document.getElementById("opcua-user").value = config.opcua.username || "";
  document.getElementById("modbus-host").value = (config.modbus && config.modbus.host) || "";
  document.getElementById("modbus-port").value = (config.modbus && config.modbus.port) || 502;
  document.getElementById("modbus-unit").value = (config.modbus && config.modbus.unit_id) || 1;
  document.getElementById("modbus-poll").value = (config.modbus && config.modbus.poll_interval_ms) || 1000;
}

async function saveConnection() {
  const data = {
    opcua: {
      endpoint: document.getElementById("opcua-endpoint").value.trim(),
      username: document.getElementById("opcua-user").value.trim(),
      password: document.getElementById("opcua-pass").value,
    },
    modbus: {
      host: document.getElementById("modbus-host").value.trim(),
      port: parseInt(document.getElementById("modbus-port").value) || 502,
      unit_id: parseInt(document.getElementById("modbus-unit").value) || 1,
      poll_interval_ms: parseInt(document.getElementById("modbus-poll").value) || 1000,
    }
  };
  await fetch("/api/config/connection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

// --- Editor ---
function openEditor(index) {
  selectedIndex = index;
  const btn = config.buttons[index] || {};
  document.getElementById("editor-title").textContent = `Taste ${index} bearbeiten`;
  document.getElementById("e-label").value = btn.label || "";
  document.getElementById("e-color").value = btn.color || "#1a3a5c";
  document.getElementById("e-enabled").checked = btn.enabled !== false;

  // Action fields
  const action = btn.action || {};
  document.getElementById("e-act-proto").value = action.protocol || "";
  updateActionFields();
  if (action.node_id) document.getElementById("e-act-nodeid").value = action.node_id;
  if (action.address != null) document.getElementById("e-act-addr").value = action.address;
  if (action.register_type) document.getElementById("e-act-regtype").value = action.register_type;
  document.getElementById("e-act-type").value = action.type || "write";
  if (action.value != null) document.getElementById("e-act-value").value = String(action.value);

  // Display fields
  const display = btn.display || {};
  document.getElementById("e-disp-proto").value = display.protocol || "";
  updateDisplayFields();
  if (display.node_id) document.getElementById("e-disp-nodeid").value = display.node_id;
  if (display.address != null) document.getElementById("e-disp-addr").value = display.address;
  if (display.register_type) document.getElementById("e-disp-regtype").value = display.register_type;
  if (display.scale != null) document.getElementById("e-disp-scale").value = display.scale;
  if (display.offset != null) document.getElementById("e-disp-offset").value = display.offset;
  if (display.unit) document.getElementById("e-disp-unit").value = display.unit;
  if (display.decimals != null) document.getElementById("e-disp-dec").value = display.decimals;

  // Thresholds
  renderThresholds(display.thresholds || []);

  document.getElementById("editor").style.display = "block";

  // Highlight selected button
  document.querySelectorAll(".deck-btn").forEach((el, i) => {
    el.classList.toggle("selected", i === index);
  });
  document.getElementById("editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  document.getElementById("editor").style.display = "none";
  document.querySelectorAll(".deck-btn").forEach(el => el.classList.remove("selected"));
  selectedIndex = null;
}

function updateActionFields() {
  const proto = document.getElementById("e-act-proto").value;
  document.getElementById("action-opcua-fields").style.display = proto === "opcua" ? "block" : "none";
  document.getElementById("action-modbus-fields").style.display = proto === "modbus" ? "block" : "none";
  document.getElementById("action-value-fields").style.display = proto ? "block" : "none";
}

function updateDisplayFields() {
  const proto = document.getElementById("e-disp-proto").value;
  document.getElementById("disp-opcua-fields").style.display = proto === "opcua" ? "block" : "none";
  document.getElementById("disp-modbus-fields").style.display = proto === "modbus" ? "block" : "none";
  document.getElementById("disp-common-fields").style.display = proto ? "block" : "none";
}

// --- Thresholds ---
function renderThresholds(list) {
  const container = document.getElementById("thresholds-list");
  container.innerHTML = "";
  list.forEach((t, i) => {
    container.appendChild(makeThresholdRow(t, i));
  });
}

function makeThresholdRow(t, i) {
  const row = document.createElement("div");
  row.className = "threshold-row";
  row.dataset.idx = i;
  row.innerHTML = `
    <select class="t-op">
      <option value="gt" ${t.operator==="gt"?"selected":""}>></option>
      <option value="gte" ${t.operator==="gte"?"selected":""}>>= </option>
      <option value="lt" ${t.operator==="lt"?"selected":""}><</option>
      <option value="lte" ${t.operator==="lte"?"selected":""}>&lt;= </option>
    </select>
    <input type="number" class="t-val" value="${t.value != null ? t.value : ""}" placeholder="Wert" step="any">
    <span style="color:#8899aa">→ Farbe:</span>
    <input type="color" class="t-color" value="${t.color || "#FF8C00"}">
    <button class="small danger" onclick="removeThreshold(${i})">×</button>
  `;
  return row;
}

function addThreshold() {
  const container = document.getElementById("thresholds-list");
  const i = container.children.length;
  container.appendChild(makeThresholdRow({ operator: "gt", value: "", color: "#FF8C00" }, i));
}

function removeThreshold(i) {
  const container = document.getElementById("thresholds-list");
  container.children[i] && container.children[i].remove();
  // Re-index
  Array.from(container.children).forEach((row, idx) => {
    row.dataset.idx = idx;
    const btn = row.querySelector("button");
    if (btn) btn.setAttribute("onclick", `removeThreshold(${idx})`);
  });
}

function collectThresholds() {
  const rows = document.querySelectorAll("#thresholds-list .threshold-row");
  return Array.from(rows).map(row => ({
    operator: row.querySelector(".t-op").value,
    value: parseFloat(row.querySelector(".t-val").value),
    color: row.querySelector(".t-color").value,
  })).filter(t => !isNaN(t.value));
}

// --- Save button config ---
async function saveButton() {
  if (selectedIndex === null) return;

  const actProto = document.getElementById("e-act-proto").value;
  const dispProto = document.getElementById("e-disp-proto").value;

  let action = null;
  if (actProto) {
    action = { protocol: actProto, type: document.getElementById("e-act-type").value };
    if (actProto === "opcua") {
      action.node_id = document.getElementById("e-act-nodeid").value.trim();
    } else {
      action.address = parseInt(document.getElementById("e-act-addr").value);
      action.register_type = document.getElementById("e-act-regtype").value;
    }
    if (action.type === "write") {
      const rawVal = document.getElementById("e-act-value").value.trim();
      action.value = parseWriteValue(rawVal);
    }
  }

  let display = null;
  if (dispProto) {
    display = {
      protocol: dispProto,
      unit: document.getElementById("e-disp-unit").value.trim(),
      decimals: parseInt(document.getElementById("e-disp-dec").value) || 1,
      thresholds: collectThresholds(),
    };
    if (dispProto === "opcua") {
      display.node_id = document.getElementById("e-disp-nodeid").value.trim();
    } else {
      display.address = parseInt(document.getElementById("e-disp-addr").value);
      display.register_type = document.getElementById("e-disp-regtype").value;
      display.scale = parseFloat(document.getElementById("e-disp-scale").value) || 1;
      display.offset = parseFloat(document.getElementById("e-disp-offset").value) || 0;
    }
  }

  const data = {
    index: selectedIndex,
    enabled: document.getElementById("e-enabled").checked,
    label: document.getElementById("e-label").value.trim(),
    color: document.getElementById("e-color").value,
    action,
    display,
  };

  await fetch(`/api/config/button/${selectedIndex}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  config.buttons[selectedIndex] = data;
  renderGrid();
  closeEditor();
}

function parseWriteValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? raw : n;
}

// --- Section toggle ---
function toggleSection(name) {
  const toggle = document.getElementById(`toggle-${name}`);
  const section = document.getElementById(`section-${name}`);
  toggle.classList.toggle("open");
  section.classList.toggle("open");
}

// --- Utility ---
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Initial load
fetchConfig();
