(function () {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "EXTRACT_JOB_DATA") {
      return false;
    }

    extractJobData()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "页面解析失败" }));

    return true;
  });

  async function extractJobData() {
    // 排除悬浮窗的内容
    const floatingPanel = document.getElementById('job-trace-floating-container');
    if (floatingPanel) {
      floatingPanel.style.display = 'none';
    }

    const jsonLd = extractJobPostingFromJsonLd();
    const meta = extractMeta();
    const headings = collectHeadings();
    const bodyText = normalizeText(document.body?.innerText || "");
    const lines = collectVisibleLines();
    const hostname = location.hostname.replace(/^www\./, "");

    // 恢复悬浮窗显示
    if (floatingPanel) {
      floatingPanel.style.display = 'block';
    }

    const domData = extractFromSemanticDOM();
    const semanticData = extractSemanticJobData(lines, headings, bodyText, hostname, meta);
    const siteData = await extractSiteEnhancedData(hostname, bodyText, headings, lines);

    // 职位名称：优先使用站点特定提取
    const title = firstNonEmpty(
      siteData.title,
      jsonLd.title,
      domData.title,
      semanticData.title,
      extractTitleFromVisibleContent(headings, bodyText),
      meta.ogTitle,
      headings[0],
      cleanDocumentTitle(document.title)
    );

    // 优先使用域名匹配公司名称
    const companyFromDomain = /zhipin\.com$/i.test(hostname) ? "" : getCompanyNameFromUrl(location.href);
    const company = firstNonEmpty(
      siteData.company,
      domData.company,
      jsonLd.company,
      semanticData.company,
      meta.siteName,
      guessCompanyFromPage(),
      guessCompanyFromDomain(hostname),
      companyFromDomain,
      guessCompanyFromTitle(document.title)
    );

    // 工作地点：优先使用站点特定提取
    const locationText = firstNonEmpty(
      siteData.location,
      jsonLd.location,
      domData.location,
      semanticData.location,
      extractLocationByKeywords(bodyText),
      guessLocation(bodyText)
    );

    const fullDescription = firstNonEmpty(
      siteData.description,
      jsonLd.description,
      extractJobDescription(bodyText),
      extractFullJobDescription(bodyText)
    );

    const confidence = calculateConfidence({
      title,
      company,
      location: locationText,
      fromJsonLd: Boolean(jsonLd.found),
      fromDOM: Boolean(domData.title || domData.company),
      fromSemantic: Boolean(semanticData.title || semanticData.company || semanticData.location)
    });

    return {
      company,
      title,
      location: locationText,
      platform: siteData.platform || hostname,
      jobUrl: location.href,
      notes: fullDescription,
      status: "已投递",
      appliedDate: formatLocalDate(new Date()),
      deliveryMethod: inferDeliveryMethod(hostname),
      captureTime: new Date().toISOString(),
      confidence,
      descriptionSnippet: fullDescription.slice(0, 500)
    };
  }

  function extractFromSemanticDOM() {
    const titleSelectors = [
      '[class*="jobTitle"]',
      '[class*="job-title"]',
      '[class*="job_title"]',
      '[class*="position-title"]',
      '[class*="positionTitle"]',
      '[class*="position-name"]',
      '[class*="positionName"]',
      '[id*="jobTitle"]',
      '[id*="job-title"]',
      '[data-job-title]',
      '[data-testid*="job-title"]',
      '[data-testid*="jobTitle"]',
      'h1[class*="title"]',
      'h1[class*="name"]',
      'h1'
    ];

    const companySelectors = [
      '[class*="companyName"]',
      '[class*="company-name"]',
      '[class*="company_name"]',
      '[class*="employer"]',
      '[id*="companyName"]',
      '[id*="company-name"]',
      '[data-company]',
      '[data-company-name]',
      '[data-testid*="company"]'
    ];

    const locationSelectors = [
      '[class*="location"]',
      '[class*="jobLocation"]',
      '[class*="job-location"]',
      '[class*="workLocation"]',
      '[class*="work-location"]',
      '[class*="city"]',
      '[id*="location"]',
      '[data-location]',
      '[data-testid*="location"]'
    ];

    return {
      title: findBestMatch(titleSelectors, isLikelyJobTitle),
      company: findBestMatch(companySelectors, isLikelyCompany),
      location: findBestMatch(locationSelectors, (text) => text.length >= 2 && text.length <= 50)
    };
  }

  function findBestMatch(selectors, validator) {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = normalizeText(element.innerText || element.textContent || "");
          if (text && validator(text)) {
            return text;
          }
        }
      } catch (_error) {
        continue;
      }
    }
    return "";
  }

  function extractSemanticJobData(lines, headings, bodyText, hostname, meta) {
    const anchorIndex = findPrimaryAnchorIndex(lines);
    const nearbyLines = getNearbyLines(lines, anchorIndex, 10);

    return {
      title: pickBestTitleCandidate(lines, headings, anchorIndex, bodyText),
      company: firstNonEmpty(
        extractFieldByKeywords(bodyText, ["公司", "雇主", "Employer", "Hiring Organization"]),
        extractCompanyFromLines(nearbyLines),
        guessCompanyFromPage(),
        guessCompanyFromDomain(hostname),
        meta.siteName
      ),
      location: firstNonEmpty(
        extractFieldByKeywords(bodyText, ["工作地点", "办公地点", "地点", "城市", "Location"]),
        extractLocationFromLines(nearbyLines),
        guessLocation(bodyText)
      ),
      description: extractDescriptionSnippet(lines, anchorIndex)
    };
  }

  async function extractSiteEnhancedData(hostname, bodyText, headings, lines) {
    if (/jobs\.bilibili\.com$/i.test(hostname)) {
      return extractBilibiliJobData(lines);
    }

    if (/zhipin\.com$/i.test(hostname)) {
      return extractBossJobData(lines, headings);
    }

    if (/join\.qq\.com$/i.test(hostname)) {
      return extractTencentJobData(bodyText, headings, lines);
    }

    if (/jobs\.bytedance\.com$/i.test(hostname)) {
      return extractByteDanceJobData(lines, headings);
    }

    if (/job\.xiaohongshu\.com$/i.test(hostname)) {
      return extractXiaohongshuJobData(lines, headings);
    }

    return {};
  }

  function extractBilibiliJobData(lines) {
    return {
      company: "哔哩哔哩",
      title: extractBilibiliTitle(lines),
      location: extractBilibiliLocation(lines),
      platform: "jobs.bilibili.com",
      description: extractBilibiliDescription()
    };
  }

  function extractBilibiliTitle(lines) {
    const domTitle = cleanGenericJobTitle(extractFirstText(".position-title"));
    if (domTitle && isLikelyJobTitle(domTitle)) return domTitle;

    return lines
      .map(cleanGenericJobTitle)
      .find((line) => isLikelyJobTitle(line) && !isLikelyNavigationTitle(line)) || "";
  }

  function extractBilibiliLocation(lines) {
    const tags = Array.from(document.querySelectorAll(".position-header .bili-infotags span, .position-header span"))
      .map((element) => normalizeText(element.innerText || element.textContent || ""))
      .filter(Boolean);

    const tagLocation = tags.find(isKnownLocationLine);
    if (tagLocation) return tagLocation;

    const title = extractBilibiliTitle(lines);
    const titleIndex = title ? lines.findIndex((line) => normalizeText(line).includes(title)) : -1;
    const nearbyLines = titleIndex >= 0 ? lines.slice(titleIndex + 1, titleIndex + 8) : lines.slice(0, 20);

    return nearbyLines.find(isKnownLocationLine) || "";
  }

  function extractBilibiliDescription() {
    const sectionTitles = Array.from(document.querySelectorAll(".position-sub-title"));
    const parts = [];

    for (const titleElement of sectionTitles) {
      const title = normalizeText(titleElement.innerText || titleElement.textContent || "");
      if (!/^(部门介绍|职位亮点|职位描述)$/.test(title)) continue;

      const contentElement = titleElement.nextElementSibling;
      const content = normalizeMultilineText(contentElement?.innerText || contentElement?.textContent || "");
      if (content) {
        parts.push(`${title}：\n${content}`);
      }
    }

    if (parts.length) return parts.join("\n\n");

    const desc = normalizeMultilineText(extractFirstText(".position-desc"));
    return desc;
  }

  function extractBossJobData(lines, headings) {
    return {
      company: extractBossCompany(lines),
      title: extractBossTitle(headings),
      location: extractBossLocation(lines),
      platform: "zhipin.com",
      description: extractBossDescription(lines)
    };
  }

  function extractBossTitle(headings) {
    const selectors = [
      ".job-title",
      ".job-primary .name",
      ".job-info h1",
      ".name h1",
      "h1"
    ];

    for (const selector of selectors) {
      const title = cleanGenericJobTitle(extractFirstText(selector));
      if (title && isLikelyJobTitle(title)) return title;
    }

    return headings
      .map(cleanGenericJobTitle)
      .find((value) => isLikelyJobTitle(value) && !isLikelyNavigationTitle(value)) || "";
  }

  function extractBossCompany(lines) {
    const selectors = [
      ".sider-company .company-info a",
      ".sider-company .company-name",
      ".job-detail-company .company-name",
      ".company-info .company-name",
      ".company-info a[href*='/gongsi/']",
      ".job-company-info .company-name",
      ".detail-company-name",
      "a[href*='/gongsi/']"
    ];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const element of elements) {
        const company = cleanBossCompanyName(element.innerText || element.textContent || "");
        if (company) return company;
      }
    }

    const companyInfoIndex = lines.findIndex((line) => line === "公司基本信息");
    if (companyInfoIndex >= 0) {
      for (const line of lines.slice(companyInfoIndex + 1, companyInfoIndex + 8)) {
        const company = cleanBossCompanyName(line);
        if (company) return company;
      }
    }

    return "";
  }

  function cleanBossCompanyName(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .find((line) => {
        return line.length >= 2 &&
          line.length <= 40 &&
          !/^(公司基本信息|查看全部职位|BOSS直聘|Boss直聘|D轮及以上|上市公司|未融资|不需要融资|天使轮|A轮|B轮|C轮|10000人以上|互联网)$/.test(line) &&
          !/人以上|人$/.test(line);
      }) || "";
  }

  function extractBossLocation(lines) {
    const title = extractBossTitle(collectHeadings());
    const titleIndex = title ? lines.findIndex((line) => normalizeText(line).includes(title)) : -1;
    const nearbyLines = titleIndex >= 0 ? lines.slice(titleIndex, titleIndex + 8) : lines.slice(0, 20);

    return nearbyLines
      .map((line) => normalizeText(line).match(/(北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|珠海|厦门|青岛|郑州|长沙|天津|重庆|香港|新加坡)/))
      .find(Boolean)?.[1] || "";
  }

  function extractBossDescription(lines) {
    const selectors = [
      ".job-detail-section .job-sec-text",
      ".job-sec-text",
      ".job-description",
      ".job-detail"
    ];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const element of elements) {
        const text = cleanBossDescriptionText(element.innerText || element.textContent || "");
        if (text.length >= 20) return text;
      }
    }

    const descIndex = lines.findIndex((line) => /^(职位描述|岗位描述)$/.test(line));
    if (descIndex < 0) return "";

    const endIndex = lines
      .slice(descIndex + 1)
      .findIndex((line) => /^(.*(先生|女士)|刚刚活跃|今日活跃|本周活跃|公司基本信息|微信扫码分享|举报|查看全部职位)$/.test(line));
    const sectionEnd = endIndex >= 0 ? descIndex + 1 + endIndex : Math.min(lines.length, descIndex + 30);

    return cleanBossDescriptionText(lines.slice(descIndex + 1, sectionEnd).join("\n"));
  }

  function cleanBossDescriptionText(text) {
    const stopPattern = /(\n|^)(.*(先生|女士)|刚刚活跃|今日活跃|本周活跃|公司基本信息|微信扫码分享|举报|查看全部职位)(\n|$)[\s\S]*$/;
    return normalizeMultilineText(String(text || "").replace(stopPattern, "\n"));
  }

  function extractTencentJobData(bodyText, headings, lines) {
    return {
      company: "腾讯",
      title: extractTencentTitleFromText(lines, headings),
      location: extractTencentLocationFromLines(lines) || extractTencentLocationFromText(bodyText),
      platform: "join.qq.com"
    };
  }

  function extractTencentTitleFromText(lines, headings) {
    const titleFromHeading = headings.find(isLikelyJobTitle);
    if (titleFromHeading) return titleFromHeading;

    const titleLine = lines.find((line) => isLikelyJobTitle(line) && !isLikelyNavigationTitle(line));
    return titleLine || cleanDocumentTitle(document.title);
  }

  function extractTencentLocationFromLines(lines) {
    const locationIndex = lines.findIndex((line) => /^工作地点$|^工作地点[:：]/.test(line));
    if (locationIndex < 0) return "";

    const values = [];
    for (const line of lines.slice(locationIndex, locationIndex + 8)) {
      if (/^(岗位描述|岗位要求|职位描述|职位要求|投递简历|招聘部门|参加面试的城市)/.test(line)) {
        break;
      }

      const cleaned = normalizeText(line.replace(/^工作地点[:：]?/, ""));
      if (!cleaned) continue;
      values.push(...splitLocationValues(cleaned));
    }

    return unique(values.filter(isLikelyLocationValue)).join("，");
  }

  function extractTencentLocationFromText(bodyText) {
    const match = bodyText.match(/工作地点[：:\s]*([\s\S]*?)(?=岗位描述|岗位要求|投递简历|$)/);
    if (!match) return "";

    return unique(splitLocationValues(match[1]).filter(isLikelyLocationValue)).join("，");
  }

  function splitLocationValues(text) {
    return normalizeText(text)
      .split(/[\s,，、/]+/)
      .map(normalizeText)
      .filter(Boolean);
  }

  function extractByteDanceJobData(lines, headings) {
    return {
      company: "字节跳动",
      title: extractByteDanceTitle(lines, headings),
      location: extractByteDanceLocation(lines),
      platform: "jobs.bytedance.com",
      description: extractByteDanceDescription(lines)
    };
  }

  function extractByteDanceTitle(lines, headings) {
    const domTitle = extractFirstText(".job-title");
    if (domTitle && isLikelyJobTitle(domTitle)) return cleanByteDanceTitle(domTitle);

    const headingTitle = headings
      .map(cleanByteDanceTitle)
      .find((value) => isLikelyJobTitle(value) && !isLikelyNavigationTitle(value));
    if (headingTitle) return headingTitle;

    const idIndex = lines.findIndex((line) => /^职位\s*ID[:：]/i.test(line));
    const searchStart = idIndex >= 0 ? Math.max(0, idIndex - 8) : 0;
    const searchEnd = idIndex >= 0 ? idIndex : Math.min(lines.length, 20);

    return lines
      .slice(searchStart, searchEnd)
      .map(cleanByteDanceTitle)
      .find((line) => isLikelyJobTitle(line) && !isLikelyNavigationTitle(line)) || "";
  }

  function extractByteDanceLocation(lines) {
    const title = extractFirstText(".job-title");
    const titleIndex = title ? lines.findIndex((line) => normalizeText(line) === normalizeText(title)) : -1;
    const idIndex = lines.findIndex((line) => /^职位\s*ID[:：]/i.test(line));
    const start = titleIndex >= 0 ? titleIndex + 1 : Math.max(0, idIndex - 6);
    const end = idIndex >= 0 ? idIndex : Math.min(lines.length, start + 6);

    return lines
      .slice(start, end)
      .map(normalizeText)
      .find(isKnownLocationLine) || "";
  }

  function extractByteDanceDescription(lines) {
    const description = extractSectionFromLines(lines, /^职位描述$/, /^职位要求$/);
    const requirement = extractSectionFromLines(lines, /^职位要求$/, /^(投递|相关职位|联系我们)/);
    const parts = [];

    if (description) {
      parts.push("职位描述：\n" + description);
    }
    if (requirement) {
      parts.push("职位要求：\n" + requirement);
    }

    return parts.join("\n\n");
  }

  function extractXiaohongshuJobData(lines, headings) {
    return {
      company: "小红书",
      title: extractXiaohongshuTitle(lines, headings),
      location: extractXiaohongshuLocation(lines),
      platform: "job.xiaohongshu.com",
      description: extractXiaohongshuDescription(lines)
    };
  }

  function extractXiaohongshuTitle(lines, headings) {
    const headingTitle = headings.find(isLikelyJobTitle);
    if (headingTitle) return headingTitle;

    const listIndex = lines.findIndex((line) => line === "职位列表");
    const detailIndex = lines.findIndex((line) => /^职位类型[:：]/.test(line));
    const searchStart = listIndex >= 0 ? listIndex + 1 : 0;
    const searchEnd = detailIndex > searchStart ? detailIndex : Math.min(searchStart + 6, lines.length);

    return lines
      .slice(searchStart, searchEnd)
      .find((line) => isLikelyJobTitle(line) && !isLikelyNavigationTitle(line)) || "";
  }

  function extractXiaohongshuLocation(lines) {
    const locationLine = lines.find((line) => /^工作地点[:：]/.test(line));
    if (!locationLine) return "";

    return normalizeText(locationLine.replace(/^工作地点[:：]\s*/, ""));
  }

  function extractXiaohongshuDescription(lines) {
    const responsibility = extractSectionFromLines(lines, /^工作职责$/, /^(任职资格|任职要求)$/);
    const requirement = extractSectionFromLines(lines, /^(任职资格|任职要求)$/, /^(关于我们|投递简历|职位列表)$/);
    const parts = [];

    if (responsibility) {
      parts.push("工作职责：\n" + responsibility);
    }
    if (requirement) {
      parts.push("任职资格：\n" + requirement);
    }

    return parts.join("\n\n");
  }

  function extractSectionFromLines(lines, startPattern, endPattern) {
    const startIndex = lines.findIndex((line) => startPattern.test(line));
    if (startIndex < 0) return "";

    const values = [];
    for (const line of lines.slice(startIndex + 1)) {
      if (endPattern.test(line)) break;
      values.push(line);
    }

    return values.map(normalizeText).filter(Boolean).join("\n");
  }

  function extractJobPostingFromJsonLd() {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        const jobPosting = findJobPosting(data);

        if (!jobPosting) {
          continue;
        }

        return {
          found: true,
          title: normalizeText(jobPosting.title || ""),
          company: normalizeText(
            jobPosting.hiringOrganization?.name ||
              jobPosting.organization?.name ||
              ""
          ),
          location: normalizeText(parseJobLocation(jobPosting.jobLocation)),
          description: normalizeText(stripHtml(jobPosting.description || ""))
        };
      } catch (_error) {
        continue;
      }
    }

    return {
      found: false,
      title: "",
      company: "",
      location: "",
      description: ""
    };
  }

  function findJobPosting(value) {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findJobPosting(item);
        if (found) {
          return found;
        }
      }
      return null;
    }

    if (typeof value !== "object") {
      return null;
    }

    const type = value["@type"];
    const graph = value["@graph"];

    if (
      type === "JobPosting" ||
      (Array.isArray(type) && type.includes("JobPosting"))
    ) {
      return value;
    }

    if (graph) {
      return findJobPosting(graph);
    }

    for (const nested of Object.values(value)) {
      const found = findJobPosting(nested);
      if (found) {
        return found;
      }
    }

    return null;
  }

  function extractMeta() {
    return {
      ogTitle: getMetaContent('meta[property="og:title"]'),
      siteName: firstNonEmpty(
        getMetaContent('meta[property="og:site_name"]'),
        getMetaContent('meta[name="application-name"]')
      )
    };
  }

  function collectHeadings() {
    return Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((element) => normalizeText(element.innerText || ""))
      .filter(Boolean)
      .slice(0, 10);
  }

  function collectVisibleLines() {
    return (document.body?.innerText || "")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .filter((line, index, array) => array.indexOf(line) === index)
      .slice(0, 300);
  }

  function findPrimaryAnchorIndex(lines) {
    const anchorKeywords = [
      "职位描述",
      "岗位职责",
      "职位要求",
      "任职要求",
      "工作地点",
      "职位 ID",
      "申请职位",
      "职位详情"
    ];

    for (let index = 0; index < lines.length; index += 1) {
      if (anchorKeywords.some((keyword) => lines[index].includes(keyword))) {
        return index;
      }
    }

    return 0;
  }

  function getNearbyLines(lines, anchorIndex, radius) {
    const start = Math.max(anchorIndex - radius, 0);
    const end = Math.min(anchorIndex + radius + 1, lines.length);
    return lines.slice(start, end);
  }

  function pickBestTitleCandidate(lines, headings, anchorIndex, bodyText) {
    const candidates = [];
    const nearbyLines = getNearbyLines(lines, anchorIndex, 8);
    const rawCandidates = [...headings, ...nearbyLines, bodyText.slice(0, 180)];

    rawCandidates.forEach((candidate, candidateIndex) => {
      const cleaned = cleanSemanticTitle(candidate);
      const score = scoreTitleCandidate(cleaned, candidateIndex, anchorIndex, lines);

      if (cleaned && score > 0) {
        candidates.push({ value: cleaned, score });
      }
    });

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.value || "";
  }

  function scoreTitleCandidate(value, candidateIndex, anchorIndex, lines) {
    if (!value) {
      return 0;
    }

    let score = 0;

    if (isLikelyJobTitle(value)) score += 60;
    if (isLikelyNavigationTitle(value)) score -= 90;
    if (value.length >= 4 && value.length <= 40) score += 15;
    if (value.length > 60) score -= 30;
    if (/(职位描述|岗位职责|职位要求|任职要求|团队介绍|联系我们)/.test(value)) score -= 60;
    if (/[A-Za-z]+职位搜索|首页技术人才/.test(value)) score -= 80;

    const normalizedValue = normalizeText(value);
    const lineIndex = lines.findIndex((line) => cleanSemanticTitle(line) === normalizedValue);
    if (lineIndex >= 0) {
      const distance = Math.abs(lineIndex - anchorIndex);
      score += Math.max(0, 20 - distance * 2);
    } else {
      score += Math.max(0, 10 - candidateIndex);
    }

    return score;
  }

  function extractTitleFromVisibleContent(headings, bodyText) {
    const selectorCandidates = [
      'h1',
      '[data-testid*="title"]',
      '[class*="title"]',
      '[class*="job"]',
      '[class*="position"]'
    ]
      .map((selector) => extractFirstText(selector))
      .filter(Boolean);

    const textCandidates = [...headings, ...selectorCandidates].map(cleanGenericJobTitle);

    const firstStrongCandidate = textCandidates.find(
      (value) => isLikelyJobTitle(value) && !isLikelyNavigationTitle(value)
    );
    if (firstStrongCandidate) {
      return firstStrongCandidate;
    }

    return cleanGenericJobTitle(
      extractFieldByPattern(bodyText.slice(0, 300), [
        /^(.{2,60}?)(?=职位描述|岗位职责|工作地点|职位要求)/,
        /^(.{2,60}?)(?=北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|Remote)/
      ])
    );
  }

  function guessCompanyFromPage() {
    const selectors = [
      "[data-company]",
      '[class*="company"]',
      '[class*="employer"]',
      '[id*="company"]',
      '[data-testid*="company"]'
    ];

    for (const selector of selectors) {
      const value = extractFirstText(selector);
      if (value && isLikelyCompany(value)) {
        return value;
      }
    }

    const candidates = Array.from(document.querySelectorAll("a, span, div"))
      .map((element) => normalizeText(element.innerText || ""))
      .filter((text) => text.length > 2 && text.length < 50)
      .filter(isLikelyCompany)
      .slice(0, 5);

    return candidates[0] || "";
  }

  function extractCompanyFromLines(lines) {
    const candidates = lines
      .map((line) => normalizeText(line))
      .filter((line) => line.length >= 2 && line.length <= 40)
      .filter(isLikelyCompany);

    return candidates[0] || "";
  }

  function guessCompanyFromDomain(hostname) {
    const companyMap = [
      { pattern: /jobs\.bytedance\.com$/i, company: "字节跳动" },
      { pattern: /linkedin\.com$/i, company: "LinkedIn" }
    ];

    const matched = companyMap.find((item) => item.pattern.test(hostname));
    return matched ? matched.company : "";
  }

  function inferDeliveryMethod(hostname) {
    const rules = [
      { pattern: /zhipin\.com$/i, value: "Boss直聘" },
      { pattern: /lagou\.com$/i, value: "拉勾" },
      { pattern: /linkedin\.com$/i, value: "LinkedIn" },
      { pattern: /liepin\.com$/i, value: "猎聘" },
      { pattern: /51job\.com$/i, value: "前程无忧" },
      { pattern: /zhaopin\.com$/i, value: "智联招聘" },
      { pattern: /jobs\.bytedance\.com$/i, value: "官网" }
    ];

    const matched = rules.find((item) => item.pattern.test(hostname));
    return matched ? matched.value : "官网";
  }

  function guessCompanyFromTitle(title) {
    const cleaned = normalizeText(title);
    const parts = cleaned
      .split(/[-|_·•]/)
      .map((part) => normalizeText(part))
      .filter(Boolean);

    const companyLike = parts.find(isLikelyCompany);
    return companyLike || "";
  }

  function guessLocation(text) {
    const patterns = [
      /(?:工作地点|办公地点|地点|Location)[:：]?\s*([^\n|]{2,30})/i,
      /(?:base|城市)[:：]?\s*([^\n|]{2,30})/i,
      /\b(北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|Remote|Hybrid|Onsite)\b/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return normalizeText(match[1] || match[0]);
      }
    }

    return "";
  }

  function extractLocationFromLines(lines) {
    for (const line of lines) {
      const value = guessLocation(line);
      if (value) {
        return value;
      }
    }

    return "";
  }

  function extractLocationByKeywords(text) {
    // 匹配 "工作地点：xxx" 或 "工作地点 xxx"
    const locationMatch = text.match(/工作地点[：:\s]*([^\n]+?)(?=\n|职位类型|投递|$)/);
    if (locationMatch) {
      const location = normalizeText(locationMatch[1]);
      // 清理掉可能混入的其他内容
      const cleaned = location.split(/[,，]/).map(s => s.trim()).filter(s => {
        return s.length >= 2 &&
               s.length <= 20 &&
               !s.includes('已投递') &&
               !s.includes('查看') &&
               !s.includes('工作职责') &&
               /^[一-龥]+(?:市|省)?$/.test(s); // 只保留中文城市名
      });
      return cleaned.join('，');
    }
    return '';
  }

  function extractJobDescription(bodyText) {
    // 提取工作职责和任职要求
    let description = '';

    const responsibilityMatch = bodyText.match(/工作职责[：:\s]*\n([\s\S]*?)(?=\n任职要求|\n工作地点|\n职位类型|$)/);
    const requirementMatch = bodyText.match(/任职要求[：:\s]*\n([\s\S]*?)(?=\n工作地点|\n职位类型|\n投递|$)/);

    if (responsibilityMatch) {
      const content = normalizeText(responsibilityMatch[1]).trim();
      if (content.length > 10) {
        description += '工作职责：\n' + content + '\n\n';
      }
    }

    if (requirementMatch) {
      const content = normalizeText(requirementMatch[1]).trim();
      if (content.length > 10) {
        description += '任职要求：\n' + content;
      }
    }

    return description.trim();
  }

  function extractFieldByKeywords(text, keywords) {
    for (const keyword of keywords) {
      const escaped = escapeRegExp(keyword);
      const pattern = new RegExp(`${escaped}[:：]?\\s*([^\\n|]{2,40})`, "i");
      const match = text.match(pattern);
      if (match) {
        return normalizeText(match[1] || "");
      }
    }

    return "";
  }

  function extractFieldByPattern(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return normalizeText(match[1] || match[0] || "");
      }
    }

    return "";
  }

  function extractDescriptionSnippet(lines, anchorIndex) {
    if (!lines.length) {
      return "";
    }

    return normalizeText(
      lines
        .slice(anchorIndex, anchorIndex + 8)
        .filter((line) => !/职位描述|岗位职责|职位要求|任职要求/.test(line))
        .join(" ")
        .slice(0, 500)
    );
  }

  function extractFullJobDescription(bodyText) {
    const descriptionSelectors = [
      '[class*="description"]',
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[class*="job_description"]',
      '[id*="description"]',
      '[id*="job-description"]',
      '[data-testid*="description"]'
    ];

    const requirementSelectors = [
      '[class*="requirement"]',
      '[class*="job-requirement"]',
      '[class*="jobRequirement"]',
      '[class*="job_requirement"]',
      '[id*="requirement"]',
      '[id*="job-requirement"]',
      '[data-testid*="requirement"]'
    ];

    let description = "";
    let requirement = "";

    for (const selector of descriptionSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const text = normalizeText(element.innerText || element.textContent || "");
          if (text.length > description.length) {
            description = text;
          }
        }
      } catch (_error) {
        continue;
      }
    }

    for (const selector of requirementSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const text = normalizeText(element.innerText || element.textContent || "");
          if (text.length > requirement.length) {
            requirement = text;
          }
        }
      } catch (_error) {
        continue;
      }
    }

    if (!description && !requirement) {
      const sections = extractDescriptionFromText(bodyText);
      description = sections.description;
      requirement = sections.requirement;
    }

    const parts = [];
    if (description) {
      parts.push("【职位描述】\n" + description);
    }
    if (requirement) {
      parts.push("【职位要求】\n" + requirement);
    }

    return parts.join("\n\n");
  }

  function extractDescriptionFromText(bodyText) {
    const descriptionPattern = /(?:职位描述|岗位职责|工作内容|Job Description|Responsibilities)[:：]?\s*([\s\S]{50,2000}?)(?=职位要求|任职要求|岗位要求|Requirements|Qualifications|工作地点|薪资|福利|$)/i;
    const requirementPattern = /(?:职位要求|任职要求|岗位要求|Requirements|Qualifications)[:：]?\s*([\s\S]{50,2000}?)(?=工作地点|薪资|福利|公司介绍|关于我们|$)/i;

    const descMatch = bodyText.match(descriptionPattern);
    const reqMatch = bodyText.match(requirementPattern);

    return {
      description: descMatch ? normalizeText(descMatch[1]) : "",
      requirement: reqMatch ? normalizeText(reqMatch[1]) : ""
    };
  }

  function calculateConfidence(data) {
    let score = 20;

    if (data.title) score += 30;
    if (data.company) score += 20;
    if (data.location) score += 10;
    if (data.fromJsonLd) score += 20;
    if (data.fromSemantic) score += 10;

    return Math.min(score, 100);
  }

  function parseJobLocation(jobLocation) {
    if (!jobLocation) {
      return "";
    }

    if (Array.isArray(jobLocation)) {
      return jobLocation.map(parseJobLocation).filter(Boolean).join(" / ");
    }

    const address = jobLocation.address || jobLocation;

    if (typeof address === "string") {
      return address;
    }

    return [
      address.addressLocality,
      address.addressRegion,
      address.addressCountry
    ]
      .map((value) => normalizeText(value || ""))
      .filter(Boolean)
      .join(" ");
  }

  function stripHtml(text) {
    const container = document.createElement("div");
    container.innerHTML = text;
    return container.innerText || "";
  }

  function extractFirstText(selector) {
    const element = document.querySelector(selector);
    return normalizeText(element?.innerText || "");
  }

  function getMetaContent(selector) {
    const element = document.querySelector(selector);
    return normalizeText(element?.getAttribute("content") || "");
  }

  function cleanByteDanceTitle(text) {
    let value = normalizeText(text);
    value = value.replace(/^(首页|社会招聘|校园招聘|技术人才|职位搜索)/, "");
    value = value.replace(/职位\s*ID[:：]?\s*[A-Za-z0-9-]+/gi, "");
    value = value.replace(/职位描述.*$/i, "");
    value = value.replace(/ByteIntern.*$/i, "");
    value = value.replace(/\s+/g, " ").trim();

    const cityMatch = value.match(/^(.*?)(北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|珠海|厦门|青岛|郑州|长沙|天津|重庆|香港|新加坡|Remote)/);
    if (cityMatch && isLikelyJobTitle(cityMatch[1])) {
      return normalizeText(cityMatch[1]);
    }

    return cleanGenericJobTitle(value);
  }

  function cleanSemanticTitle(text) {
    let value = cleanGenericJobTitle(text);
    value = value.replace(/ByteIntern/gi, "");
    value = value.replace(/\s+/g, " ").trim();

    const cityTailMatch = value.match(
      /^(.*?)(?=(北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|珠海|厦门|青岛|郑州|长沙|天津|重庆|香港|新加坡|Remote|远程)(实习|全职|社招|校招|研发|技术|产品|设计|运营|市场|职能|销售|算法|后端|前端|客户端|测试|数据|AI|安全|DevOps))/i
    );

    if (cityTailMatch && isLikelyJobTitle(cityTailMatch[1])) {
      value = normalizeText(cityTailMatch[1]);
    }

    value = value.replace(/\s+-\s+(研发|技术|产品|设计|运营|市场|职能|销售).*$/i, "");
    return normalizeText(value);
  }

  function cleanGenericJobTitle(text) {
    let value = normalizeText(text);
    value = value.replace(/^(首页|社会招聘|校园招聘|技术人才|职位搜索)/, "");
    value = value.replace(/职位\s*ID[:：]?\s*[A-Za-z0-9-]+/gi, "");
    value = value.replace(/(职位描述|岗位职责|职位要求|任职要求).*$/i, "");
    value = value.replace(/\s{2,}/g, " ").trim();

    const parts = value
      .split(/[\n|]/)
      .map((part) => normalizeText(part))
      .filter(Boolean);

    return parts[0] || value;
  }

  function cleanDocumentTitle(title) {
    const cleaned = cleanGenericJobTitle(title);
    const parts = cleaned
      .split(/[-|_·•]/)
      .map((part) => normalizeText(part))
      .filter(Boolean);

    return parts[0] || cleaned;
  }

  function firstNonEmpty(...values) {
    return values.find((value) => normalizeText(value || "")) || "";
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function isLikelyCompany(text) {
    return /(公司|集团|科技|网络|软件|信息|有限|Inc|LLC|Ltd|Studio|Labs|Corp)/i.test(text);
  }

  function isLikelyJobTitle(text) {
    const value = normalizeText(text);

    if (!value || value.length < 2 || value.length > 80) {
      return false;
    }

    if (/(登录|注册|搜索|首页|职位描述|职位要求|团队介绍|联系我们)/.test(value)) {
      return false;
    }

    return /(实习|开发|工程师|后端|前端|算法|数据|产品|经理|设计|运营|测试|架构|research|engineer|intern|developer|scientist|analyst|product)/i.test(
      value
    );
  }

  function isLikelyNavigationTitle(text) {
    const value = normalizeText(text);
    return /首页|技术人才|社会招聘|校园招聘|职位搜索|加入我们|关于我们/.test(value);
  }

  function isLikelyLocationValue(text) {
    const value = normalizeText(text);
    return value.length >= 2 &&
      value.length <= 20 &&
      !/(岗位|职位|要求|描述|投递|面试|部门|招聘|方向|类别)/.test(value);
  }

  function isKnownLocationLine(text) {
    return /^(北京|上海|深圳|广州|杭州|成都|武汉|西安|南京|苏州|珠海|厦门|青岛|郑州|长沙|天津|重庆|香港|新加坡|Remote|远程)$/.test(
      normalizeText(text)
    );
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function normalizeMultilineText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .join("\n");
  }

  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
})();
