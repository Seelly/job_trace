importScripts("./feishu-auth.js");

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

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get("fieldMapping");
  if (!stored.fieldMapping) {
    await chrome.storage.sync.set({ fieldMapping: DEFAULT_FIELD_MAPPING });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) return false;

  const handlers = {
    FEISHU_AUTHORIZE: handleAuthorize,
    FEISHU_SMART_AUTHORIZE: handleSmartAuthorize,
    FEISHU_DISCONNECT: handleDisconnect,
    FEISHU_STATUS: handleGetStatus,
    FEISHU_LIST_TABLES: handleListTables,
    FEISHU_LIST_FIELDS: handleListFields,
    FEISHU_TEST_CONNECTION: handleTestConnection,
    SUBMIT_RECORD: handleSubmitRecord,
    GET_SETTINGS: handleGetSettings,
    SAVE_SETTINGS: handleSaveSettings,
    PARSE_BITABLE_URL: handleParseBitableUrl,
    EXTRACT_JOB_DATA_FROM_PAGE: handleExtractJobDataFromPage,
    OPEN_OPTIONS_PAGE: handleOpenOptionsPage
  };

  const handler = handlers[message.type];
  if (!handler) return false;

  handler(message.payload)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!isInjectableTab(tab)) {
      throw new Error("当前页面不支持打开 Job Trace，请切换到普通网页职位详情页");
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FLOATING_PANEL' });
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      console.warn("Failed to toggle floating panel:", error.message);
      return;
    }

    try {
      await injectJobTraceScripts(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_FLOATING_PANEL' });
    } catch (injectError) {
      console.warn("Failed to inject Job Trace:", injectError.message);
    }
  }
});

function isInjectableTab(tab) {
  return Boolean(tab?.id && /^https?:\/\//i.test(tab.url || ""));
}

function isMissingContentScriptError(error) {
  const message = error?.message || "";
  return message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection");
}

async function injectJobTraceScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "src/content/company-matcher.js",
      "src/content/content.js",
      "src/content/floating-panel.js"
    ]
  });
}

async function handleAuthorize(payload) {
  const { appId, appSecret } = payload;
  return await authorize(appId, appSecret);
}

async function handleSmartAuthorize(payload) {
  const { appId, appSecret } = payload;
  return await smartAuthorize(appId, appSecret);
}

async function handleDisconnect() {
  await disconnect();
  return { message: "已断开飞书连接" };
}

async function handleGetStatus() {
  return await getAuthStatus();
}

async function handleListTables(payload) {
  const { appToken } = payload;
  return await listTables(appToken);
}

async function handleListFields(payload) {
  const { appToken, tableId } = payload;
  const fields = await listFields(appToken, tableId);
  // 查找 BASE 字段的类型
  const baseField = fields.find(f => f.field_name === "BASE");
  return { fields, baseFieldType: baseField?.type };
}

async function handleTestConnection(payload) {
  const { appToken, tableId } = payload;
  return await testConnection(appToken, tableId);
}

async function handleParseBitableUrl(payload) {
  return parseBitableUrl(payload.url);
}

async function handleOpenOptionsPage() {
  await chrome.runtime.openOptionsPage();
  return { message: "已打开设置页" };
}

async function handleExtractJobDataFromPage() {
  // 获取当前活动标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('未找到当前标签页');
  }

  // 向 content script 发送抓取请求
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB_DATA' });
  if (!response?.ok) {
    throw new Error(response?.error || '抓取失败');
  }

  return response.data;
}

async function handleSubmitRecord(jobData) {
  const config = await getStoredConfig();
  if (!config.appToken || !config.tableId) {
    throw new Error("请先在设置页配置飞书表格");
  }

  const fields = buildFields(jobData, config.fieldMapping);
  const record = await writeRecord(config.appToken, config.tableId, fields);
  return { recordId: record.record_id, raw: record };
}

async function handleGetSettings() {
  const config = await getStoredConfig();
  return config;
}

async function handleSaveSettings(payload) {
  await chrome.storage.sync.set(payload);
  return { message: "配置已保存" };
}

async function getStoredConfig() {
  const result = await chrome.storage.sync.get(["appToken", "tableId", "fieldMapping"]);
  return {
    appToken: result.appToken || "",
    tableId: result.tableId || "",
    fieldMapping: { ...DEFAULT_FIELD_MAPPING, ...(result.fieldMapping || {}) }
  };
}

function buildFields(jobData, fieldMapping) {
  const now = new Date();

  // 处理工作地点：支持中英文逗号、空格分割，转换为数组
  let locationArray = [];
  if (jobData.location) {
    locationArray = jobData.location
      .split(/[,，\s]+/)  // 支持中英文逗号和空格
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  const payload = {
    company: jobData.company || "",
    title: jobData.title || "",
    deliveryMethod: jobData.deliveryMethod || "官网",
    location: locationArray.length > 0 ? locationArray : "",
    jobUrl: jobData.jobUrl ? {
      link: jobData.jobUrl,
      text: jobData.title || jobData.jobUrl
    } : null,
    status: jobData.status || "已投递",
    appliedDate: jobData.appliedDate ? new Date(jobData.appliedDate).getTime() : now.getTime(),
    notes: jobData.notes || ""
  };

  const fields = {};
  for (const [key, feishuFieldName] of Object.entries(fieldMapping)) {
    if (feishuFieldName && payload[key] !== undefined && payload[key] !== "" && payload[key] !== null) {
      fields[feishuFieldName] = payload[key];
    }
  }
  return fields;
}
