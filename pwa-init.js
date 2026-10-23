/* Installation behavior only. No Firestore reads or writes here. */
(() => {
  const installButton = document.getElementById("mobileInstallBtn");
  let deferredInstall = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    if (installButton) installButton.hidden = false;
  });
  installButton?.addEventListener("click", async () => {
    if (!deferredInstall) return;
    const prompt = deferredInstall;
    deferredInstall = null;
    installButton.hidden = true;
    try { await prompt.prompt(); await prompt.userChoice; } catch (error) {
      console.warn("앱 설치 대화상자 표시 실패:", error);
    }
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    if (installButton) installButton.hidden = true;
  });
  document.getElementById("mobileLogoutBtn")?.addEventListener("click", () => {
    document.getElementById("logoutBtn")?.click();
  });
  document.getElementById("mobileAddBtn")?.addEventListener("click", () => {
    const field = document.getElementById("titleInput");
    document.getElementById("addForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => field?.focus({ preventScroll: true }), 320);
  });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .catch((error) => console.warn("앱 설치 지원 초기화 실패:", error));
    });
  }
})();
