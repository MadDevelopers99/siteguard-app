(function () {
  const cart = {}; // item_id -> {name, price, qty}

  // ---- Category filter ----
  const tabs = document.getElementById("categoryTabs");
  const grid = document.getElementById("itemGrid");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      if (e.target.tagName !== "BUTTON") return;
      [...tabs.children].forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      const cat = e.target.dataset.cat;
      [...grid.children].forEach((card) => {
        card.style.display = cat === "all" || card.dataset.cat === cat ? "" : "none";
      });
    });
  }

  // ---- Search ----
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      [...grid.children].forEach((card) => {
        const match = card.dataset.name.includes(q) || card.dataset.sku.includes(q);
        card.style.display = match ? "" : "none";
      });
      // reset category tab to "all" visually when searching
      if (q) {
        [...tabs.children].forEach((b) => b.classList.remove("active"));
        tabs.children[0].classList.add("active");
      }
    });
  }

  // ---- Add to cart ----
  document.querySelectorAll(".add-to-cart").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price);
      const qtyInput = document.querySelector(`.qty-input[data-item-id="${id}"]`);
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);

      if (cart[id]) {
        cart[id].qty += qty;
      } else {
        cart[id] = { name, price, qty };
      }
      renderCart();
      openDrawer();
    });
  });

  function renderCart() {
    const lines = document.getElementById("cartLines");
    const countEl = document.getElementById("cartCount");
    const totalEl = document.getElementById("cartTotal");
    const form = document.getElementById("checkoutForm");
    const ids = Object.keys(cart);

    countEl.textContent = ids.reduce((sum, id) => sum + cart[id].qty, 0);

    if (ids.length === 0) {
      lines.innerHTML = '<div class="empty-cart">No items added yet. Browse the catalog and click "Add to order".</div>';
      form.style.display = "none";
      return;
    }

    form.style.display = "block";
    let total = 0;
    lines.innerHTML = ids
      .map((id) => {
        const line = cart[id];
        const lineTotal = line.price * line.qty;
        total += lineTotal;
        return `<div class="cart-line">
          <span>${line.name} × ${line.qty}</span>
          <span>€${lineTotal.toFixed(2)} <span class="rm" data-id="${id}">remove</span></span>
        </div>`;
      })
      .join("");
    totalEl.textContent = `€${total.toFixed(2)}`;

    lines.querySelectorAll(".rm").forEach((el) => {
      el.addEventListener("click", () => {
        delete cart[el.dataset.id];
        renderCart();
      });
    });
  }

  // ---- Drawer open/close ----
  const fab = document.getElementById("cartFab");
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("drawerOverlay");
  const closeBtn = document.getElementById("drawerClose");

  function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.add("open");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
  }
  if (fab) fab.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  // ---- Submit order ----
  const submitBtn = document.getElementById("submitOrderBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const resultEl = document.getElementById("orderResult");
      const name = document.getElementById("f_name").value.trim();
      const email = document.getElementById("f_email").value.trim();
      const phone = document.getElementById("f_phone").value.trim();

      if (!name || !email || !phone) {
        resultEl.style.color = "#a12631";
        resultEl.textContent = "Please fill in name, email and phone.";
        return;
      }

      const cartPayload = Object.keys(cart).map((id) => ({
        item_id: id,
        quantity: cart[id].qty
      }));

      const payload = {
        name,
        company: document.getElementById("f_company").value.trim(),
        email,
        phone,
        site_address: document.getElementById("f_address").value.trim(),
        city: document.getElementById("f_city").value.trim(),
        needed_by: document.getElementById("f_needed_by").value,
        notes: document.getElementById("f_notes").value.trim(),
        cart: JSON.stringify(cartPayload)
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";

      try {
        const res = await fetch("/order", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(payload).toString()
        });
        const data = await res.json();
        if (data.ok) {
          resultEl.style.color = "#1f7a44";
          resultEl.innerHTML = `Order <strong>${data.orderNumber}</strong> submitted — total €${data.total.toFixed(2)}. We'll confirm shortly.`;
          Object.keys(cart).forEach((k) => delete cart[k]);
          renderCart();
        } else {
          resultEl.style.color = "#a12631";
          resultEl.textContent = data.error || "Something went wrong.";
        }
      } catch (err) {
        resultEl.style.color = "#a12631";
        resultEl.textContent = "Network error — please try again.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit order";
      }
    });
  }
})();
