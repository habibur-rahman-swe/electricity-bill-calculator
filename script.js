const VAT_RATE = 0.05;

const SLABS = [
  { label: "0–50 units (Lifeline)", from: 0, to: 50, rate: 4.63, lifeline: true },
  { label: "0–75 units", from: 0, to: 75, rate: 5.26 },
  { label: "76–200 units", from: 76, to: 200, rate: 8.5 },
  { label: "201–300 units", from: 201, to: 300, rate: 9.1 },
  { label: "301–400 units", from: 301, to: 400, rate: 9.62 },
  { label: "401–600 units", from: 401, to: 600, rate: 15.01 },
];

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

renderTariff();
