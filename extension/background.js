// ============================================================================
//  Service worker: hace CLICS REALES (de confianza) con chrome.debugger (CDP).
//  Los formularios React (FB/IG/WhatsApp/TikTok) rechazan los clics sintéticos
//  de una extensión para marcar radios/casillas; solo aceptan clics reales.
//  El popup envía una lista de selectores y aquí se hace un clic real en cada uno.
//  Solo marca (clic) cuando el elemento NO está ya marcado, para no des-marcar.
// ============================================================================

function cmd(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (r) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
}
function attach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}
function detach(tabId) {
  return new Promise((resolve) => { chrome.debugger.detach({ tabId }, () => resolve()); });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Devuelve las coordenadas del centro del control a clicar (su label visible si lo
// tiene). Devuelve null si el elemento no existe o YA está marcado (no re-clicar).
function exprCoords(sel) {
  return "(function(){var e=document.querySelector(" + JSON.stringify(sel) + ");" +
    "if(!e) return null;" +
    "if((e.type==='radio'||e.type==='checkbox') && e.checked) return null;" +
    "var l=null; try{ if(e.id) l=document.querySelector('label[for=\"'+(window.CSS?CSS.escape(e.id):e.id)+'\"]'); }catch(x){}" +
    "var t=(l && l.getBoundingClientRect().width>1)? l : e;" +
    "try{ t.scrollIntoView({block:'center'}); }catch(x){}" +
    "var r=t.getBoundingClientRect();" +
    "if(r.width<1||r.height<1){ r=e.getBoundingClientRect(); }" +
    "if(r.width<1||r.height<1) return null;" +
    "return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};})()";
}

async function clicReal(tabId, sel) {
  const r = await cmd(tabId, "Runtime.evaluate", { expression: exprCoords(sel), returnByValue: true });
  const c = r && r.result && r.result.value;
  if (!c) return false; // no existe o ya estaba marcado
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
  await cmd(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
  return true;
}

async function hacerClics(tabId, selectores) {
  let ok = 0;
  let attached = false;
  try {
    await attach(tabId);
    attached = true;
    await cmd(tabId, "Runtime.enable").catch(() => {});
    for (const sel of selectores) {
      try { if (await clicReal(tabId, sel)) ok++; } catch (e) { /* sigue con el resto */ }
      await dormir(180);
    }
  } catch (e) {
    return { ok, error: String((e && e.message) || e) };
  } finally {
    if (attached) await detach(tabId);
  }
  return { ok };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.accion === "clicsReales" && msg.tabId) {
    hacerClics(msg.tabId, msg.selectores || []).then(sendResponse);
    return true; // respuesta asíncrona
  }
});
