const VAT_RATE = 0.05;

const SLABS = [
  { label: "0–50 units (Lifeline)", from: 0, to: 50, rate: 4.63, lifeline: true },
  { label: "0–75 units", from: 0, to: 75, rate: 5.26 },
  { label: "76–200 units", from: 76, to: 200, rate: 8.5 },
  { label: "201–300 units", from: 201, to: 300, rate: 9.1 },
  { label: "301–400 units", from: 301, to: 400, rate: 9.62 },
  { label: "401–600 units", from: 401, to: 600, rate: 15.01 },
];

const HISTORY_LEDE =
  "Meter history for the last 24 months: monthly bills, running total, and whether costs are rising or falling.";

const COPY = {
  forward: {
    lede: "Enter monthly units (kWh) to see a slab-by-slab DPDC LT-A estimate, then 5% VAT on the energy charge.",
    label: "Monthly consumption",
    suffix: "kWh",
    placeholder: "e.g. 185",
    hint: "Lifeline (৳4.63) applies only if you use <strong>50 units or less</strong>. Above that, billing starts from the 0–75 slab.",
    empty: "Type your units to see the bill breakdown.",
    resultLabel: "Estimated payable",
  },
  reverse: {
    lede: "Enter the total bill (including 5% VAT) to estimate how many units that amount would cover.",
    label: "Total bill (with VAT)",
    suffix: "৳",
    placeholder: "e.g. 1850",
    hint: "VAT is removed first, then usage is worked backwards through the same residential slabs.",
    empty: "Type the payable amount to estimate usage.",
    resultLabel: "Estimated usage",
  },
};

const MONTH_INDEX = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const amountInput = document.getElementById("amount");
const tariffList = document.getElementById("tariff-list");
const emptyState = document.getElementById("empty-state");
const result = document.getElementById("result");
const slabBody = document.getElementById("slab-body");
const energyChargeEl = document.getElementById("energy-charge");
const vatAmountEl = document.getElementById("vat-amount");
const payableEl = document.getElementById("payable");
const grandTotalEl = document.getElementById("grand-total");
const lifelineNote = document.getElementById("lifeline-note");
const modeForwardBtn = document.getElementById("mode-forward");
const modeReverseBtn = document.getElementById("mode-reverse");
const tabCalculator = document.getElementById("tab-calculator");
const tabHistory = document.getElementById("tab-history");
const calculatorSection = document.getElementById("calculator-section");
const historySection = document.getElementById("history-section");
const historyBody = document.getElementById("history-body");
const historyLoading = document.getElementById("history-loading");
const historyEmpty = document.getElementById("history-empty");
const historyStats = document.getElementById("history-stats");
const historyWindow = document.getElementById("history-window");
const historySource = document.getElementById("history-source");
const trendBadge = document.getElementById("trend-badge");
const billChart = document.getElementById("bill-chart");

let mode = "forward";

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatTaka(amount) {
  return `৳${amount.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTakaCompact(amount) {
  return `৳${Math.round(amount).toLocaleString("en-BD")}`;
}

function formatUnits(units) {
  return `${units.toLocaleString("en-BD", {
    maximumFractionDigits: 2,
  })} kWh`;
}

function renderTariff(activeLabels = []) {
  tariffList.innerHTML = SLABS.map((slab) => {
    const active = activeLabels.includes(slab.label) ? "active" : "";
    return `<li class="${active}"><span>${slab.label}</span><span class="rate">${formatTaka(slab.rate)} / kWh</span></li>`;
  }).join("");
}

function calculateBill(units) {
  if (units <= 50) {
    const charge = round(units * 4.63);
    return {
      rows: [
        {
          label: "0–50 units (Lifeline)",
          units,
          rate: 4.63,
          charge,
        },
      ],
      energy: charge,
      lifeline: true,
    };
  }

  const progressive = SLABS.filter((slab) => !slab.lifeline);
  const rows = [];
  let remaining = units;

  for (const slab of progressive) {
    const width = slab.to - slab.from + (slab.from === 0 ? 0 : 1);
    const used = Math.min(remaining, width);
    if (used <= 0) break;

    const charge = round(used * slab.rate);
    rows.push({
      label: slab.label,
      units: used,
      rate: slab.rate,
      charge,
    });
    remaining -= used;
  }

  if (remaining > 0) {
    const lastRate = progressive[progressive.length - 1].rate;
    const charge = round(remaining * lastRate);
    rows.push({
      label: "Above 600 units",
      units: remaining,
      rate: lastRate,
      charge,
    });
  }

  const energy = round(rows.reduce((sum, row) => sum + row.charge, 0));
  return { rows, energy, lifeline: false };
}

function payableFor(units) {
  const bill = calculateBill(units);
  const vat = round(bill.energy * VAT_RATE);
  const total = round(bill.energy + vat);
  return { bill, vat, total };
}

function binarySearchUnits(target, lo, hi) {
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (payableFor(mid).total < target) lo = mid;
    else hi = mid;
  }

  let best = round(hi);
  let bestDiff = Math.abs(payableFor(best).total - target);

  for (const candidate of [round(lo), round(hi), round((lo + hi) / 2)]) {
    const diff = Math.abs(payableFor(candidate).total - target);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }

  return best;
}

function usageFromTotal(total) {
  const at50 = payableFor(50).total;
  const at51 = payableFor(51).total;

  if (total <= at50) {
    return { units: binarySearchUnits(total, 0.01, 50), gap: false };
  }

  if (total >= at51) {
    return { units: binarySearchUnits(total, 51, 80000), gap: false };
  }

  const nearer = Math.abs(total - at50) <= Math.abs(total - at51) ? 50 : 51;
  return { units: nearer, gap: true, at50, at51 };
}

function showEmpty() {
  emptyState.classList.remove("hidden");
  result.classList.add("hidden");
  renderTariff();
}

function renderBreakdown(units, note) {
  const { bill, vat, total } = payableFor(units);

  emptyState.classList.add("hidden");
  result.classList.remove("hidden");

  slabBody.innerHTML = bill.rows
    .map(
      (row) => `
        <tr>
          <td>${row.label}</td>
          <td>${Number(row.units.toFixed(2))}</td>
          <td>${formatTaka(row.rate)}</td>
          <td>${formatTaka(row.charge)}</td>
        </tr>`
    )
    .join("");

  energyChargeEl.textContent = formatTaka(bill.energy);
  vatAmountEl.textContent = formatTaka(vat);
  payableEl.textContent = formatTaka(total);

  if (mode === "forward") {
    grandTotalEl.textContent = formatTaka(total);
  } else {
    grandTotalEl.textContent = formatUnits(units);
  }

  const showNote = Boolean(note) || bill.lifeline;
  lifelineNote.classList.toggle("hidden", !showNote);
  lifelineNote.textContent =
    note || (bill.lifeline ? "Lifeline tariff applied" : "");

  renderTariff(bill.rows.map((row) => row.label));
}

function update() {
  const value = Number(amountInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    showEmpty();
    return;
  }

  if (mode === "forward") {
    renderBreakdown(value);
    return;
  }

  const found = usageFromTotal(value);
  const note = found.gap
    ? `No exact match in the lifeline jump (৳${found.at50.toFixed(2)}–৳${found.at51.toFixed(2)}). Showing nearest usage.`
    : "";
  renderBreakdown(found.units, note);
}

function setMode(nextMode) {
  mode = nextMode;
  const copy = COPY[mode];

  modeForwardBtn.classList.toggle("active", mode === "forward");
  modeReverseBtn.classList.toggle("active", mode === "reverse");
  modeForwardBtn.setAttribute("aria-pressed", String(mode === "forward"));
  modeReverseBtn.setAttribute("aria-pressed", String(mode === "reverse"));

  document.getElementById("lede").textContent = copy.lede;
  document.getElementById("input-label").textContent = copy.label;
  document.getElementById("input-suffix").textContent = copy.suffix;
  document.getElementById("input-hint").innerHTML = copy.hint;
  document.getElementById("empty-copy").textContent = copy.empty;
  document.getElementById("result-label").textContent = copy.resultLabel;
  amountInput.placeholder = copy.placeholder;
  amountInput.value = "";
  showEmpty();
}

modeForwardBtn.addEventListener("click", () => setMode("forward"));
modeReverseBtn.addEventListener("click", () => setMode("reverse"));
amountInput.addEventListener("input", update);

function setMainTab(tab) {
  if (tab === "calculator") {
    tabCalculator.classList.add("active");
    tabHistory.classList.remove("active");
    tabCalculator.setAttribute("aria-pressed", "true");
    tabHistory.setAttribute("aria-pressed", "false");
    calculatorSection.classList.remove("hidden");
    historySection.classList.add("hidden");
    document.getElementById("lede").textContent = COPY[mode].lede;
  } else {
    tabCalculator.classList.remove("active");
    tabHistory.classList.add("active");
    tabCalculator.setAttribute("aria-pressed", "false");
    tabHistory.setAttribute("aria-pressed", "true");
    calculatorSection.classList.add("hidden");
    historySection.classList.remove("hidden");
    document.getElementById("lede").textContent = HISTORY_LEDE;
    loadBills();
  }
}

function parseMonth(value) {
  const key = String(value || "").trim().toLowerCase();
  return MONTH_INDEX[key];
}

function normalizeBills(records) {
  if (!Array.isArray(records)) return [];

  return records
    .map((row) => {
      const year = Number(row.year);
      const monthIndex = parseMonth(row.month);
      if (!Number.isFinite(year) || monthIndex === undefined) return null;

      return {
        year,
        month: row.month,
        monthIndex,
        sortKey: year * 12 + monthIndex,
        label: `${MONTH_SHORT[monthIndex]} ${year}`,
        previous: Number(row.previous),
        present: Number(row.present),
        total: Number(row.total),
        bill: Number(row.bill),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortKey - b.sortKey);
}

function last24Months(bills) {
  if (bills.length === 0) return [];
  const latest = bills[bills.length - 1].sortKey;
  const cutoff = latest - 23;
  return bills.filter((bill) => bill.sortKey >= cutoff);
}

function describeTrend(windowBills) {
  if (windowBills.length < 2) {
    return { label: "Need more data", tone: "flat", detail: "Add another month to compare." };
  }

  const mid = Math.floor(windowBills.length / 2);
  const first = windowBills.slice(0, mid);
  const second = windowBills.slice(mid);
  const avg = (rows) => rows.reduce((sum, row) => sum + row.bill, 0) / rows.length;
  const earlier = avg(first);
  const later = avg(second);
  const change = ((later - earlier) / earlier) * 100;

  if (Math.abs(change) < 2) {
    return { label: "Holding steady", tone: "flat", detail: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs earlier months` };
  }

  if (change > 0) {
    return { label: "Bills increasing", tone: "up", detail: `+${change.toFixed(1)}% vs earlier months` };
  }

  return { label: "Bills decreasing", tone: "down", detail: `${change.toFixed(1)}% vs earlier months` };
}

function renderStats(windowBills, allCount) {
  const total = windowBills.reduce((sum, row) => sum + row.bill, 0);
  const units = windowBills.reduce((sum, row) => sum + row.total, 0);
  const latest = windowBills[windowBills.length - 1];
  const previous = windowBills.length > 1 ? windowBills[windowBills.length - 2] : null;
  const mom = previous ? ((latest.bill - previous.bill) / previous.bill) * 100 : null;

  historyStats.innerHTML = `
    <div class="stat">
      <p class="stat-label">24-month total</p>
      <p class="stat-value">${formatTakaCompact(total)}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Average bill</p>
      <p class="stat-value">${formatTakaCompact(total / windowBills.length)}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Latest (${latest.label})</p>
      <p class="stat-value">${formatTakaCompact(latest.bill)}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Month-over-month</p>
      <p class="stat-value ${mom == null ? "" : mom > 0 ? "up" : mom < 0 ? "down" : ""}">${
        mom == null ? "—" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`
      }</p>
    </div>
  `;

  historyWindow.textContent = `${windowBills.length} month${windowBills.length === 1 ? "" : "s"} in view · ${formatUnits(units)} · ${allCount} record${allCount === 1 ? "" : "s"} total`;
}

function renderTrend(windowBills) {
  const trend = describeTrend(windowBills);
  trendBadge.classList.remove("hidden", "up", "down", "flat");
  trendBadge.classList.add(trend.tone);
  trendBadge.innerHTML = `<strong>${trend.label}</strong><span>${trend.detail}</span>`;
}

function chartPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function renderChart(windowBills) {
  const width = 720;
  const height = 260;
  const pad = { top: 24, right: 56, bottom: 42, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxBill = Math.max(...windowBills.map((row) => row.bill), 1);
  const running = [];
  windowBills.reduce((sum, row) => {
    const next = sum + row.bill;
    running.push(next);
    return next;
  }, 0);
  const maxSum = Math.max(...running, 1);
  const count = windowBills.length;
  const slot = innerW / Math.max(count, 1);
  const barW = Math.min(36, slot * 0.55);

  const barPoints = windowBills.map((row, index) => {
    const x = pad.left + slot * index + slot / 2;
    const h = (row.bill / maxBill) * innerH;
    return { x, y: pad.top + innerH - h, h, label: row.label, bill: row.bill };
  });

  const linePoints = running.map((value, index) => ({
    x: pad.left + slot * index + slot / 2,
    y: pad.top + innerH - (value / maxSum) * innerH,
  }));

  const yTicks = 4;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks;
    const y = pad.top + innerH * (1 - t);
    return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" class="grid-line" />
      <text x="${pad.left - 8}" y="${y + 4}" class="axis-label left">${formatTakaCompact(maxBill * t)}</text>
      <text x="${width - pad.right + 8}" y="${y + 4}" class="axis-label right">${formatTakaCompact(maxSum * t)}</text>`;
  }).join("");

  const bars = barPoints
    .map(
      (point) => `
      <rect class="bar" x="${(point.x - barW / 2).toFixed(1)}" y="${point.y.toFixed(1)}" width="${barW}" height="${Math.max(point.h, 2).toFixed(1)}" rx="6">
        <title>${point.label}: ${formatTaka(point.bill)}</title>
      </rect>`
    )
    .join("");

  const labelStep = count > 12 ? 3 : count > 8 ? 2 : 1;
  const labels = barPoints
    .map((point, index) => {
      if (index % labelStep !== 0 && index !== count - 1) return "";
      return `<text x="${point.x.toFixed(1)}" y="${height - 14}" class="axis-label center">${point.label}</text>`;
    })
    .join("");

  const area = `${chartPath(linePoints)} L ${linePoints[linePoints.length - 1].x.toFixed(1)} ${pad.top + innerH} L ${linePoints[0].x.toFixed(1)} ${pad.top + innerH} Z`;

  billChart.innerHTML = `
    <defs>
      <linearGradient id="sumFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7ee0d0" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#7ee0d0" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" class="sum-area" />
    ${bars}
    <path d="${chartPath(linePoints)}" class="sum-line" />
    ${linePoints
      .map((point) => `<circle class="sum-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" />`)
      .join("")}
    ${labels}
  `;
}

function renderHistory(bills) {
  const windowBills = last24Months(bills);
  const tableRows = [...windowBills].reverse();

  historyBody.innerHTML = tableRows
    .map((bill, index) => {
      const older = tableRows[index + 1];
      let changeCell = `<span class="change flat">—</span>`;
      if (older) {
        const delta = bill.bill - older.bill;
        const pct = (delta / older.bill) * 100;
        const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
        const sign = delta > 0 ? "+" : "";
        changeCell = `<span class="change ${tone}">${sign}${formatTakaCompact(delta)} (${sign}${pct.toFixed(1)}%)</span>`;
      }

      return `
      <tr>
        <td><strong>${bill.label}</strong></td>
        <td>${bill.previous.toLocaleString("en-BD")}</td>
        <td>${bill.present.toLocaleString("en-BD")}</td>
        <td>${bill.total.toLocaleString("en-BD")}</td>
        <td>${formatTaka(bill.bill)}</td>
        <td>${changeCell}</td>
      </tr>
    `;
    })
    .join("");

  if (windowBills.length > 0) {
    renderStats(windowBills, bills.length);
    renderTrend(windowBills);
    renderChart(windowBills);
  }
}

function loadBills() {
  historyLoading.classList.add("hidden");
  historyEmpty.classList.add("hidden");
  historyBody.innerHTML = "";
  billChart.innerHTML = "";
  historyStats.innerHTML = "";
  trendBadge.classList.add("hidden");

  const bills = normalizeBills(typeof BILLS === "undefined" ? [] : BILLS);
  historySource.textContent = "Loaded from bills.js";

  if (bills.length === 0) {
    historyEmpty.classList.remove("hidden");
    historyEmpty.textContent = "No bills found. Add a row in bills.js and refresh.";
    return;
  }

  renderHistory(bills);
}

tabCalculator.addEventListener("click", () => setMainTab("calculator"));
tabHistory.addEventListener("click", () => setMainTab("history"));

renderTariff();
setMainTab("history");
