async function sendMessage(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res?.ok) throw new Error(res?.error || "操作失败");
  return res.data;
}

const DEFAULT_FIELD_MAPPING = {
  company: "公司",
  title: "岗位",
  deliveryMethod: "投递方式",
  location: "BASE",
  jobUrl: "投递链接",
  status: "当前状态",
  appliedDate: "投递时间",
  notes: "jd"
};

const statusBanner = document.getElementById("statusBanner");

// Auth elements
const authNotConnected = document.getElementById("authNotConnected");
const appIdInput = document.getElementById("appId");
const appSecretInput = document.getElementById("appSecret");
const authorizeButton = document.getElementById("authorizeButton");
const disconnectButton = document.getElementById("disconnectButton");
const userInfoDiv = document.getElementById("userInfo");
const userNameEl = document.getElementById("userName");
const userEmailEl = document.getElementById("userEmail");

// Table config elements
const tableConfigCard = document.getElementById("tableConfigCard");
const bitableUrlInput = document.getElementById("bitableUrl");
const parseUrlButton = document.getElementById("parseUrlButton");
const appTokenInput = document.getElementById("appToken");
const tableIdSelect = document.getElementById("tableId");
const refreshTablesButton = document.getElementById("refreshTablesButton");
const testConnectionButton = document.getElementById("testConnectionButton");

// Field mapping elements
const fieldMappingCard = document.getElementById("fieldMappingCard");
const mappingGrid = document.getElementById("mappingGrid");
const saveMappingButton = document.getElementById("saveMappingButton");
const resetMappingButton = document.getElementById("resetMappingButton");

let currentAuth = null;
let currentFieldMapping = { ...DEFAULT_FIELD_MAPPING };

// --- Initialize ---
initialize();

authorizeButton.addEventListener("click", handleAuthorize);
disconnectButton.addEventListener("click", handleDisconnect);
parseUrlButton.addEventListener("click", handleParseUrl);
refreshTablesButton.addEventListener("click", handleRefreshTables);
testConnectionButton.addEventListener("click", handleTestConnection);
saveMappingButton.addEventListener("click", handleSaveMapping);
resetMappingButton.addEventListener("click", () => applyFieldMapping(DEFAULT_FIELD_MAPPING));
tableIdSelect.addEventListener("change", async () => {
  const appToken = appTokenInput.value.trim();
  const tableId = tableIdSelect.value;

  if (appToken && tableId) {
    await loadFieldMapping(appToken, tableId);
  }
});

async function initialize() {
  try {
    const status = await sendMessage("FEISHU_STATUS");
    if (status.connected) {
      currentAuth = status;
      showConnectedState(status.userInfo);

      const config = await sendMessage("GET_SETTINGS");
      currentFieldMapping = { ...DEFAULT_FIELD_MAPPING, ...(config.fieldMapping || {}) };
      if (config.appToken) {
        appTokenInput.value = config.appToken;
        if (config.tableId) {
          await loadTables(config.appToken, config.tableId);
        } else {
          applyFieldMapping(currentFieldMapping);
        }
      } else {
        applyFieldMapping(currentFieldMapping);
      }
      fieldMappingCard.style.display = "";
    } else {
      showDisconnectedState();
    }
  } catch (error) {
    showDisconnectedState();
    setStatus(`检查飞书连接失败：${error.message}`, "error");
  }
}

// --- Auth handlers ---

async function handleAuthorize() {
  const appId = appIdInput.value.trim();
  const appSecret = appSecretInput.value.trim();

  if (!appId || !appSecret) {
    setStatus("请输入飞书应用的 App ID 和 App Secret", "warning");
    return;
  }

  setAuthLoading(true);
  setStatus("正在连接飞书...", "idle");

  try {
    const result = await sendMessage("FEISHU_SMART_AUTHORIZE", { appId, appSecret });
    currentAuth = { connected: true, userInfo: result.userInfo };
    showConnectedState(result.userInfo);

    const methodText = {
      oauth: "已通过 OAuth 授权连接"
    }[result.method] || "飞书授权成功";

    setStatus(methodText, "success");
  } catch (error) {
    setStatus(`连接失败：${error.message}`, "error");
  } finally {
    setAuthLoading(false);
  }
}

async function handleDisconnect() {
  try {
    await sendMessage("FEISHU_DISCONNECT");
    currentAuth = null;
    showDisconnectedState();
    setStatus("已断开飞书连接", "idle");
  } catch (error) {
    setStatus(`断开失败：${error.message}`, "error");
  }
}

// --- Table discovery handlers ---

async function handleParseUrl() {
  const url = bitableUrlInput.value.trim();
  if (!url) {
    setStatus("请先粘贴多维表格链接", "warning");
    return;
  }

  try {
    const result = await sendMessage("PARSE_BITABLE_URL", { url });
    if (result.appToken) {
      appTokenInput.value = result.appToken;
      setStatus("链接解析完成", "success");

      // 自动加载表格列表
      await loadTables(result.appToken, result.tableId);
    } else {
      setStatus("无法解析链接，请检查链接格式", "warning");
    }
  } catch (error) {
    setStatus(`解析失败：${error.message}`, "error");
  }
}

async function handleRefreshTables() {
  const appToken = appTokenInput.value.trim();
  if (!appToken) {
    setStatus("请先填写 appToken", "warning");
    return;
  }

  await loadTables(appToken);
}

async function loadTables(appToken, selectedTableId) {
  setTableLoading(true);
  setStatus("正在加载数据表列表...", "idle");

  try {
    const tables = await sendMessage("FEISHU_LIST_TABLES", { appToken });
    tableIdSelect.innerHTML = '<option value="">请选择数据表</option>';

    for (const table of tables) {
      const option = document.createElement("option");
      option.value = table.table_id;
      option.textContent = table.name || table.table_id;
      if (table.table_id === selectedTableId) option.selected = true;
      tableIdSelect.appendChild(option);
    }

    tableIdSelect.disabled = false;

    // 如果有选中的表格，自动加载字段映射
    if (selectedTableId) {
      await loadFieldMapping(appToken, selectedTableId);
    }

    setStatus(`已加载 ${tables.length} 个数据表`, "success");
  } catch (error) {
    setStatus(`加载数据表失败：${error.message}`, "error");
  } finally {
    setTableLoading(false);
  }
}

async function loadFieldMapping(appToken, tableId) {
  try {
    const result = await sendMessage("FEISHU_LIST_FIELDS", { appToken, tableId });
    const fields = Array.isArray(result) ? result : (result.fields || []);

    // 构建字段映射下拉选择
    buildMappingFieldsWithOptions(fields, currentFieldMapping);

    setStatus(`已加载 ${fields.length} 个字段`, "success");
  } catch (error) {
    setStatus(`加载字段失败：${error.message}`, "error");
  }
}

function buildMappingFieldsWithOptions(feishuFields, fieldMapping = currentFieldMapping) {
  mappingGrid.innerHTML = "";

  const internalFields = Object.keys(DEFAULT_FIELD_MAPPING);

  for (const key of internalFields) {
    const label = document.createElement("label");
    label.innerHTML = `<span>${key}</span>`;

    const select = document.createElement("select");
    select.id = `mapping-${key}`;

    // 添加空选项
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "不映射";
    select.appendChild(emptyOption);

    const mappedValue = fieldMapping[key] || DEFAULT_FIELD_MAPPING[key] || "";
    let hasMappedOption = !mappedValue;

    // 添加飞书字段选项
    for (const field of feishuFields) {
      const option = document.createElement("option");
      option.value = field.field_name;
      option.textContent = field.field_name;

      if (field.field_name === mappedValue) {
        hasMappedOption = true;
      }

      select.appendChild(option);
    }

    if (!hasMappedOption) {
      const customOption = document.createElement("option");
      customOption.value = mappedValue;
      customOption.textContent = mappedValue;
      select.appendChild(customOption);
    }

    select.value = mappedValue;

    label.appendChild(select);
    mappingGrid.appendChild(label);
  }
}

async function handleTestConnection() {
  const appToken = appTokenInput.value.trim();
  const tableId = tableIdSelect.value;

  if (!appToken || !tableId) {
    setStatus("请先选择 appToken 和数据表", "warning");
    return;
  }

  setTableLoading(true);
  setStatus("正在测试连接...", "idle");

  try {
    await sendMessage("FEISHU_TEST_CONNECTION", { appToken, tableId });
    setStatus("连接测试成功！", "success");
  } catch (error) {
    setStatus(`连接测试失败：${error.message}`, "error");
  } finally {
    setTableLoading(false);
  }
}

// --- Settings handlers ---

async function handleSaveMapping() {
  const appToken = appTokenInput.value.trim();
  const tableId = tableIdSelect.value;
  const fieldMapping = collectFieldMapping();

  try {
    await sendMessage("SAVE_SETTINGS", { appToken, tableId, fieldMapping });
    currentFieldMapping = { ...DEFAULT_FIELD_MAPPING, ...fieldMapping };
    setStatus("配置已保存", "success");
  } catch (error) {
    setStatus(`保存失败：${error.message}`, "error");
  }
}

// --- UI helpers ---

function showConnectedState(userInfo) {
  authNotConnected.style.display = "none";
  authorizeButton.style.display = "none";
  disconnectButton.style.display = "";
  tableConfigCard.style.display = "";
  fieldMappingCard.style.display = "";

  if (userInfo) {
    userNameEl.textContent = userInfo.name || userInfo.en_name || "未知用户";
    userEmailEl.textContent = userInfo.email || "";
    userInfoDiv.style.display = "";
  }
}

function showDisconnectedState() {
  authNotConnected.style.display = "";
  authorizeButton.style.display = "";
  disconnectButton.style.display = "none";
  tableConfigCard.style.display = "none";
  fieldMappingCard.style.display = "none";
  userInfoDiv.style.display = "none";
}

function buildMappingFields() {
  mappingGrid.innerHTML = "";
  for (const [key, defaultValue] of Object.entries(DEFAULT_FIELD_MAPPING)) {
    const label = document.createElement("label");
    label.innerHTML = `<span>${key}</span>`;
    const input = document.createElement("input");
    input.type = "text";
    input.id = `mapping-${key}`;
    input.value = defaultValue;
    label.appendChild(input);
    mappingGrid.appendChild(label);
  }
}

function collectFieldMapping() {
  const mapping = {};
  for (const key of Object.keys(DEFAULT_FIELD_MAPPING)) {
    const select = document.getElementById(`mapping-${key}`);
    if (select) mapping[key] = select.value;
  }
  return mapping;
}

function applyFieldMapping(fieldMapping) {
  currentFieldMapping = { ...DEFAULT_FIELD_MAPPING, ...fieldMapping };

  const existingSelects = mappingGrid.querySelectorAll("select");
  if (existingSelects.length === 0) {
    buildMappingFields();
  }

  for (const [key, value] of Object.entries(fieldMapping)) {
    const input = document.getElementById(`mapping-${key}`);
    if (!input) continue;

    if (input.tagName === "SELECT" && value && !Array.from(input.options).some((option) => option.value === value)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      input.appendChild(option);
    }

    input.value = value || "";
  }
}

function setAuthLoading(isLoading) {
  authorizeButton.disabled = isLoading;
  appIdInput.disabled = isLoading;
  appSecretInput.disabled = isLoading;
}

function setTableLoading(isLoading) {
  parseUrlButton.disabled = isLoading;
  refreshTablesButton.disabled = isLoading;
  testConnectionButton.disabled = isLoading;
  saveMappingButton.disabled = isLoading;
  resetMappingButton.disabled = isLoading;
}

function setStatus(message, type) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner status-${type}`;
}
