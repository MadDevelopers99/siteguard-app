(function () {
  const calcForm = document.getElementById("calcForm");
  const calcError = document.getElementById("calcError");
  const priceResultCard = document.getElementById("priceResultCard");
  const manualReviewCard = document.getElementById("manualReviewCard");
  const contactSection = document.getElementById("contactSection");
  const contactForm = document.getElementById("contactForm");
  const submitResult = document.getElementById("submitResult");

  function eur(amount) {
    return "€" + Number(amount).toFixed(2);
  }

  function calcPayload() {
    const fd = new FormData(calcForm);
    const payload = Object.fromEntries(fd.entries());
    payload.both_sides = document.getElementById("bothSidesCheck").checked ? "1" : "0";
    return payload;
  }

  calcForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    calcError.style.display = "none";
    priceResultCard.style.display = "none";
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

      if (data.manualReview) {
        manualReviewCard.style.display = "block";
        contactSection.style.display = "block";
        return;
      }

      document.getElementById("priceAmount").textContent = eur(data.totalGross);
      document.getElementById("bdSigns").textContent = data.numberOfSigns;
      document.getElementById("bdDays").textContent = data.numberOfDays + " days";
      document.getElementById("bdCalc").textContent =
        `Calculation: ${eur(data.baseServiceFee)} + (${data.numberOfSigns} × ${eur(data.signRate)} × ${data.numberOfDays} days)`;
      document.getElementById("bdTotal").textContent = eur(data.totalGross);

      priceResultCard.style.display = "block";
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
        submitResult.innerHTML = data.manualReview
          ? `Thank you — request <strong>${data.requestNumber}</strong> received. Our team will review your custom zone length and contact you.`
          : `Thank you — request <strong>${data.requestNumber}</strong> received. We will guide you through the next step.`;
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
})();
