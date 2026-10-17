(() => {
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesomeLink = document.createElement("link");
    fontAwesomeLink.rel = "stylesheet";
    fontAwesomeLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    document.head.appendChild(fontAwesomeLink);
  }

  const storage = (typeof chrome !== "undefined" && chrome.storage && (chrome.storage.sync || chrome.storage.local)) || null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let isRecording = false;
  let currentTarget = null;
  let toastTimer = null;
  let currentLang = "bn-BD";
  let currentMode = "normal";
  let floatingBtnEnabled = true;
  let resizeObserver = null;
  const translationCache = new Map();

  const syncGlobalSettings = (items) => {
    if (items.uvt_mode !== undefined) currentMode = items.uvt_mode;
    if (items.uvt_lang !== undefined) currentLang = items.uvt_lang;
    if (items.uvt_floating_btn !== undefined) {
      floatingBtnEnabled = items.uvt_floating_btn;
      if (!floatingBtnEnabled) {
        logoButton.style.display = "none";
      } else if (currentTarget) {
        positionLogo(currentTarget);
      }
    }
  };

  if (storage) {
    storage.get({ uvt_mode: "normal", uvt_lang: "bn-BD", uvt_floating_btn: true }, syncGlobalSettings);
  } else {
    currentMode = localStorage.getItem("uvt_mode") || "normal";
    currentLang = localStorage.getItem("uvt_lang") || "bn-BD";
    floatingBtnEnabled = localStorage.getItem("uvt_floating_btn") !== "false";
  }

  const toastElement = document.createElement("div");
  toastElement.className = "uvt-toast";
  document.body.appendChild(toastElement);

  const showToast = (message, type = "info") => {
    clearTimeout(toastTimer);
    const iconClass = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
    toastElement.className = `uvt-toast uvt-toast-${type} uvt-show`;
    toastElement.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
    toastTimer = setTimeout(() => {
      toastElement.classList.remove("uvt-show");
    }, 2800);
  };

  const logoUrl = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL("logo.png")
    : "logo.png";

  const logoButton = document.createElement("button");
  logoButton.type = "button";
  logoButton.className = "uvt-logo-trigger";
  logoButton.title = "Voice Type (Click or Alt + V)";
  logoButton.style.cssText = "position:fixed;z-index:2147483647;display:none;width:22px;height:22px;min-width:22px;border-radius:50%;background:#1e1f24;border:1px solid rgba(255,255,255,0.2);box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;padding:1px;align-items:center;justify-content:center;transition:transform 0.15s ease,box-shadow 0.2s ease,border-color 0.2s ease;user-select:none;outline:none;";

  const logoImg = document.createElement("img");
  logoImg.src = logoUrl;
  logoImg.alt = "Voice";
  logoImg.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:50%;display:block;pointer-events:none;";
  logoButton.appendChild(logoImg);
  document.body.appendChild(logoButton);

  const positionLogo = (target) => {
    if (!floatingBtnEnabled) {
      logoButton.style.display = "none";
      return;
    }
    if (!target || !document.contains(target)) {
      logoButton.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
      logoButton.style.display = "none";
      return;
    }

    const btnHeight = 22;
    const btnWidth = 22;
    const top = rect.height <= 44
      ? rect.top + (rect.height - btnHeight) / 2
      : rect.top + 6;

    let left = rect.right - btnWidth - 6;
    if (left < rect.left + 4) {
      left = rect.left + 4;
    }

    logoButton.style.top = `${Math.round(top)}px`;
    logoButton.style.left = `${Math.round(left)}px`;
    logoButton.style.display = "flex";
  };

  const updateLogoVisual = () => {
    if (isRecording) {
      logoButton.style.borderColor = "#ea4335";
      logoButton.style.boxShadow = "0 0 6px rgba(234,67,53,0.7)";
      logoButton.style.transform = "scale(1.05)";
    } else {
      logoButton.style.borderColor = "rgba(255,255,255,0.2)";
      logoButton.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
      logoButton.style.transform = "scale(1)";
    }
  };

  const translateText = async (text, fromLang, toLang) => {
    if (!text || !text.trim()) return text;
    const cleanText = text.trim();
    const cacheKey = `${fromLang}_${toLang}_${cleanText.toLowerCase()}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    try {
      const u1 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${fromLang}&tl=${toLang}&q=${encodeURIComponent(cleanText)}`;
      const r1 = await fetch(u1);
      if (r1.ok) {
        const d1 = await r1.json();
        let res = "";
        if (d1.sentences && Array.isArray(d1.sentences)) {
          res = d1.sentences.map((s) => s.trans || "").join(" ").trim();
        } else if (Array.isArray(d1)) {
          res = typeof d1[0] === "string" ? d1.join(" ") : d1[0].map((i) => i[0]).filter(Boolean).join(" ");
        }
        if (res && res !== cleanText) {
          translationCache.set(cacheKey, res);
          return res;
        }
      }
    } catch {}

    try {
      const u2 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
      const r2 = await fetch(u2);
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2 && d2[0]) {
          const res = d2[0].map((item) => item[0]).filter(Boolean).join("").trim();
          if (res) {
            translationCache.set(cacheKey, res);
            return res;
          }
        }
      }
    } catch {}

    try {
      const u3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${fromLang}|${toLang}`;
      const r3 = await fetch(u3);
      if (r3.ok) {
        const d3 = await r3.json();
        if (d3 && d3.responseData && d3.responseData.translatedText) {
          const res = d3.responseData.translatedText.trim();
          if (res && !res.toLowerCase().includes("mymemory")) {
            translationCache.set(cacheKey, res);
            return res;
          }
        }
      }
    } catch {}

    return text;
  };

  const formatBanglaPunctuation = (rawText) => {
    if (!rawText) return "";
    let s = rawText.normalize("NFC").trim();

    s = s.replace(/(^|\s)(কমা|comma)($|\s)/gi, "$1,$2");
    s = s.replace(/(^|\s)(দাঁড়ি|দাড়ি|ফুলস্টপ|ফুল স্টপ|full stop)($|\s)/gi, "$1।$2");
    s = s.replace(/(^|\s)(প্রশ্নবোধক|প্রশ্নচিহ্ন|কোশ্চেন মার্ক|question mark)($|\s)/gi, "$1?$2");

    s = s.replace(/(^|\s)(ঠিক আছে|আচ্ছা|আসলে|শুনুন|শোনো|দেখুন|দেখো|যাইহোক|যাই হোক|হ্যাঁ|না|অবশ্যই|ধন্যবাদ|হ্যালো|হাই)(?=\s|$)/gi, "$1$2,");
    s = s.replace(/(^|\s)(কিন্তু|তবে|তাহলে|সুতরাং|নাহলে|নতুবা|অথবা|কারণ)(?=\s)/gi, ", $2");
    s = s.replace(/\s+(তাই না|নাকি|হবে তো|পারবেন তো|পারবে তো|আছেন তো|আছো তো)($|[।?!,])/gi, ", $1?");

    const isQuestion = /(^|\s)(কি|কী|কেন|কোথায়|কোথাও|কখন|কেমন|কে|কার|কাকে|কিসের|কত|কবে|কিভাবে|কই|নাকি)($|\s|[।?!,])/i.test(s) || /\?$/.test(s);

    if (!/[।?!]$/.test(s)) {
      s = s.replace(/[,]+$/, "");
      s += isQuestion ? "?" : "।";
    }

    s = s.replace(/\s+([,।?!])/g, "$1");
    s = s.replace(/([,।?!])(?=[^\s,।?!])/g, "$1 ");
    s = s.replace(/,+/g, ",");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
  };

  const formatEnglishPunctuation = (rawText) => {
    if (!rawText) return "";
    let s = rawText.trim();
    s = s.replace(/(^|\s)(comma)($|\s)/gi, "$1,$2");
    s = s.replace(/(^|\s)(period|full stop)($|\s)/gi, "$1.$2");
    s = s.replace(/(^|\s)(question mark)($|\s)/gi, "$1?$2");
    s = s.replace(/(^|\s)(ok|okay|well|actually|yes|no|hello|hi|hey|sure|please)(?=\s|$)/gi, (m, p1, p2) => p1 + p2.charAt(0).toUpperCase() + p2.slice(1).toLowerCase() + ",");
    s = s.replace(/\s+(right|isn't it|aren't you|won't you)($|[.?!,])/gi, ", $1?");
    const isQuestion = /(^|\s)(what|why|when|where|who|whom|whose|which|how|is|are|am|do|does|did|can|could|will|would|should)($|\s)/i.test(s) || /\?$/.test(s);
    if (!/[.?!]$/.test(s)) {
      s = s.replace(/[,]+$/, "");
      s += isQuestion ? "?" : ".";
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    s = s.replace(/\s+([,.?!])/g, "$1");
    s = s.replace(/([,.?!])(?=[^\s,.?!])/g, "$1 ");
    s = s.replace(/,+/g, ",");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
  };

  const getTargetElement = () => {
    if (currentTarget && document.contains(currentTarget)) {
      return currentTarget;
    }
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "TEXTAREA" ||
        (active.tagName === "INPUT" && !["button", "checkbox", "radio", "submit", "file", "image"].includes(active.type)) ||
        active.isContentEditable)
    ) {
      return active;
    }
    return document.querySelector('textarea, [contenteditable="true"], input[type="text"]');
  };

  const insertText = (target, text) => {
    if (!target || !text) return;
    target.focus();
    if ("value" in target) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const prefix = start > 0 && !/\s$/.test(target.value.slice(0, start)) ? " " : "";
      const textToInsert = prefix + text;
      target.setRangeText(textToInsert, start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (target.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        document.execCommand("insertText", false, ` ${text}`);
      } else {
        target.innerText += ` ${text}`;
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    positionLogo(target);
  };

  const setupRecognition = () => {
    if (!SpeechRecognition) {
      showToast("Web Speech API not supported in this browser.", "error");
      return null;
    }
    const instance = new SpeechRecognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 5;

    if (currentMode === "bn_to_en") {
      instance.lang = "bn-BD";
    } else if (currentMode === "en_to_bn") {
      instance.lang = "en-US";
    } else {
      instance.lang = currentLang;
    }

    instance.onstart = () => {
      isRecording = true;
      updateLogoVisual();
      if (currentMode === "bn_to_en") {
        showToast("Listening: বাংলা ➔ English...", "info");
      } else if (currentMode === "en_to_bn") {
        showToast("Listening: English ➔ বাংলা...", "info");
      } else {
        showToast("Listening...", "info");
      }
    };

    instance.onresult = async (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          let chosen = "";
          const isBanglaInput = currentMode === "bn_to_en" || (currentMode === "normal" && currentLang === "bn-BD");

          for (let j = 0; j < item.length; j++) {
            const candidate = item[j].transcript.trim();
            if (isBanglaInput && /[\u0980-\u09FF]/.test(candidate)) {
              chosen = candidate;
              break;
            }
          }
          if (!chosen && item.length > 0) {
            chosen = item[0].transcript.trim();
          }

          if (chosen) {
            let processedText = chosen;
            if (currentMode === "bn_to_en") {
              const translated = await translateText(processedText, "bn", "en");
              processedText = formatEnglishPunctuation(translated);
            } else if (currentMode === "en_to_bn") {
              const translated = await translateText(processedText, "en", "bn");
              processedText = formatBanglaPunctuation(translated);
            } else if (currentLang === "bn-BD") {
              processedText = formatBanglaPunctuation(processedText);
            } else {
              processedText = formatEnglishPunctuation(processedText);
            }

            const target = getTargetElement();
            if (target) {
              insertText(target, processedText);
            }
          }
        }
      }
    };

    instance.onerror = (event) => {
      if (event.error === "no-speech") return;
      stopRecording();
      showToast(`Speech error: ${event.error}`, "error");
    };

    instance.onend = () => {
      if (isRecording) {
        stopRecording();
      }
    };

    return instance;
  };

  const startRecording = () => {
    const target = getTargetElement();
    if (!target) {
      showToast("Please click inside an input box first.", "error");
      return;
    }
    currentTarget = target;
    if (recognition) {
      try {
        recognition.abort();
      } catch {}
    }
    recognition = setupRecognition();
    if (!recognition) return;
    try {
      recognition.start();
    } catch {
      recognition.stop();
    }
  };

  const stopRecording = () => {
    isRecording = false;
    updateLogoVisual();
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }
    showToast("Listening stopped", "success");
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  logoButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleRecording();
  });

  const handleTargetFocus = (e) => {
    const el = e.target;
    if (
      el &&
      (el.tagName === "TEXTAREA" ||
        (el.tagName === "INPUT" && !["button", "checkbox", "radio", "submit", "file", "image"].includes(el.type)) ||
        el.isContentEditable)
    ) {
      if (currentTarget && resizeObserver) {
        resizeObserver.unobserve(currentTarget);
      }
      currentTarget = el;
      positionLogo(el);

      if (window.ResizeObserver) {
        if (!resizeObserver) {
          resizeObserver = new ResizeObserver(() => {
            if (currentTarget) positionLogo(currentTarget);
          });
        }
        resizeObserver.observe(el);
      }
    }
  };

  document.addEventListener("focusin", handleTargetFocus, true);
  document.addEventListener("input", () => {
    if (currentTarget) positionLogo(currentTarget);
  }, true);

  window.addEventListener("scroll", () => {
    if (currentTarget && logoButton.style.display !== "none") {
      positionLogo(currentTarget);
    }
  }, { passive: true, capture: true });

  window.addEventListener("resize", () => {
    if (currentTarget && logoButton.style.display !== "none") {
      positionLogo(currentTarget);
    }
  }, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      if (currentMode === "normal") {
        currentLang = currentLang === "bn-BD" ? "en-US" : "bn-BD";
        if (storage) storage.set({ uvt_lang: currentLang });
        showToast(`Language: ${currentLang === "bn-BD" ? "Bangla" : "English"}`, "info");
      } else {
        currentMode = currentMode === "bn_to_en" ? "en_to_bn" : "bn_to_en";
        if (storage) storage.set({ uvt_mode: currentMode });
        showToast(`Mode: ${currentMode === "bn_to_en" ? "বাংলা ➔ English" : "English ➔ বাংলা"}`, "info");
      }
      if (isRecording) {
        stopRecording();
        setTimeout(() => startRecording(), 250);
      }
    } else if (e.altKey && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      const active = document.activeElement;
      if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.isContentEditable)) {
        currentTarget = active;
        positionLogo(active);
      }
      toggleRecording();
    }
  });

  if (storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" || areaName === "local") {
        if (changes.uvt_mode) currentMode = changes.uvt_mode.newValue;
        if (changes.uvt_lang) currentLang = changes.uvt_lang.newValue;
        if (changes.uvt_floating_btn !== undefined) {
          floatingBtnEnabled = changes.uvt_floating_btn.newValue;
          if (!floatingBtnEnabled) {
            logoButton.style.display = "none";
          } else if (currentTarget) {
            positionLogo(currentTarget);
          }
        }
      }
    });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggleRecording") {
        toggleRecording();
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "setLanguage") {
        currentLang = request.lang;
        currentMode = "normal";
        showToast(`Language: ${currentLang === "bn-BD" ? "Bangla" : "English"}`, "info");
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "setMode") {
        currentMode = request.mode;
        const modeLabel = currentMode === "bn_to_en" ? "বাংলা ➔ English" : currentMode === "en_to_bn" ? "English ➔ বাংলা" : "Normal";
        showToast(`Mode: ${modeLabel}`, "info");
        if (isRecording) {
          stopRecording();
          setTimeout(() => startRecording(), 250);
        }
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "setFloatingBtn") {
        floatingBtnEnabled = !!request.enabled;
        if (!floatingBtnEnabled) {
          logoButton.style.display = "none";
        } else if (currentTarget) {
          positionLogo(currentTarget);
        }
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "getStatus") {
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      }
      return true;
    });
  }
})();