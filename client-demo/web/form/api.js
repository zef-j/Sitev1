export const api = {
  baseUrl: '',

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

  async getBuildingForm(id) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/form`);
    if (!r.ok) throw new Error('Failed to fetch form');
    const etag = r.headers.get('ETag');
    const json = await r.json();
    try { window.__buildingMeta = { id: json?.building?.id || id, dataVersion: json?.dataVersion, etag }; } catch {}
    return json;
  },

  async getReview(id, since) {
    const url = new URL(`${this.baseUrl}/buildings/${id}/review`);
    if (since) url.searchParams.set('since', String(since));
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error('Failed to fetch review');
    const etag = r.headers.get('ETag');
    const json = await r.json();
    try {
      if (window.__buildingMeta) {
        window.__buildingMeta.dataVersion = json?.dataVersion ?? window.__buildingMeta.dataVersion;
        window.__buildingMeta.etag = etag || window.__buildingMeta.etag;
      }
    } catch {}
    return json;
  },

  async save(id, data, reason) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, reason })
    });
    if (!r.ok) throw new Error('Save failed');
    const newTag = r.headers.get('ETag');
    const j = await r.json();
    try {
      if (window.__buildingMeta) {
        window.__buildingMeta.dataVersion = j?.dataVersion ?? window.__buildingMeta.dataVersion;
        window.__buildingMeta.etag = newTag || window.__buildingMeta.etag;
      }
    } catch {}
    return j;
  },

  async publish(id, data, dataVersion, etag) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': etag || (window.__buildingMeta?.etag || '')
      },
      body: JSON.stringify({ data, dataVersion })
    });
    if (r.status === 412) {
      const j = await r.json().catch(()=>({}));
      const err = new Error('Precondition Failed');
      // @ts-ignore
      err.code = 412;
      // @ts-ignore
      err.detail = j;
      throw err;
    }
    if (!r.ok) throw new Error('Publish failed');
    const newTag = r.headers.get('ETag');
    const j = await r.json();
    try {
      if (window.__buildingMeta) {
        window.__buildingMeta.dataVersion = j?.dataVersion ?? window.__buildingMeta.dataVersion;
        window.__buildingMeta.etag = newTag || window.__buildingMeta.etag;
      }
    } catch {}
    return j;
  },

  async listVersions(id) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/versions`);
    if (!r.ok) throw new Error('Failed to list versions');
    return r.json();
  },

  async getVersion(id, versionId) {
    const r = await fetch(`${this.baseUrl}/buildings/${id}/versions/${versionId}`);
    if (!r.ok) throw new Error('Failed to get version');
    return r.json();
  },

  async uploadFile(id, fieldPath, file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fieldPath', fieldPath);
    const r = await fetch(`${this.baseUrl}/buildings/${id}/upload`, {
      method: 'POST',
      body: fd
    });
    if (!r.ok) throw new Error('Upload failed');
    return r.json();
  }
};
