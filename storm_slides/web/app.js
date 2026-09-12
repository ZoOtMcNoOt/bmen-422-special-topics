import {
  decodePixels,
  drawActivity,
  drawCamera,
  drawReconstruction,
  imageSnapshot,
} from "./renderer.js";
import { localizationCsv } from "./export.js";

const $ = (id) => document.getElementById(id);
const form = $("settings-form");
const dialog = $("model-dialog");
const number = new Intl.NumberFormat("en-US");
const controls = [
  "photon_mean",
  "n_emitters",
  "on_probability",
  "background_lambda",
  "drift_nm",
];
const defaults = {
  specimen: "filaments",
  n_emitters: 220,
  frame_count: 160,
  photon_mean: 1200,
  background_lambda: 2,
  on_probability: 0.018,
  drift_nm: 0.5,
  seed: 42,
};
const presets = {
  balanced: defaults,
  photons: {
    ...defaults,
    photon_mean: 3200,
    background_lambda: 1,
    on_probability: 0.012,
  },
  crowded: { ...defaults, n_emitters: 340, on_probability: 0.1 },
  drift: { ...defaults, drift_nm: 3.5 },
};
const specimens = {
  filaments: {
    title: "Filament study",
    description: "Trace a network of five fluorescent filaments.",
  },
  rings: {
    title: "Ring study",
    description: "Resolve the hollow centers of three fluorescent rings.",
  },
  clusters: {
    title: "Cluster study",
    description: "Separate six small islands of fluorescent labels.",
  },
};
const state = {
  experiment: null,
  pixels: null,
  widefield: null,
  frame: 160,
  view: "reconstruction",
  correctDrift: true,
  playing: false,
  busy: false,
  animation: 0,
  lastTick: 0,
};

function settings() {
  const result = Object.fromEntries(new FormData(form));
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [
      key,
      key === "specimen" ? value : Number(value),
    ]),
  );
}

function updateLabels() {
  const values = settings();
  for (const key of controls) {
    const value =
      key === "on_probability"
        ? `${(values[key] * 100).toFixed(1)}%`
        : key === "drift_nm"
          ? `${values[key].toFixed(1)} nm`
          : number.format(values[key]);
    $(`${key}-value`).textContent = value;
    $(key).setAttribute("aria-valuetext", value);
  }
  $("specimen-description").textContent =
    specimens[values.specimen].description;
  const dirty =
    state.experiment &&
    Object.keys(defaults).some(
      (key) => values[key] !== state.experiment.settings[key],
    );
  $("run-note").textContent = dirty
    ? "Settings changed. Run to update the images."
    : `Reproducible with seed ${values.seed}`;
}

function setSettings(values) {
  for (const [key, value] of Object.entries(values)) {
    if (key === "specimen") form.elements.namedItem("specimen").value = value;
    else $(key).value = value;
  }
  updateLabels();
}

function setPlaying(playing) {
  state.playing = playing;
  cancelAnimationFrame(state.animation);
  $("play-button").setAttribute(
    "aria-label",
    playing ? "Pause acquisition" : "Play acquisition",
  );
  $("play-icon").setAttribute(
    "d",
    playing ? "M7 5h3v14H7Zm7 0h3v14h-3Z" : "m9 5 11 7-11 7Z",
  );
  if (playing) {
    if (state.frame >= state.experiment.settings.frame_count) state.frame = 1;
    state.lastTick = performance.now();
    state.animation = requestAnimationFrame(tick);
  }
  updateAcquisitionStatus();
}

function tick(now) {
  if (!state.playing) return;
  const interval = 1000 / Number($("playback-speed").value);
  const steps = Math.floor((now - state.lastTick) / interval);
  if (steps > 0) {
    state.frame = Math.min(
      state.experiment.settings.frame_count,
      state.frame + steps,
    );
    state.lastTick += steps * interval;
    render();
    if (state.frame === state.experiment.settings.frame_count) {
      setPlaying(false);
      return;
    }
  }
  state.animation = requestAnimationFrame(tick);
}

function updateAcquisitionStatus() {
  if (state.busy) return;
  $("acquisition-status").textContent = !state.experiment
    ? "Ready for an experiment"
    : state.playing
      ? "Replaying acquisition"
      : state.frame === state.experiment.settings.frame_count
        ? "Acquisition complete"
        : "Acquisition paused";
}

function render() {
  const experiment = state.experiment;
  drawReconstruction($("reconstruction"), experiment, state.frame, state);
  drawCamera($("camera"), state.pixels, (state.frame - 1) * 4096);
  drawCamera($("widefield"), state.widefield);
  drawActivity($("activity-chart"), experiment?.counts_per_frame, state.frame);
  updateAcquisitionStatus();
  if (!experiment) return;
  const frameCount = experiment.settings.frame_count;
  const loc = experiment.localizations;
  const count = experiment.counts_per_frame
    .slice(0, state.frame)
    .reduce((sum, value) => sum + value, 0);
  const precisions = loc.precision_nm.slice(0, count).sort((a, b) => a - b);
  const middle = Math.floor(precisions.length / 2);
  const precision = !count
    ? null
    : count % 2
      ? precisions[middle]
      : (precisions[middle - 1] + precisions[middle]) / 2;
  const active = experiment.active_per_frame[state.frame - 1];
  $("frame-slider").max = frameCount;
  $("frame-slider").value = state.frame;
  $("frame-slider").setAttribute(
    "aria-valuetext",
    `Frame ${state.frame} of ${frameCount}`,
  );
  $("frame-value").textContent = `${state.frame} / ${frameCount} frames`;
  $("camera-index").textContent = `${state.frame} / ${frameCount}`;
  $("view-count").textContent =
    state.view === "truth"
      ? `${experiment.settings.n_emitters} reference emitters`
      : `${number.format(count)} localizations`;
  $("active-count").textContent = `${active} emitters on`;
  $("metric-count").textContent = number.format(count);
  $("metric-precision").replaceChildren(
    document.createTextNode(
      precision === null ? "— " : `${precision.toFixed(1)} `,
    ),
    Object.assign(document.createElement("em"), { textContent: "nm" }),
  );
  $("metric-active").textContent = active;
  $("total-emitters").textContent = experiment.settings.n_emitters;
  $("main-view-title").textContent =
    state.view === "truth" ? "Ground truth" : "STORM reconstruction";
  $("field-label").textContent =
    state.view === "truth"
      ? "The original fluorescent labels."
      : state.correctDrift
        ? "One blink. One fitted position."
        : "Reconstruction with sample drift.";
  $("reconstruction").setAttribute(
    "aria-label",
    state.view === "truth"
      ? `Synthetic ${experiment.settings.specimen} ground truth with ${experiment.settings.n_emitters} emitters.`
      : `STORM ${experiment.settings.specimen} reconstruction with ${count} localizations through frame ${state.frame}. Known drift correction ${state.correctDrift ? "on" : "off"}.`,
  );
  $("camera").setAttribute(
    "aria-label",
    `Camera frame ${state.frame} of ${frameCount}, with ${active} active emitters.`,
  );
  $("experiment-name").textContent =
    specimens[experiment.settings.specimen].title;
  $("insight").textContent =
    count === 0
      ? "No accepted fits yet. Try more photons or lower background."
      : experiment.settings.on_probability > 0.06
        ? "Crowded blinks can bias a single-emitter fit. Try fewer activations."
        : !state.correctDrift && experiment.settings.drift_nm > 1
          ? "Drift smears the reconstruction. Compare with known drift correction."
          : "Each point is a fitted blink. More observations gradually reveal the specimen.";
  updateAcquisitionStatus();
}

function busy(value) {
  state.busy = value;
  $("run-button").disabled = value;
  $("run-button").querySelector("span").textContent = value
    ? "Acquiring & fitting…"
    : "Run experiment";
  $("observation-panel").setAttribute("aria-busy", String(value));
  $("loading-state").hidden = !value;
  $("loading-state").querySelector(".loading-orbit").hidden = !value;
  $("play-button").disabled = value || !state.experiment;
  $("frame-slider").disabled = value || !state.experiment;
  $("export-button").disabled = value || !state.experiment;
  $("save-image").disabled = value || !state.experiment;
  if (value)
    $("acquisition-status").textContent =
      "Simulating & fitting individual blinks…";
}

async function acquire() {
  if (state.busy || !form.reportValidity()) return;
  setPlaying(false);
  const submitted = settings();
  busy(true);
  $("loading-title").textContent = "Gathering a little light";
  $("loading-description").textContent =
    "Simulating photons and fitting individual blinks…";
  $("feedback").hidden = true;
  try {
    const response = await fetch("/api/experiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitted),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      const detail =
        typeof problem.detail === "string"
          ? problem.detail
          : response.status === 422
            ? "Check the acquisition settings; one or more values are outside the supported range."
            : "The acquisition could not finish. Check that the local lab is running, then try again.";
      throw new Error(detail);
    }
    const result = await response.json();
    const framePixels = decodePixels(result.frames);
    const widefieldPixels = decodePixels(result.widefield);
    if (
      framePixels.length !== result.settings.frame_count * 4096 ||
      widefieldPixels.length !== 4096
    ) {
      throw new Error(
        "The acquisition returned incomplete images. Run the experiment again.",
      );
    }
    state.experiment = result;
    state.pixels = framePixels;
    state.widefield = widefieldPixels;
    state.frame = result.settings.frame_count;
    updateLabels();
  } catch (error) {
    $("feedback").textContent =
      error instanceof TypeError
        ? "The lab connection was interrupted. Start the local lab, then run the experiment again."
        : error.message;
    $("feedback").hidden = false;
  } finally {
    busy(false);
    render();
    if (!state.experiment) {
      $("loading-state").hidden = false;
      $("loading-title").textContent = "Ready when you are";
      $("loading-description").textContent =
        "Set up an experiment, then choose Run experiment.";
    }
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportLocalizations() {
  const experiment = state.experiment;
  if (!experiment) return;
  const acquisition = experiment.settings;
  download(
    new Blob([localizationCsv(experiment)], { type: "text/csv;charset=utf-8" }),
    `storm-${acquisition.specimen}-seed-${acquisition.seed}.csv`,
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  acquire();
});
form.addEventListener("input", (event) => {
  if (event.target.id !== "preset") $("preset").value = "custom";
  updateLabels();
});
$("preset").addEventListener("change", () => {
  const preset = presets[$("preset").value];
  if (preset) setSettings({ ...preset, specimen: settings().specimen });
});
$("reset-button").addEventListener("click", () => {
  setSettings(defaults);
  $("preset").value = "balanced";
});
$("play-button").addEventListener("click", () => {
  setPlaying(!state.playing);
  render();
});
$("frame-slider").addEventListener("input", () => {
  setPlaying(false);
  state.frame = Number($("frame-slider").value);
  render();
});
$("drift-correction").addEventListener("change", () => {
  state.correctDrift = $("drift-correction").checked;
  render();
});
document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document
      .querySelectorAll("[data-view]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    render();
  }),
);
$("export-button").addEventListener("click", exportLocalizations);
$("save-image").addEventListener("click", () => {
  const snapshot = imageSnapshot(
    $("reconstruction"),
    state.experiment,
    state.frame,
    state.view,
    state.correctDrift,
  );
  snapshot.toBlob((blob) => {
    if (blob)
      download(
        blob,
        `storm-${state.view}-seed-${state.experiment.settings.seed}.png`,
      );
  }, "image/png");
});
$("model-button").addEventListener("click", () => dialog.showModal());
$("close-model").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPlaying(false);
});
window.addEventListener("pagehide", () =>
  cancelAnimationFrame(state.animation),
);
new ResizeObserver(() => render()).observe($("observation-panel"));
updateLabels();
render();
acquire();
