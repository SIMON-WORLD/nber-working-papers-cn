(function () {
  if (!document.querySelector('script[src*="page-tools.js"]')) {
    const toolsScript = document.createElement("script");
    toolsScript.src = "../assets/page-tools.js";
    document.head.appendChild(toolsScript);
  }
  const feedback = document.querySelector("[data-copy-feedback]");

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("copy failed");
  }

  document.querySelectorAll("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        await copyText(button.dataset.copyValue || "");
        button.textContent = "已复制";
        if (feedback) feedback.textContent = "";
      } catch (_) {
        if (feedback) feedback.textContent = "复制失败，请复制浏览器地址栏链接。";
      }
      window.setTimeout(() => {
        button.textContent = original;
      }, 1800);
    });
  });
})();
