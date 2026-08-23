(function () {
  const payload = window.EXPORTERS_DATA || { records: [], summary: {} };
  const records = payload.records || [];
  const state = {
    query: "",
    status: "",
    confidence: "",
    contact: "",
    stateName: "",
    industry: "",
    sort: "relevance",
    visible: 80,
    selectedIndex: null,
  };

  const els = {
    sourceName: document.getElementById("sourceName"),
    generatedAt: document.getElementById("generatedAt"),
    metricTotal: document.getElementById("metricTotal"),
    metricFound: document.getElementById("metricFound"),
    metricContact: document.getElementById("metricContact"),
    metricAddress: document.getElementById("metricAddress"),
    metricMissing: document.getElementById("metricMissing"),
    searchInput: document.getElementById("searchInput"),
    clearSearch: document.getElementById("clearSearch"),
    statusFilter: document.getElementById("statusFilter"),
    confidenceFilter: document.getElementById("confidenceFilter"),
    contactFilter: document.getElementById("contactFilter"),
    stateFilter: document.getElementById("stateFilter"),
    industryFilter: document.getElementById("industryFilter"),
    sortSelect: document.getElementById("sortSelect"),
    resetFilters: document.getElementById("resetFilters"),
    exportCsv: document.getElementById("exportCsv"),
    resultsBody: document.getElementById("resultsBody"),
    resultCount: document.getElementById("resultCount"),
    activeFilters: document.getElementById("activeFilters"),
    emptyState: document.getElementById("emptyState"),
    loadMore: document.getElementById("loadMore"),
    detailCard: document.getElementById("detailCard"),
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9@._:/+-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString("zh-CN");
  }

  function text(record, key) {
    return String(record[key] || "").trim();
  }

  function splitIndustries(record) {
    return text(record, "行业描述（中文，合并）")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function statusClass(value) {
    if (value === "已找到") return "found";
    if (value === "需复核") return "review";
    if (value === "未找到") return "missing";
    return "neutral";
  }

  function hasContact(record) {
    return Boolean(text(record, "官网") || text(record, "电话") || text(record, "邮箱"));
  }

  function queryScore(record) {
    const raw = state.query.trim();
    if (!raw) return 0;
    const tokens = normalize(raw).split(" ").filter(Boolean);
    if (!tokens.length) return 0;

    let score = 0;
    const rfc = normalize(text(record, "RFC（税务登记号）"));
    const company = normalize(text(record, "企业名称（原文）"));
    const normalizedName = normalize(text(record, "标准化企业名（查询关键词）"));
    const email = normalize(text(record, "邮箱"));
    const phone = normalize(text(record, "电话"));
    const haystack = record._search || normalize(Object.values(record).join(" "));

    for (const token of tokens) {
      if (!haystack.includes(token)) return -1;
      if (rfc.includes(token)) score += 70;
      if (normalizedName.includes(token)) score += 55;
      if (company.includes(token)) score += 45;
      if (email.includes(token)) score += 35;
      if (phone.includes(token)) score += 30;
      score += 5;
    }

    if (normalizedName === normalize(raw) || company === normalize(raw)) score += 90;
    return score;
  }

  function matchesFilters(record, skip = "") {
    if (skip !== "query" && state.query && queryScore(record) < 0) return false;
    if (skip !== "status" && state.status && text(record, "查询状态") !== state.status) return false;
    if (skip !== "confidence" && state.confidence && text(record, "匹配置信度") !== state.confidence) {
      return false;
    }
    if (skip !== "contact" && state.contact && text(record, "联系方式状态") !== state.contact) return false;
    if (skip !== "state" && state.stateName && text(record, "州") !== state.stateName) return false;
    if (skip !== "industry" && state.industry && !splitIndustries(record).includes(state.industry)) return false;
    return true;
  }

  function filteredRecords(skip = "") {
    return records
      .map((record, index) => ({ record, index, score: queryScore(record) }))
      .filter((item) => matchesFilters(item.record, skip));
  }

  function sortRecords(items) {
    const statusRank = { 已找到: 0, 需复核: 1, 未找到: 2 };
    const confidenceRank = { 高: 0, 中: 1, 低: 2, "": 3 };
    const sorters = {
      relevance: (a, b) =>
        b.score - a.score ||
        (statusRank[text(a.record, "查询状态")] ?? 9) - (statusRank[text(b.record, "查询状态")] ?? 9) ||
        text(a.record, "企业名称（原文）").localeCompare(text(b.record, "企业名称（原文）"), "zh-Hans-CN"),
      status: (a, b) =>
        (statusRank[text(a.record, "查询状态")] ?? 9) - (statusRank[text(b.record, "查询状态")] ?? 9),
      confidence: (a, b) =>
        (confidenceRank[text(a.record, "匹配置信度")] ?? 9) -
        (confidenceRank[text(b.record, "匹配置信度")] ?? 9),
      name: (a, b) => text(a.record, "企业名称（原文）").localeCompare(text(b.record, "企业名称（原文）"), "zh-Hans-CN"),
      date: (a, b) => text(b.record, "最晚登记日期").localeCompare(text(a.record, "最晚登记日期")),
    };
    return items.sort(sorters[state.sort] || sorters.relevance);
  }

  function countOptions(items, getter) {
    const counts = new Map();
    for (const item of items) {
      const values = getter(item.record);
      for (const value of values) {
        if (!value) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"));
  }

  function setOptions(select, label, value, options) {
    const current = value;
    const hasCurrent = !current || options.some(([optionValue]) => optionValue === current);
    select.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = `全部${label}`;
    select.appendChild(first);
    if (current && !hasCurrent) {
      const option = document.createElement("option");
      option.value = current;
      option.textContent = `${current} (0)`;
      select.appendChild(option);
    }
    for (const [optionValue, count] of options) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = `${optionValue} (${fmt(count)})`;
      select.appendChild(option);
    }
    select.value = current;
  }

  function updateFilterOptions() {
    setOptions(
      els.statusFilter,
      "状态",
      state.status,
      countOptions(filteredRecords("status"), (record) => [text(record, "查询状态") || "空白"]),
    );
    setOptions(
      els.confidenceFilter,
      "置信度",
      state.confidence,
      countOptions(filteredRecords("confidence"), (record) => [text(record, "匹配置信度") || "空白"]),
    );
    setOptions(
      els.contactFilter,
      "联系方式",
      state.contact,
      countOptions(filteredRecords("contact"), (record) => [text(record, "联系方式状态")]),
    );
    setOptions(
      els.stateFilter,
      "州",
      state.stateName,
      countOptions(filteredRecords("state"), (record) => [text(record, "州") || "未知"]),
    );
    setOptions(
      els.industryFilter,
      "行业",
      state.industry,
      countOptions(filteredRecords("industry"), splitIndustries),
    );
  }

  function renderMetrics(items) {
    const found = items.filter((item) => text(item.record, "查询状态") === "已找到").length;
    const missing = items.filter((item) => text(item.record, "查询状态") === "未找到").length;
    const contact = items.filter((item) => hasContact(item.record)).length;
    const address = items.filter((item) => text(item.record, "地址")).length;
    els.metricTotal.textContent = fmt(items.length);
    els.metricFound.textContent = fmt(found);
    els.metricContact.textContent = fmt(contact);
    els.metricAddress.textContent = fmt(address);
    els.metricMissing.textContent = fmt(missing);
  }

  function contactHtml(record) {
    const rows = [];
    if (text(record, "官网")) rows.push(`<a href="${escapeAttr(toUrl(text(record, "官网")))}" target="_blank" rel="noreferrer">${escapeHtml(text(record, "官网"))}</a>`);
    if (text(record, "电话")) rows.push(`<span>${escapeHtml(text(record, "电话"))}</span>`);
    if (text(record, "邮箱")) rows.push(`<a href="mailto:${escapeAttr(text(record, "邮箱"))}">${escapeHtml(text(record, "邮箱"))}</a>`);
    if (!rows.length && text(record, "地址")) rows.push("<span>仅地址</span>");
    if (!rows.length) rows.push("<span class=\"muted\">无公开联系方式</span>");
    return rows.join("");
  }

  function toUrl(value) {
    const v = String(value || "").trim();
    if (!v) return "#";
    if (/^https?:\/\//i.test(v)) return v;
    return `https://${v}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function renderRows(items) {
    const visibleItems = items.slice(0, state.visible);
    els.resultsBody.innerHTML = visibleItems
      .map(({ record, index }) => {
        const status = text(record, "查询状态") || "空白";
        const confidence = text(record, "匹配置信度") || "空白";
        const industry = splitIndustries(record).slice(0, 3).join("；");
        return `
          <tr>
            <td class="company-cell">
              <strong>${escapeHtml(text(record, "企业名称（原文）") || "未命名企业")}</strong>
              <small>${escapeHtml(text(record, "标准化企业名（查询关键词）"))}</small>
            </td>
            <td>${escapeHtml(text(record, "RFC（税务登记号）"))}</td>
            <td class="industry-cell">${escapeHtml(industry || text(record, "行业代码（合并）"))}</td>
            <td class="region-cell">${escapeHtml(text(record, "城市/州") || text(record, "州"))}</td>
            <td><div class="contact-stack">${contactHtml(record)}</div></td>
            <td><span class="badge ${statusClass(status)}">${escapeHtml(status)}</span></td>
            <td><span class="badge neutral">${escapeHtml(confidence)}</span></td>
            <td class="row-actions"><button type="button" data-view="${index}">查看</button></td>
          </tr>
        `;
      })
      .join("");
    els.emptyState.hidden = items.length !== 0;
    els.loadMore.hidden = state.visible >= items.length;
    els.resultCount.textContent = `${fmt(items.length)} 条结果`;
  }

  function renderActiveFilters() {
    const chips = [];
    if (state.query) chips.push(`搜索: ${state.query}`);
    if (state.status) chips.push(`状态: ${state.status}`);
    if (state.confidence) chips.push(`置信度: ${state.confidence}`);
    if (state.contact) chips.push(`联系方式: ${state.contact}`);
    if (state.stateName) chips.push(`州: ${state.stateName}`);
    if (state.industry) chips.push(`行业: ${state.industry}`);
    els.activeFilters.innerHTML = chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");
  }

  function field(label, value, linkType = "") {
    const v = String(value || "").trim();
    let body = v ? escapeHtml(v) : '<span class="muted">空</span>';
    if (v && linkType === "url") body = `<a href="${escapeAttr(toUrl(v))}" target="_blank" rel="noreferrer">${escapeHtml(v)}</a>`;
    if (v && linkType === "email") body = `<a href="mailto:${escapeAttr(v)}">${escapeHtml(v)}</a>`;
    return `<div class="field"><span>${escapeHtml(label)}</span><div>${body}</div></div>`;
  }

  function renderDetail(record) {
    if (!record) return;
    const status = text(record, "查询状态") || "空白";
    const confidence = text(record, "匹配置信度") || "空白";
    els.detailCard.innerHTML = `
      <div class="detail-title">
        <p class="eyebrow">Company Detail</p>
        <h2>${escapeHtml(text(record, "企业名称（原文）") || "未命名企业")}</h2>
        <div>
          <span class="badge ${statusClass(status)}">${escapeHtml(status)}</span>
          <span class="badge neutral">${escapeHtml(confidence)}</span>
        </div>
      </div>
      <div class="field-list">
        ${field("RFC", text(record, "RFC（税务登记号）"))}
        ${field("行业", text(record, "行业描述（中文，合并）"))}
        ${field("官网", text(record, "官网"), "url")}
        ${field("电话", text(record, "电话"))}
        ${field("邮箱", text(record, "邮箱"), "email")}
        ${field("地址", text(record, "地址"))}
        ${field("城市/州", text(record, "城市/州"))}
        ${field("来源链接", text(record, "来源链接"), "url")}
        ${field("备注", text(record, "备注"))}
      </div>
      <div class="detail-links">
        ${text(record, "Google联系方式搜索URL") ? `<a href="${escapeAttr(text(record, "Google联系方式搜索URL"))}" target="_blank" rel="noreferrer">Google 联系方式搜索</a>` : ""}
        ${text(record, "官网/Contacto搜索URL") ? `<a href="${escapeAttr(text(record, "官网/Contacto搜索URL"))}" target="_blank" rel="noreferrer">官网/Contacto 搜索</a>` : ""}
        ${text(record, "DENUE查询入口URL") ? `<a href="${escapeAttr(text(record, "DENUE查询入口URL"))}" target="_blank" rel="noreferrer">DENUE 查询入口</a>` : ""}
      </div>
    `;
  }

  function render() {
    updateFilterOptions();
    const items = sortRecords(filteredRecords());
    renderMetrics(items);
    renderRows(items);
    renderActiveFilters();
    updateChipState();
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", () => {
      state.query = els.searchInput.value;
      state.visible = 80;
      render();
    });

    els.clearSearch.addEventListener("click", () => {
      els.searchInput.value = "";
      state.query = "";
      state.visible = 80;
      render();
    });

    els.statusFilter.addEventListener("change", () => {
      state.status = els.statusFilter.value;
      state.visible = 80;
      render();
    });
    els.confidenceFilter.addEventListener("change", () => {
      state.confidence = els.confidenceFilter.value;
      state.visible = 80;
      render();
    });
    els.contactFilter.addEventListener("change", () => {
      state.contact = els.contactFilter.value;
      state.visible = 80;
      render();
    });
    els.stateFilter.addEventListener("change", () => {
      state.stateName = els.stateFilter.value;
      state.visible = 80;
      render();
    });
    els.industryFilter.addEventListener("change", () => {
      state.industry = els.industryFilter.value;
      state.visible = 80;
      render();
    });
    els.sortSelect.addEventListener("change", () => {
      state.sort = els.sortSelect.value;
      render();
    });

    document.querySelector(".quick-chips").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-chip]");
      if (!button) return;
      const [key, value] = button.dataset.chip.split(":");
      if (key === "status") state.status = state.status === value ? "" : value;
      if (key === "contact") state.contact = state.contact === value ? "" : value;
      if (key === "confidence") state.confidence = state.confidence === value ? "" : value;
      syncInputs();
      state.visible = 80;
      render();
      updateChipState();
    });

    els.resetFilters.addEventListener("click", () => {
      state.query = "";
      state.status = "";
      state.confidence = "";
      state.contact = "";
      state.stateName = "";
      state.industry = "";
      state.sort = "relevance";
      state.visible = 80;
      syncInputs();
      render();
      updateChipState();
    });

    els.loadMore.addEventListener("click", () => {
      state.visible += 80;
      render();
    });

    els.resultsBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-view]");
      if (!button) return;
      const record = records[Number(button.dataset.view)];
      state.selectedIndex = Number(button.dataset.view);
      renderDetail(record);
    });

    els.exportCsv.addEventListener("click", () => {
      exportCurrentResults(sortRecords(filteredRecords()).map((item) => item.record));
    });
  }

  function syncInputs() {
    els.searchInput.value = state.query;
    els.statusFilter.value = state.status;
    els.confidenceFilter.value = state.confidence;
    els.contactFilter.value = state.contact;
    els.stateFilter.value = state.stateName;
    els.industryFilter.value = state.industry;
    els.sortSelect.value = state.sort;
  }

  function updateChipState() {
    document.querySelectorAll(".quick-chips button").forEach((button) => {
      const [key, value] = button.dataset.chip.split(":");
      const active =
        (key === "status" && state.status === value) ||
        (key === "contact" && state.contact === value) ||
        (key === "confidence" && state.confidence === value);
      button.classList.toggle("active", active);
    });
  }

  function exportCurrentResults(items) {
    const headers = [
      "RFC（税务登记号）",
      "企业名称（原文）",
      "行业描述（中文，合并）",
      "官网",
      "电话",
      "邮箱",
      "地址",
      "城市/州",
      "来源链接",
      "匹配置信度",
      "查询状态",
      "备注",
    ];
    const lines = [
      headers.join(","),
      ...items.map((record) => headers.map((header) => csvCell(text(record, header))).join(",")),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "墨西哥企业联系方式_筛选结果.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  function init() {
    els.sourceName.textContent = payload.source ? `数据源: ${payload.source}` : "数据源: Excel";
    els.generatedAt.textContent = payload.generatedAt ? `生成: ${payload.generatedAt.replace("T", " ")}` : "";
    bindEvents();
    render();
    const firstFound = records.find((record) => text(record, "查询状态") === "已找到") || records[0];
    renderDetail(firstFound);
  }

  init();
})();
