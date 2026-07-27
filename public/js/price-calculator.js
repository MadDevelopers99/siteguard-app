(function () {
  const calcForm = document.getElementById("calcForm");
  const calcError = document.getElementById("calcError");
  const priceResultsWrap = document.getElementById("priceResultsWrap");
  const manualReviewCard = document.getElementById("manualReviewCard");
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

  // ---------- Step wizard ----------
  const STEPS = ["pcStep1", "pcStep2", "pcStep3", "pcStep4"];
  window.pcMapInstances = window.pcMapInstances || {};

  function showStep(stepId) {
    STEPS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === stepId ? "" : "none";
    });
    const stepIndex = STEPS.indexOf(stepId);
    document.querySelectorAll(".pc-stepper-item").forEach((el, i) => {
      el.classList.toggle("active", i === stepIndex);
      el.classList.toggle("done", i < stepIndex);
    });
    const stepper = document.querySelector(".pc-stepper");
    if (stepper) stepper.scrollIntoView({ behavior: "smooth", block: "start" });
    if (stepId === "pcStep1") {
      Object.values(window.pcMapInstances).forEach((getMap) => {
        const m = getMap();
        if (m) setTimeout(() => m.invalidateSize(), 50);
      });
    }
  }

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showStep(btn.dataset.back));
  });

  // ---------- Zone-marking map (per address) ----------
  function mapSectionHTML(index) {
    return `
      <div class="pc-map-section">
        <label>Measure &amp; Mark the zone on the map</label>
        <div class="pc-map-toolbar">
          <button type="button" class="pc-map-tool" data-mode="point"><span class="pc-tool-icon">📍</span><span class="pc-tool-label">Mark Location</span></button>
          <button type="button" class="pc-map-tool" data-mode="line"><span class="pc-tool-icon">✏️</span><span class="pc-tool-label">Draw Line</span></button>
          <button type="button" class="pc-map-tool" data-mode="straight"><span class="pc-tool-icon">📐</span><span class="pc-tool-label">Straight Line</span></button>
          <button type="button" class="pc-map-tool" data-mode="polygon-straight"><span class="pc-tool-icon">⬠</span><span class="pc-tool-label">Straight Area</span></button>
          <button type="button" class="pc-map-tool" data-mode="text"><span class="pc-tool-icon">🔤</span><span class="pc-tool-label">Text</span></button>
          <button type="button" class="pc-map-tool" data-mode="measure"><span class="pc-tool-icon">📏</span><span class="pc-tool-label">Measure Line</span></button>
          <button type="button" class="pc-map-tool-action" id="pcUndoBtn-${index}"><span class="pc-tool-icon">↩</span><span class="pc-tool-label">Undo</span></button>
          <button type="button" class="pc-map-tool-action" id="pcClearMapBtn-${index}"><span class="pc-tool-icon">🧹</span><span class="pc-tool-label">Clear</span></button>
        </div>
        <div id="pcMarkMap-${index}" class="pc-mark-map"></div>
        <div class="pc-map-meta">
          <span id="pcMapLength-${index}">Drawn length: —</span>
          <span id="pcMeasureResult-${index}" class="pc-measure-result"></span>
          <button type="button" class="btn btn-outline btn-sm" id="pcSaveMarkingBtn-${index}">Save Marking</button>
        </div>
        <p class="pc-map-note">Draw Line / Straight Area: click each point, then click again near the last point to finish. Straight Line: click the start, then the end. Text: click to place a label. Measure Line: click points to measure a distance without saving it. Drawing a line/area fills in Zone Length as "Custom length" for manual review. PDF export of your marked zone will be available once your request is confirmed and paid.</p>
        <input type="hidden" name="addresses[${index}][map_marking]" class="pc-map-marking-input" id="pcMapMarkingInput-${index}">
      </div>`;
  }

  function initAddressMap(index, block) {
    const mapEl = document.getElementById(`pcMarkMap-${index}`);
    if (!mapEl || typeof L === "undefined") return;

    const FALLBACK_CENTER = [48.1351, 11.5820]; // Munich
    const DRAW_COLOR = "#c1382b";
    let leafletMap = null;
    let mapStarted = false;
    let mode = null;
    let pendingPoints = [];
    let pendingLayer = null;
    let measureLayer = null;
    let savedState = false;
    const savedFeatures = [];
    const savedLayers = [];

    const lengthLabel = document.getElementById(`pcMapLength-${index}`);
    const measureResultEl = document.getElementById(`pcMeasureResult-${index}`);
    const undoBtn = document.getElementById(`pcUndoBtn-${index}`);
    const clearBtn = document.getElementById(`pcClearMapBtn-${index}`);
    const saveBtn = document.getElementById(`pcSaveMarkingBtn-${index}`);
    const zoneSelect = block.querySelector(`select[name="addresses[${index}][zone_length]"]`);
    const markingInput = document.getElementById(`pcMapMarkingInput-${index}`);
    const toolButtons = Array.from(block.querySelectorAll(".pc-map-tool"));

    const pinIcon = L.divIcon({ className: "pc-pin-icon", html: "📍", iconSize: [26, 26], iconAnchor: [13, 26] });

    function metersBetween(a, b) {
      return L.latLng(a).distanceTo(L.latLng(b));
    }
    function pxDist(a, b) {
      const A = leafletMap.latLngToContainerPoint(L.latLng(a));
      const B = leafletMap.latLngToContainerPoint(L.latLng(b));
      return A.distanceTo(B);
    }

    function totalLength() {
      let meters = 0;
      savedFeatures.forEach((f) => {
        if (f.type === "point" || f.type === "text") return;
        for (let i = 1; i < f.coords.length; i++) meters += metersBetween(f.coords[i - 1], f.coords[i]);
        if (f.type === "polygon" && f.coords.length > 2) meters += metersBetween(f.coords[f.coords.length - 1], f.coords[0]);
      });
      return Math.round(meters);
    }

    function refreshLength() {
      const meters = totalLength();
      lengthLabel.textContent = meters > 0 ? `Drawn length: ${meters} m` : "Drawn length: —";
    }

    function syncMarkingInput() {
      if (markingInput) markingInput.value = JSON.stringify(savedFeatures);
    }

    function markUnsaved() {
      if (savedState) {
        savedState = false;
        saveBtn.textContent = "Save Marking";
      }
    }

    function drawSavedFeature(f) {
      if (f.type === "point") return L.marker(f.coords[0], { icon: pinIcon }).addTo(leafletMap);
      if (f.type === "text") {
        return L.marker(f.coords[0], {
          icon: L.divIcon({ className: "pc-text-label", html: escapeHtml(f.text), iconSize: null })
        }).addTo(leafletMap);
      }
      if (f.type === "line") return L.polyline(f.coords, { color: DRAW_COLOR, weight: 4 }).addTo(leafletMap);
      return L.polygon(f.coords, { color: DRAW_COLOR, weight: 3, fillOpacity: 0.15 }).addTo(leafletMap);
    }

    function redrawPending(previewPoints) {
      const pts = previewPoints || pendingPoints;
      if (!leafletMap) return;
      if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      if (pts.length === 0) return;
      if (mode === "polygon-straight") {
        pendingLayer = pts.length === 1
          ? L.circleMarker(pts[0], { radius: 5, color: DRAW_COLOR, fillColor: DRAW_COLOR, fillOpacity: 1 }).addTo(leafletMap)
          : L.polygon(pts, { color: DRAW_COLOR, weight: 3, dashArray: "6,6", fillOpacity: 0.1 }).addTo(leafletMap);
      } else {
        pendingLayer = pts.length === 1
          ? L.circleMarker(pts[0], { radius: 5, color: DRAW_COLOR, fillColor: DRAW_COLOR, fillOpacity: 1 }).addTo(leafletMap)
          : L.polyline(pts, { color: DRAW_COLOR, weight: 4, dashArray: "6,6" }).addTo(leafletMap);
      }
    }

    function enterMode(newMode) {
      mode = newMode;
      pendingPoints = [];
      if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === newMode));
      if (leafletMap) { leafletMap.dragging.disable(); leafletMap.doubleClickZoom.disable(); }
    }

    function exitMode() {
      mode = null;
      pendingPoints = [];
      if (pendingLayer && leafletMap) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      if (leafletMap) { leafletMap.dragging.enable(); leafletMap.doubleClickZoom.enable(); }
      toolButtons.forEach((b) => b.classList.remove("active"));
    }

    toolButtons.forEach((btn) => {
      btn.addEventListener("click", () => enterMode(btn.dataset.mode));
    });

    undoBtn.addEventListener("click", () => {
      if (savedLayers.length === 0) return;
      leafletMap.removeLayer(savedLayers.pop());
      savedFeatures.pop();
      refreshLength();
      syncMarkingInput();
      markUnsaved();
    });

    clearBtn.addEventListener("click", () => {
      savedLayers.forEach((l) => leafletMap.removeLayer(l));
      savedLayers.length = 0;
      savedFeatures.length = 0;
      refreshLength();
      syncMarkingInput();
      markUnsaved();
    });

    saveBtn.addEventListener("click", () => {
      syncMarkingInput();
      const meters = totalLength();
      if (meters > 0 && zoneSelect) {
        zoneSelect.value = "Custom length";
        if (window.pcToggleCustomLengthGroup) window.pcToggleCustomLengthGroup(zoneSelect);
        const grid = zoneSelect.closest(".pc-form-grid");
        const customInput = grid ? grid.querySelector(".pc-custom-length-input") : null;
        if (customInput) customInput.value = meters;
      }
      savedState = true;
      saveBtn.textContent = "Saved";
    });

    function finishShape() {
      if (mode === "measure") {
        const coords = pendingPoints.slice();
        if (measureLayer) { leafletMap.removeLayer(measureLayer); measureLayer = null; }
        measureLayer = L.polyline(coords, { color: DRAW_COLOR, weight: 3, dashArray: "4,4" }).addTo(leafletMap);
        let meters = 0;
        for (let i = 1; i < coords.length; i++) meters += metersBetween(coords[i - 1], coords[i]);
        measureResultEl.textContent = `Measured: ${Math.round(meters)} m`;
        pendingPoints = [];
        if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
        exitMode();
        return;
      }
      const type = mode === "polygon-straight" ? "polygon" : "line";
      const feature = { type, coords: pendingPoints.slice() };
      savedFeatures.push(feature);
      if (pendingLayer) { leafletMap.removeLayer(pendingLayer); pendingLayer = null; }
      savedLayers.push(drawSavedFeature(feature));
      pendingPoints = [];
      refreshLength();
      syncMarkingInput();
      markUnsaved();
      exitMode();
    }

    function initMap(center) {
      leafletMap = L.map(`pcMarkMap-${index}`, { tap: true, tapTolerance: 15 }).setView(center, 19);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(leafletMap);

      leafletMap.on("click", (e) => {
        if (!mode) return;
        const ll = [e.latlng.lat, e.latlng.lng];

        if (mode === "point") {
          const feature = { type: "point", coords: [ll] };
          savedFeatures.push(feature);
          savedLayers.push(drawSavedFeature(feature));
          refreshLength();
          syncMarkingInput();
          markUnsaved();
          exitMode();
          return;
        }

        if (mode === "text") {
          const text = window.prompt("Label text:");
          if (text && text.trim()) {
            const feature = { type: "text", coords: [ll], text: text.trim() };
            savedFeatures.push(feature);
            savedLayers.push(drawSavedFeature(feature));
            syncMarkingInput();
            markUnsaved();
          }
          exitMode();
          return;
        }

        if (mode === "straight") {
          pendingPoints.push(ll);
          redrawPending();
          if (pendingPoints.length === 2) finishShape();
          return;
        }

        // Draw Line / Straight Area / Measure Line: click each point in turn,
        // then click near the last point again to finish — works reliably
        // for both mouse and touch, no double-click timing involved.
        const minFinish = mode === "polygon-straight" ? 3 : 2;
        if (pendingPoints.length > 0) {
          const last = pendingPoints[pendingPoints.length - 1];
          if (pxDist(ll, last) <= 16) {
            if (pendingPoints.length >= minFinish) finishShape();
            return;
          }
        }
        pendingPoints.push(ll);
        redrawPending();
      });

      leafletMap.on("mousemove", (e) => {
        if (pendingPoints.length === 0) return;
        if (mode === "line" || mode === "polygon-straight" || mode === "measure" || mode === "straight") {
          redrawPending(pendingPoints.concat([[e.latlng.lat, e.latlng.lng]]));
        }
      });

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

    window.pcMapInstances[index] = () => leafletMap;
  }

  function mountMap(mount) {
    const index = parseInt(mount.dataset.index, 10);
    const wrap = document.createElement("div");
    wrap.innerHTML = mapSectionHTML(index);
    const section = wrap.firstElementChild;
    mount.replaceWith(section);
    const block = section.closest(".pc-address-block");
    initAddressMap(index, block);
  }

  document.querySelectorAll(".pc-map-mount").forEach(mountMap);

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
          <div class="form-group"><label>City *</label><input type="text" name="addresses[${index}][city]" required></div>
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
          <div class="form-group"><label>Postal Code *</label><input type="text" name="addresses[${index}][postal_code]" required></div>
        </div>
        <div class="pc-section-label"></div>
        <div class="pc-form-grid">
          <div class="form-group"><label>From Street *</label><input type="text" name="addresses[${index}][from_street]" required></div>
          <div class="form-group"><label>House Number *</label><input type="text" name="addresses[${index}][from_house_number]" required></div>
        </div>
        <div class="pc-section-label"></div>
        <div class="pc-form-grid">
          <div class="form-group"><label>To Street</label><input type="text" name="addresses[${index}][till_street]"></div>
          <div class="form-group"><label>House Number</label><input type="text" name="addresses[${index}][till_house_number]"></div>
        </div>
        <div class="pc-form-grid">
          <div class="form-group">
            <label>Zone Length *</label>
            <select name="addresses[${index}][zone_length]" class="pc-zone-length-select" required>
              <option value="">Select length</option>
              ${window.PC_ZONE_LENGTH_OPTIONS.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group pc-custom-length-group" style="display:none;">
            <label>Custom Length (meters) *</label>
            <input type="number" min="1" step="1" name="addresses[${index}][custom_length_meters]" class="pc-custom-length-input">
          </div>
          <div class="form-group full">
            <label class="pc-checkbox-label"><input type="checkbox" name="addresses[${index}][both_sides]" value="1"> No-parking zone needed on both sides</label>
          </div>
        </div>
        <div class="pc-map-mount" data-index="${index}"></div>
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
    mountMap(block.querySelector(".pc-map-mount"));
  });

  document.querySelectorAll(".pc-remove-address").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".pc-address-block").remove());
  });

  // ---------- Zone Length: show a meters input when "Custom length" is chosen ----------
  function toggleCustomLengthGroup(select) {
    const grid = select.closest(".pc-form-grid");
    const group = grid ? grid.querySelector(".pc-custom-length-group") : null;
    if (!group) return;
    const input = group.querySelector(".pc-custom-length-input");
    const isCustom = select.value === "Custom length";
    group.style.display = isCustom ? "" : "none";
    if (input) input.required = isCustom;
  }
  window.pcToggleCustomLengthGroup = toggleCustomLengthGroup;

  calcForm.addEventListener("change", (e) => {
    if (e.target.classList.contains("pc-zone-length-select")) toggleCustomLengthGroup(e.target);
  });
  document.querySelectorAll(".pc-zone-length-select").forEach(toggleCustomLengthGroup);

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
      showStep("pcStep2");
    } catch (err) {
      calcError.textContent = "Network error — please try again.";
      calcError.style.display = "block";
    }
  });

  document.getElementById("toStep3Btn").addEventListener("click", () => showStep("pcStep3"));

  document.getElementById("toStep4Btn").addEventListener("click", () => {
    const step3Inputs = document.querySelectorAll("#pcStep3 [required]");
    for (const input of step3Inputs) {
      if (!input.checkValidity()) { input.reportValidity(); return; }
    }
    showStep("pcStep4");
  });

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const continueBtn = document.getElementById("continueBtn");
    const fd = new FormData(contactForm);
    const payload = { ...calcPayload(), ...Object.fromEntries(fd.entries()) };

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
        document.getElementById("pcStep4").querySelectorAll("input, button, select, textarea").forEach((el) => {
          if (el !== continueBtn) el.disabled = true;
        });
        continueBtn.style.display = "none";
      } else {
        submitResult.style.color = "#c1382b";
        submitResult.textContent = data.error || "Something went wrong.";
        continueBtn.disabled = false;
        continueBtn.textContent = "Submit Request";
      }
    } catch (err) {
      submitResult.style.color = "#c1382b";
      submitResult.textContent = "Network error — please try again.";
      continueBtn.disabled = false;
      continueBtn.textContent = "Submit Request";
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
})();
