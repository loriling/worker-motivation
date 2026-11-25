(() => {
  "use strict";

  const STORAGE_KEY = "salary-ticker-settings-v1";
  const DEFAULT_SETTINGS = {
    monthlySalary: 10000,
    workdays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00"
  };

  const form = document.querySelector("#settings-form");
  const salaryInput = document.querySelector("#monthly-salary");
  const startInput = document.querySelector("#start-time");
  const endInput = document.querySelector("#end-time");
  const dayInputs = [...document.querySelectorAll('input[name="workday"]')];
  const progressBar = document.querySelector('[role="progressbar"]');
  const installButton = document.querySelector("#install-app");
  const installStatus = document.querySelector("#install-status");
  let settings = loadSettings();
  let saveMessageTimer;
  let deferredInstallPrompt;

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (isValidSettings(stored)) return stored;
    } catch (_) {
      // localStorage may be unavailable or contain stale data; defaults keep the app usable.
    }
    return { ...DEFAULT_SETTINGS, workdays: [...DEFAULT_SETTINGS.workdays] };
  }

  function isValidSettings(value) {
    return value
      && Number.isFinite(Number(value.monthlySalary))
      && Number(value.monthlySalary) > 0
      && Array.isArray(value.workdays)
      && value.workdays.length > 0
      && value.workdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
      && /^\d{2}:\d{2}$/.test(value.startTime)
      && /^\d{2}:\d{2}$/.test(value.endTime)
      && timeToMinutes(value.endTime) > timeToMinutes(value.startTime);
  }

  function timeToMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function populateForm() {
    salaryInput.value = settings.monthlySalary;
    startInput.value = settings.startTime;
    endInput.value = settings.endTime;
    dayInputs.forEach(input => { input.checked = settings.workdays.includes(Number(input.value)); });
    updateCalculationSummary();
  }

  function getDraftSettings() {
    return {
      monthlySalary: Number(salaryInput.value),
      workdays: dayInputs.filter(input => input.checked).map(input => Number(input.value)),
      startTime: startInput.value,
      endTime: endInput.value
    };
  }

  function validateForm() {
    clearErrors();
    const draft = getDraftSettings();
    let firstInvalid = null;

    if (!Number.isFinite(draft.monthlySalary) || draft.monthlySalary <= 0) {
      showError(salaryInput, "salary-error", "请输入大于 0 的月薪。", () => { firstInvalid ??= salaryInput; });
    }
    if (draft.workdays.length === 0) {
      document.querySelector("#workdays-error").textContent = "请至少选择一个工作日。";
      firstInvalid ??= dayInputs[0];
    }
    if (!draft.startTime || !draft.endTime || timeToMinutes(draft.endTime) <= timeToMinutes(draft.startTime)) {
      document.querySelector("#time-error").textContent = "下班时间需要晚于上班时间。";
      startInput.setAttribute("aria-invalid", "true");
      endInput.setAttribute("aria-invalid", "true");
      firstInvalid ??= startInput;
    }
    if (firstInvalid) firstInvalid.focus();
    return firstInvalid ? null : draft;
  }

  function showError(input, errorId, message, callback) {
    input.setAttribute("aria-invalid", "true");
    document.querySelector(`#${errorId}`).textContent = message;
    callback();
  }

  function clearErrors() {
    [salaryInput, startInput, endInput].forEach(input => input.removeAttribute("aria-invalid"));
    document.querySelectorAll(".field-error").forEach(error => { error.textContent = ""; });
  }

  function updateCalculationSummary() {
    const draft = getDraftSettings();
    const duration = draft.startTime && draft.endTime
      ? (timeToMinutes(draft.endTime) - timeToMinutes(draft.startTime)) / 60
      : 0;
    const hoursText = duration > 0 ? `${formatCompact(duration)} 小时` : "-- 小时";
    document.querySelector("#calculation-summary").textContent = `每天 ${hoursText}，每周 ${draft.workdays.length} 天`;
  }

  function formatCompact(value) {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
  }

  function formatMoney(value, digits) {
    return new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: true
    }).format(Math.max(0, value));
  }

  function getTodaySchedule(now) {
    const startMinutes = timeToMinutes(settings.startTime);
    const endMinutes = timeToMinutes(settings.endTime);
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
    return { start, end, durationMs: end - start };
  }

  function calculate(now) {
    const { start, end, durationMs } = getTodaySchedule(now);
    const isWorkday = settings.workdays.includes(now.getDay());
    const weeklyHours = (durationMs / 3_600_000) * settings.workdays.length;
    const monthlyHours = weeklyHours * 52 / 12;
    const hourlyRate = settings.monthlySalary / monthlyHours;
    let elapsedMs = 0;
    let state = "rest";

    if (isWorkday) {
      if (now < start) state = "before";
      else if (now >= end) { state = "done"; elapsedMs = durationMs; }
      else { state = "working"; elapsedMs = now - start; }
    }

    return {
      state,
      start,
      end,
      hourlyRate,
      earnings: hourlyRate * (elapsedMs / 3_600_000),
      progress: durationMs > 0 ? Math.min(1, elapsedMs / durationMs) : 0,
      remainingMs: Math.max(0, end - now)
    };
  }

  function updateDashboard() {
    const now = new Date();
    const result = calculate(now);
    const currentTime = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", weekday: "short",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(now);
    document.querySelector("#current-time").textContent = currentTime;
    document.querySelector("#today-earnings").textContent = formatMoney(result.earnings, 4);
    document.querySelector("#hourly-rate").textContent = `¥${formatMoney(result.hourlyRate, 2)}`;
    document.querySelector("#minute-rate").textContent = `¥${formatMoney(result.hourlyRate / 60, 4)}`;
    document.querySelector("#second-rate").textContent = `¥${formatMoney(result.hourlyRate / 3600, 6)}`;

    const percent = result.progress * 100;
    document.querySelector("#progress-percent").textContent = `${percent.toFixed(1)}%`;
    document.querySelector("#progress-fill").style.width = `${percent}%`;
    progressBar.setAttribute("aria-valuenow", String(Math.round(percent)));
    document.querySelector("#start-time-label").textContent = `开始 ${settings.startTime}`;
    document.querySelector("#end-time-label").textContent = `结束 ${settings.endTime}`;
    document.querySelector("#schedule-label").textContent = `${weekdaySummary(settings.workdays)} · ${settings.startTime} - ${settings.endTime}`;
    updateStatus(result);
  }

  function weekdaySummary(days) {
    const weekdays = [1, 2, 3, 4, 5];
    if (days.length === 5 && weekdays.every(day => days.includes(day))) return "周一至周五";
    const names = ["日", "一", "二", "三", "四", "五", "六"];
    return days.map(day => `周${names[day]}`).join("、");
  }

  function updateStatus(result) {
    const badge = document.querySelector("#work-status");
    const text = document.querySelector("#status-text");
    const remaining = document.querySelector("#remaining-label");
    badge.classList.remove("is-off", "is-done");

    if (result.state === "working") {
      text.textContent = "正在上班 · 收入累积中";
      remaining.textContent = `距下班 ${formatDuration(result.remainingMs)}`;
    } else if (result.state === "before") {
      badge.classList.add("is-off");
      text.textContent = "今天还未开工";
      remaining.textContent = `距上班 ${formatDuration(result.start - new Date())}`;
    } else if (result.state === "done") {
      badge.classList.add("is-done");
      text.textContent = "今日工作已完成";
      remaining.textContent = "今日已完成";
    } else {
      badge.classList.add("is-off");
      text.textContent = "今天是休息日";
      remaining.textContent = "好好休息";
    }
  }

  function formatDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes} 分钟`;
    return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const draft = validateForm();
    if (!draft) return;
    settings = draft;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) {}
    updateDashboard();
    updateCalculationSummary();
    const status = document.querySelector("#save-status");
    status.textContent = "设置已保存，计时已更新。";
    clearTimeout(saveMessageTimer);
    saveMessageTimer = setTimeout(() => { status.textContent = ""; }, 4000);
  });

  function setupInstallPrompt() {
    const supportsWebInstall = typeof Navigator.prototype.install === "function";

    if (supportsWebInstall) installButton.hidden = false;

    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = undefined;
      installButton.hidden = true;
      installStatus.textContent = "薪动已安装。";
    });

    installButton.addEventListener("click", async () => {
      if (installButton.getAttribute("aria-disabled") === "true") return;
      installButton.setAttribute("aria-disabled", "true");

      try {
        if (supportsWebInstall) {
          await navigator.install();
          installStatus.textContent = "薪动已安装或打开。";
          installButton.hidden = true;
        } else if (deferredInstallPrompt) {
          const promptEvent = deferredInstallPrompt;
          deferredInstallPrompt = undefined;
          await promptEvent.prompt();
          const { outcome } = await promptEvent.userChoice;
          installStatus.textContent = outcome === "accepted" ? "薪动已安装。" : "已取消安装。";
          installButton.hidden = true;
        }
      } catch (error) {
        installStatus.textContent = error.name === "AbortError" ? "已取消安装。" : "暂时无法安装应用。";
        if (error.name !== "AbortError") console.error(error);
      } finally {
        installButton.removeAttribute("aria-disabled");
      }
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(error => {
        console.error("Service Worker registration failed:", error);
      });
    });
  }

  [salaryInput, startInput, endInput, ...dayInputs].forEach(input => {
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      updateCalculationSummary();
    });
  });

  populateForm();
  setupInstallPrompt();
  registerServiceWorker();
  updateDashboard();
  window.setInterval(updateDashboard, 100);
})();
