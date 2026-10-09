if (typeof document !== "undefined") {
  // The pane owns the only scrollbar in the app. Without these three rules the
  // document scrolls as well, which is what showed up as a second bar down the
  // side of the window.
  const style = document.createElement("style");
  style.textContent = `html, body, #root { height: 100%; margin: 0; overflow: hidden; }
  body { overscroll-behavior: none; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.24); background-clip: content-box; border: 3px solid transparent; }
  ::-webkit-scrollbar-track { background: transparent; }`;
  document.head.appendChild(style);
}

export const css = `
.app {
  display: flex; height: 100vh; min-height: 0;
  font-family: "Inter Variable", Inter, system-ui, sans-serif;
  color: rgba(255,255,255,0.88); background: #0d0d0f;
  font-size: 13px; -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
:focus-visible { outline: 2px solid rgba(255,255,255,0.5); outline-offset: 2px; border-radius: 6px; }

/* ---- rail ------------------------------------------------------------- */
.rail {
  width: 208px; flex: none; padding: 18px 14px 16px; display: flex; flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.022);
}
.mark { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14.5px; letter-spacing: -0.015em; padding: 4px 8px 20px; }
.mark .dots { display: inline-flex; gap: 3px; align-items: center; }
.mark .dots i { width: 4px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.8); }
.mark .dots i:nth-child(2) { opacity: 0.72; }
.mark .dots i:nth-child(3) { opacity: 0.45; }
.rail-group { display: flex; flex-direction: column; gap: 1px; }
.tab {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 10px; border: 0; border-radius: 9px; cursor: pointer;
  background: transparent; color: rgba(255,255,255,0.56);
  font: inherit; font-weight: 450; text-align: left;
  transition: background 0.18s ease, color 0.18s ease;
}
.tab:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.86); }
.tab.on { background: rgba(255,255,255,0.09); color: #fff; font-weight: 500; }
.tab.record {
  margin-top: auto; color: rgba(255,255,255,0.86);
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
}
.tab.record:hover { background: rgba(255,255,255,0.08); }
.tab.record .dot { width: 8px; height: 8px; border-radius: 999px; background: #ff5a52; box-shadow: 0 0 0 3px rgba(255,90,82,0.18); flex: none; }

/* ---- pane ------------------------------------------------------------- */
.pane { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; }
.pane-inner { max-width: 720px; margin: 0 auto; padding: 34px 36px 56px; }
h1 { font-size: 21px; font-weight: 600; letter-spacing: -0.022em; margin: 0 0 4px; }
.lede { color: rgba(255,255,255,0.46); margin: 0 0 26px; line-height: 1.55; max-width: 52ch; }
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }

section { margin-bottom: 34px; }
.section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.09em;
  color: rgba(255,255,255,0.34); margin: 0 0 10px; padding: 0 2px;
}
.card {
  border: 1px solid rgba(255,255,255,0.075); border-radius: 14px;
  background: rgba(255,255,255,0.025); overflow: hidden;
}

/* ---- rows ------------------------------------------------------------- */
.row { display: flex; align-items: center; gap: 22px; padding: 13px 16px; }
.row + .row { border-top: 1px solid rgba(255,255,255,0.055); }
.row-text { flex: 1; min-width: 0; }
.row-label { font-size: 13px; font-weight: 450; }
.row-hint { font-size: 11.5px; color: rgba(255,255,255,0.4); margin-top: 2px; line-height: 1.45; }
.row-ctl { flex: none; display: flex; align-items: center; gap: 10px; }
.text {
  background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.1); color: #fff;
  border-radius: 9px; padding: 7px 11px; font: inherit; min-width: 214px; outline: none;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.text:hover { border-color: rgba(255,255,255,0.16); }
.text:focus { border-color: rgba(255,255,255,0.28); background: rgba(0,0,0,0.42); }
select.text { cursor: pointer; padding-right: 8px; }
input[type="range"] { width: 176px; accent-color: rgba(255,255,255,0.72); }

.toggle {
  width: 40px; height: 23px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.08); cursor: pointer; padding: 0; position: relative;
  transition: background 0.22s ease, border-color 0.22s ease;
}
.toggle i {
  position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 999px;
  background: rgba(255,255,255,0.78); transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
}
.toggle.on { background: rgba(255,255,255,0.9); border-color: transparent; }
.toggle.on i { transform: translateX(17px); background: #0d0d0f; }

/* ---- models ----------------------------------------------------------- */
.model { display: flex; gap: 18px; align-items: center; padding: 14px 16px; }
.model + .model { border-top: 1px solid rgba(255,255,255,0.055); }
.model-main { flex: 1; min-width: 0; }
.model-title { display: flex; align-items: center; gap: 9px; font-size: 13.5px; font-weight: 500; }
.model-sub { font-size: 11.5px; color: rgba(255,255,255,0.4); margin-top: 2px; }
.model-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.bar { position: relative; height: 6px; margin-top: 11px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }
.bar i { position: absolute; inset: 0 auto 0 0; background: rgba(255,255,255,0.34); border-radius: 999px; transition: width 0.24s ease; }
.bar-label { font-size: 10.5px; color: rgba(255,255,255,0.42); margin-top: 6px; font-variant-numeric: tabular-nums; }
.ok { font-size: 11.5px; color: #79d39c; display: inline-flex; align-items: center; gap: 5px; }
.ok::before { content: ""; width: 5px; height: 5px; border-radius: 999px; background: #79d39c; }
.model-err { font-size: 11.5px; color: #ff8b84; margin-top: 6px; }

.btn {
  display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 9px;
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.9); color: #0d0d0f;
  font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap;
  transition: background 0.18s ease, opacity 0.18s ease, transform 0.12s ease;
}
.btn:hover { background: #fff; }
.btn:active { transform: scale(0.985); }
.btn.ghost { background: transparent; color: rgba(255,255,255,0.78); border-color: rgba(255,255,255,0.14); }
.btn.ghost:hover { background: rgba(255,255,255,0.07); color: #fff; }
.btn.icon { padding: 8px; background: transparent; color: rgba(255,255,255,0.5); border-color: transparent; }
.btn.icon:hover { background: rgba(255,255,255,0.08); color: #fff; }
.btn:disabled { opacity: 0.45; cursor: default; }

.tag {
  font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.55);
}
.tag.streaming { background: rgba(122,162,255,0.16); color: #a8c2ff; }
.tag.review { background: rgba(255,190,120,0.15); color: #ffcf9a; }
.tag.window { background: rgba(127,211,155,0.15); color: #a5e0bd; }
.tag.clipboard { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
.tag.none { background: rgba(255,139,132,0.14); color: #ffb0aa; }

/* ---- history ---------------------------------------------------------- */
.entry { display: flex; gap: 14px; align-items: flex-start; padding: 13px 16px; }
.entry + .entry { border-top: 1px solid rgba(255,255,255,0.055); }
.entry-text { flex: 1; min-width: 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.entry-meta { display: flex; align-items: center; gap: 9px; flex: none; font-size: 11px; color: rgba(255,255,255,0.34); }
.entry-meta .btn.icon { padding: 4px; }

/* ---- diagnostics ------------------------------------------------------ */
.kv-row { display: flex; gap: 18px; padding: 9px 16px; align-items: baseline; }
.kv-row + .kv-row { border-top: 1px solid rgba(255,255,255,0.055); }
.kv-row span { width: 132px; flex: none; color: rgba(255,255,255,0.4); font-size: 11.5px; }
.kv-row code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; color: rgba(255,255,255,0.8); word-break: break-all; }
.log {
  background: rgba(0,0,0,0.34); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px;
  padding: 12px 14px; height: 300px; overflow-y: auto;
}
.log-line { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; line-height: 1.7; color: rgba(255,255,255,0.7); word-break: break-word; }
.log-line.error { color: #ff8b84; }

.empty { padding: 44px 16px; text-align: center; color: rgba(255,255,255,0.5); }
.empty .dim { color: rgba(255,255,255,0.32); font-size: 11.5px; margin-top: 4px; }
.dim { color: rgba(255,255,255,0.34); }
`;
