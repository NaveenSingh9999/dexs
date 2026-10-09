import { useCallback, useEffect, useState, type JSX } from "react";
import {
  GearSix,
  DownloadSimple,
  Trash,
  Copy,
  ClockCounterClockwise,
  Pulse,
  Stop,
} from "@phosphor-icons/react";
import { css } from "./styles";
import type { ModelSpec, ModelStatus } from "../../../core/models";
import type { HistoryEntry, DexsSettings } from "../../../core/settings";
import type { DownloadProgress } from "../../../main/models";

type Tab = "settings" | "models" | "history" | "diagnostics";

interface Diagnostics {
  platform: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
  modelsDir: string;
  hotkey: string;
  hotkeyRegistered: boolean;
  sherpa: string;
  session: string;
  lines: { at: number; level: string; line: string }[];
  settings: DexsSettings;
}

type ModelRow = ModelStatus & { spec?: ModelSpec };

const TABS: { id: Tab; label: string }[] = [
  { id: "settings", label: "Dictation" },
  { id: "models", label: "Models" },
  { id: "history", label: "History" },
  { id: "diagnostics", label: "Diagnostics" },
];

const ICONS: Record<Tab, JSX.Element> = {
  settings: <GearSix size={15} weight="duotone" />,
  models: <DownloadSimple size={15} weight="duotone" />,
  history: <ClockCounterClockwise size={15} weight="duotone" />,
  diagnostics: <Pulse size={15} weight="duotone" />,
};

export default function MainApp(): JSX.Element {
  const [tab, setTab] = useState<Tab>("settings");
  const [settings, setSettings] = useState<DexsSettings | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>(
    {},
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  const reloadModels = useCallback((): void => {
    void window.api.getModels().then((m) => setModels(m as ModelRow[]));
  }, []);

  useEffect(() => {
    void window.api.getSettings().then((s) => setSettings(s as DexsSettings));
    reloadModels();
    void window.api.getHistory().then((h) => setHistory(h as HistoryEntry[]));
    window.api.onSettings((s) => setSettings(s));
    window.api.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.modelId]: p }));
      if (p.done) reloadModels();
    });
  }, [reloadModels]);

  useEffect(() => {
    if (tab !== "diagnostics") return;
    void window.api.getDiagnostics().then((d) => setDiag(d as Diagnostics));
  }, [tab]);

  const update = useCallback((patch: Partial<DexsSettings>): void => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      window.api.setSettings(next);
      return next;
    });
  }, []);

  return (
    <div className="app">
      <style>{css}</style>
      <nav className="rail">
        <div className="mark">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          Dexs
        </div>
        <div className="rail-group">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {ICONS[t.id]}
              {t.label}
            </button>
          ))}
        </div>
        <button className="tab record" onClick={() => window.api.toggle()}>
          <span className="dot" />
          Dictate now
        </button>
      </nav>

      <main className="pane">
        <div className="pane-inner">
          {tab === "settings" && settings && (
            <SettingsPane settings={settings} update={update} />
          )}
          {tab === "models" && (
            <ModelsPane
              models={models}
              progress={progress}
              modelsDir={settings?.modelsDir ?? ""}
              onDownload={(id) => window.api.downloadModel(id)}
              onCancel={(id) => window.api.cancelModel(id)}
              onRemove={(id) => window.api.removeModel(id)}
            />
          )}
          {tab === "history" && (
            <HistoryPane
              history={history}
              onCopy={(id) => window.api.copyHistory(id)}
              onClear={() => {
                window.api.clearHistory();
                setHistory([]);
              }}
            />
          )}
          {tab === "diagnostics" && <DiagnosticsPane diag={diag} />}
        </div>
      </main>
    </div>
  );
}

function SettingsPane({
  settings,
  update,
}: {
  settings: DexsSettings;
  update: (patch: Partial<DexsSettings>) => void;
}): JSX.Element {
  return (
    <>
      <div className="head-row">
        <div>
          <h1>Dictation</h1>
          <p className="lede">
            Everything runs on this machine. A take ends with one paste, into a
            field the system tells us is editable.
          </p>
        </div>
      </div>

      <section>
        <h2 className="section-title">Trigger</h2>
        <div className="card">
          <Row
            label="Push to talk"
            hint="Hold the shortcut, speak, then release to finish the take."
          >
            <input
              className="text"
              value={settings.hotkey}
              spellCheck={false}
              onChange={(e) => update({ hotkey: e.target.value })}
            />
          </Row>
          <Row
            label="Screen corner"
            hint="Where the pill parks. You can also drag it anywhere, and it "
          >
            <select
              className="text"
              value={`${settings.slot.h}/${settings.slot.v}`}
              onChange={(e) => {
                const [h, v] = e.target.value.split("/");
                update({
                  slot: {
                    h: h as DexsSettings["slot"]["h"],
                    v: v as DexsSettings["slot"]["v"],
                  },
                });
              }}
            >
              {[
                ["h-left/v-top", "Top left"],
                ["h-center/v-top", "Top centre"],
                ["h-right/v-top", "Top right"],
                ["h-left/v-middle", "Middle left"],
                ["h-center/v-middle", "Middle"],
                ["h-right/v-middle", "Middle right"],
                ["h-left/v-bottom", "Bottom left"],
                ["h-center/v-bottom", "Bottom centre"],
                ["h-right/v-bottom", "Bottom right"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Row
            label="Edge margin"
            hint={`${settings.edgeMargin} px of clearance from the screen edge.`}
          >
            <input
              type="range"
              min={0}
              max={48}
              value={settings.edgeMargin}
              onChange={(e) => update({ edgeMargin: Number(e.target.value) })}
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="section-title">Delivery</h2>
        <div className="card">
          <Row
            label="Paste on finish"
            hint="Pastes into the focused field once, when the take ends."
          >
            <Toggle
              on={settings.pasteOnFinish}
              onChange={(v) => update({ pasteOnFinish: v })}
            />
          </Row>
          <Row
            label="Clipboard fallback"
            hint="Copy instead when no editable field can be found."
          >
            <Toggle
              on={settings.clipboardFallback}
              onChange={(v) => update({ clipboardFallback: v })}
            />
          </Row>
          <Row
            label="Review pass"
            hint="Fixes punctuation and casing on every finished phrase."
          >
            <Toggle
              on={settings.reviewEnabled}
              onChange={(v) => update({ reviewEnabled: v })}
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="section-title">Pill</h2>
        <div className="card">
          <Row
            label="Grow with text"
            hint="The pill widens for long phrases instead of scrolling them."
          >
            <Toggle
              on={settings.dynamicSize}
              onChange={(v) => update({ dynamicSize: v })}
            />
          </Row>
          <Row
            label="Dim live text"
            hint="Unsettled words stay faint until the review pass confirms them."
          >
            <Toggle
              on={settings.dimPartials}
              onChange={(v) => update({ dimPartials: v })}
            />
          </Row>
          <Row label="Stop button" hint="Shown in the pill while recording.">
            <Toggle
              on={settings.showStopButton}
              onChange={(v) => update({ showStopButton: v })}
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="section-title">Advanced</h2>
        <div className="card">
          <Row
            label="Download models automatically"
            hint="Fetch the models above the first time they are needed."
          >
            <Toggle
              on={settings.autoDownloadModels}
              onChange={(v) => update({ autoDownloadModels: v })}
            />
          </Row>
          <Row
            label="Verbose logging"
            hint="Spell out what the recogniser and the session are doing."
          >
            <Toggle
              on={settings.verboseLogging}
              onChange={(v) => update({ verboseLogging: v })}
            />
          </Row>
        </div>
      </section>
    </>
  );
}

function ModelsPane({
  models,
  progress,
  modelsDir,
  onDownload,
  onCancel,
  onRemove,
}: {
  models: ModelRow[];
  progress: Record<string, DownloadProgress>;
  modelsDir: string;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}): JSX.Element {
  return (
    <>
      <div className="head-row">
        <div>
          <h1>Models</h1>
          <p className="lede">
            Speech runs locally, so the models have to be here before dictation
            can start. Nothing is uploaded, ever.
          </p>
        </div>
      </div>
      <div className="card">
        {models.map((m) => {
          const p = progress[m.id];
          const busy = !!p && !p.done;
          return (
            <div className="model" key={m.id}>
              <div className="model-main">
                <div className="model-title">
                  {m.spec?.title ?? m.id}
                  <span className={`tag ${m.spec?.role ?? ""}`}>
                    {m.spec?.role}
                  </span>
                </div>
                <div className="model-sub">
                  {m.spec?.blurb ?? `${m.sizeMB} MB`}
                </div>
                {busy && (
                  <>
                    <div className="bar">
                      <i
                        style={{ width: `${Math.round(p.progress * 100)}%` }}
                      />
                    </div>
                    <div className="bar-label">
                      {p.file ? `${p.file} · ` : ""}
                      {Math.round(p.progress * 100)}%
                    </div>
                  </>
                )}
                {p?.error && <div className="model-err">{p.error}</div>}
              </div>
              <div className="model-actions">
                {m.installed && !busy && <span className="ok">Installed</span>}
                <button
                  className="btn ghost"
                  onClick={() => (busy ? onCancel(m.id) : onDownload(m.id))}
                >
                  {busy ? (
                    <>
                      <Stop size={14} weight="fill" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <DownloadSimple size={14} weight="bold" />
                      {m.installed ? "Repair" : "Download"}
                    </>
                  )}
                </button>
                {m.installed && !busy && (
                  <button
                    className="btn icon"
                    aria-label={`Delete ${m.spec?.title ?? m.id}`}
                    onClick={() => onRemove(m.id)}
                  >
                    <Trash size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="dim" style={{ marginTop: 12, fontSize: 11.5 }}>
        {modelsDir
          ? `Stored in ${modelsDir}`
          : "Stored with your Dexs user data."}
      </p>
    </>
  );
}

function HistoryPane({
  history,
  onCopy,
  onClear,
}: {
  history: HistoryEntry[];
  onCopy: (id: string) => void;
  onClear: () => void;
}): JSX.Element {
  return (
    <>
      <div className="head-row">
        <div>
          <h1>History</h1>
          <p className="lede">
            Every finished phrase, with where the text went.
          </p>
        </div>
        {history.length > 0 && (
          <button className="btn ghost" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="card">
          <div className="empty">
            Nothing dictated yet.
            <div className="dim">
              Hold the shortcut, speak, and it will show up here.
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          {history.map((h) => (
            <div className="entry" key={h.id}>
              <div className="entry-text">{h.text}</div>
              <div className="entry-meta">
                <span>{new Date(h.at).toLocaleString()}</span>
                <span className={`tag ${h.delivered}`}>
                  {h.delivered === "window"
                    ? "pasted"
                    : h.delivered === "clipboard"
                      ? "clipboard"
                      : "not pasted"}
                </span>
                <button
                  className="btn icon"
                  aria-label="Copy"
                  onClick={() => onCopy(h.id)}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DiagnosticsPane({ diag }: { diag: Diagnostics | null }): JSX.Element {
  if (!diag) {
    return (
      <div className="card">
        <div className="empty">Reading state…</div>
      </div>
    );
  }
  const rows: [string, string][] = [
    ["Platform", `${diag.platform} ${diag.arch}`],
    ["Electron", diag.electron],
    ["Chromium", diag.chrome],
    ["Node", diag.node],
    ["Speech engine", diag.sherpa],
    ["Session", diag.session],
    [
      "Hotkey",
      `${diag.hotkey}${
        diag.hotkeyRegistered ? "" : " (not registered — another app owns it)"
      }`,
    ],
    ["Models", diag.modelsDir || "user data folder"],
  ];
  return (
    <>
      <div className="head-row">
        <div>
          <h1>Diagnostics</h1>
          <p className="lede">
            Everything needed to work out why something is not behaving.
          </p>
        </div>
      </div>
      <section>
        <h2 className="section-title">Runtime</h2>
        <div className="card">
          {rows.map(([k, v]) => (
            <div className="kv-row" key={k}>
              <span>{k}</span>
              <code>{v}</code>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="section-title">Event log</h2>
        <div className="log">
          {diag.lines.length === 0 ? (
            <div className="dim">No events yet.</div>
          ) : (
            diag.lines.slice(-200).map((l, i) => (
              <div className={`log-line ${l.level}`} key={i}>
                <span className="dim">
                  {new Date(l.at).toLocaleTimeString()}
                </span>{" "}
                {l.line}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-label">{label}</div>
        <div className="row-hint">{hint}</div>
      </div>
      <div className="row-ctl">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      className={`toggle${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}
