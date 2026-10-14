/* Broadlink Code Manager v0.1.1 — dependency-free Home Assistant sidebar panel. */
const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

class RM4CodeManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._started = false;
    this._busy = false;
    this._data = { remotes: [], devices: {} };
    this._entity = "";
    this._device = "";
    this._search = "";
  }

  set hass(value) {
    this._hass = value;
    if (this.isConnected && !this._started && value?.connection) {
      this._started = true;
      this.refresh();
    }
  }
  get hass() { return this._hass; }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { --bg:var(--primary-background-color,#f6f7fa); --card:var(--card-background-color,#fff); --ink:var(--primary-text-color,#202734); --muted:var(--secondary-text-color,#687383); --line:var(--divider-color,#dce0e7); --accent:var(--primary-color,#1596cb); color:var(--ink); font-family:var(--paper-font-body1_-_font-family,Roboto,Arial,sans-serif); display:block; min-height:100%; background:var(--bg); }
        * { box-sizing:border-box; }
        button, input, select, textarea { font:inherit; }
        button { border:1px solid var(--line); border-radius:10px; padding:9px 13px; color:var(--ink); background:var(--card); cursor:pointer; }
        button:hover { border-color:var(--accent); } button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        button.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:700; }
        button.danger { color:#c14e53; } button:disabled { opacity:.5; cursor:wait; }
        header { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:25px 28px 14px; }
        .brand { display:flex; flex-direction:column; gap:4px; flex:1 1 300px; } h1 { font-size:25px; margin:0; letter-spacing:-.5px; } h2 { font-size:20px; margin:0; } h3 { font-size:15px; margin:0; }
        .sub, .muted { color:var(--muted); } .sub { font-size:13px; }
        .top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        select, input, textarea { border:1px solid var(--line); border-radius:9px; color:var(--ink); background:var(--card); padding:10px; width:100%; }
        .top select { min-width:180px; max-width:290px; }
        #alert { margin:0 28px 14px; padding:12px 15px; border-radius:10px; display:none; border:1px solid var(--line); background:var(--card); }
        #alert.visible { display:block; } #alert.error { color:#a72f3e; border-color:#c76d77; }
        .layout { display:grid; grid-template-columns:290px minmax(0,1fr); gap:18px; padding:10px 28px 34px; align-items:start; }
        .panel { border:1px solid var(--line); border-radius:16px; background:var(--card); overflow:hidden; box-shadow:0 2px 8px #00000008; }
        .panelhead { padding:16px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .panelbody { padding:13px; }
        .devices { display:grid; gap:7px; } .device { border:1px solid transparent; width:100%; display:flex; gap:11px; text-align:left; align-items:center; padding:12px; background:transparent; border-radius:11px; }
        .device.active { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 9%,var(--card)); }
        .device .ico { font-size:23px; } .device .label { min-width:0; flex:1; } .device strong { display:block; overflow-wrap:anywhere; } .device small { color:var(--muted); }
        .toolbar { padding:15px 16px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; border-bottom:1px solid var(--line); }
        .toolbar input { flex:1 1 170px; max-width:380px; } .toolbar h2 { flex:1 0 100%; }
        .commandrow { display:flex; justify-content:space-between; gap:10px; align-items:center; padding:13px 16px; border-bottom:1px solid var(--line); }
        .commandrow:last-child { border-bottom:0; } .cmdname { font-weight:600; overflow-wrap:anywhere; } .pill { display:inline-block; margin-left:8px; padding:3px 7px; border:1px solid var(--line); border-radius:20px; font-size:11px; color:var(--muted); vertical-align:middle; }
        .actions { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; } .actions button { padding:8px 10px; font-size:12px; }
        .empty { padding:38px 20px; color:var(--muted); text-align:center; } .empty b { color:var(--ink); display:block; margin-bottom:6px; }
        footer { padding:0 28px 30px; color:var(--muted); font-size:12px; }
        dialog { color:var(--ink); background:var(--card); border:1px solid var(--line); width:min(620px,calc(100vw - 28px)); padding:0; border-radius:18px; box-shadow:0 20px 65px #0006; max-height:calc(100vh - 35px); }
        dialog::backdrop { background:#09121bbb; } .modalbody { padding:22px; overflow:auto; max-height:calc(100vh - 130px); }
        .formgrid { display:grid; gap:13px; margin:18px 0; } .formgrid label { display:grid; gap:6px; font-size:13px; font-weight:600; }
        .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; } .radio { display:flex; align-items:center; gap:8px; } .radio input { width:auto; }
        .hint { font-weight:400; color:var(--muted); font-size:12px; line-height:1.5; }
        .modalfoot { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px; padding:15px 22px; border-top:1px solid var(--line); }
        textarea { resize:vertical; min-height:76px; font-family:ui-monospace,Consolas,monospace; font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
        .busy { opacity:.65; pointer-events:none; } .spacer {flex:1}
        @media(max-width:740px) { header {padding:17px 14px 10px;} #alert {margin:0 14px 10px;} .layout {grid-template-columns:1fr; padding:8px 14px 24px;} .devices {grid-template-columns:repeat(auto-fit,minmax(150px,1fr));} .commandrow {align-items:flex-start;flex-direction:column;} .actions {justify-content:flex-start;} .two {grid-template-columns:1fr;} footer {padding:0 14px 20px;} }
      </style>
      <header>
        <div class="brand"><h1>Remote Manager</h1><div class="sub">Learn, test, organize and edit Broadlink IR/RF codes</div></div>
        <div class="top"><select id="remote" aria-label="Broadlink transmitter"></select><button data-act="refresh" title="Reload commands">↻ Refresh</button><button data-act="export" title="Back up commands">↓ Export</button></div>
      </header>
      <div id="alert" role="status" aria-live="polite"></div>
      <div class="layout"><aside class="panel"><div class="panelhead"><h3>Devices</h3><button data-act="newdevice" class="primary">+ Add</button></div><div id="devices" class="panelbody devices"></div></aside>
      <main class="panel" id="main"></main></div>
      <footer>Experimental v0.1.1 · Admin only · Your original Home Assistant Broadlink integration remains in control of transmitting and learning.</footer>
      <dialog id="dialog"></dialog>
    `;
    this.shadowRoot.addEventListener("click", (e) => this.onClick(e));
    this.shadowRoot.querySelector("#remote").addEventListener("change", (e) => { this._entity=e.target.value; this._device=""; this.refresh(); });
    if (this._hass?.connection && !this._started) { this._started=true; this.refresh(); }
  }

  async call(type, args={}) {
    if (!this._hass?.connection) throw Error("Home Assistant connection is not ready.");
    return this._hass.connection.sendMessagePromise({type:`rm4_code_manager/${type}`, ...args});
  }
  message(text, error=false) {
    const el=this.shadowRoot.querySelector("#alert");
    el.textContent=text || "";
    el.className=text ? `visible${error ? " error" : ""}` : "";
  }
  setBusy(b) { this._busy=b; this.shadowRoot.querySelector(".layout").classList.toggle("busy",b); this.shadowRoot.querySelectorAll("header button").forEach((el)=>el.disabled=b); }
  async refresh() {
    if (this._busy) return;
    this.setBusy(true);
    try {
      let response=await this.call("list",this._entity ? {entity_id:this._entity}:{});
      if (!response.remotes.some(r=>r.entity_id===this._entity)) {
        this._entity=response.remotes[0]?.entity_id || "";
        if(this._entity) response=await this.call("list",{entity_id:this._entity});
      }
      this._data=response;
      const remoteSelect=this.shadowRoot.querySelector("#remote");
      remoteSelect.innerHTML=response.remotes.length ? response.remotes.map((r)=>`<option value="${escapeHTML(r.entity_id)}">${escapeHTML(r.name)}</option>`).join("") : `<option>No Broadlink remotes detected</option>`;
      remoteSelect.value=this._entity;
      if (this._device && !Object.hasOwn(response.devices,this._device)) this._device="";
      if (!this._device) this._device=Object.keys(response.devices)[0] || "";
      this.draw();
    } catch(e) { this.message(this.errorText(e),true); this.draw(); }
    finally { this.setBusy(false); }
  }
  errorText(e) { return e?.message || e?.error?.message || String(e); }
  draw() {
    const groups=this._data.devices || {};
    const devices=this.shadowRoot.querySelector("#devices");
    devices.innerHTML=Object.keys(groups).length ? Object.keys(groups).map((name)=>`
      <button class="device ${name===this._device?"active":""}" data-act="device" data-device="${escapeHTML(name)}">
      <span class="ico">${/fan/i.test(name)?"🌀":/tv|television/i.test(name)?"📺":/light|lamp/i.test(name)?"💡":"🎛️"}</span>
      <span class="label"><strong>${escapeHTML(name)}</strong><small>${Object.keys(groups[name]).length} command(s)</small></span><span>›</span></button>`).join("") : `<p class="muted">No saved devices yet. Click + Add.</p>`;
    const main=this.shadowRoot.querySelector("#main");
    if (!this._entity) { main.innerHTML=`<div class="empty"><b>No Broadlink remote detected</b>Make sure the Broadlink integration is set up and provides a remote entity.</div>`;return; }
    if (!this._device) { main.innerHTML=`<div class="empty"><b>No commands yet</b>Click + Add under Devices to create your first device and learn a command.</div>`;return; }
    main.innerHTML=`<div class="toolbar"><h2>${escapeHTML(this._device)}</h2>
      <input id="search" placeholder="Search commands…" value="${escapeHTML(this._search)}" aria-label="Search commands" />
      <button class="primary" data-act="newcommand">+ Learn Command</button></div><div id="commands"></div>`;
    main.querySelector("#search").addEventListener("input",(e)=>{this._search=e.target.value;this.drawCommands();});
    this.drawCommands();
  }
  drawCommands() {
    const el=this.shadowRoot.querySelector("#commands"); if(!el) return;
    const pairs=Object.entries(this._data.devices[this._device] || {}).filter(([name])=>name.toLowerCase().includes(this._search.toLowerCase()));
    el.innerHTML=pairs.length ? pairs.map(([name,info])=>`
      <div class="commandrow"><div class="cmdname">${escapeHTML(name)}<span class="pill">${escapeHTML(info.type.toUpperCase())}</span>${info.alternative?'<span class="pill">2 codes</span>':''}</div>
      <div class="actions"><button data-act="send" data-command="${escapeHTML(name)}" title="Transmit code">▶ Test</button>
      <button data-act="edit" data-command="${escapeHTML(name)}">✎ Edit</button>
      <button data-act="relearn" data-command="${escapeHTML(name)}">↻ Re-learn</button>
      <button data-act="delete" class="danger" data-command="${escapeHTML(name)}">Delete</button></div></div>`).join("") : `<div class="empty"><b>No matching commands</b>Use + Learn Command to capture a new button.</div>`;
  }

  async onClick(e) {
    const b=e.target.closest("button[data-act]"); if (!b || this._busy) return;
    const act=b.dataset.act, command=b.dataset.command;
    if(act==="refresh") { this.message(""); await this.refresh(); }
    if(act==="export") this.exportCodes();
    if(act==="device") {this._device=b.dataset.device;this._search="";this.draw();}
    if(act==="newdevice") this.learningDialog("", "");
    if(act==="newcommand") this.learningDialog(this._device, "");
    if(act==="edit") this.editDialog(command);
    if(act==="relearn") {
      const detail=this._data.devices[this._device]?.[command];
      if(!window.confirm(`Replace the learned ${detail?.type?.toUpperCase() || "IR/RF"} code for ${this._device} / ${command}? The old code will be overwritten after a successful capture.`))return;
      await this.runAction("learn",this._device,command,detail?.type==="rf"?"rf":"ir",!!detail?.alternative);
    }
    if(act==="send") await this.runAction("send",this._device,command);
    if(act==="delete") {
      if(!window.confirm(`Delete "${command}" from "${this._device}"? This can break scripts or automations that reference the command.`))return;
      await this.runAction("delete",this._device,command);
    }
  }

  openDialog(markup) {
    const dlg=this.shadowRoot.querySelector("#dialog");
    dlg.innerHTML=markup;
    dlg.querySelectorAll("[data-close]").forEach((b)=>b.addEventListener("click",()=>dlg.close()));
    dlg.showModal();
    return dlg;
  }

  learningDialog(device, command) {
    const dlg=this.openDialog(`<form id="learnform" class="modalbody">
      <h2>Learn a remote command</h2><p class="hint">Give the remote button a name. Home Assistant will instruct you when to press your original remote.</p>
      <div class="formgrid"><label>Device name<input name="device" required maxlength="96" placeholder="Living Room TV" value="${escapeHTML(device)}"></label>
      <label>Command name<input name="command" required maxlength="96" placeholder="power_on" value="${escapeHTML(command)}"></label>
      <div class="two"><label>Signal type<select name="type"><option value="ir">Infrared (IR)</option><option value="rf">Radio frequency (RF)</option></select></label>
      <label class="radio"><input type="checkbox" name="alternate"> Learn two alternating codes</label></div>
      <p class="hint"><strong>IR:</strong> Point your remote at RM4 Pro and press the button when its indicator blinks.<br>
      <strong>RF:</strong> Hold the remote button during frequency sweep, then press it again to capture when prompted. Watch Home Assistant notifications.</p></div>
      <div class="modalfoot"><button type="button" data-close>Cancel</button><button type="button" id="paste">Paste Base64 instead</button><button class="primary" type="submit">Start Learning</button></div></form>`);
    const form=dlg.querySelector("#learnform");
    dlg.querySelector("#paste").addEventListener("click",()=>{
      const dev=form.elements.device.value.trim(),cmd=form.elements.command.value.trim();
      if(!dev || !cmd){form.reportValidity();return;}
      dlg.close();this.codeDialog({device:dev,command:cmd,code1:"",code2:""});
    });
    form.addEventListener("submit",async(e)=>{
      e.preventDefault();
      const dev=form.elements.device.value.trim(),cmd=form.elements.command.value.trim();
      const type=form.elements.type.value, alt=form.elements.alternate.checked;
      if(Object.hasOwn(this._data.devices[dev]||{},cmd) && !window.confirm("This command exists. Re-learning may overwrite its stored code. Continue?"))return;
      dlg.close();this.message(type==="rf" ? `RF learning started: hold ${cmd} to sweep, then press again when prompted. Watch HA notifications.` : `IR learning started: point at Broadlink and press ${cmd} when the LED blinks.`);
      await this.runAction("learn",dev,cmd,type,alt);
      this._device=dev;
    });
  }

  editDialog(command) {
    const data=this._data.devices[this._device][command];
    const codes=Array.isArray(data.codes)?data.codes:[data.codes];
    this.codeDialog({original_device:this._device,original_command:command,device:this._device,command,code1:codes[0]||"",code2:codes[1]||""});
  }
  codeDialog(info) {
    const dlg=this.openDialog(`<form id="codeform" class="modalbody"><h2>${info.original_command?"Edit command":"Import Base64 code"}</h2>
      <p class="hint">Rename or paste an existing Broadlink IR/RF packet. Codes are saved immediately to Broadlink's live storage. Backup the code library first.</p>
      <div class="formgrid"><div class="two"><label>Device name<input name="device" required maxlength="96" value="${escapeHTML(info.device)}"></label>
      <label>Command name<input name="command" required maxlength="96" value="${escapeHTML(info.command)}"></label></div>
      <label>Base64 code<textarea name="code1" required spellcheck="false" placeholder="JgBQAA...">${escapeHTML(info.code1)}</textarea></label>
      <label>Alternative Base64 code (optional)<textarea name="code2" spellcheck="false" placeholder="Second packet if alternating">${escapeHTML(info.code2)}</textarea></label>
      <p class="hint">Packets must begin with IR 0x26 or RF 0xB2/0xD7. Editing the signal itself is advanced; the safest way to fix an incorrect capture is Re-learn.</p></div>
      <div class="modalfoot"><button type="button" data-close>Cancel</button><button type="button" id="copycode">Copy code</button><button class="primary" type="submit">Save Changes</button></div></form>`);
    const form=dlg.querySelector("#codeform");
    dlg.querySelector("#copycode").addEventListener("click",async()=>{
      try{ await navigator.clipboard.writeText(form.elements.code1.value);this.message("Base64 code copied to clipboard."); }
      catch(e){this.message("Clipboard unavailable. Select and copy the Base64 field manually.",true);}
    });
    form.addEventListener("submit",async(e)=>{
      e.preventDefault();
      const body={entity_id:this._entity,device:form.elements.device.value.trim(),command:form.elements.command.value.trim(),
        code1:form.elements.code1.value.trim(),code2:form.elements.code2.value.trim(),
        ...(info.original_command?{original_device:info.original_device,original_command:info.original_command}:{})};
      const submit=form.querySelector('[type="submit"]'); submit.disabled=true;
      try {
        await this.call("save",body);
        dlg.close();
        this._device=body.device;
        await this.refresh();
        this.message(`Saved ${body.device} / ${body.command}.`);
      } catch(err) {
        this.message(`Save failed: ${this.errorText(err)}. Your unsaved form is still open.`,true);
      } finally { submit.disabled=false; }
    });
  }

  async runAction(action,device,command,commandType="ir",alternative=false) {
    this.setBusy(true);
    try {
      const r=await this.call("action",{entity_id:this._entity,device,command,action,command_type:commandType,alternative});
      if(action==="send")this.message(`Requested transmission of ${device} / ${command}. Verify that your appliance responded.`);
      if(action==="delete")this.message(`Deleted ${device} / ${command}.`);
      if(action==="learn")this.message(r.changed?`Learned ${device} / ${command}. Use Test to verify.`:`Learning finished, but the stored packet did not change. Test it to confirm capture succeeded.`);
      this._device=device;
    } catch(err) { this.message(`${action} failed: ${this.errorText(err)}`,true); }
    finally {this.setBusy(false);await this.refresh();}
  }

  exportCodes() {
    if(!this._entity){this.message("Choose a Broadlink transmitter first.",true);return;}
    const snapshot={exported_at:new Date().toISOString(),remote_entity:this._entity,devices:Object.fromEntries(
      Object.entries(this._data.devices).map(([device,commands])=>[device,Object.fromEntries(Object.entries(commands).map(([name,obj])=>[name,obj.codes]))]))};
    const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`broadlink-codes-${new Date().toISOString().slice(0,10)}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
    this.message("Export prepared. Store the file securely; it contains your learned remote codes.");
  }
}
customElements.define("rm4-code-manager-panel",RM4CodeManagerPanel);
