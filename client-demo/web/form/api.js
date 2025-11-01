// client-demo/web/form/api.js
// ES module (loaded by the browser)

export const api = {
  // same-origin; leave '' so requests go to the current host
  baseUrl: '',

  // ----- READ -----

  async getActiveTemplate() {
    const r = await fetch(`${this.baseUrl}/templates/active`);
    if (!r.ok) throw new Error('Failed to fetch template');
    return r.json();
  },

  async getBuildings() {
    const r = await fetch(`${this.baseUrl}/buildings`);
    if (!r.ok) throw new Error('Failed to fetch buildings');
    return r.json();
  },

  // NOTE: we use /buildings/:id to also capture the ETag header
async getBuildingForm(id) {
  const urls = [
    `${this.baseUrl}/buildings/${encodeURIComponent(id)}/form`, // preferred on your server
    `${this.baseUrl}/buildings/${encodeURIComponent(id)}`       // fallback
  ];

  let res = null;
  for (const url of urls) {
    const r = await fetch(url);
    if (r.ok) { res = r; break; }
  }
  if (!res) throw new Error('Failed to fetch form');

  const etag = res.headers.get('ETag');
  const json = await res.json();

  try {
    window.__buildingMeta = {
      id: json?.building?.id || id,
      dataVersion: json?.dataVersion ?? window.__buildingMeta?.dataVersion,
      etag: etag || window.__buildingMeta?.etag,
    };
  } catch {}

  return json;
},


  // sinceEtag is optional; if present we’ll ask server “what changed since that ETag?”
  async getReview(id, sinceEtag) {
    const qs = sinceEtag ? `?since=${encodeURIComponent(sinceEtag)}` : '';
    const r = await fetch(`${this.baseUrl}/buildings/${encodeURIComponent(id)}/review${qs}`);
    if (!r.ok) throw new Error('Failed to fetch review');
    const etag = r.headers.get('ETag');
    const json = await r.json();
    try {
      if (window.__buildingMeta) {
        window.__buildingMeta.dataVersion =
          json?.dataVersion ?? window.__buildingMeta.dataVersion;
        window.__buildingMeta.etag = etag || window.__buildingMeta.etag;
      }
    } catch {}
    return json;
  },

  async listVersions(id) {
    const r = await fetch(`${this.baseUrl}/buildings/${encodeURIComponent(id)}/versions`);
    if (!r.ok) throw new Error('Failed to fetch versions');
    return r.json();
  },

  async getVersion(id, versionId) {
    const r = await fetch(
      `${this.baseUrl}/buildings/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`
    );
    if (!r.ok) throw new Error('Failed to fetch version');
    return r.json();
  },

  // ----- WRITE -----

  // Keep original signature used by your UI: (id, data, reason)
  // Server increases dataVersion and returns new ETag + json
  async save(id, data, reason) {
    const r = await fetch(`${this.baseUrl}/buildings/${encodeURIComponent(id)}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, reason }),
    });
    if (!r.ok) throw new Error('Save failed');
    const newTag = r.headers.get('ETag');
    const json = await r.json();
    try {
      if (window.__buildingMeta) {
        window.__buildingMeta.dataVersion =
          json?.dataVersion ?? window.__buildingMeta.dataVersion;
        window.__buildingMeta.etag = newTag || window.__buildingMeta.etag;
      }
    } catch {}
    return json;
  },

  // Publish with optimistic locking.
  // If the server replies 412 (stale dataVersion), retry once with the server’s current DV.
  async publish(id, data, dataVersion, etag) {
    const post = async (dv) => {
      const r = await fetch(`${this.baseUrl}/buildings/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(etag ? { 'If-Match': etag } : {}),
        },
        body: JSON.stringify({ data, dataVersion: dv, reason: 'ui-publish' }),
      });

      if (r.status === 412) {
        // Retry once with the server-provided current.dataVersion
        const e = await r.json().catch(() => ({}));
        const nextDV = e?.current?.dataVersion;
        if (nextDV != null) return post(nextDV);
      }

      if (!r.ok) throw new Error('Publish failed');

      const newTag = r.headers.get('ETag');
      const json = await r.json();
      try {
        if (window.__buildingMeta) {
          window.__buildingMeta.dataVersion =
            json?.dataVersion ?? window.__buildingMeta.dataVersion;
          window.__buildingMeta.etag = newTag || window.__buildingMeta.etag;
        }
      } catch {}
      return json;
    };

    return post(dataVersion);
  },

  async uploadFile(id, fieldPath, file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fieldPath', fieldPath);
    const r = await fetch(`${this.baseUrl}/buildings/${encodeURIComponent(id)}/upload`, {
      method: 'POST',
      body: fd,
    });
    if (!r.ok) throw new Error('Upload failed');
    return r.json();
  },
};


/** Fallback download for non-module pages */
async function __downloadShim(id){
  const url = `/buildings/${encodeURIComponent(id)}/download`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const msg = await res.text().catch(()=>'');
    throw new Error(`Download failed: ${res.status} ${msg}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  let fname = 'download.zip';
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  if (m) fname = decodeURIComponent(m[1] || m[2]);
  const a = document.createElement('a');
  const urlObj = URL.createObjectURL(blob);
  a.href = urlObj;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(urlObj), 4000);
}
try { window.api = window.api || {}; if (!window.api.download) window.api.download = __downloadShim; } catch {}
