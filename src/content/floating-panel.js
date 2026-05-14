(function() {
  'use strict';

  // 避免重复注入
  if (window.__jobTraceFloatingPanelInjected) return;
  window.__jobTraceFloatingPanelInjected = true;

  let panel = null;
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;

  // 创建悬浮面板
  function createFloatingPanel() {
    const container = document.createElement('div');
    container.id = 'job-trace-floating-container';
    container.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
    `;

    // 加载 HTML 内容
    fetch(chrome.runtime.getURL('src/content/floating-panel.html'))
      .then(res => res.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 提取 style 标签
        const styleElement = doc.querySelector('style');
        if (styleElement) {
          document.head.appendChild(styleElement.cloneNode(true));
        }

        // 提取 body 内容
        const panelContent = doc.body.innerHTML;
        container.innerHTML = panelContent;

        document.body.appendChild(container);
        panel = container.querySelector('.floating-panel');

        initializePanel();
      });
  }

  function initializePanel() {
    const header = document.getElementById('panelHeader');
    const toggleBtn = document.getElementById('toggleBtn');
    const closeBtn = document.getElementById('closeBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const captureBtn = document.getElementById('captureBtn');
    const submitBtn = document.getElementById('submitBtn');
    const appliedDateInput = document.getElementById('appliedDate');

    // 设置默认日期
    appliedDateInput.value = formatLocalDate(new Date());

    // 恢复表单数据
    restoreFormData();

    // 拖拽功能
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // 折叠/展开
    toggleBtn.addEventListener('click', togglePanel);

    // 关闭面板
    closeBtn.addEventListener('click', () => {
      panel.parentElement.style.display = 'none';
    });

    // 打开设置页
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' });
    });

    // 抓取信息
    captureBtn.addEventListener('click', captureJobInfo);

    // 提交到飞书
    submitBtn.addEventListener('click', submitToFeishu);

    // 监听来自 background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SHOW_FLOATING_PANEL') {
        const container = panel.parentElement;
        container.style.display = 'block';
        panel.classList.remove('panel-collapsed');
        sendResponse?.({ ok: true });
        return true;
      }

      if (message.type === 'TOGGLE_FLOATING_PANEL') {
        const container = panel.parentElement;
        if (container.style.display === 'none') {
          container.style.display = 'block';
          panel.classList.remove('panel-collapsed');
        } else {
          container.style.display = 'none';
        }
        sendResponse?.({ ok: true });
        return true;
      }
    });
  }

  function dragStart(e) {
    if (e.target.closest('.panel-btn')) return;

    isDragging = true;
    initialX = e.clientX - currentX;
    initialY = e.clientY - currentY;
    panel.parentElement.style.cursor = 'grabbing';
  }

  function drag(e) {
    if (!isDragging) return;

    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;

    const container = panel.parentElement;
    const maxX = window.innerWidth - container.offsetWidth;
    const maxY = window.innerHeight - container.offsetHeight;

    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));

    container.style.left = currentX + 'px';
    container.style.top = currentY + 'px';
    container.style.right = 'auto';
  }

  function dragEnd() {
    isDragging = false;
    if (panel) {
      panel.parentElement.style.cursor = 'default';
    }
  }

  function togglePanel() {
    panel.classList.toggle('panel-collapsed');
    const toggleBtn = document.getElementById('toggleBtn');
    toggleBtn.textContent = panel.classList.contains('panel-collapsed') ? '+' : '−';
  }

  async function captureJobInfo() {
    setStatus('正在分析当前页面...', 'idle');
    setLoadingState(true);

    try {
      // 调用原有的抓取逻辑
      const response = await chrome.runtime.sendMessage({
        type: 'EXTRACT_JOB_DATA_FROM_PAGE'
      });

      if (!response?.ok) {
        throw new Error(response?.error || '抓取失败');
      }

      fillForm(response.data);
      setStatus('抓取完成，请检查信息后写入飞书', 'success');
    } catch (error) {
      setStatus(error.message || '抓取失败', 'error');
    } finally {
      setLoadingState(false);
    }
  }

  async function submitToFeishu() {
    const form = document.getElementById('jobForm');
    if (!form.reportValidity()) return;

    setStatus('正在写入飞书多维表格...', 'idle');
    setLoadingState(true);

    try {
      const payload = collectFormData();
      const response = await chrome.runtime.sendMessage({
        type: 'SUBMIT_RECORD',
        payload: payload
      });

      if (!response?.ok) {
        throw new Error(response?.error || '写入失败');
      }

      const message = response.data?.recordId
        ? `写入成功，记录 ID：${response.data.recordId}`
        : '写入成功';
      setStatus(message, 'success');

      // 清除保存的表单数据
      clearFormData();

      // 清空表单
      form.reset();
      document.getElementById('appliedDate').value = formatLocalDate(new Date());
    } catch (error) {
      setStatus(error.message || '写入失败', 'error');
    } finally {
      setLoadingState(false);
    }
  }

  function fillForm(data) {
    document.getElementById('company').value = data.company || '';
    document.getElementById('title').value = data.title || '';
    document.getElementById('location').value = data.location || '';
    document.getElementById('platform').value = data.platform || '';
    document.getElementById('jobUrl').value = data.jobUrl || '';
    document.getElementById('deliveryMethod').value = data.deliveryMethod || '官网';
    document.getElementById('status').value = data.status || '已投递';
    document.getElementById('appliedDate').value = data.appliedDate || formatLocalDate(new Date());
    document.getElementById('notes').value = data.notes || '';
  }

  function collectFormData() {
    const data = {
      company: document.getElementById('company').value.trim(),
      title: document.getElementById('title').value.trim(),
      location: document.getElementById('location').value.trim(),
      platform: document.getElementById('platform').value.trim(),
      jobUrl: document.getElementById('jobUrl').value.trim(),
      deliveryMethod: document.getElementById('deliveryMethod').value.trim(),
      status: document.getElementById('status').value.trim(),
      appliedDate: document.getElementById('appliedDate').value,
      notes: document.getElementById('notes').value.trim()
    };

    saveFormData(data);
    return data;
  }

  function saveFormData(data) {
    try {
      localStorage.setItem('jobTraceFormData', JSON.stringify(data));
    } catch (error) {
      console.error('保存表单数据失败:', error);
    }
  }

  function restoreFormData() {
    try {
      const saved = localStorage.getItem('jobTraceFormData');
      if (saved) {
        const data = JSON.parse(saved);
        fillForm(data);
      }
    } catch (error) {
      console.error('恢复表单数据失败:', error);
    }
  }

  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function clearFormData() {
    try {
      localStorage.removeItem('jobTraceFormData');
    } catch (error) {
      console.error('清除表单数据失败:', error);
    }
  }

  function setStatus(message, type) {
    const banner = document.getElementById('statusBanner');
    banner.textContent = message;
    banner.className = `status-banner status-${type} show`;

    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        banner.classList.remove('show');
      }, 5000);
    }
  }

  function setLoadingState(isLoading) {
    document.getElementById('captureBtn').disabled = isLoading;
    document.getElementById('submitBtn').disabled = isLoading;
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingPanel);
  } else {
    createFloatingPanel();
  }
})();
