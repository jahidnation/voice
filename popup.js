document.addEventListener("DOMContentLoaded", () => {
  const modeNormal = document.getElementById("modeNormal");
  const modeBnToEn = document.getElementById("modeBnToEn");
  const modeEnToBn = document.getElementById("modeEnToBn");
  const normalLangGroup = document.getElementById("normalLangGroup");
  const btnBangla = document.getElementById("btnBangla");
  const btnEnglish = document.getElementById("btnEnglish");
  const mainMicBtn = document.getElementById("mainMicBtn");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const micActionText = document.getElementById("micActionText");

  const modeButtons = [modeNormal, modeBnToEn, modeEnToBn];

  const updateUI = (isRecording, currentLang, currentMode) => {
    const mode = currentMode || localStorage.getItem("uvt_mode") || "normal";
    const lang = currentLang || localStorage.getItem("uvt_lang") || "bn-BD";

    modeButtons.forEach((btn) => btn.classList.remove("active"));
    if (mode === "bn_to_en") {
      modeBnToEn.classList.add("active");
      normalLangGroup.classList.add("disabled");
    } else if (mode === "en_to_bn") {
      modeEnToBn.classList.add("active");
      normalLangGroup.classList.add("disabled");
    } else {
      modeNormal.classList.add("active");
      normalLangGroup.classList.remove("disabled");
    }

    if (lang === "bn-BD") {
      btnBangla.classList.add("active");
      btnEnglish.classList.remove("active");
    } else {
      btnEnglish.classList.add("active");
      btnBangla.classList.remove("active");
    }

    if (isRecording) {
      mainMicBtn.classList.add("active");
      mainMicBtn.innerHTML = '<i class="fa-solid fa-microphone-lines"></i>';
      statusDot.classList.add("recording");
      if (mode === "bn_to_en") {
        statusText.innerText = "বাংলা ➔ EN";
        micActionText.innerText = "Speaking Bangla... Typing English";
      } else if (mode === "en_to_bn") {
        statusText.innerText = "EN ➔ বাংলা";
        micActionText.innerText = "Speaking English... Typing Bangla";
      } else {
        statusText.innerText = "Listening...";
        micActionText.innerText = "Listening... Click to Stop";
      }
    } else {
      mainMicBtn.classList.remove("active");
      mainMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      statusDot.classList.remove("recording");
      statusText.innerText = "Ready";
      micActionText.innerText = "Click to Speak";
    }
  };

  const getActiveTab = async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs && tabs.length > 0 ? tabs[0] : null;
    } catch {
      return null;
    }
  };

  const safeSendMessage = async (message, callback) => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      if (callback) callback(null);
      return;
    }

    if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:"))) {
      if (callback) callback(null);
      return;
    }

    try {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    } catch {
      if (callback) callback(null);
    }
  };

  const syncState = () => {
    const fallbackLang = localStorage.getItem("uvt_lang") || "bn-BD";
    const fallbackMode = localStorage.getItem("uvt_mode") || "normal";
    updateUI(false, fallbackLang, fallbackMode);

    safeSendMessage({ action: "getStatus" }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode);
      }
    });
  };

  const setMode = (mode) => {
    localStorage.setItem("uvt_mode", mode);
    updateUI(false, null, mode);
    safeSendMessage({ action: "setMode", mode }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode);
      }
    });
  };

  modeNormal.addEventListener("click", () => setMode("normal"));
  modeBnToEn.addEventListener("click", () => setMode("bn_to_en"));
  modeEnToBn.addEventListener("click", () => setMode("en_to_bn"));

  btnBangla.addEventListener("click", () => {
    localStorage.setItem("uvt_lang", "bn-BD");
    localStorage.setItem("uvt_mode", "normal");
    updateUI(false, "bn-BD", "normal");
    safeSendMessage({ action: "setLanguage", lang: "bn-BD" }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode);
      }
    });
  });

  btnEnglish.addEventListener("click", () => {
    localStorage.setItem("uvt_lang", "en-US");
    localStorage.setItem("uvt_mode", "normal");
    updateUI(false, "en-US", "normal");
    safeSendMessage({ action: "setLanguage", lang: "en-US" }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode);
      }
    });
  });

  mainMicBtn.addEventListener("click", () => {
    safeSendMessage({ action: "toggleRecording" }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode);
      }
    });
  });

  syncState();
});