const FEISHU_BASE = "https://open.feishu.cn/open-apis";

async function getAuthData() {
  const result = await chrome.storage.local.get("feishuAuth");
  return result.feishuAuth || null;
}

async function saveAuthData(partial) {
  const existing = (await getAuthData()) || {};
  await chrome.storage.local.set({
    feishuAuth: { ...existing, ...partial }
  });
}

async function clearAuthData() {
  await chrome.storage.local.remove("feishuAuth");
}

async function feishuFetch(path, options = {}) {
  const { token, ...fetchOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOptions.headers || {})
  };

  const res = await fetch(`${FEISHU_BASE}${path}`, {
    ...fetchOptions,
    headers
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(data.msg || `Feishu API error (code: ${data.code})`);
  }

  return data.data;
}

async function getAppAccessTokenWithCredentials(appId, appSecret) {
  const res = await fetch(`${FEISHU_BASE}/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(data.msg || `Get app access token failed (code: ${data.code})`);
  }

  return data.app_access_token;
}

async function authorize(appId, appSecret) {
  const redirectUrl = chrome.identity.getRedirectURL();

  const authUrl =
    `https://passport.feishu.cn/suite/passport/oauth/authorize?` +
    `client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&response_type=token` +
    `&state=feishu_auth`;

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (url) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!url) {
          reject(new Error("Authorization window closed"));
        } else {
          resolve(url);
        }
      }
    );
  });

  console.log("OAuth callback URL:", responseUrl);

  let accessToken = null;
  let expiresIn = 7200;

  if (responseUrl.includes("#")) {
    const fragment = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(fragment);
    accessToken = params.get("access_token");
    expiresIn = parseInt(params.get("expires_in") || "7200", 10);
  }

  if (!accessToken && responseUrl.includes("?")) {
    const url = new URL(responseUrl);
    accessToken = url.searchParams.get("access_token");
    expiresIn = parseInt(url.searchParams.get("expires_in") || "7200", 10);
  }

  if (!accessToken) {
    const url = new URL(responseUrl);
    const code = url.searchParams.get("code");

    if (code) {
      console.log("Got code, exchanging for access_token");
      const appAccessToken = await getAppAccessTokenWithCredentials(appId, appSecret);

      const tokenData = await feishuFetch("/authen/v1/oidc/access_token", {
        method: "POST",
        token: appAccessToken,
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: code
        })
      });

      accessToken = tokenData.access_token;
      expiresIn = tokenData.expires_in || 7200;

      const userInfo = await fetchUserInfo(accessToken);

      await saveAuthData({
        appId: appId,
        appSecret: appSecret,
        userAccessToken: accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + expiresIn * 1000,
        userInfo: userInfo,
        authMethod: "oauth"
      });

      return userInfo;
    }
  }

  if (!accessToken) {
    throw new Error("Authorization failed: no access token. Callback URL: " + responseUrl);
  }

  const userInfo = await fetchUserInfo(accessToken);

  await saveAuthData({
    appId: appId,
    appSecret: appSecret,
    userAccessToken: accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userInfo: userInfo,
    authMethod: "oauth"
  });

  return userInfo;
}

async function fetchUserInfo(token) {
  return await feishuFetch("/authen/v1/user_info", { token: token });
}

async function smartAuthorize(appId, appSecret) {
  const userInfo = await authorize(appId, appSecret);
  return { method: "oauth", userInfo: userInfo };
}

async function refreshUserToken() {
  const auth = await getAuthData();

  if (!auth?.refreshToken || !auth?.appId || !auth?.appSecret) {
    throw new Error("Refresh token not found, please reconnect");
  }

  const appAccessToken = await getAppAccessTokenWithCredentials(auth.appId, auth.appSecret);

  const tokenData = await feishuFetch("/authen/v1/oidc/refresh_access_token", {
    method: "POST",
    token: appAccessToken,
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken
    })
  });

  await saveAuthData({
    userAccessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000
  });

  return tokenData.access_token;
}

async function ensureValidToken() {
  const auth = await getAuthData();
  if (!auth?.userAccessToken) {
    throw new Error("Not authorized, please connect to Feishu first");
  }

  if (auth.authMethod && auth.authMethod !== "oauth") {
    throw new Error("Please reconnect to Feishu with OAuth");
  }

  if (auth.expiresAt && auth.expiresAt - Date.now() < 5 * 60 * 1000) {
    return await refreshUserToken();
  }

  return auth.userAccessToken;
}

async function getAuthStatus() {
  const auth = await getAuthData();
  if (!auth?.userAccessToken) {
    return { connected: false };
  }

  try {
    await ensureValidToken();
    return {
      connected: true,
      userInfo: auth.userInfo,
      authMethod: auth.authMethod || "unknown"
    };
  } catch {
    return { connected: false };
  }
}

async function listTables(appToken) {
  const token = await ensureValidToken();
  const data = await feishuFetch(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
    { token: token }
  );
  return data.items || [];
}

async function listFields(appToken, tableId) {
  const token = await ensureValidToken();
  const data = await feishuFetch(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
    { token: token }
  );
  // 返回字段列表,包含字段类型信息
  return (data.items || []).map(field => ({
    field_id: field.field_id,
    field_name: field.field_name,
    type: field.type,
    property: field.property
  }));
}

function parseBitableUrl(url) {
  try {
    const urlObj = new URL(url);

    // 支持 /base/xxx 和 /wiki/xxx 两种格式
    const pathMatch = urlObj.pathname.match(/\/(base|wiki)\/([a-zA-Z0-9_-]+)/);
    const appToken = pathMatch ? pathMatch[2] : null;
    const tableId = urlObj.searchParams.get("table") || null;
    const viewId = urlObj.searchParams.get("view") || null;

    return { appToken: appToken, tableId: tableId, viewId: viewId };
  } catch {
    return { appToken: null, tableId: null, viewId: null };
  }
}

async function writeRecord(appToken, tableId, fields) {
  const token = await ensureValidToken();
  const data = await feishuFetch(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
    {
      method: "POST",
      token: token,
      body: JSON.stringify({ fields: fields })
    }
  );
  return data.record || {};
}

async function testConnection(appToken, tableId) {
  const token = await ensureValidToken();
  await feishuFetch(
    `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?page_size=1`,
    { token: token }
  );
  return { message: "Connection successful" };
}

async function disconnect() {
  await clearAuthData();
}

function getRedirectUrl() {
  return chrome.identity.getRedirectURL();
}
