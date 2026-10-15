      const bootTheme = new URLSearchParams(location.search).get("bootTheme");
      if (bootTheme === "dark" || bootTheme === "light") document.documentElement.classList.add(`boot-${bootTheme}`);
      const storedLanguage = localStorage.getItem("iterlay:language");
      const systemIsChinese = navigator.languages.some((language) => language.toLowerCase().startsWith("zh"));
      const locale = storedLanguage === "zh-CN" || storedLanguage === "en-US"
        ? storedLanguage
        : systemIsChinese ? "zh-CN" : "en-US";
      document.documentElement.lang = locale;

document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("boot-status");
  if (status && document.documentElement.lang === "en-US") status.textContent = "Opening Iterlay";
});
