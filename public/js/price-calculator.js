(function () {
  const calcForm = document.getElementById("calcForm");
  const calcError = document.getElementById("calcError");
  const priceResultsWrap = document.getElementById("priceResultsWrap");
  const manualReviewCard = document.getElementById("manualReviewCard");
  const contactSection = document.getElementById("contactSection");
  const contactForm = document.getElementById("contactForm");
  const submitResult = document.getElementById("submitResult");
  const addressBlocks = document.getElementById("addressBlocks");
  const addAddressBtn = document.getElementById("addAddressBtn");

  function eur(amount) {
    return "€" + Number(amount).toFixed(2);
  }
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Address blocks (+ Add New Address) ----------
  let nextAddressIndex = 1;

  function addressBlockHTML(index) {
    return `
      <div class="pc-address-block" data-index="${index}">
        <div class="pc-address-block-header">
          <strong class="pc-address-title">Address ${index + 1}</strong>
          <button type="button" class="pc-remove-address">Remove</button>
        </div>
        <div class="pc-form-grid">
          <div class="form-group"><label>City *</label><input type="text" name="addresses[${index}][city]" placeholder="Munich" required></div>
          <div class="form-group">
            <label>Reason / Purpose *</label>
            <select name="addresses[${index}][reason]" required>
              <option value="">Select reason</option>
              ${window.PC_REASON_OPTIONS.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="pc-form-grid">
          <div class="form-group"><label>Start Date *</label><input type="date" name="addresses[${index}][start_date]" required></div>
          <div class="form-group"><label>End Date *</label><input type="date" name="addresses[${index}][end_date]" required></div>
        </div>
        <div class="pc-form-grid">
          <div class="form-group"><label>Start Time *</label><input type="time" name="addresses[${index}][start_time]" value="07:00" required></div>
          <div class="form-group"><label>End Time *</label><input type="time" name="addresses[${index}][end_time]" value="17:00" required></div>
        </div>
        <div class="pc-form-grid">
          <div class="form-group"><label>Postal Code *</label><input type="text" name="addresses[${index}][postal_code]" placeholder="81677" required></div>
        </div>
        <div class="pc-section-label">FROM</div>
        <div class="pc-form-grid">
          <div class="form-group"><label>Street *</label><input type="text" name="addresses[${index}][from_street]" placeholder="Example Street" required></div>
          <div class="form-group"><label>House Number *</label><input type="text" name="addresses[${index}][from_house_number]" placeholder="35" required></div>
        </div>
        <div class="pc-section-label">TILL</div>
        <div class="pc-form-grid">
          <div class="form-group"><label>Street</label><input type="text" name="addresses[${index}][till_street]" placeholder="Example Street"></div>
          <div class="form-group"><label>House Number</label><input type="text" name="addresses[${index}][till_house_number]" placeholder="51"></div>
        </div>
        <div class="pc-form-grid">
          <div class="form-group">
            <label>Zone Length *</label>
            <select name="addresses[${index}][zone_length]" class="pc-zone-length-select" required>
              <option value="">Select length</option>
              ${window.PC_ZONE_LENGTH_OPTIONS.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>&nbsp;</label>
            <label class="pc-checkbox-label"><input type="checkbox" name="addresses[${index}][both_sides]" value="1"> No-parking zone needed on both sides</label>
          </div>
        </div>
      </div>`;
  }

  addAddressBtn.addEventListener("click", () => {
    const index = nextAddressIndex++;
    const wrap = document.createElement("div");
    wrap.innerHTML = addressBlockHTML(index);
    const block = wrap.firstElementChild;
    addressBlocks.appendChild(block);
    block.querySelector(".pc-remove-address").addEventListener("click", () => {
      block.remove();
    });
  });

  document.querySelectorAll(".pc-remove-address").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".pc-address-block").remove());
  });

  // ---------- Calculate / Submit payload ----------
  function calcPayload() {
    const fd = new FormData(calcForm);
    const payload = Object.fromEntries(fd.entries());
    document.querySelectorAll(".pc-address-block").forEach((block) => {
      const idx = block.dataset.index;
      const checkbox = block.querySelector(`input[name="addresses[${idx}][both_sides]"]`);
      payload[`addresses[${idx}][both_sides]`] = checkbox && checkbox.checked ? "1" : "0";
    });
    return payload;
  }

  function addressLabels() {
    return Array.from(document.querySelectorAll(".pc-address-block")).map((block, i) => {
      const cityInput = block.querySelector('input[name$="[city]"]');
      return (cityInput && cityInput.value) || `Address ${i + 1}`;
    });
  }

  function renderResults(data) {
    priceResultsWrap.innerHTML = "";
    const labels = addressLabels();
    const priced = [];

    data.results.forEach((r, i) => {
      if (r.manualReview) return;
      priced.push(r);
      const card = document.createElement("div");
      card.className = "pc-result-card";
      card.innerHTML = `
        <h3>Estimated Price — ${escapeHtml(labels[i] || `Address ${i + 1}`)}</h3>
        <div class="pc-breakdown">
          <div class="pc-breakdown-line"><span>Base service fee</span><span>${eur(r.baseServiceFee)}</span></div>
          <div class="pc-breakdown-line"><span>Sign rate</span><span>${eur(r.signRate)} per sign per day</span></div>
          <div class="pc-breakdown-line"><span>Number of signs</span><span>${r.numberOfSigns}</span></div>
          <div class="pc-breakdown-line"><span>Duration</span><span>${r.numberOfDays} days</span></div>
          <div class="pc-breakdown-calc">Calculation: ${eur(r.baseServiceFee)} + (${r.numberOfSigns} × ${eur(r.signRate)} × ${r.numberOfDays} days)</div>
          <div class="pc-breakdown-total"><span>Estimated Total</span><span>${eur(r.totalGross)}</span></div>
          <div class="pc-breakdown-line pc-vat-line"><span>+ VAT (inkl. MwSt.) 19%</span><span>${eur(r.vatAmount)}</span></div>
          <div class="pc-breakdown-grand"><span>Total</span><span>${eur(r.grandTotal)}</span></div>
        </div>
        <p class="pc-disclaimer">This is an estimated price. Final pricing may change if additional permit fees, special traffic requirements, custom signage plans, or extra on-site services are required.</p>
      `;
      priceResultsWrap.appendChild(card);
    });

    if (priced.length > 1) {
      const combinedCard = document.createElement("div");
      combinedCard.className = "pc-combined-total";
      combinedCard.innerHTML = `<span>Combined Total (all addresses)</span><span>${eur(data.combined.grandTotal)}</span>`;
      priceResultsWrap.appendChild(combinedCard);
    }
  }

  calcForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    calcError.style.display = "none";
    priceResultsWrap.innerHTML = "";
    manualReviewCard.style.display = "none";
    contactSection.style.display = "none";

    const payload = calcPayload();

    try {
      const res = await fetch("/price-calculator/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(payload).toString()
      });
      const data = await res.json();

      if (data.error) {
        calcError.textContent = data.error;
        calcError.style.display = "block";
        return;
      }

      renderResults(data);
      if (data.manualReview) manualReviewCard.style.display = "block";

      contactSection.style.display = "block";
      contactSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      calcError.textContent = "Network error — please try again.";
      calcError.style.display = "block";
    }
  });

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const continueBtn = document.getElementById("continueBtn");
    const fd = new FormData(contactForm);
    const payload = { ...calcPayload(), ...Object.fromEntries(fd.entries()) };
    if (window.pcMapMarkingJSON) {
      payload["addresses[0][map_marking]"] = window.pcMapMarkingJSON;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = "Submitting…";

    try {
      const res = await fetch("/price-calculator/submit", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(payload).toString()
      });
      const data = await res.json();

      if (data.ok) {
        submitResult.style.color = "#2f7d5b";
        const numbers = (data.requestNumbers || []).map((n) => `<strong>${escapeHtml(n)}</strong>`).join(", ");
        submitResult.innerHTML = data.manualReview
          ? `Thank you — request(s) ${numbers} received. Our team will review your custom zone length and contact you.`
          : `Thank you — request(s) ${numbers} received. We will guide you through the next step.`;
        contactForm.style.display = "none";
      } else {
        submitResult.style.color = "#c1382b";
        submitResult.textContent = data.error || "Something went wrong.";
        continueBtn.disabled = false;
        continueBtn.textContent = "Continue with This Price";
      }
    } catch (err) {
      submitResult.style.color = "#c1382b";
      submitResult.textContent = "Network error — please try again.";
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue with This Price";
    }
  });

  // ---------- Client toggle (New / Existing) ----------
  const clientModeInput = document.getElementById("clientModeInput");
  const pcExistingNote = document.getElementById("pcExistingNote");
  document.querySelectorAll(".pc-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pc-toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      clientModeInput.value = btn.dataset.mode;
      pcExistingNote.style.display = btn.dataset.mode === "existing" ? "block" : "none";
    });
  });

  // ---------- Client type toggle (Private / Company) ----------
  const clientTypeInput = document.getElementById("clientTypeInput");
  const companyFieldWrap = document.getElementById("companyFieldWrap");
  document.querySelectorAll(".pc-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pc-type-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      clientTypeInput.value = btn.dataset.type;
      companyFieldWrap.style.display = btn.dataset.type === "Company" ? "block" : "none";
    });
  });

  // ---------- Zone-marking map (point / line / polygon) ----------
  (function initMarkMap() {
    const mapEl = document.getElementById("pcMarkMap");
    if (!mapEl || typeof L === "undefined") return;

    const FALLBACK_CENTER = [48.1351, 11.5820]; // Munich
    let leafletMap = null;
    let mapStarted = false;
    let mode = "point";
    let pendingPoints = [];
    let pendingLayer = null;
    const savedFeatures = [];
    const savedLayers = [];

    const lengthLabel = document.getElementById("pcMapLength");
    const stopDrawBtn = document.getElementById("pcStopDrawBtn");
    const finishShapeBtn = document.getElementById("pcFinishShapeBtn");
    const undoBtn = document.getElementById("pcUndoBtn");
    const clearBtn = document.getElementById("pcClearMapBtn");
    const saveBtn = document.getElementById("pcSaveMarkingBtn");
    const zoneSelect = document.querySelector('select[name="addresses[0][zone_length]"]');
    const markingInput = document.querySelector('input[name="addresses[0][map_marking]"]');

    function metersBetween(a, b) {
      return L.latLng(a).distanceTo(L.latLng(b));
    }

    function totalLength() {
      let meters = 0;
      savedFeatures.forEach((f) => {
        if (f.type === "point") return;
        for (let i = 1; i < f.coords.length; i++) meters += metersBetween(f.coords[i - 1], f.coords[i]);
        if (f.type === "polygon" && f.coords.length > 2) meters += metersBetween(f.coords[f.coords.length - 1], f.coords[0]);
      });
      return Math.round(meters);
    }

    function refreshLength() {
      const meters = totalLength();
      if (meters > 0) {
        lengthLabel.textContent = `Drawn length: ${meters} m`;
      } else {
        lengthLabel.textContent = "Drawn length: —";
      }
    }

    function syncMarkingInput() {
      const json = JSON.stringify(savedFeatures);
      if (markingInput) markingInput.value = json;
      window.pcMapMarkingJSON = json;
    }

    function drawSavedFeature(f) {
      if (f.type === "point") return L.circleMarker(f.coords[0], { radius: 7, color: "#cf9600", fillColor: "#f4b400", fillOpacity: 1 }).addTo(leafletMap);
      if (f.type === "line") return L.polyline(f.coords, { color: "#1e5631", weight: 4 }).addTo(leafletMap);
      return L.polygon(f.coords, { color: "#1e5631", weight: 3, fillOpacity: 0.15 }).addTo(leafletMap);
    }

    function redrawPending() {
      if (!leafletMap) return;
      if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      if (pendingPoints.length === 0) return;
      if (mode === "line") {
        pendingLayer = L.polyline(pendingPoints, { color: "#d98c00", weight: 4, dashArray: "6,6" }).addTo(leafletMap);
      } else if (mode === "polygon") {
        pendingLayer = L.polygon(pendingPoints, { color: "#d98c00", weight: 3, dashArray: "6,6", fillOpacity: 0.1 }).addTo(leafletMap);
      }
    }

    function enterMode(newMode) {
      mode = newMode;
      pendingPoints = [];
      if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      document.querySelectorAll(".pc-map-tool").forEach((b) => b.classList.toggle("active", b.dataset.mode === newMode));
      if (leafletMap) leafletMap.dragging.disable();
      stopDrawBtn.style.display = "";
      finishShapeBtn.style.display = newMode === "polygon" ? "" : "none";
    }

    function exitMode() {
      pendingPoints = [];
      if (pendingLayer && leafletMap) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      if (leafletMap) leafletMap.dragging.enable();
      stopDrawBtn.style.display = "none";
      finishShapeBtn.style.display = "none";
    }

    document.querySelectorAll(".pc-map-tool").forEach((btn) => {
      btn.addEventListener("click", () => enterMode(btn.dataset.mode));
    });
    stopDrawBtn.addEventListener("click", exitMode);
    finishShapeBtn.addEventListener("click", () => {
      if (mode === "polygon" && pendingPoints.length >= 3) finishShape();
    });

    undoBtn.addEventListener("click", () => {
      if (savedLayers.length === 0) return;
      leafletMap.removeLayer(savedLayers.pop());
      savedFeatures.pop();
      refreshLength();
      syncMarkingInput();
    });

    clearBtn.addEventListener("click", () => {
      savedLayers.forEach((l) => leafletMap.removeLayer(l));
      savedLayers.length = 0;
      savedFeatures.length = 0;
      refreshLength();
      syncMarkingInput();
    });

    saveBtn.addEventListener("click", () => {
      syncMarkingInput();
      const meters = totalLength();
      if (meters > 0 && zoneSelect) {
        zoneSelect.value = "Custom length";
      }
      saveBtn.textContent = "Saved ✓";
      setTimeout(() => { saveBtn.textContent = "Save Marking"; }, 1500);
    });

    function finishShape() {
      const type = mode === "polygon" ? "polygon" : "line";
      const feature = { type, coords: pendingPoints.slice() };
      savedFeatures.push(feature);
      if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      savedLayers.push(drawSavedFeature(feature));
      pendingPoints = [];
      refreshLength();
      syncMarkingInput();
    }

    function initMap(center) {
      leafletMap = L.map("pcMarkMap", { tap: true, tapTolerance: 15 }).setView(center, 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(leafletMap);

      leafletMap.on("click", (e) => {
        const ll = [e.latlng.lat, e.latlng.lng];
        if (mode === "point") {
          savedFeatures.push({ type: "point", coords: [ll] });
          savedLayers.push(drawSavedFeature({ type: "point", coords: [ll] }));
          refreshLength();
          syncMarkingInput();
          return;
        }
        pendingPoints.push(ll);
        redrawPending();
        if (mode === "line" && pendingPoints.length === 2) finishShape();
      });

      enterMode("point");
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }

    function startMap(center) {
      if (mapStarted) return;
      mapStarted = true;
      initMap(center);
    }

    function beginLocating() {
      const hardFallback = setTimeout(() => startMap(FALLBACK_CENTER), 5000);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(hardFallback); startMap([pos.coords.latitude, pos.coords.longitude]); },
          () => { clearTimeout(hardFallback); startMap(FALLBACK_CENTER); },
          { enableHighAccuracy: true, timeout: 4500 }
        );
      } else {
        clearTimeout(hardFallback);
        startMap(FALLBACK_CENTER);
      }
    }

    function panelVisible() { return mapEl.offsetParent !== null; }
    if (panelVisible()) beginLocating();
    else window.addEventListener("load", () => { if (panelVisible()) beginLocating(); });
  })();
})();
