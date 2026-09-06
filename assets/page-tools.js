(function () {
  if (document.querySelector(".back-to-top")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "back-to-top";
  button.setAttribute("aria-label", "返回顶部");
  button.textContent = "↑";
  document.body.appendChild(button);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function updateVisibility() {
    button.classList.toggle("visible", window.scrollY > 560);
  }

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
  });
  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
})();
